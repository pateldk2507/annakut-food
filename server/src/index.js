import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import express from "express";
import { getFirebaseAdmin } from "./firebase.js";
import { DEFAULT_RECEIPT_FOOTER, sendConfirmationEmail, sendNotificationEmail, sendReminderEmail } from "./mailer.js";

const app = express();
const port = Number(process.env.PORT || 3001);
const HOLD_MINUTES = 15;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..", "..");
dotenv.config({ path: path.resolve(__dirname, "..", ".env") });
const menuPath = path.resolve(rootDir, "frontend", "static", "seva", "data", "menu.json");
const assetDir = path.resolve(rootDir, "frontend", "static", "assets");
const clientDistDir = path.resolve(rootDir, "client", "dist");
const logsDir = path.resolve(rootDir, "server", "logs");

fs.mkdirSync(logsDir, { recursive: true });

function logDateInToronto(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function writeServerLog(event) {
  const entry = `${JSON.stringify({ timestamp: new Date().toISOString(), ...event })}\n`;
  const logPath = path.join(logsDir, `${logDateInToronto()}.log`);
  fs.appendFile(logPath, entry, (error) => {
    if (error) console.error("Unable to write server audit log:", error.message);
  });
}

app.use(express.json({ limit: "2mb" }));
app.use((req, res, next) => {
  const logsDatabaseAction = req.path.startsWith("/api/") && ["POST", "PUT", "PATCH", "DELETE"].includes(req.method);
  if (!logsDatabaseAction) {
    next();
    return;
  }

  const startedAt = Date.now();
  const eventId = crypto.randomUUID();
  res.on("finish", () => {
    writeServerLog({
      event_id: eventId,
      event: "database_action",
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration_ms: Date.now() - startedAt,
      uid: getVerifiedUserId(req.authUser) || null,
      email: getVerifiedEmail(req.authUser) || null,
      target_uid: req.auditTargetUid || null,
      ip: req.ip || null,
    });
  });
  next();
});
app.use("/assets", express.static(assetDir));

function readMenu() {
  return JSON.parse(fs.readFileSync(menuPath, "utf8"));
}

async function getMenu() {
  const { db } = getFirebaseAdmin();
  const menuRef = db.ref("menu");
  const snapshot = await menuRef.get();
  if (snapshot.exists()) {
    return snapshot.val();
  }

  const seedMenu = readMenu();
  const transaction = await menuRef.transaction((current) => current || seedMenu);
  return transaction.snapshot.val() || seedMenu;
}

function slugify(value = "") {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizePhone(value = "") {
  return String(value).replace(/\D/g, "");
}

function nowIso() {
  return new Date().toISOString();
}

function plusMinutesIso(minutes) {
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

function formatDisplayDate(value) {
  return new Date(value).toLocaleString("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function createReceiptNo(nextNumber) {
  return `ANN-${String(nextNumber).padStart(4, "0")}`;
}

function getVerifiedEmail(decodedToken) {
  return String(decodedToken?.email || "").trim().toLowerCase();
}

function getVerifiedUserId(decodedToken) {
  return String(decodedToken?.uid || decodedToken?.sub || "").trim();
}

function getAdminEmails() {
  return String(process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

function normalizePermission(value = "") {
  const permission = String(value || "").trim().toLowerCase();
  if (["super_admin", "admin", "annakut_admin", "volunteer_admin", "both_admin", "orders_status"].includes(permission)) {
    return permission;
  }

  return "user";
}

function hasAnnakutAccess(permission) {
  return ["super_admin", "admin", "annakut_admin", "both_admin", "orders_status"].includes(permission);
}

function hasFullAnnakutAccess(permission) {
  return ["super_admin", "admin", "annakut_admin", "both_admin"].includes(permission);
}

function hasVolunteerAdminAccess(permission) {
  return ["super_admin", "volunteer_admin", "both_admin"].includes(permission);
}

async function getRequestPermission(decodedToken) {
  const email = getVerifiedEmail(decodedToken);
  if (getAdminEmails().includes(email)) {
    return "super_admin";
  }

  const profile = await getUserProfile(getVerifiedUserId(decodedToken));
  return normalizePermission(profile?.permission);
}

async function requireAdmin(req, res, next) {
  const permission = await getRequestPermission(req.authUser);
  if (!hasAnnakutAccess(permission)) {
    res.status(403).json({ ok: false, error: "Admin or orders status access is required." });
    return;
  }

  req.adminPermission = permission;
  next();
}

async function requireFullAdmin(req, res, next) {
  const permission = await getRequestPermission(req.authUser);
  if (!hasFullAnnakutAccess(permission)) {
    res.status(403).json({ ok: false, error: "Full admin access is required." });
    return;
  }

  req.adminPermission = permission;
  next();
}

async function requireVolunteerAdmin(req, res, next) {
  const permission = await getRequestPermission(req.authUser);
  if (!hasVolunteerAdminAccess(permission)) {
    res.status(403).json({ ok: false, error: "Volunteer admin access is required." });
    return;
  }

  req.adminPermission = permission;
  next();
}

async function requireAnyAdmin(req, res, next) {
  const permission = await getRequestPermission(req.authUser);
  if (!hasAnnakutAccess(permission) && !hasVolunteerAdminAccess(permission)) {
    res.status(403).json({ ok: false, error: "Admin access is required." });
    return;
  }
  req.adminPermission = permission;
  next();
}

async function requireSuperAdmin(req, res, next) {
  const permission = await getRequestPermission(req.authUser);
  if (permission !== "super_admin") {
    res.status(403).json({ ok: false, error: "Super admin access is required." });
    return;
  }
  req.adminPermission = permission;
  next();
}

function holdStillActive(hold) {
  return Boolean(hold?.expiresAt && new Date(hold.expiresAt).getTime() > Date.now());
}

function getActiveHoldRecord(itemHoldNode) {
  if (!itemHoldNode) {
    return null;
  }

  if (itemHoldNode?.active?.sessionId) {
    return itemHoldNode.active;
  }

  if (itemHoldNode?.sessionId) {
    return itemHoldNode;
  }

  for (const [sessionId, hold] of Object.entries(itemHoldNode || {})) {
    if (!hold) {
      continue;
    }

    const normalized = {
      sessionId: hold.sessionId || sessionId,
      ...hold,
    };

    if (holdStillActive(normalized)) {
      return normalized;
    }
  }

  return null;
}

async function requireFirebaseAuth(req, res, next) {
  const header = String(req.headers.authorization || "");
  if (!header.startsWith("Bearer ")) {
    res.status(401).json({ ok: false, error: "Missing Firebase authorization token." });
    return;
  }

  const idToken = header.slice("Bearer ".length).trim();
  if (!idToken) {
    res.status(401).json({ ok: false, error: "Missing Firebase authorization token." });
    return;
  }

  try {
    const { auth } = getFirebaseAdmin();
    const decodedToken = await auth.verifyIdToken(idToken);
    if (!getVerifiedUserId(decodedToken)) {
      res.status(403).json({ ok: false, error: "Verified Firebase user is missing a user identifier." });
      return;
    }

    req.authUser = decodedToken;
    next();
  } catch {
    res.status(401).json({ ok: false, error: "Invalid or expired Firebase token." });
  }
}

async function getOfferingById(offeringId) {
  const { db } = getFirebaseAdmin();
  const snapshot = await db.ref(`offerings/${offeringId}`).get();
  return snapshot.val();
}

async function getUserProfile(uid) {
  const { db } = getFirebaseAdmin();
  const snapshot = await db.ref(`users/${uid}`).get();
  return snapshot.val();
}

async function listOfferingsByUid(uid) {
  const { db } = getFirebaseAdmin();
  const idsSnapshot = await db.ref(`offeringsByUid/${uid}`).get();
  const ids = Object.keys(idsSnapshot.val() || {});
  if (!ids.length) {
    return [];
  }

  const offerings = await Promise.all(ids.map((id) => getOfferingById(id)));
  return offerings.filter(Boolean).sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt));
}

async function getAllOfferings() {
  const { db } = getFirebaseAdmin();
  const snapshot = await db.ref("offerings").get();
  return Object.values(snapshot.val() || {});
}

async function getAllUsers() {
  const { db } = getFirebaseAdmin();
  const snapshot = await db.ref("users").get();
  return Object.values(snapshot.val() || {});
}

async function getNotificationRecipients(type) {
  const { db } = getFirebaseAdmin();
  const [settingSnapshot, users] = await Promise.all([db.ref(`settings/notifications/${type}`).get(), getAllUsers()]);
  const selectedUids = new Set(Object.keys(settingSnapshot.val() || {}));
  return users.filter((user) => selectedUids.has(user.uid) && user.email).map((user) => user.email);
}

async function getAllHolds() {
  const { db } = getFirebaseAdmin();
  const snapshot = await db.ref("itemHolds").get();
  return snapshot.val() || {};
}

async function getAllReminders() {
  const { db } = getFirebaseAdmin();
  const snapshot = await db.ref("itemReminders").get();
  return snapshot.val() || {};
}

async function getMenuItemName(itemId) {
  const menu = await getMenu();
  for (const category of menu.categories || []) {
    for (const subcategory of category.subcategories || []) {
      const match = (subcategory.items || []).find((item) => item.id === itemId);
      if (match?.name) {
        return match.name;
      }
    }
  }

  return itemId;
}

async function cleanupExpiredHolds() {
  const { db } = getFirebaseAdmin();
  const holdsByItem = await getAllHolds();
  const updates = {};
  const releasedItemIds = new Set();

  for (const [itemId, holds] of Object.entries(holdsByItem)) {
    const activeHold = getActiveHoldRecord(holds);
    if (activeHold && !holdStillActive(activeHold)) {
      updates[`itemHolds/${itemId}`] = null;
      releasedItemIds.add(itemId);
    }
  }

  if (Object.keys(updates).length) {
    await db.ref().update(updates);
  }

  if (releasedItemIds.size) {
    const remindersByItem = await getAllReminders();
    const reminderUpdates = {};

    for (const itemId of releasedItemIds) {
      const reminders = remindersByItem[itemId] || {};
      for (const [uid, reminder] of Object.entries(reminders)) {
        try {
          const mailResult = await sendReminderEmail({
            email: reminder.email,
            itemName: reminder.itemName || (await getMenuItemName(itemId)),
          });

          if (mailResult.sent) {
            reminderUpdates[`itemReminders/${itemId}/${uid}`] = null;
          }
        } catch (error) {
          console.error("Reminder email failed:", error);
        }
      }
    }

    if (Object.keys(reminderUpdates).length) {
      await db.ref().update(reminderUpdates);
    }
  }
}

async function buildAvailability(sessionId = "") {
  await cleanupExpiredHolds();

  const offerings = await getAllOfferings();
  const holdsByItem = await getAllHolds();
  const takenItemIds = new Set();
  const heldItemIds = new Set();
  const heldByCurrentSession = new Set();

  for (const offering of offerings) {
    if (offering.status === "cancelled") {
      continue;
    }

    for (const item of offering.items || []) {
      if (item.item_id) {
        takenItemIds.add(item.item_id);
      }
    }
  }

  for (const [itemId, holds] of Object.entries(holdsByItem)) {
    const activeHold = getActiveHoldRecord(holds);
    if (!activeHold || !holdStillActive(activeHold)) {
      continue;
    }

    if (activeHold.sessionId === sessionId) {
      heldByCurrentSession.add(itemId);
    } else {
      heldItemIds.add(itemId);
    }
  }

  return {
    takenItemIds,
    heldItemIds,
    heldByCurrentSession,
  };
}

async function syncSessionHolds({ sessionId, uid, email, itemIds }) {
  const { db } = getFirebaseAdmin();
  const holdsByItem = await getAllHolds();
  const desired = new Set(itemIds.filter(Boolean));
  const updates = {};
  const conflicts = [];

  for (const [itemId, holds] of Object.entries(holdsByItem)) {
    const activeHold = getActiveHoldRecord(holds);
    if (!activeHold || activeHold.sessionId !== sessionId) {
      continue;
    }

    if (!desired.has(itemId) || !holdStillActive(activeHold)) {
      updates[`itemHolds/${itemId}`] = null;
    }
  }

  if (Object.keys(updates).length) {
    await db.ref().update(updates);
  }

  for (const itemId of desired) {
    const nextHold = {
      sessionId,
      uid,
      email,
      createdAt: nowIso(),
      expiresAt: plusMinutesIso(HOLD_MINUTES),
    };

    const transaction = await db.ref(`itemHolds/${itemId}`).transaction((current) => {
      const activeHold = getActiveHoldRecord(current);
      if (activeHold?.sessionId === sessionId && holdStillActive(activeHold)) {
        return current;
      }
      if (!activeHold || !holdStillActive(activeHold)) {
        return { active: nextHold };
      }

      return;
    });

    if (!transaction.committed) {
      conflicts.push({
        id: itemId,
        name: await getMenuItemName(itemId),
        reason: "held",
      });
    }
  }

  return { conflicts };
}

async function releaseSessionHolds(sessionId) {
  const { db } = getFirebaseAdmin();
  const holdsByItem = await getAllHolds();
  const updates = {};

  for (const [itemId, holds] of Object.entries(holdsByItem)) {
    const activeHold = getActiveHoldRecord(holds);
    if (activeHold?.sessionId === sessionId) {
      updates[`itemHolds/${itemId}`] = null;
    }
  }

  if (Object.keys(updates).length) {
    await db.ref().update(updates);
  }
}

function offeringResponseShape(offering) {
  return {
    id: offering.id,
    uid: offering.uid || "",
    receipt_no: offering.receiptNo,
    status: offering.status,
    pdf_downloaded: Boolean(offering.pdfDownloadedAt),
    pdf_downloaded_at: offering.pdfDownloadedAt ? formatDisplayDate(offering.pdfDownloadedAt) : null,
    created_at: formatDisplayDate(offering.createdAt),
    devotee: {
      full_name: offering.devotee.full_name,
      phone: offering.devotee.phone,
      email: offering.devotee.email || "",
      address: offering.devotee.address,
      notes: offering.devotee.notes || "",
    },
    items: offering.items || [],
  };
}

function offeringSummaryShape(offering) {
  return {
    id: offering.id,
    uid: offering.uid || "",
    receipt_no: offering.receiptNo,
    status: offering.status,
    created_at: offering.createdAt ? formatDisplayDate(offering.createdAt) : "",
    updated_at: offering.updatedAt ? formatDisplayDate(offering.updatedAt) : "",
    devotee: {
      full_name: offering.devotee?.full_name || "",
      phone: offering.devotee?.phone || "",
      email: offering.devotee?.email || "",
      address: offering.devotee?.address || "",
      notes: offering.devotee?.notes || "",
    },
    items: offering.items || [],
    items_count: (offering.items || []).length,
    containers_required: (offering.items || []).length,
  };
}

function escapeCsvCell(value = "") {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function buildAdminReportCsv(offerings) {
  const rows = [
    [
      "Receipt",
      "Status",
      "Name",
      "Email",
      "Phone",
      "Pickup Address",
      "Item Name",
      "Quantity",
      "Containers Required",
      "Submitted",
    ],
  ];

  for (const offering of offerings) {
    for (const item of offering.items || []) {
      const qty = Number(item.qty || 1);
      rows.push([
        offering.receiptNo || "",
        offering.status || "",
        offering.devotee?.full_name || "",
        offering.devotee?.email || "",
        offering.devotee?.phone || "",
        offering.devotee?.address || "",
        item.name || "",
        qty,
        qty,
        offering.createdAt || "",
      ]);
    }
  }

  return rows.map((row) => row.map(escapeCsvCell).join(",")).join("\n");
}

function validatePayload(payload, verifiedEmail) {
  const fullName = String(payload.full_name || "").trim();
  const phone = normalizePhone(payload.phone);
  const address = String(payload.address || "").trim();
  const notes = String(payload.notes || "").trim();
  const items = Array.isArray(payload.items) ? payload.items : [];
  const sessionId = String(payload.session_id || "").trim();

  if (!(verifiedEmail && fullName && phone && address && sessionId)) {
    return { error: "Missing required fields" };
  }

  if (!items.length) {
    return { error: "Cart is empty" };
  }

  return {
    email: verifiedEmail,
    fullName,
    phone,
    address,
    notes,
    items,
    sessionId,
    mode: payload.mode === "modify" ? "modify" : "new",
    offeringId: String(payload.offering_id || "").trim(),
  };
}

function validateProfilePayload(payload, verifiedEmail) {
  const firstName = String(payload.first_name || "").trim();
  const lastName = String(payload.last_name || "").trim();
  const fullName = String(payload.full_name || `${firstName} ${lastName}`).trim();
  const phone = normalizePhone(payload.phone);
  const address = String(payload.address || "").trim();
  const addressLine1 = String(payload.address_line1 || "").trim();
  const unitNumber = String(payload.unit_number || "N/A").trim() || "N/A";

  if (!(verifiedEmail && firstName && lastName && fullName && phone && address && addressLine1)) {
    return { error: "Missing required profile fields." };
  }

  if (!address.toLowerCase().includes("thunder bay")) {
    return { error: "Only Thunder Bay addresses are allowed." };
  }

  return {
    email: verifiedEmail,
    firstName,
    lastName,
    fullName,
    phone,
    address,
    addressLine1,
    unitNumber,
  };
}

async function assertItemsAvailable({ items, sessionId, excludeOfferingId = "" }) {
  const offerings = await getAllOfferings();
  const holdsByItem = await getAllHolds();
  const blocked = [];

  for (const item of items) {
    const itemId = String(item.id || item.item_id || "").trim();
    const name = String(item.name || "").trim();
    if (!itemId && !name) {
      continue;
    }

    const taken = offerings.some((offering) => {
      if (offering.status === "cancelled") {
        return false;
      }
      if (excludeOfferingId && offering.id === excludeOfferingId) {
        return false;
      }
      return (offering.items || []).some((savedItem) => savedItem.item_id === itemId || savedItem.name === name);
    });

    if (taken) {
      blocked.push({ id: itemId, name, reason: "taken" });
      continue;
    }

    const activeHold = getActiveHoldRecord(holdsByItem[itemId]);
    const activeForeignHold = Boolean(activeHold && activeHold.sessionId !== sessionId && holdStillActive(activeHold));

    if (activeForeignHold) {
      blocked.push({ id: itemId, name, reason: "held" });
    }
  }

  return blocked;
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/menu", async (_req, res) => {
  res.json(await getMenu());
});

app.post("/api/item-requests", requireFirebaseAuth, async (req, res) => {
  const name = String(req.body?.name || "").trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 100) {
    res.status(400).json({ ok: false, error: "Item name must be between 2 and 100 characters." });
    return;
  }

  const uid = getVerifiedUserId(req.authUser);
  const { db } = getFirebaseAdmin();
  const requestsRef = db.ref("itemRequests");
  const snapshot = await requestsRef.get();
  const duplicate = Object.entries(snapshot.val() || {}).find(([, request]) => request.uid === uid && request.status === "pending" && String(request.name || "").toLowerCase() === name.toLowerCase());
  if (duplicate) {
    res.status(409).json({ ok: false, error: "You already requested this item." });
    return;
  }

  const profile = await getUserProfile(uid);
  const requestRef = requestsRef.push();
  const itemRequest = {
    id: requestRef.key,
    uid,
    name,
    status: "pending",
    requestedBy: profile?.fullName || req.authUser?.name || getVerifiedEmail(req.authUser) || "Devotee",
    requesterEmail: getVerifiedEmail(req.authUser),
    createdAt: nowIso(),
  };
  await requestRef.set(itemRequest);
  res.status(201).json({ ok: true, request: itemRequest });
});

app.post("/api/suggestions", requireFirebaseAuth, async (req, res) => {
  const message = String(req.body?.message || "").trim().replace(/\s+/g, " ");
  if (message.length < 5 || message.length > 1000) {
    res.status(400).json({ ok: false, error: "Suggestion must be between 5 and 1000 characters." });
    return;
  }
  const uid = getVerifiedUserId(req.authUser);
  const profile = await getUserProfile(uid);
  const { db } = getFirebaseAdmin();
  const suggestionRef = db.ref("suggestions").push();
  const suggestion = { id: suggestionRef.key, uid, message, submittedBy: profile?.fullName || getVerifiedEmail(req.authUser) || "User", email: getVerifiedEmail(req.authUser), createdAt: nowIso() };
  await suggestionRef.set(suggestion);
  try {
    await sendNotificationEmail({ recipients: await getNotificationRecipients("suggestions"), subject: "New Seva Portal Suggestion", heading: "New Suggestion", lines: [`From: ${suggestion.submittedBy}`, `Email: ${suggestion.email}`, `Suggestion: ${message}`] });
  } catch (error) {
    console.error("Suggestion notification failed:", error);
  }
  res.status(201).json({ ok: true, suggestion });
});

app.get("/api/booked-items", requireFirebaseAuth, async (req, res) => {
  const sessionId = String(req.query.session_id || "").trim();
  const availability = await buildAvailability(sessionId);
  res.json({
    ok: true,
    taken_item_ids: [...availability.takenItemIds],
    held_item_ids: [...availability.heldItemIds],
    held_by_session_ids: [...availability.heldByCurrentSession],
    hold_minutes: HOLD_MINUTES,
  });
});

app.post("/api/sync-holds", requireFirebaseAuth, async (req, res) => {
  const sessionId = String(req.body?.session_id || "").trim();
  const itemIds = Array.isArray(req.body?.item_ids) ? req.body.item_ids.map(String) : [];
  if (!sessionId) {
    res.status(400).json({ ok: false, error: "Missing session_id" });
    return;
  }

  const result = await syncSessionHolds({
    sessionId,
    uid: getVerifiedUserId(req.authUser),
    email: getVerifiedEmail(req.authUser),
    itemIds,
  });

  if (result.conflicts.length) {
    res.status(409).json({ ok: false, error: "Some items are already on hold.", conflicts: result.conflicts });
    return;
  }

  res.json({ ok: true, hold_expires_in_minutes: HOLD_MINUTES });
});

app.get("/api/profile", requireFirebaseAuth, async (req, res) => {
  const profile = await getUserProfile(getVerifiedUserId(req.authUser));
  const permission = await getRequestPermission(req.authUser);
  res.json({
    ok: true,
    profile: profile
      ? {
          uid: profile.uid || getVerifiedUserId(req.authUser),
          email: profile.email || getVerifiedEmail(req.authUser),
          first_name: profile.firstName || "",
          last_name: profile.lastName || "",
          full_name: profile.fullName || "",
          phone: profile.phone || "",
          address: profile.address || "",
          address_line1: profile.addressLine1 || "",
          unit_number: profile.unitNumber || "",
          notes: profile.notes || "",
          permission,
        }
      : null,
  });
});

app.post("/api/profile", requireFirebaseAuth, async (req, res) => {
  const verifiedEmail = getVerifiedEmail(req.authUser) || String(req.body?.email || "").trim().toLowerCase();
  if (!verifiedEmail) {
    res.status(403).json({ ok: false, error: "Verified Firebase user is missing an email address." });
    return;
  }

  const parsed = validateProfilePayload(req.body || {}, verifiedEmail);
  if (parsed.error) {
    res.status(400).json({ ok: false, error: parsed.error });
    return;
  }

  const uid = getVerifiedUserId(req.authUser);
  const profile = {
    uid,
    email: parsed.email,
    firstName: parsed.firstName,
    lastName: parsed.lastName,
    fullName: parsed.fullName,
    phone: parsed.phone,
    address: parsed.address,
    addressLine1: parsed.addressLine1,
    unitNumber: parsed.unitNumber,
    notes: String(req.body?.notes || "").trim(),
    updatedAt: nowIso(),
  };

  const { db } = getFirebaseAdmin();
  await db.ref(`users/${uid}`).update(profile);

  res.json({
    ok: true,
    profile: {
      uid: profile.uid,
      email: profile.email,
      first_name: profile.firstName,
      last_name: profile.lastName,
      full_name: profile.fullName,
      phone: profile.phone,
      address: profile.address,
      address_line1: profile.addressLine1,
      unit_number: profile.unitNumber,
      notes: profile.notes,
      permission: normalizePermission(profile.permission),
    },
  });
});

app.post("/api/release-holds", requireFirebaseAuth, async (req, res) => {
  const sessionId = String(req.body?.session_id || "").trim();
  if (!sessionId) {
    res.status(400).json({ ok: false, error: "Missing session_id" });
    return;
  }

  await releaseSessionHolds(sessionId);
  res.json({ ok: true });
});

app.post("/api/reminders", requireFirebaseAuth, async (req, res) => {
  const itemId = String(req.body?.item_id || "").trim();
  const itemName = String(req.body?.item_name || "").trim() || (await getMenuItemName(itemId));
  const email = getVerifiedEmail(req.authUser);
  const uid = getVerifiedUserId(req.authUser);

  if (!itemId) {
    res.status(400).json({ ok: false, error: "Missing item_id" });
    return;
  }

  if (!email) {
    res.status(403).json({ ok: false, error: "Verified Firebase user is missing an email address." });
    return;
  }

  const { db } = getFirebaseAdmin();
  await db.ref(`itemReminders/${itemId}/${uid}`).set({
    uid,
    email,
    itemName,
    createdAt: nowIso(),
  });

  res.json({ ok: true, reminder_set: true });
});

app.post("/api/find-offerings", requireFirebaseAuth, async (req, res) => {
  const verifiedEmail = getVerifiedEmail(req.authUser);
  if (!verifiedEmail) {
    res.status(403).json({ ok: false, error: "Verified Firebase user is missing an email address." });
    return;
  }

  const requestedEmail = String(req.body?.email || "").trim().toLowerCase();
  if (requestedEmail && requestedEmail !== verifiedEmail) {
    res.status(403).json({ ok: false, error: "You can only access offerings for your verified email address." });
    return;
  }

  const offerings = await listOfferingsByUid(getVerifiedUserId(req.authUser));
  res.json({
    ok: true,
    offerings: offerings.map((offering) => ({
      id: offering.id,
      receipt_no: offering.receiptNo,
      full_name: offering.devotee.full_name || "Devotee",
      phone: offering.devotee.phone || "",
      email: offering.devotee.email || "",
      created_at: formatDisplayDate(offering.createdAt),
      items_count: (offering.items || []).length,
      items: (offering.items || []).map((item) => ({
        id: item.id || item.item_id || "",
        name: item.name || "Item",
        qty: 1,
      })),
      status: offering.status || "",
      pdf_downloaded: Boolean(offering.pdfDownloadedAt),
      pdf_downloaded_at: offering.pdfDownloadedAt ? formatDisplayDate(offering.pdfDownloadedAt) : null,
    })),
  });
});

app.post("/api/offering/:offeringId/cancel", requireFirebaseAuth, async (req, res) => {
  res.status(403).json({
    ok: false,
    error: "Submitted offerings cannot be changed online. Please call Rakeshbhai or Sagarbhai.",
  });
});

app.get("/api/volunteer/availability", requireFirebaseAuth, async (req, res) => {
  const uid = getVerifiedUserId(req.authUser);
  const { db } = getFirebaseAdmin();
  const snapshot = await db.ref(`volunteerAvailability/${uid}`).get();
  res.json({ ok: true, availability: snapshot.val() || { days: {} } });
});

app.put("/api/volunteer/availability", requireFirebaseAuth, async (req, res) => {
  const allowedDays = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
  const inputDays = req.body?.days || {};
  const days = Object.fromEntries(allowedDays.map((day) => [day, {
    available: Boolean(inputDays[day]?.available),
    from: String(inputDays[day]?.from || "").slice(0, 5),
    to: String(inputDays[day]?.to || "").slice(0, 5),
  }]));
  const inputDates = req.body?.dates && typeof req.body.dates === "object" ? req.body.dates : {};
  const dates = {};
  for (const [date, inputSlots] of Object.entries(inputDates)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Array.isArray(inputSlots) || !inputSlots.length) continue;
    const slots = inputSlots.map((slot) => ({ from: String(slot?.from || "").slice(0, 5), to: String(slot?.to || "").slice(0, 5) }));
    if (slots.some((slot) => !/^\d{2}:\d{2}$/.test(slot.from) || !/^\d{2}:\d{2}$/.test(slot.to) || slot.to <= slot.from)) {
      res.status(400).json({ ok: false, error: `Invalid time slot for ${date}.` });
      return;
    }
    const ordered = [...slots].sort((left, right) => left.from.localeCompare(right.from));
    if (ordered.some((slot, index) => index > 0 && slot.from < ordered[index - 1].to)) {
      res.status(400).json({ ok: false, error: `Time slots overlap for ${date}.` });
      return;
    }
    dates[date] = ordered;
  }
  const uid = getVerifiedUserId(req.authUser);
  const profile = await getUserProfile(uid);
  const availability = {
    uid,
    days,
    dates,
    fullName: String(req.body?.full_name || profile?.fullName || "").trim(),
    phone: normalizePhone(req.body?.phone || profile?.phone),
    updatedAt: nowIso(),
  };
  const { db } = getFirebaseAdmin();
  await db.ref(`volunteerAvailability/${uid}`).set(availability);
  const dateLines = Object.entries(dates).map(([date, slots]) => `${date}: ${slots.map((slot) => `${slot.from}-${slot.to}`).join(", ")}`);
  try {
    const volunteerEmail = getVerifiedEmail(req.authUser) || profile?.email || "";
    await sendNotificationEmail({ recipients: [volunteerEmail], subject: "Volunteer Seva Confirmation", heading: "Your Volunteer Seva Is Confirmed", lines: [`Volunteer: ${availability.fullName}`, `Phone: ${availability.phone}`, ...dateLines, "Thank you for offering your time in seva."] });
  } catch (error) {
    console.error("Volunteer confirmation email failed:", error);
  }
  try {
    await sendNotificationEmail({ recipients: await getNotificationRecipients("volunteer"), subject: "New Volunteer Seva Submission", heading: "Volunteer Seva Confirmation", lines: [`Volunteer: ${availability.fullName}`, `Phone: ${availability.phone}`, ...dateLines] });
  } catch (error) {
    console.error("Volunteer notification failed:", error);
  }
  res.json({ ok: true, availability });
});

app.get("/api/volunteer/admin/availability", requireFirebaseAuth, requireVolunteerAdmin, async (_req, res) => {
  const { db } = getFirebaseAdmin();
  const [availabilitySnapshot, users] = await Promise.all([db.ref("volunteerAvailability").get(), getAllUsers()]);
  const availabilityByUid = availabilitySnapshot.val() || {};
  const usersByUid = new Map(users.map((user) => [user.uid, user]));
  const recordUids = new Set([...usersByUid.keys(), ...Object.keys(availabilityByUid)]);
  const records = [...recordUids].map((uid) => {
    const user = usersByUid.get(uid) || {};
    const savedAvailability = availabilityByUid[uid] || {};
    return {
      uid,
      full_name: savedAvailability.fullName || user.fullName || user.email || "Volunteer",
      email: user.email || "",
      phone: savedAvailability.phone || user.phone || "",
      days: savedAvailability.days || {},
      dates: savedAvailability.dates || {},
      updatedAt: savedAvailability.updatedAt || "",
    };
  }).filter((record) => Object.keys(record.dates).length || Object.values(record.days).some((day) => day?.available));
  records.sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)));
  res.json({ ok: true, records });
});

