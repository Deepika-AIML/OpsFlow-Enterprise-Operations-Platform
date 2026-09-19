/* Projects - full CRUD for Admin/Manager, read-only for Employee. */
(function () {
  let currentOrdering = "-created_at";
  let editingId = null;
  let lastRows = [];
  let clientsById = {};
  let canWrite = false;

  Layout.init("projects").then(async () => {
    canWrite = Auth.isAdminOrManager();
    document.getElementById("add-project-btn").classList.toggle("hidden", !canWrite);
    await loadClientOptions();
    load();
  });

  async function loadClientOptions() {
    try {
      const data = await Api.get("/clients/", { is_active: "true", page_size: 200, ordering: "name" });
      const clients = data.results || data;
      clientsById = Object.fromEntries(clients.map((c) => [c.id, c.name]));
      const opts = clients.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("");
      document.getElementById("client-filter").innerHTML += opts;
      document.getElementById("project-client").innerHTML += opts;
    } catch (err) { /* filter dropdown just stays minimal on failure */ }
  }

  const searchInput = document.getElementById("search-input");
  ["search-input", "status-filter", "priority-filter", "client-filter"].forEach((id) => {
    const el = document.getElementById(id);
    el.addEventListener(id === "search-input" ? "input" : "change", id === "search-input" ? debounce(load, 350) : load);
  });

  document.querySelectorAll("#project-table th.sortable").forEach((th) => {
    th.addEventListener("click", () => {
      const field = th.dataset.sort;
      currentOrdering = currentOrdering === field ? `-${field}` : field;
      load();
    });
  });

  async function load() {
    const tbody = document.getElementById("project-tbody");
    tbody.innerHTML = loadingRow(7);
    try {
      const data = await Api.get("/projects/", {
        search: searchInput.value.trim() || undefined,
        status: document.getElementById("status-filter").value || undefined,
        priority: document.getElementById("priority-filter").value || undefined,
        client: document.getElementById("client-filter").value || undefined,
        ordering: currentOrdering,
        page_size: 100,
      });
      lastRows = data.results || data;
      renderRows(lastRows);
    } catch (err) {
      tbody.innerHTML = errorStateRow(7, err.message);
    }
  }

  function renderRows(rows) {
    const tbody = document.getElementById("project-tbody");
    if (!rows.length) {
      tbody.innerHTML = emptyStateRow(7, {
        icon: "layers", title: "No projects found",
        message: canWrite ? "Create your first project to start tracking work." : "No projects match your search.",
        actionHtml: canWrite ? `<button class="btn btn-primary btn-sm" onclick="document.getElementById('add-project-btn').click()">+ New Project</button>` : "",
      });
      return;
    }
    tbody.innerHTML = rows.map((p) => `
      <tr>
        <td class="cell-primary">${escapeHtml(p.name)}</td>
        <td class="cell-muted">${escapeHtml(p.client_name || "-")}</td>
        <td>${statusBadge(p.status)}</td>
        <td>${statusBadge(p.priority)}</td>
        <td class="cell-muted">${formatDate(p.start_date)}</td>
        <td class="cell-muted">${formatDate(p.end_date)}</td>
        <td>
          <div class="row-actions">
            <button class="btn btn-outline btn-sm" data-view="${p.id}">${canWrite ? "Edit" : "View"}</button>
            ${canWrite ? `<button class="btn btn-danger btn-sm" data-delete="${p.id}">Delete</button>` : ""}
          </div>
        </td>
      </tr>
    `).join("");

    tbody.querySelectorAll("[data-view]").forEach((btn) => btn.addEventListener("click", () => openModal(btn.dataset.view)));
    tbody.querySelectorAll("[data-delete]").forEach((btn) => btn.addEventListener("click", () => handleDelete(btn.dataset.delete)));
  }

  const modal = document.getElementById("project-modal");
  const errorBox = document.getElementById("project-form-error");
  const saveBtn = document.getElementById("project-save-btn");
  const formFields = ["project-name", "project-description", "project-status", "project-priority", "project-client", "project-start", "project-end"];

  document.getElementById("add-project-btn").addEventListener("click", () => openModal(null));
  document.getElementById("project-cancel-btn").addEventListener("click", closeModal);
  document.getElementById("project-modal-close").addEventListener("click", closeModal);
  modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });

  function openModal(id) {
    editingId = id;
    errorBox.classList.add("hidden");
    document.getElementById("project-form").reset();
    formFields.forEach((f) => document.getElementById(f).disabled = !canWrite);
    saveBtn.classList.toggle("hidden", !canWrite);

    if (id) {
      const p = lastRows.find((x) => x.id === id);
      document.getElementById("project-modal-title").textContent = canWrite ? "Edit Project" : "Project Details";
      document.getElementById("project-name").value = p.name || "";
      document.getElementById("project-description").value = p.description || "";
      document.getElementById("project-status").value = p.status;
      document.getElementById("project-priority").value = p.priority;
      document.getElementById("project-client").value = p.client || "";
      document.getElementById("project-start").value = p.start_date || "";
      document.getElementById("project-end").value = p.end_date || "";
    } else {
      document.getElementById("project-modal-title").textContent = "New Project";
    }
    modal.classList.add("open");
  }
  function closeModal() { modal.classList.remove("open"); }

  saveBtn.addEventListener("click", async () => {
    errorBox.classList.add("hidden");
    const name = document.getElementById("project-name").value.trim();
    if (!name) { errorBox.textContent = "Name is required."; errorBox.classList.remove("hidden"); return; }

    const payload = {
      name,
      description: document.getElementById("project-description").value.trim(),
      status: document.getElementById("project-status").value,
      priority: document.getElementById("project-priority").value,
      client: document.getElementById("project-client").value || null,
      start_date: document.getElementById("project-start").value || null,
      end_date: document.getElementById("project-end").value || null,
    };

    setButtonLoading(saveBtn, true, "Saving...");
    try {
      if (editingId) {
        await Api.patch(`/projects/${editingId}/`, payload);
        toast("Project updated successfully.", "success");
      } else {
        await Api.post("/projects/", payload);
        toast("Project created successfully.", "success");
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
    const p = lastRows.find((x) => x.id === id);
    const ok = await confirmAction({
      title: "Delete project?",
      message: `This will permanently delete "${p ? p.name : "this project"}" and unlink its tasks. This cannot be undone.`,
      confirmLabel: "Delete",
    });
    if (!ok) return;
    try {
      await Api.delete(`/projects/${id}/`);
      toast("Project deleted.", "success");
      load();
    } catch (err) {
      toast(err.message || "Unable to delete project.", "error");
    }
  }

  const EXPORT_COLUMNS = [
    { label: "Name", value: (r) => r.name },
    { label: "Client", value: (r) => r.client_name },
    { label: "Status", value: (r) => r.status },
    { label: "Priority", value: (r) => r.priority },
    { label: "Start Date", value: (r) => r.start_date },
    { label: "End Date", value: (r) => r.end_date },
  ];
  document.getElementById("export-csv-btn").addEventListener("click", () => exportToCSV("projects", lastRows, EXPORT_COLUMNS));
  document.getElementById("export-xlsx-btn").addEventListener("click", () => exportToExcel("projects", lastRows, EXPORT_COLUMNS));
})();
