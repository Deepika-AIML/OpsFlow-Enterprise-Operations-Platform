/* ==========================================================================
   OpsFlow - shared UI helpers: toasts, confirm modal, empty states,
   loading rows, debounce. Used by every page.
   ========================================================================== */

function ensureToastRoot() {
  let root = document.getElementById("toast-root");
  if (!root) {
    root = document.createElement("div");
    root.id = "toast-root";
    document.body.appendChild(root);
  }
  return root;
}

function toast(message, type = "info", timeout = 4200) {
  const root = ensureToastRoot();
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.textContent = message;
  root.appendChild(el);
  setTimeout(() => el.remove(), timeout);
}

function toastError(err) {
  toast(err && err.message ? err.message : "Something went wrong. Please try again.", "error", 5500);
}

// Flash message carried across a redirect (e.g. session expiry -> login page)
function consumeFlash() {
  const raw = sessionStorage.getItem("opsflow_flash");
  if (!raw) return;
  sessionStorage.removeItem("opsflow_flash");
  try {
    const flash = JSON.parse(raw);
    toast(flash.message, flash.type || "info");
  } catch (e) { /* ignore */ }
}

/**
 * Promise-based confirm modal for destructive actions (replaces
 * window.confirm with something styled and accessible).
 */
function confirmAction({ title = "Are you sure?", message = "", confirmLabel = "Confirm", danger = true } = {}) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay open";
    overlay.innerHTML = `
      <div class="modal modal-confirm" role="dialog" aria-modal="true">
        <div class="modal-head"><h3>${escapeHtml(title)}</h3></div>
        <div class="modal-body"><p>${escapeHtml(message)}</p></div>
        <div class="modal-foot">
          <button class="btn btn-outline" data-action="cancel">Cancel</button>
          <button class="btn ${danger ? "btn-danger" : "btn-primary"}" data-action="confirm">${escapeHtml(confirmLabel)}</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    function cleanup(result) {
      overlay.remove();
      resolve(result);
    }
    overlay.addEventListener("click", (e) => { if (e.target === overlay) cleanup(false); });
    overlay.querySelector('[data-action="cancel"]').addEventListener("click", () => cleanup(false));
    overlay.querySelector('[data-action="confirm"]').addEventListener("click", () => cleanup(true));
  });
}

function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function loadingRow(colSpan, label = "Loading...") {
  return `<tr><td colspan="${colSpan}"><div class="loading-row"><span class="spinner"></span>${escapeHtml(label)}</div></td></tr>`;
}

function emptyStateRow(colSpan, { icon = "inbox", title = "Nothing here yet", message = "", actionHtml = "" } = {}) {
  return `<tr><td colspan="${colSpan}">
    <div class="empty-state">
      <div class="empty-icon">${Icons[icon] || Icons.inbox}</div>
      <h3>${escapeHtml(title)}</h3>
      ${message ? `<p>${escapeHtml(message)}</p>` : ""}
      ${actionHtml}
    </div>
  </td></tr>`;
}

function errorStateRow(colSpan, message = "Unable to load data. Please try again.") {
  return `<tr><td colspan="${colSpan}">
    <div class="empty-state">
      <div class="empty-icon">${Icons.alert}</div>
      <h3>Something went wrong</h3>
      <p>${escapeHtml(message)}</p>
      <button class="btn btn-outline btn-sm" onclick="window.location.reload()">Retry</button>
    </div>
  </td></tr>`;
}

function debounce(fn, wait = 350) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

function formatDate(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function formatDateTime(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function timeAgo(value) {
  if (!value) return "-";
  const seconds = Math.floor((Date.now() - new Date(value).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(value);
}

function initials(nameOrEmail) {
  if (!nameOrEmail) return "?";
  const trimmed = nameOrEmail.trim();
  const parts = trimmed.split(" ").filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return trimmed.slice(0, 2).toUpperCase();
}

function setButtonLoading(btn, isLoading, loadingLabel = "Please wait...") {
  if (!btn) return;
  if (isLoading) {
    btn.dataset.originalLabel = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner"></span> ${escapeHtml(loadingLabel)}`;
  } else {
    btn.disabled = false;
    if (btn.dataset.originalLabel) btn.innerHTML = btn.dataset.originalLabel;
  }
}

const STATUS_BADGE_CLASS = {
  DRAFT: "badge-neutral", PENDING_REVIEW: "badge-warning", CHANGES_REQUESTED: "badge-warning",
  APPROVED: "badge-success", REJECTED: "badge-danger",
  PLANNED: "badge-info", IN_PROGRESS: "badge-info", ON_HOLD: "badge-warning",
  COMPLETED: "badge-success", CANCELLED: "badge-danger",
  LOW: "badge-neutral", MEDIUM: "badge-info", HIGH: "badge-warning", URGENT: "badge-danger",
};

function statusBadge(value, labelOverride) {
  const cls = STATUS_BADGE_CLASS[value] || "badge-neutral";
  const label = labelOverride || (value || "-").replace(/_/g, " ");
  return `<span class="badge ${cls}">${escapeHtml(label)}</span>`;
}