app.get("/api/admin/me", requireFirebaseAuth, requireAdmin, async (req, res) => {
  res.json({
    ok: true,
    permission: req.adminPermission,
  });
});

app.get("/api/admin/settings", requireFirebaseAuth, requireSuperAdmin, async (_req, res) => {
  const { db } = getFirebaseAdmin();
  const snapshot = await db.ref("settings").get();
  const settings = snapshot.val() || {};
  res.json({
    ok: true,
    receipt_footer_message: String(settings.receiptFooterMessage || DEFAULT_RECEIPT_FOOTER),
    notifications: Object.fromEntries(["annakut", "volunteer", "suggestions"].map((type) => [type, Object.keys(settings.notifications?.[type] || {})])),
  });
});

app.patch("/api/admin/settings", requireFirebaseAuth, requireSuperAdmin, async (req, res) => {
  const receiptFooterMessage = String(req.body?.receipt_footer_message || "").trim();
  if (!receiptFooterMessage || receiptFooterMessage.length > 500) {
    res.status(400).json({ ok: false, error: "Footer message must be between 1 and 500 characters." });
    return;
  }

  const users = await getAllUsers();
  const notificationPermissions = new Set(["super_admin", "admin", "annakut_admin", "volunteer_admin", "both_admin", "orders_status"]);
  const validUids = new Set(users.filter((user) => user.uid && user.email && notificationPermissions.has(normalizePermission(user.permission))).map((user) => user.uid));
  const notifications = {};
  for (const type of ["annakut", "volunteer", "suggestions"]) {
    const selected = Array.isArray(req.body?.notifications?.[type]) ? [...new Set(req.body.notifications[type].map(String))] : [];
    if (selected.some((uid) => !validUids.has(uid))) {
      res.status(400).json({ ok: false, error: "Notification recipients must be registered users with an email address." });
      return;
    }
    notifications[type] = Object.fromEntries(selected.map((uid) => [uid, true]));
  }
  const { db } = getFirebaseAdmin();
  await db.ref("settings").update({
    receiptFooterMessage,
    notifications,
    updatedAt: nowIso(),
    updatedBy: getVerifiedEmail(req.authUser),
  });
  res.json({ ok: true, receipt_footer_message: receiptFooterMessage, notifications: Object.fromEntries(Object.entries(notifications).map(([type, values]) => [type, Object.keys(values)])) });
});

