const CART_KEY = "annakut_cart_v1";
const DETAILS_KEY = "annakut_details_v1";
const FLOW_KEY = "annakut_flow_mode_v1";
const ACTIVE_ORDER_ID_KEY = "annakut_active_order_id_v1";
const ACTIVE_PHONE_KEY = "annakut_active_phone_v1";
const CATEGORY_KEY = "annakut_selected_category_v1";
const SUBCATEGORY_KEY = "annakut_selected_subcategory_v1";
const SESSION_AUTH_KEY = "annakut_session_auth_v1";
const CART_SESSION_KEY = "annakut_cart_session_v1";

function readJson(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  window.localStorage.setItem(key, JSON.stringify(value));
}

export function getCart() {
  return readJson(CART_KEY, {});
}

export function setCart(cart) {
  writeJson(CART_KEY, cart);
}

export function clearCart() {
  window.localStorage.removeItem(CART_KEY);
}

export function getDetails() {
  return readJson(DETAILS_KEY, {});
}

export function setDetails(details) {
  writeJson(DETAILS_KEY, details);
}

export function getFlowMode() {
  return window.localStorage.getItem(FLOW_KEY) || "new";
}

export function setFlowMode(mode) {
  window.localStorage.setItem(FLOW_KEY, mode);
}

export function getActiveOrderId() {
  return window.localStorage.getItem(ACTIVE_ORDER_ID_KEY) || "";
}

export function setActiveOrderId(value) {
  if (!value) {
    window.localStorage.removeItem(ACTIVE_ORDER_ID_KEY);
    return;
  }
  window.localStorage.setItem(ACTIVE_ORDER_ID_KEY, String(value));
}

export function getActivePhone() {
  return window.localStorage.getItem(ACTIVE_PHONE_KEY) || "";
}

export function setActivePhone(value) {
  if (!value) {
    window.localStorage.removeItem(ACTIVE_PHONE_KEY);
    return;
  }
  window.localStorage.setItem(ACTIVE_PHONE_KEY, value);
}

export function getSelectedCategoryId() {
  return window.localStorage.getItem(CATEGORY_KEY) || "";
}

export function setSelectedCategoryId(value) {
  if (!value) {
    window.localStorage.removeItem(CATEGORY_KEY);
    return;
  }
  window.localStorage.setItem(CATEGORY_KEY, value);
}

export function getSelectedSubcategoryId() {
  return window.localStorage.getItem(SUBCATEGORY_KEY) || "";
}

export function setSelectedSubcategoryId(value) {
  if (!value) {
    window.localStorage.removeItem(SUBCATEGORY_KEY);
    return;
  }
  window.localStorage.setItem(SUBCATEGORY_KEY, value);
}

export function resetFlow() {
  clearCart();
  window.localStorage.removeItem(DETAILS_KEY);
  window.localStorage.removeItem(CATEGORY_KEY);
  window.localStorage.removeItem(SUBCATEGORY_KEY);
  window.localStorage.removeItem(ACTIVE_ORDER_ID_KEY);
  window.localStorage.removeItem(ACTIVE_PHONE_KEY);
  window.localStorage.removeItem(SESSION_AUTH_KEY);
  window.localStorage.setItem(FLOW_KEY, "new");
}

export function getSessionAuth() {
  return readJson(SESSION_AUTH_KEY, {});
}

export function setSessionAuth(auth) {
  writeJson(SESSION_AUTH_KEY, auth);
}

export function getCartSessionId() {
  let sessionId = window.localStorage.getItem(CART_SESSION_KEY);
  if (!sessionId) {
    sessionId = window.crypto?.randomUUID?.() || `session_${Date.now()}`;
    window.localStorage.setItem(CART_SESSION_KEY, sessionId);
  }
  return sessionId;
}

export function resetCartSessionId() {
  const sessionId = window.crypto?.randomUUID?.() || `session_${Date.now()}`;
  window.localStorage.setItem(CART_SESSION_KEY, sessionId);
  return sessionId;
}
