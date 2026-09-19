/* ==========================================================================
   OpsFlow - API client
   Handles JWT storage, automatic access-token refresh, and every fetch to
   the Django REST backend. No localStorage-based "mock" data lives here -
   every function in this file talks to a real endpoint.
   ========================================================================== */

const API_BASE = "/api/v1";

const Auth = {
  getAccess() { return localStorage.getItem("opsflow_access"); },
  getRefresh() { return localStorage.getItem("opsflow_refresh"); },
  setTokens(access, refresh) {
    localStorage.setItem("opsflow_access", access);
    if (refresh) localStorage.setItem("opsflow_refresh", refresh);
  },
  clear() {
    localStorage.removeItem("opsflow_access");
    localStorage.removeItem("opsflow_refresh");
    localStorage.removeItem("opsflow_user");
  },
  setUser(user) { localStorage.setItem("opsflow_user", JSON.stringify(user)); },
  getUser() {
    try { return JSON.parse(localStorage.getItem("opsflow_user") || "null"); }
    catch (e) { return null; }
  },
  isLoggedIn() { return !!this.getAccess(); },
  /**
   * Decodes the JWT payload client-side purely for UI convenience (e.g.
   * showing a name before the /me/ call resolves). This is NEVER trusted
   * for authorization - every protected endpoint re-checks the role on
   * the server from the database, so tampering with this value client-side
   * accomplishes nothing.
   */
  decodeToken(token) {
    try {
      const payload = token.split(".")[1];
      const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
      return JSON.parse(decodeURIComponent(escape(json)));
    } catch (e) { return null; }
  },
  role() {
    const u = this.getUser();
    return u ? u.role : null;
  },
  isAdmin() { return this.role() === "ADMIN"; },
  isManager() { return this.role() === "MANAGER"; },
  isAdminOrManager() { return ["ADMIN", "MANAGER"].includes(this.role()); },
};

let refreshInFlight = null;

async function refreshAccessToken() {
  const refresh = Auth.getRefresh();
  if (!refresh) return false;
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = fetch(`${API_BASE}/auth/token/refresh/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh }),
  })
    .then(async (res) => {
      if (!res.ok) return false;
      const data = await res.json();
      Auth.setTokens(data.access, data.refresh);
      return true;
    })
    .catch(() => false)
    .finally(() => { refreshInFlight = null; });

  return refreshInFlight;
}

/**
 * Core request helper used by every page. Attaches the JWT, retries once
 * after a silent token refresh on a 401, and normalizes errors into a
 * single ApiError shape the UI layer knows how to render.
 */
async function apiRequest(path, { method = "GET", body, params, isRetry = false } = {}) {
  let url = `${API_BASE}${path}`;
  if (params) {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== "")
    ).toString();
    if (qs) url += (url.includes("?") ? "&" : "?") + qs;
  }

  const headers = { "Content-Type": "application/json" };
  const access = Auth.getAccess();
  if (access) headers["Authorization"] = `Bearer ${access}`;

  let res;
  try {
    res = await fetch(url, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  } catch (networkErr) {
    throw new ApiError("Unable to reach the server. Please check your connection and try again.", 0, null);
  }

  if (res.status === 401 && !isRetry && Auth.getRefresh()) {
    const refreshed = await refreshAccessToken();
    if (refreshed) return apiRequest(path, { method, body, params, isRetry: true });
    Auth.clear();
    redirectToLogin("Your session has expired. Please log in again.");
    throw new ApiError("Session expired.", 401, null);
  }
  if (res.status === 401) {
    Auth.clear();
    redirectToLogin("Please log in to continue.");
    throw new ApiError("Not authenticated.", 401, null);
  }

  if (res.status === 204) return null;

  let data = null;
  const text = await res.text();
  if (text) {
    try { data = JSON.parse(text); } catch (e) { data = null; }
  }

  if (!res.ok) {
    if (res.status === 403) {
      throw new ApiError("You do not have permission to perform this action.", 403, data);
    }
    throw new ApiError(extractErrorMessage(data) || `Request failed (${res.status}).`, res.status, data);
  }

  return data;
}

function extractErrorMessage(data) {
  if (!data) return null;
  if (typeof data === "string") return data;

  // The backend's custom exception handler wraps every DRF error response
  // as {"error": {code, message, details, request_id}} - unwrap that
  // envelope to get at the real per-field validation errors underneath.
  // (See core/exceptions.py:custom_exception_handler.)
  let details = data;
  let fallback = null;
  if (data.error && typeof data.error === "object") {
    details = data.error.details;
    fallback = data.error.message;
  }
  if (!details) return fallback;
  if (typeof details === "string") return details;
  if (details.detail) return Array.isArray(details.detail) ? details.detail.join(" ") : details.detail;

  const parts = [];
  for (const [field, val] of Object.entries(details)) {
    const msg = Array.isArray(val) ? val.join(" ") : val;
    parts.push(field === "non_field_errors" ? msg : `${fieldLabel(field)}: ${msg}`);
  }
  return parts.length ? parts.join(" ") : fallback;
}

function fieldLabel(field) {
  return field.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Unwraps the same {"error": {details: {...}}} envelope down to a plain
 * {field: "message"} map, for forms that want to show per-field errors. */
function extractFieldErrors(data) {
  if (!data) return {};
  const details = (data.error && typeof data.error === "object") ? data.error.details : data;
  if (!details || typeof details !== "object") return {};
  const out = {};
  for (const [k, v] of Object.entries(details)) {
    if (k !== "detail") out[k] = Array.isArray(v) ? v.join(" ") : v;
  }
  return out;
}

class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.status = status;
    this.data = data || {};
  }
  fieldErrors() {
    return extractFieldErrors(this.data);
  }
}

function redirectToLogin(message) {
  if (window.location.pathname.endsWith("login.html")) return;
  sessionStorage.setItem("opsflow_flash", JSON.stringify({ type: "warning", message }));
  window.location.href = "login.html";
}

const Api = {
  get: (path, params) => apiRequest(path, { method: "GET", params }),
  post: (path, body) => apiRequest(path, { method: "POST", body }),
  patch: (path, body) => apiRequest(path, { method: "PATCH", body }),
  put: (path, body) => apiRequest(path, { method: "PUT", body }),
  delete: (path) => apiRequest(path, { method: "DELETE" }),
};