app.get("/api/admin/suggestions", requireFirebaseAuth, requireAnyAdmin, async (_req, res) => {
  const { db } = getFirebaseAdmin();
  const snapshot = await db.ref("suggestions").get();
  const suggestions = Object.entries(snapshot.val() || {}).map(([id, suggestion]) => ({ id, ...suggestion })).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  res.json({ ok: true, suggestions });
});

app.get("/api/admin/accounts", requireFirebaseAuth, requireFullAdmin, async (_req, res) => {
  const users = await getAllUsers();
  res.json({
    ok: true,
    accounts: users
      .map((user) => ({
        uid: user.uid || "",
        email: user.email || "",
        full_name: user.fullName || "",
        phone: user.phone || "",
        address: user.address || "",
        permission: normalizePermission(user.permission),
        updated_at: user.updatedAt ? formatDisplayDate(user.updatedAt) : "",
      }))
      .sort((left, right) => String(left.full_name || left.email).localeCompare(String(right.full_name || right.email))),
  });
});

app.get("/api/admin/item-requests", requireFirebaseAuth, requireFullAdmin, async (_req, res) => {
  const { db } = getFirebaseAdmin();
  const snapshot = await db.ref("itemRequests").get();
  const requests = Object.entries(snapshot.val() || {}).map(([id, request]) => ({ id, ...request }));
  requests.sort((left, right) => String(right.createdAt || "").localeCompare(String(left.createdAt || "")));
  res.json({ ok: true, requests });
});

