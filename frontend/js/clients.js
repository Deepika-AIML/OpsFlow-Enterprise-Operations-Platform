/* Clients - full CRUD for Admin/Manager, read-only for Employee. The
   backend (IsAdminOrManagerOrReadOnly) enforces this independently of
   whatever buttons this page decides to show. */
(function () {
  let currentOrdering = "name";
  let editingId = null;
  let lastRows = [];
  let canWrite = false;

  Layout.init("clients").then(() => {
    canWrite = Auth.isAdminOrManager();
    document.getElementById("add-client-btn").classList.toggle("hidden", !canWrite);
    load();
  });

  const searchInput = document.getElementById("search-input");
  const statusFilter = document.getElementById("status-filter");
  searchInput.addEventListener("input", debounce(load, 350));
  statusFilter.addEventListener("change", load);

  document.querySelectorAll("#client-table th.sortable").forEach((th) => {
    th.addEventListener("click", () => {
      const field = th.dataset.sort;
      currentOrdering = currentOrdering === field ? `-${field}` : field;
      load();
    });
  });

  async function load() {
    const tbody = document.getElementById("client-tbody");
    tbody.innerHTML = loadingRow(6);
    try {
      const data = await Api.get("/clients/", {
        search: searchInput.value.trim() || undefined,
        is_active: statusFilter.value || undefined,
        ordering: currentOrdering,
        page_size: 100,
      });
      lastRows = data.results || data;
      renderRows(lastRows);
    } catch (err) {
      tbody.innerHTML = errorStateRow(6, err.message);
    }
  }

  function renderRows(rows) {
    const tbody = document.getElementById("client-tbody");
    if (!rows.length) {
      tbody.innerHTML = emptyStateRow(6, {
        icon: "briefcase", title: "No clients found",
        message: canWrite ? "Add your first client to start tracking projects for them." : "No clients match your search.",
        actionHtml: canWrite ? `<button class="btn btn-primary btn-sm" onclick="document.getElementById('add-client-btn').click()">+ New Client</button>` : "",
      });
      return;
    }
    tbody.innerHTML = rows.map((c) => `
      <tr>
        <td class="cell-primary">${escapeHtml(c.name)}</td>
        <td class="cell-muted">${escapeHtml(c.email || "-")}</td>
        <td class="cell-muted">${escapeHtml(c.phone || "-")}</td>
        <td class="cell-muted">${formatDate(c.created_at)}</td>
        <td>${c.is_active ? statusBadge("ACTIVE", "Active") : statusBadge("CANCELLED", "Inactive")}</td>
        <td>
          <div class="row-actions">
            ${canWrite ? `
              <button class="btn btn-outline btn-sm" data-edit="${c.id}">Edit</button>
              <button class="btn btn-danger btn-sm" data-delete="${c.id}">Delete</button>
            ` : `<span class="text-sm cell-muted">View only</span>`}
          </div>
        </td>
      </tr>
    `).join("");

    tbody.querySelectorAll("[data-edit]").forEach((btn) => btn.addEventListener("click", () => openModal(btn.dataset.edit)));
    tbody.querySelectorAll("[data-delete]").forEach((btn) => btn.addEventListener("click", () => handleDelete(btn.dataset.delete)));
  }

  const modal = document.getElementById("client-modal");
  const errorBox = document.getElementById("client-form-error");
  const saveBtn = document.getElementById("client-save-btn");

  document.getElementById("add-client-btn").addEventListener("click", () => openModal(null));
  document.getElementById("client-cancel-btn").addEventListener("click", closeModal);
  document.getElementById("client-modal-close").addEventListener("click", closeModal);
  modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });

  function openModal(id) {
    editingId = id;
    errorBox.classList.add("hidden");
    document.getElementById("client-form").reset();
    document.getElementById("client-active-group").classList.toggle("hidden", !id);
    if (id) {
      const c = lastRows.find((x) => x.id === id);
      document.getElementById("client-modal-title").textContent = "Edit Client";
      document.getElementById("client-name").value = c.name || "";
      document.getElementById("client-email").value = c.email || "";
      document.getElementById("client-phone").value = c.phone || "";
      document.getElementById("client-notes").value = c.address || "";
      document.getElementById("client-active").checked = c.is_active;
    } else {
      document.getElementById("client-modal-title").textContent = "New Client";
    }
    modal.classList.add("open");
  }
  function closeModal() { modal.classList.remove("open"); }

  saveBtn.addEventListener("click", async () => {
    errorBox.classList.add("hidden");
    const name = document.getElementById("client-name").value.trim();
    if (!name) { errorBox.textContent = "Name is required."; errorBox.classList.remove("hidden"); return; }

    const payload = {
      name,
      email: document.getElementById("client-email").value.trim() || null,
      phone: document.getElementById("client-phone").value.trim() || null,
      address: document.getElementById("client-notes").value.trim() || null,
    };
    if (editingId) payload.is_active = document.getElementById("client-active").checked;

    setButtonLoading(saveBtn, true, "Saving...");
    try {
      if (editingId) {
        await Api.patch(`/clients/${editingId}/`, payload);
        toast("Client updated successfully.", "success");
      } else {
        await Api.post("/clients/", payload);
        toast("Client created successfully.", "success");
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
    const c = lastRows.find((x) => x.id === id);
    const ok = await confirmAction({
      title: "Delete client?",
      message: `This will permanently delete "${c ? c.name : "this client"}". Related projects will keep their history but lose the client link.`,
      confirmLabel: "Delete",
    });
    if (!ok) return;
    try {
      await Api.delete(`/clients/${id}/`);
      toast("Client deleted.", "success");
      load();
    } catch (err) {
      toast(err.message || "Unable to delete client.", "error");
    }
  }

  const EXPORT_COLUMNS = [
    { label: "Name", value: (r) => r.name },
    { label: "Email", value: (r) => r.email },
    { label: "Phone", value: (r) => r.phone },
    { label: "Created", value: (r) => formatDate(r.created_at) },
    { label: "Status", value: (r) => (r.is_active ? "Active" : "Inactive") },
  ];
  document.getElementById("export-csv-btn").addEventListener("click", () => exportToCSV("clients", lastRows, EXPORT_COLUMNS));
  document.getElementById("export-xlsx-btn").addEventListener("click", () => exportToExcel("clients", lastRows, EXPORT_COLUMNS));
})();
