/* Audit Logs - Admin-only page. The backend independently enforces this
   (AuditLogViewSet requires IsAdminUserRole) - Layout's page guard here is
   just the UX-level mirror of that same rule. */
(function () {
  let currentOrdering = "-timestamp";
  let lastRows = [];
  let currentPage = 1;
  let pageCount = { next: null, previous: null, count: 0 };

  Layout.init("audit-logs").then(load);

  ["search-input", "action-filter", "model-filter"].forEach((id) => {
    const el = document.getElementById(id);
    el.addEventListener(id === "search-input" ? "input" : "change", id === "search-input" ? debounce(() => load(1), 350) : () => load(1));
  });

  document.querySelectorAll("#audit-table th.sortable").forEach((th) => {
    th.addEventListener("click", () => {
      const field = th.dataset.sort;
      currentOrdering = currentOrdering === field ? `-${field}` : field;
      load(1);
    });
  });

  async function load(page = currentPage) {
    currentPage = page;
    const tbody = document.getElementById("audit-tbody");
    tbody.innerHTML = loadingRow(5);
    try {
      const data = await Api.get("/audit-logs/", {
        search: document.getElementById("search-input").value.trim() || undefined,
        action: document.getElementById("action-filter").value || undefined,
        target_model: document.getElementById("model-filter").value || undefined,
        ordering: currentOrdering,
        page,
      });
      const rows = data.results || data;
      lastRows = rows;
      pageCount = { next: data.next, previous: data.previous, count: data.count ?? rows.length };
      renderRows(rows);
      renderPagination();
    } catch (err) {
      tbody.innerHTML = errorStateRow(5, err.message);
    }
  }

  function renderRows(rows) {
    const tbody = document.getElementById("audit-tbody");
    if (!rows.length) {
      tbody.innerHTML = emptyStateRow(5, { icon: "shield", title: "No audit log entries", message: "Activity will appear here as your team works." });
      return;
    }
    tbody.innerHTML = rows.map((log) => `
      <tr>
        <td class="cell-muted">${formatDateTime(log.timestamp)}</td>
        <td>${escapeHtml(log.actor_name || "System")}</td>
        <td>${statusBadge(log.action)}</td>
        <td class="cell-primary">${escapeHtml(log.target_model)} <span class="cell-muted">#${escapeHtml((log.target_id || "").slice(0, 8))}</span></td>
        <td class="text-sm cell-muted">${escapeHtml(summarizeChanges(log.changes_json))}</td>
      </tr>
    `).join("");
  }

  function summarizeChanges(changes) {
    if (!changes || !Object.keys(changes).length) return "-";
    if (changes.before && changes.after) {
      return Object.keys(changes.after)
        .filter((k) => JSON.stringify(changes.before[k]) !== JSON.stringify(changes.after[k]))
        .map((k) => `${k}: ${changes.before[k]} -> ${changes.after[k]}`)
        .join(", ") || "-";
    }
    return Object.entries(changes).map(([k, v]) => {
      if (v && typeof v === "object" && "from" in v && "to" in v) return `${k}: ${v.from} -> ${v.to}`;
      return `${k}: ${JSON.stringify(v)}`;
    }).join(", ");
  }

  function renderPagination() {
    const el = document.getElementById("pagination");
    el.innerHTML = `
      <span>${pageCount.count} total entries</span>
      <div class="flex gap-8">
        <button class="btn btn-outline btn-sm" id="prev-page" ${pageCount.previous ? "" : "disabled"}>Previous</button>
        <button class="btn btn-outline btn-sm" id="next-page" ${pageCount.next ? "" : "disabled"}>Next</button>
      </div>`;
    document.getElementById("prev-page").addEventListener("click", () => load(currentPage - 1));
    document.getElementById("next-page").addEventListener("click", () => load(currentPage + 1));
  }

  const EXPORT_COLUMNS = [
    { label: "Timestamp", value: (r) => formatDateTime(r.timestamp) },
    { label: "Actor", value: (r) => r.actor_name },
    { label: "Action", value: (r) => r.action },
    { label: "Record Type", value: (r) => r.target_model },
    { label: "Record ID", value: (r) => r.target_id },
  ];
  document.getElementById("export-csv-btn").addEventListener("click", () => exportToCSV("audit-logs", lastRows, EXPORT_COLUMNS));
  document.getElementById("export-xlsx-btn").addEventListener("click", () => exportToExcel("audit-logs", lastRows, EXPORT_COLUMNS));
})();