app.delete("/api/admin/item-requests/:requestId", requireFirebaseAuth, requireFullAdmin, async (req, res) => {
  const requestId = String(req.params.requestId || "").trim();
  const { db } = getFirebaseAdmin();
  const requestRef = db.ref(`itemRequests/${requestId}`);
  const snapshot = await requestRef.get();
  if (!snapshot.exists()) {
    res.status(404).json({ ok: false, error: "Requested item was not found." });
    return;
  }
  await requestRef.remove();
  res.json({ ok: true });
});

app.post("/api/admin/item-requests/:requestId/approve", requireFirebaseAuth, requireFullAdmin, async (req, res) => {
  const requestId = String(req.params.requestId || "").trim();
  const categoryId = String(req.body?.category_id || "").trim();
  const subcategoryId = String(req.body?.subcategory_id || "").trim();
  if (!requestId || !categoryId || !subcategoryId) {
    res.status(400).json({ ok: false, error: "Request, category, and subcategory are required." });
    return;
  }

  const { db } = getFirebaseAdmin();
  const requestRef = db.ref(`itemRequests/${requestId}`);
  const requestSnapshot = await requestRef.get();
  if (!requestSnapshot.exists()) {
    res.status(404).json({ ok: false, error: "Requested item was not found." });
    return;
  }
  const itemRequest = requestSnapshot.val();
  if (itemRequest.status !== "pending") {
    res.status(409).json({ ok: false, error: "This request has already been processed." });
    return;
  }

  const menuRef = db.ref("menu");
  await getMenu();
  let createdItem = null;
  const result = await menuRef.transaction((menu) => {
    const category = (menu?.categories || []).find((entry) => entry.id === categoryId);
    const subcategory = (category?.subcategories || []).find((entry) => entry.id === subcategoryId);
    if (!subcategory) return;
    const baseId = `${categoryId}-${subcategoryId}-${slugify(itemRequest.name)}`;
    let id = baseId;
    let suffix = 2;
    while ((subcategory.items || []).some((item) => item.id === id)) id = `${baseId}-${suffix++}`;
    createdItem = { id, name: itemRequest.name };
    subcategory.items = [...(subcategory.items || []), createdItem];
    return menu;
  });
  if (!result.committed || !createdItem) {
    res.status(404).json({ ok: false, error: "Category or subcategory was not found." });
    return;
  }

  const approvedAt = nowIso();
  await requestRef.update({
    status: "approved",
    categoryId,
    subcategoryId,
    itemId: createdItem.id,
    approvedAt,
    approvedBy: getVerifiedEmail(req.authUser),
  });
  res.json({ ok: true, item: createdItem, menu: result.snapshot.val(), request: { ...itemRequest, id: requestId, status: "approved", categoryId, subcategoryId, itemId: createdItem.id, approvedAt } });
});

