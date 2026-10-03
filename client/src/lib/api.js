import { getCurrentIdToken } from "./firebase";

async function request(path, options = {}) {
  const requiresAuth = Boolean(options.requiresAuth);
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 15000);
  const nextHeaders = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  if (requiresAuth) {
    nextHeaders.Authorization = `Bearer ${await getCurrentIdToken()}`;
  }

  try {
    const response = await fetch(path, {
      ...options,
      headers: nextHeaders,
      signal: options.signal || controller.signal,
    });

    const data = await response.json();
    if (!response.ok || data.ok === false) {
      const error = new Error(data.error || "Request failed");
      error.data = data;
      error.status = response.status;
      throw error;
    }

    return data;
  } catch (error) {
    if (error.name === "AbortError") throw new Error("The server request timed out. Please check that the Node server and Firebase connection are running.");
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export function fetchMenu() {
  return request("/api/menu");
}

export function fetchBookedItems(query = "") {
  return request(`/api/booked-items${query}`, { requiresAuth: true });
}

export function syncCartHolds(payload) {
  return request("/api/sync-holds", {
    method: "POST",
    body: JSON.stringify(payload),
    requiresAuth: true,
  });
}

export function releaseCartHolds(payload) {
  return request("/api/release-holds", {
    method: "POST",
    body: JSON.stringify(payload),
    requiresAuth: true,
  });
}

export function requestItemReminder(payload) {
  return request("/api/reminders", {
    method: "POST",
    body: JSON.stringify(payload),
    requiresAuth: true,
  });
}

export function submitItemRequest(payload) {
  return request("/api/item-requests", {
    method: "POST",
    body: JSON.stringify(payload),
    requiresAuth: true,
  });
}

export function submitSuggestion(payload) {
  return request("/api/suggestions", { method: "POST", body: JSON.stringify(payload), requiresAuth: true });
}

export function saveOffering(payload) {
  return request("/api/save-offering", {
    method: "POST",
    body: JSON.stringify(payload),
    requiresAuth: true,
  });
}

export function fetchProfile() {
  return request("/api/profile", { requiresAuth: true });
}

export function saveProfile(payload) {
  return request("/api/profile", {
    method: "POST",
    body: JSON.stringify(payload),
    requiresAuth: true,
  });
}

export function fetchVolunteerAvailability() {
  return request("/api/volunteer/availability", { requiresAuth: true });
}

export function saveVolunteerAvailability(payload) {
  return request("/api/volunteer/availability", {
    method: "PUT",
    body: JSON.stringify(payload),
    requiresAuth: true,
  });
}

export function fetchVolunteerAdminAvailability() {
  return request("/api/volunteer/admin/availability", { requiresAuth: true });
}

export function findOfferings(email = "") {
  return request("/api/find-offerings", {
    method: "POST",
    body: JSON.stringify(email ? { email } : {}),
    requiresAuth: true,
  });
}

export function getOffering(offeringId) {
  return request(`/api/offering/${offeringId}`, { requiresAuth: true });
}

export function cancelOffering(offeringId) {
  return request(`/api/offering/${offeringId}/cancel`, {
    method: "POST",
    body: JSON.stringify({}),
    requiresAuth: true,
  });
}

export function fetchAdminAccounts() {
  return request("/api/admin/accounts", { requiresAuth: true });
}

export function fetchAdminMe() {
  return request("/api/admin/me", { requiresAuth: true });
}

export function fetchAdminSettings() {
  return request("/api/admin/settings", { requiresAuth: true });
}

export function updateAdminSettings(payload) {
  return request("/api/admin/settings", {
    method: "PATCH",
    body: JSON.stringify(payload),
    requiresAuth: true,
  });
}

export function fetchAdminOfferings() {
  return request("/api/admin/offerings", { requiresAuth: true });
}

export function fetchAdminItemRequests() {
  return request("/api/admin/item-requests", { requiresAuth: true });
}

export function fetchAdminSuggestions() {
  return request("/api/admin/suggestions", { requiresAuth: true });
}

export function approveAdminItemRequest(requestId, payload) {
  return request(`/api/admin/item-requests/${encodeURIComponent(requestId)}/approve`, {
    method: "POST",
    body: JSON.stringify(payload),
    requiresAuth: true,
  });
}

export function deleteAdminItemRequest(requestId) {
  return request(`/api/admin/item-requests/${encodeURIComponent(requestId)}`, {
    method: "DELETE",
    requiresAuth: true,
  });
}

export function updateAdminUserPermission(uid, permission) {
  return request(`/api/admin/users/${uid}/permission`, {
    method: "POST",
    body: JSON.stringify({ permission }),
    requiresAuth: true,
  });
}

export function updateAdminUser(uid, payload) {
  return request(`/api/admin/users/${uid}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
    requiresAuth: true,
  });
}

export function deleteAdminUser(uid) {
  return request(`/api/admin/users/${uid}`, {
    method: "DELETE",
    requiresAuth: true,
  });
}

export function updateAdminOfferingStatus(offeringId, status) {
  return request(`/api/admin/offerings/${offeringId}/status`, {
    method: "POST",
    body: JSON.stringify({ status }),
    requiresAuth: true,
  });
}

export function updateAdminOffering(offeringId, payload) {
  return request(`/api/admin/offerings/${offeringId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
    requiresAuth: true,
  });
}

export function addAdminMenuItem(payload) {
  return request("/api/admin/menu/items", {
    method: "POST",
    body: JSON.stringify(payload),
    requiresAuth: true,
  });
}

export function addAdminMenuCategory(payload) {
  return request("/api/admin/menu/categories", {
    method: "POST",
    body: JSON.stringify(payload),
    requiresAuth: true,
  });
}

export function updateAdminMenuItem(itemId, payload) {
  return request(`/api/admin/menu/items/${encodeURIComponent(itemId)}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
    requiresAuth: true,
  });
}

export function removeAdminMenuItem(itemId) {
  return request(`/api/admin/menu/items/${encodeURIComponent(itemId)}`, {
    method: "DELETE",
    requiresAuth: true,
  });
}

export async function downloadAdminReport() {
  const token = await getCurrentIdToken();
  const response = await fetch("/api/admin/report.csv", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error("Unable to download report");
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "annakut-offerings-report.csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function markPdfDownloaded(payload) {
  return request("/api/mark-pdf-downloaded", {
    method: "POST",
    body: JSON.stringify(payload),
    requiresAuth: true,
  });
}
