/* Organizations - Admin-only CRUD, wired to the real /api/v1/organizations/ API. */
(function () {
  let currentOrdering = "name";
  let editingId = null;
  let lastRows = [];

  Layout.init("organizations").then(load);

  const searchInput = document.getElementById("search-input");
  const statusFilter = document.getElementById("status-filter");
  searchInput.addEventListener("input", debounce(load, 350));
  statusFilter.addEventListener("change", load);

  document.querySelectorAll("#org-table th.sortable").forEach((th) => {
    th.addEventListener("click", () => {
      const field = th.dataset.sort;
      currentOrdering = currentOrdering === field ? `-${field}` : field;
      load();
    });
  });

  async function load() {
    const tbody = document.getElementById("org-tbody");
    tbody.innerHTML = loadingRow(7);
    try {
      const params = {
        search: searchInput.value.trim() || undefined,
        is_active: statusFilter.value || undefined,
        ordering: currentOrdering,
        page_size: 100,
      };
      const data = await Api.get("/organizations/", params);
      const rows = data.results || data;
      lastRows = rows;
      renderRows(rows);
    } catch (err) {
      tbody.innerHTML = errorStateRow(7, err.message);
    }
  }

  function renderRows(rows) {
    const tbody = document.getElementById("org-tbody");
    if (!rows.length) {
      tbody.innerHTML = emptyStateRow(7, {
        icon: "building", title: "No organizations found",
        message: "Create one to start partitioning clients, projects and tasks.",
        actionHtml: `<button class="btn btn-primary btn-sm" onclick="document.getElementById('add-org-btn').click()">+ New Organization</button>`,
      });
      return;
    }
    tbody.innerHTML = rows.map((org) => `
      <tr>
        <td class="cell-primary">${escapeHtml(org.name)}</td>
        <td class="cell-muted">${escapeHtml(org.slug)}</td>
        <td>${org.user_count}</td>
        <td>${org.client_count}</td>
        <td>${org.project_count}</td>
        <td>${org.is_active ? statusBadge("ACTIVE", "Active") : statusBadge("CANCELLED", "Inactive")}</td>
        <td>
          <div class="row-actions">
            <button class="btn btn-outline btn-sm" data-edit="${org.id}">Edit</button>
            <button class="btn btn-danger btn-sm" data-delete="${org.id}">Delete</button>
          </div>
        </td>
      </tr>
    `).join("");

    tbody.querySelectorAll("[data-edit]").forEach((btn) => btn.addEventListener("click", () => openModal(btn.dataset.edit)));
    tbody.querySelectorAll("[data-delete]").forEach((btn) => btn.addEventListener("click", () => handleDelete(btn.dataset.delete)));
  }

  // ---- Modal (create/edit) ----
  const modal = document.getElementById("org-modal");
  const form = document.getElementById("org-form");
  const errorBox = document.getElementById("org-form-error");
  const saveBtn = document.getElementById("org-save-btn");

  document.getElementById("add-org-btn").addEventListener("click", () => openModal(null));
  document.getElementById("org-cancel-btn").addEventListener("click", closeModal);
  document.getElementById("org-modal-close").addEventListener("click", closeModal);
  modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });

  function openModal(id) {
    editingId = id;
    errorBox.classList.add("hidden");
    form.reset();
    document.getElementById("org-active-group").classList.toggle("hidden", !id);
    if (id) {
      const org = lastRows.find((o) => o.id === id);
      document.getElementById("org-modal-title").textContent = "Edit Organization";
      document.getElementById("org-name").value = org ? org.name : "";
      document.getElementById("org-active").checked = org ? org.is_active : true;
    } else {
      document.getElementById("org-modal-title").textContent = "New Organization";
    }
    modal.classList.add("open");
  }
  function closeModal() { modal.classList.remove("open"); }

  saveBtn.addEventListener("click", async () => {
    errorBox.classList.add("hidden");
    const name = document.getElementById("org-name").value.trim();
    if (!name) { errorBox.textContent = "Name is required."; errorBox.classList.remove("hidden"); return; }

    const payload = { name };
    if (editingId) payload.is_active = document.getElementById("org-active").checked;

    setButtonLoading(saveBtn, true, "Saving...");
    try {
      if (editingId) {
        await Api.patch(`/organizations/${editingId}/`, payload);
        toast("Organization updated.", "success");
      } else {
        await Api.post("/organizations/", payload);
        toast("Organization created.", "success");
      }
      closeModal();
      load();
    } catch (err) {
      errorBox.textContent = err.message;
      errorBox.classList.remove("hidden");
    } finally {
      setButtonLoading(saveBtn, false);
    }
  });

  async function handleDelete(id) {
    const org = lastRows.find((o) => o.id === id);
    const ok = await confirmAction({
      title: "Delete organization?",
      message: `This will permanently delete "${org ? org.name : "this organization"}". This cannot be undone.`,
      confirmLabel: "Delete",
    });
    if (!ok) return;
    try {
      await Api.delete(`/organizations/${id}/`);
      toast("Organization deleted.", "success");
      load();
    } catch (err) {
      toastError(err);
    }
  }

  // ---- Export ----
  const EXPORT_COLUMNS = [
    { label: "Name", value: (r) => r.name },
    { label: "Slug", value: (r) => r.slug },
    { label: "Users", value: (r) => r.user_count },
    { label: "Clients", value: (r) => r.client_count },
    { label: "Projects", value: (r) => r.project_count },
    { label: "Status", value: (r) => (r.is_active ? "Active" : "Inactive") },
  ];
  document.getElementById("export-csv-btn").addEventListener("click", () => exportToCSV("organizations", lastRows, EXPORT_COLUMNS));
  document.getElementById("export-xlsx-btn").addEventListener("click", () => exportToExcel("organizations", lastRows, EXPORT_COLUMNS));
})();