app.post("/api/admin/users/:uid/permission", requireFirebaseAuth, requireSuperAdmin, async (req, res) => {
  const uid = String(req.params.uid || "").trim();
  req.auditTargetUid = uid || null;
  const permission = normalizePermission(req.body?.permission);
  if (!uid) {
    res.status(400).json({ ok: false, error: "Missing user id." });
    return;
  }

  const { db } = getFirebaseAdmin();
  const snapshot = await db.ref(`users/${uid}`).get();
  if (!snapshot.exists()) {
    res.status(404).json({ ok: false, error: "User not found." });
    return;
  }
  const existingPermission = normalizePermission(snapshot.val()?.permission);
  await db.ref(`users/${uid}`).update({
    permission,
    permissionUpdatedAt: nowIso(),
    permissionUpdatedBy: getVerifiedEmail(req.authUser),
    updatedAt: nowIso(),
  });

  res.json({ ok: true, permission });
});

app.patch("/api/admin/users/:uid", requireFirebaseAuth, requireFullAdmin, async (req, res) => {
  const uid = String(req.params.uid || "").trim();
  const fullName = String(req.body?.full_name || "").trim();
  const email = String(req.body?.email || "").trim().toLowerCase();
  const phone = normalizePhone(req.body?.phone);
  const address = String(req.body?.address || "").trim();
  if (!uid || !fullName || !email.includes("@") || phone.length !== 10 || !address) {
    res.status(400).json({ ok: false, error: "Name, email, 10-digit phone, and address are required." });
    return;
  }

  const { auth, db } = getFirebaseAdmin();
  const userRef = db.ref(`users/${uid}`);
  const snapshot = await userRef.get();
  if (!snapshot.exists()) {
    res.status(404).json({ ok: false, error: "User not found." });
    return;
  }

  const nameParts = fullName.split(/\s+/);
  const updates = {
    fullName,
    firstName: nameParts.shift() || "",
    lastName: nameParts.join(" "),
    email,
    phone,
    address,
    updatedAt: nowIso(),
    updatedBy: getVerifiedEmail(req.authUser),
  };
  await auth.updateUser(uid, { email, displayName: fullName });
  await userRef.update(updates);
  res.json({ ok: true, user: { uid, full_name: fullName, email, phone, address } });
});

app.delete("/api/admin/users/:uid", requireFirebaseAuth, requireFullAdmin, async (req, res) => {
  const uid = String(req.params.uid || "").trim();
  req.auditTargetUid = uid || null;
  const actorUid = getVerifiedUserId(req.authUser);
  if (!uid || uid === actorUid) {
    res.status(400).json({ ok: false, error: "You cannot delete your own account." });
    return;
  }

  const { auth, db } = getFirebaseAdmin();
  const userSnapshot = await db.ref(`users/${uid}`).get();
  if (!userSnapshot.exists()) {
    res.status(404).json({ ok: false, error: "User not found." });
    return;
  }
  const targetPermission = normalizePermission(userSnapshot.val()?.permission);
  const targetIsConfiguredSuperAdmin = getAdminEmails().includes(String(userSnapshot.val()?.email || "").toLowerCase());
  if ((targetPermission === "super_admin" || targetIsConfiguredSuperAdmin) && req.adminPermission !== "super_admin") {
    res.status(403).json({ ok: false, error: "Only a super admin can delete a super admin account." });
    return;
  }

  const [offerings, holdsByItem, remindersByItem] = await Promise.all([getAllOfferings(), getAllHolds(), getAllReminders()]);
  const userOfferings = offerings.filter((offering) => offering.uid === uid);
  const updates = {
    [`users/${uid}`]: null,
    [`offeringsByUid/${uid}`]: null,
  };
  for (const offering of userOfferings) updates[`offerings/${offering.id}`] = null;
  for (const [itemId, holds] of Object.entries(holdsByItem)) {
    const activeHold = getActiveHoldRecord(holds);
    if (activeHold?.uid === uid) updates[`itemHolds/${itemId}`] = null;
  }
  for (const itemId of Object.keys(remindersByItem)) updates[`itemReminders/${itemId}/${uid}`] = null;

  await db.ref().update(updates);
  try {
    await auth.deleteUser(uid);
  } catch (error) {
    if (error?.code !== "auth/user-not-found") throw error;
  }
  res.json({ ok: true, deleted_uid: uid, deleted_offerings: userOfferings.length });
});

app.get("/api/admin/offerings", requireFirebaseAuth, requireAdmin, async (_req, res) => {
  const offerings = await getAllOfferings();
  res.json({
    ok: true,
    offerings: offerings
      .sort((left, right) => new Date(right.updatedAt || right.createdAt) - new Date(left.updatedAt || left.createdAt))
      .map(offeringSummaryShape),
  });
});

app.post("/api/admin/offerings/:offeringId/status", requireFirebaseAuth, requireAdmin, async (req, res) => {
  const offeringId = String(req.params.offeringId || "").trim();
  const status = String(req.body?.status || "").trim().toLowerCase();
  const allowedStatuses = new Set(["submitted", "confirmed", "preparing", "ready", "picked_up", "cancelled"]);

  if (!offeringId || !allowedStatuses.has(status)) {
    res.status(400).json({ ok: false, error: "Invalid order status." });
    return;
  }

  const { db } = getFirebaseAdmin();
  const offering = await getOfferingById(offeringId);
  if (!offering) {
    res.status(404).json({ ok: false, error: "Offering not found." });
    return;
  }

  await db.ref(`offerings/${offeringId}`).update({
    status,
    statusUpdatedAt: nowIso(),
    statusUpdatedBy: getVerifiedEmail(req.authUser),
    updatedAt: nowIso(),
  });

  res.json({ ok: true, status });
});

app.patch("/api/admin/offerings/:offeringId", requireFirebaseAuth, requireAdmin, async (req, res) => {
  const offeringId = String(req.params.offeringId || "").trim();
  const offering = await getOfferingById(offeringId);
  if (!offering) {
    res.status(404).json({ ok: false, error: "Offering not found." });
    return;
  }

  const devotee = req.body?.devotee || offering.devotee || {};
  const fullName = String(devotee.full_name || "").trim();
  const email = String(devotee.email || "").trim().toLowerCase();
  const phone = normalizePhone(devotee.phone);
  const address = String(devotee.address || "").trim();
  const items = Array.isArray(req.body?.items)
    ? req.body.items
        .map((item) => ({
          ...item,
          id: String(item.id || item.item_id || "").trim(),
          item_id: String(item.item_id || item.id || "").trim(),
          name: String(item.name || "").trim(),
          qty: 1,
        }))
        .filter((item) => item.id && item.name)
    : [];

  if (!offeringId || !fullName || !email.includes("@") || phone.length !== 10 || !address || !items.length) {
    res.status(400).json({ ok: false, error: "Order requires devotee details and at least one item." });
    return;
  }

  const { db } = getFirebaseAdmin();
  await db.ref(`offerings/${offeringId}`).update({
    devotee: {
      ...(offering.devotee || {}),
      full_name: fullName,
      email,
      phone,
      address,
    },
    items,
    updatedAt: nowIso(),
    updatedBy: getVerifiedEmail(req.authUser),
  });

  res.json({ ok: true, offering: offeringSummaryShape({ ...offering, devotee: { ...(offering.devotee || {}), full_name: fullName, email, phone, address }, items }) });
});

app.post("/api/admin/menu/categories", requireFirebaseAuth, requireFullAdmin, async (req, res) => {
  const name = String(req.body?.name || "").trim();
  if (!name) {
    res.status(400).json({ ok: false, error: "Category name is required." });
    return;
  }

  const { db } = getFirebaseAdmin();
  const menuRef = db.ref("menu");
  await getMenu();
  let createdCategory = null;
  const result = await menuRef.transaction((menu) => {
    const categories = menu?.categories || [];
    if (categories.some((category) => category.name.toLowerCase() === name.toLowerCase())) return;
    const baseId = slugify(name) || `category-${Date.now()}`;
    let id = baseId;
    let suffix = 2;
    while (categories.some((category) => category.id === id)) id = `${baseId}-${suffix++}`;
    createdCategory = { id, name, subcategories: [{ id: `${id}-general`, name: "General", items: [] }] };
    menu.categories = [...categories, createdCategory];
    return menu;
  });
  if (!result.committed || !createdCategory) {
    res.status(409).json({ ok: false, error: "A category with this name already exists." });
    return;
  }
  res.json({ ok: true, category: createdCategory, menu: result.snapshot.val() });
});

app.post("/api/admin/menu/items", requireFirebaseAuth, requireFullAdmin, async (req, res) => {
  const categoryId = String(req.body?.category_id || "").trim();
  const subcategoryId = String(req.body?.subcategory_id || "").trim();
  const name = String(req.body?.name || "").trim();
  if (!categoryId || !subcategoryId || !name) {
    res.status(400).json({ ok: false, error: "Category, subcategory, and item name are required." });
    return;
  }

  const { db } = getFirebaseAdmin();
  const menuRef = db.ref("menu");
  await getMenu();
  let createdItem = null;
  const result = await menuRef.transaction((menu) => {
    const category = (menu?.categories || []).find((entry) => entry.id === categoryId);
    const subcategory = (category?.subcategories || []).find((entry) => entry.id === subcategoryId);
    if (!subcategory) {
      return;
    }
    const baseId = `${categoryId}-${subcategoryId}-${slugify(name)}`;
    let id = baseId;
    let suffix = 2;
    while ((subcategory.items || []).some((item) => item.id === id)) {
      id = `${baseId}-${suffix}`;
      suffix += 1;
    }
    createdItem = { id, name };
    subcategory.items = [...(subcategory.items || []), createdItem];
    return menu;
  });
  if (!result.committed || !createdItem) {
    res.status(404).json({ ok: false, error: "Category or subcategory was not found." });
    return;
  }
  res.json({ ok: true, item: createdItem, menu: result.snapshot.val() });
});

app.patch("/api/admin/menu/items/:itemId", requireFirebaseAuth, requireFullAdmin, async (req, res) => {
  const itemId = String(req.params.itemId || "").trim();
  const name = String(req.body?.name || "").trim();
  if (!itemId || !name) {
    res.status(400).json({ ok: false, error: "Item name is required." });
    return;
  }

  const { db } = getFirebaseAdmin();
  const menuRef = db.ref("menu");
  await getMenu();
  let found = false;
  const result = await menuRef.transaction((menu) => {
    for (const category of menu?.categories || []) {
      for (const subcategory of category.subcategories || []) {
        const item = (subcategory.items || []).find((entry) => entry.id === itemId);
        if (item) {
          item.name = name;
          found = true;
          return menu;
        }
      }
    }
    return;
  });
  if (!result.committed || !found) {
    res.status(404).json({ ok: false, error: "Menu item was not found." });
    return;
  }
  res.json({ ok: true, item: { id: itemId, name }, menu: result.snapshot.val() });
});

app.delete("/api/admin/menu/items/:itemId", requireFirebaseAuth, requireFullAdmin, async (req, res) => {
  const itemId = String(req.params.itemId || "").trim();
  const { db } = getFirebaseAdmin();
  const menuRef = db.ref("menu");
  await getMenu();
  let removed = false;
  const result = await menuRef.transaction((menu) => {
    for (const category of menu?.categories || []) {
      for (const subcategory of category.subcategories || []) {
        const previousLength = (subcategory.items || []).length;
        subcategory.items = (subcategory.items || []).filter((entry) => entry.id !== itemId);
        if (subcategory.items.length !== previousLength) {
          removed = true;
          return menu;
        }
      }
    }
    return;
  });
  if (!result.committed || !removed) {
    res.status(404).json({ ok: false, error: "Menu item was not found." });
    return;
  }
  res.json({ ok: true, menu: result.snapshot.val() });
});

app.get("/api/admin/report.csv", requireFirebaseAuth, requireAdmin, async (_req, res) => {
  const offerings = (await getAllOfferings()).filter((offering) => offering.status !== "cancelled");
  res.header("Content-Type", "text/csv; charset=utf-8");
  res.header("Content-Disposition", "attachment; filename=\"annakut-offerings-report.csv\"");
  res.send(buildAdminReportCsv(offerings));
});

app.get("/api/offering/:offeringId", requireFirebaseAuth, async (req, res) => {
  const offering = await getOfferingById(req.params.offeringId);
  if (!offering) {
    res.status(404).json({ ok: false, error: "Offering not found" });
    return;
  }

  if (offering.uid !== getVerifiedUserId(req.authUser)) {
    res.status(403).json({ ok: false, error: "You do not have access to this offering." });
    return;
  }

  res.json({ ok: true, offering: offeringResponseShape(offering) });
});

app.post("/api/save-offering", requireFirebaseAuth, async (req, res) => {
  const { db } = getFirebaseAdmin();
  const verifiedEmail = getVerifiedEmail(req.authUser) || String(req.body?.email || "").trim().toLowerCase();
  if (!verifiedEmail) {
    res.status(403).json({ ok: false, error: "Verified Firebase user is missing an email address." });
    return;
  }

  const parsed = validatePayload(req.body || {}, verifiedEmail);
  if (parsed.error) {
    res.status(400).json({ ok: false, error: parsed.error });
    return;
  }

  if (parsed.mode === "modify") {
    res.status(403).json({
      ok: false,
      error: "Submitted offerings cannot be changed online. Please call Rakeshbhai or Sagarbhai.",
    });
    return;
  }

  const conflicts = await assertItemsAvailable({
    items: parsed.items,
    sessionId: parsed.sessionId,
    excludeOfferingId: parsed.mode === "modify" ? parsed.offeringId : "",
  });

  if (conflicts.length) {
    res.status(400).json({
      ok: false,
      error: "Some items are no longer available.",
      booked_items: conflicts,
    });
    return;
  }

  const uid = getVerifiedUserId(req.authUser);
  const existingUserOffering = (await getAllOfferings()).find((offering) => offering.uid === uid && offering.status !== "cancelled");
  if (existingUserOffering) {
    res.status(409).json({
      ok: false,
      error: "You have already submitted an offering. Please call Rakeshbhai or Sagarbhai if it needs to be changed.",
      offering_id: existingUserOffering.id,
      receipt_no: existingUserOffering.receiptNo || "",
    });
    return;
  }

  let offeringId = `user-${crypto.createHash("sha256").update(uid).digest("hex").slice(0, 32)}`;
  let existingOffering = null;

  if (parsed.mode === "modify") {
    existingOffering = await getOfferingById(parsed.offeringId);
    if (!existingOffering) {
      res.status(404).json({ ok: false, error: "Offering not found" });
      return;
    }

    if (existingOffering.uid !== getVerifiedUserId(req.authUser)) {
      res.status(403).json({ ok: false, error: "You do not have access to modify this offering." });
      return;
    }
  }

  let receiptNo = existingOffering?.receiptNo || "";
  if (!receiptNo) {
    const receiptRef = db.ref("meta/nextReceiptNo");
    const transaction = await receiptRef.transaction((current) => (current || 0) + 1);
    receiptNo = createReceiptNo(transaction.snapshot.val());
  }

  const offering = {
    id: offeringId,
    uid: getVerifiedUserId(req.authUser),
    sessionId: parsed.sessionId,
    status: "submitted",
    receiptNo,
    devotee: {
      full_name: parsed.fullName,
      phone: parsed.phone,
      email: parsed.email,
      address: parsed.address,
      notes: parsed.notes,
    },
    items: parsed.items
      .map((item) => {
        const name = String(item.name || "").trim();
        if (!name) {
          return null;
        }

        return {
          id: String(item.id || item.item_id || "").trim(),
          item_id: String(item.id || item.item_id || "").trim(),
          category: String(item.category || "").trim(),
          subcategory: String(item.subcategory || item.subCategory || "").trim(),
          category_id: String(item.category_id || "").trim(),
          subcategory_id: String(item.subcategory_id || "").trim(),
          name,
          qty: 1,
        };
      })
      .filter(Boolean),
    receiptSnapshot: existingOffering?.receiptSnapshot || null,
    pdfDownloadedAt: existingOffering?.pdfDownloadedAt || null,
    createdAt: existingOffering?.createdAt || nowIso(),
    updatedAt: nowIso(),
  };

  const existingProfile = (await getUserProfile(uid)) || {};
  const createResult = await db.ref(`offerings/${offeringId}`).transaction((current) => {
    if (!current || current.status === "cancelled") {
      return offering;
    }
    return undefined;
  });
  if (!createResult.committed || createResult.snapshot.val()?.receiptNo !== receiptNo) {
    res.status(409).json({
      ok: false,
      error: "You have already submitted an offering. Please call Rakeshbhai or Sagarbhai if it needs to be changed.",
    });
    return;
  }

  await db.ref().update({
    [`offeringsByUid/${uid}/${offeringId}`]: true,
    [`users/${uid}`]: {
      ...existingProfile,
      uid,
      email: parsed.email,
      firstName: String(req.body?.first_name || "").trim() || existingProfile.firstName || existingOffering?.devotee?.first_name || "",
      lastName: String(req.body?.last_name || "").trim() || existingProfile.lastName || existingOffering?.devotee?.last_name || "",
      fullName: parsed.fullName,
      phone: parsed.phone,
      address: parsed.address,
      addressLine1: String(req.body?.address_line1 || "").trim() || parsed.address,
      unitNumber: String(req.body?.unit_number || "N/A").trim() || "N/A",
      notes: parsed.notes,
      permission: normalizePermission(existingProfile.permission),
      updatedAt: nowIso(),
    },
  });

  await releaseSessionHolds(parsed.sessionId);

  let emailSent = false;
  let emailError = "";
  try {
    const { db } = getFirebaseAdmin();
    const footerSnapshot = await db.ref("settings/receiptFooterMessage").get();
    const mailResult = await sendConfirmationEmail(offering, String(footerSnapshot.val() || DEFAULT_RECEIPT_FOOTER));
    emailSent = Boolean(mailResult?.sent);
    emailError = mailResult?.sent ? "" : String(mailResult?.error || "Email was not accepted by the mail server.");
  } catch (error) {
    emailSent = false;
    emailError = error instanceof Error ? error.message : "Unable to send confirmation email.";
    console.error("Confirmation email failed:", error);
  }

  try {
    await sendNotificationEmail({ recipients: await getNotificationRecipients("annakut"), subject: `New Annakut Offering - ${offering.receiptNo}`, heading: "New Annakut Offering", lines: [`Devotee: ${offering.devotee.full_name}`, `Phone: ${offering.devotee.phone}`, `Items: ${offering.items.map((item) => item.name).join(", ")}`] });
  } catch (error) {
    console.error("Annakut admin notification failed:", error);
  }

  res.json({ ok: true, offering_id: offeringId, receipt_no: receiptNo, email_sent: emailSent, email_error: emailError });
});

app.post("/api/mark-pdf-downloaded", requireFirebaseAuth, async (req, res) => {
  const offeringId = String(req.body?.offering_id || "").trim();
  if (!offeringId) {
    res.status(400).json({ ok: false, error: "Missing offering_id" });
    return;
  }

  const { db } = getFirebaseAdmin();
  const offering = await getOfferingById(offeringId);
  if (!offering) {
    res.status(404).json({ ok: false, error: "Offering not found" });
    return;
  }

  if (offering.uid !== getVerifiedUserId(req.authUser)) {
    res.status(403).json({ ok: false, error: "You do not have access to this offering." });
    return;
  }

  await db.ref(`offerings/${offeringId}`).update({
    pdfDownloadedAt: nowIso(),
    receiptSnapshot: req.body?.snapshot || offering.receiptSnapshot || null,
    updatedAt: nowIso(),
  });

  res.json({ ok: true });
});

if (fs.existsSync(clientDistDir)) {
  app.use(express.static(clientDistDir));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api/")) {
      next();
      return;
    }

    res.sendFile(path.join(clientDistDir, "index.html"));
  });
}

app.listen(port, () => {
  console.log(`Annakut server listening on http://localhost:${port}`);
});
