/* Tasks - the richest RBAC surface in the app:
   - Admin/Manager: full CRUD on any task in the org.
   - Employee: read-only on tasks not assigned to them; on a task assigned
     to them, may change ONLY the status field, and only along an allowed
     transition (mirrors Task.ALLOWED_TRANSITIONS server-side - this is a
     UX nicety, the server independently re-validates and rejects anything
     invalid regardless of what this page allows through).
*/
(function () {
  const ALLOWED_TRANSITIONS = {
    DRAFT: ["PENDING_REVIEW"],
    PENDING_REVIEW: ["APPROVED", "REJECTED", "CHANGES_REQUESTED"],
    CHANGES_REQUESTED: ["PENDING_REVIEW"],
    REJECTED: ["DRAFT"],
    APPROVED: [],
  };

  let currentOrdering = "-created_at";
  let editingTask = null;
  let lastRows = [];
  let members = [];
  let projects = [];
  let currentUser = null;
  let canWriteGlobally = false;

  Layout.init("tasks").then(async () => {
    currentUser = Auth.getUser();
    canWriteGlobally = Auth.isAdminOrManager();
    document.getElementById("add-task-btn").classList.toggle("hidden", !canWriteGlobally);
    await Promise.all([loadMembers(), loadProjectOptions()]);
    load();
  });

  async function loadMembers() {
    try {
      members = await Api.get("/org-members/");
      const opts = members.map((m) => `<option value="${m.id}">${escapeHtml(m.full_name || m.email)}</option>`).join("");
      document.getElementById("task-assignee").innerHTML += opts;
    } catch (err) { /* dropdown just stays minimal */ }
  }

  async function loadProjectOptions() {
    try {
      const data = await Api.get("/projects/", { page_size: 200, ordering: "name" });
      projects = data.results || data;
      const opts = projects.map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join("");
      document.getElementById("project-filter").innerHTML += opts;
      document.getElementById("task-project").innerHTML += opts;
    } catch (err) { /* ignore */ }
  }

  ["search-input", "status-filter", "priority-filter", "project-filter", "mine-only"].forEach((id) => {
    const el = document.getElementById(id);
    const evt = id === "search-input" ? "input" : "change";
    el.addEventListener(evt, id === "search-input" ? debounce(load, 350) : load);
  });

  document.querySelectorAll("#task-table th.sortable").forEach((th) => {
    th.addEventListener("click", () => {
      const field = th.dataset.sort;
      currentOrdering = currentOrdering === field ? `-${field}` : field;
      load();
    });
  });

  async function load() {
    const tbody = document.getElementById("task-tbody");
    tbody.innerHTML = loadingRow(7);
    try {
      const data = await Api.get("/tasks/", {
        search: document.getElementById("search-input").value.trim() || undefined,
        status: document.getElementById("status-filter").value || undefined,
        priority: document.getElementById("priority-filter").value || undefined,
        project: document.getElementById("project-filter").value || undefined,
        assigned_to_me: document.getElementById("mine-only").checked ? "true" : undefined,
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
    const tbody = document.getElementById("task-tbody");
    if (!rows.length) {
      tbody.innerHTML = emptyStateRow(7, {
        icon: "check", title: "No tasks found",
        message: canWriteGlobally ? "Create a task to start assigning work." : "No tasks match your search.",
        actionHtml: canWriteGlobally ? `<button class="btn btn-primary btn-sm" onclick="document.getElementById('add-task-btn').click()">+ New Task</button>` : "",
      });
      return;
    }
    tbody.innerHTML = rows.map((t) => {
      const isMine = t.assignee === currentUser.id;
      const canOpen = canWriteGlobally || isMine || true; // always viewable read-only
      return `
      <tr>
        <td class="cell-primary">${escapeHtml(t.title)} ${t.is_locked ? '<span class="badge badge-neutral">Locked</span>' : ""}</td>
        <td class="cell-muted">${escapeHtml(t.project_name || "-")}</td>
        <td class="cell-muted">${escapeHtml(t.assignee_name || "Unassigned")}</td>
        <td>${statusBadge(t.priority)}</td>
        <td>${statusBadge(t.status)}</td>
        <td class="cell-muted">${formatDate(t.due_date)}</td>
        <td>
          <div class="row-actions">
            <button class="btn btn-outline btn-sm" data-view="${t.id}">${canWriteGlobally || isMine ? "Edit" : "View"}</button>
            ${canWriteGlobally ? `<button class="btn btn-danger btn-sm" data-delete="${t.id}">Delete</button>` : ""}
          </div>
        </td>
      </tr>`;
    }).join("");

    tbody.querySelectorAll("[data-view]").forEach((btn) => btn.addEventListener("click", () => openModal(btn.dataset.view)));
    tbody.querySelectorAll("[data-delete]").forEach((btn) => btn.addEventListener("click", () => handleDelete(btn.dataset.delete)));
  }

  const modal = document.getElementById("task-modal");
  const errorBox = document.getElementById("task-form-error");
  const saveBtn = document.getElementById("task-save-btn");
  const statusHint = document.getElementById("task-status-hint");
  const ALL_FIELDS = ["task-title", "task-description", "task-project", "task-assignee", "task-priority", "task-due", "task-status"];

  document.getElementById("add-task-btn").addEventListener("click", () => openModal(null));
  document.getElementById("task-cancel-btn").addEventListener("click", closeModal);
  document.getElementById("task-modal-close").addEventListener("click", closeModal);
  modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });

  let statusOnlyMode = false;

  function openModal(id) {
    editingTask = id ? lastRows.find((t) => t.id === id) : null;
    errorBox.classList.add("hidden");
    statusHint.textContent = "";
    document.getElementById("task-form").reset();

    const isMine = editingTask && editingTask.assignee === currentUser.id;
    const isLocked = editingTask && editingTask.is_locked;
    const fullEdit = !editingTask ? canWriteGlobally : (canWriteGlobally && !isLocked);
    const statusOnlyEdit = editingTask && !canWriteGlobally && isMine && !isLocked;
    statusOnlyMode = !!statusOnlyEdit;

    ALL_FIELDS.forEach((f) => document.getElementById(f).disabled = true);
    if (fullEdit) ALL_FIELDS.forEach((f) => document.getElementById(f).disabled = false);
    if (statusOnlyEdit) document.getElementById("task-status").disabled = false;
    saveBtn.classList.toggle("hidden", !(fullEdit || statusOnlyEdit));

    if (editingTask) {
      document.getElementById("task-modal-title").textContent = fullEdit || statusOnlyEdit ? "Edit Task" : "Task Details";
      document.getElementById("task-title").value = editingTask.title || "";
      document.getElementById("task-description").value = editingTask.description || "";
      document.getElementById("task-project").value = editingTask.project || "";
      document.getElementById("task-assignee").value = editingTask.assignee || "";
      document.getElementById("task-priority").value = editingTask.priority;
      document.getElementById("task-due").value = editingTask.due_date || "";
      document.getElementById("task-status").value = editingTask.status;

      if (statusOnlyEdit) {
        const next = ALLOWED_TRANSITIONS[editingTask.status] || [];
        statusHint.textContent = next.length
          ? `You can move this task to: ${next.join(", ").replace(/_/g, " ")}.`
          : "This task cannot be moved to a new status.";
        restrictStatusOptions([editingTask.status, ...next]);
      } else {
        restrictStatusOptions(null);
      }
      if (isLocked) statusHint.textContent = "This task was approved and is now locked.";
    } else {
      document.getElementById("task-modal-title").textContent = "New Task";
      restrictStatusOptions(null);
    }
    modal.classList.add("open");
  }

  function restrictStatusOptions(allowedValues) {
    document.querySelectorAll("#task-status option").forEach((opt) => {
      opt.hidden = !!allowedValues && !allowedValues.includes(opt.value);
    });
  }

  function closeModal() { modal.classList.remove("open"); }

  saveBtn.addEventListener("click", async () => {
    errorBox.classList.add("hidden");
    let payload;

    if (editingTask && statusOnlyMode) {
      // Status-only edit path (Employee updating their own task)
      payload = { status: document.getElementById("task-status").value };
    } else {
      const title = document.getElementById("task-title").value.trim();
      if (!title) { errorBox.textContent = "Title is required."; errorBox.classList.remove("hidden"); return; }
      payload = {
        title,
        description: document.getElementById("task-description").value.trim(),
        project: document.getElementById("task-project").value || null,
        assignee: document.getElementById("task-assignee").value || null,
        priority: document.getElementById("task-priority").value,
        due_date: document.getElementById("task-due").value || null,
        status: document.getElementById("task-status").value,
      };
    }

    setButtonLoading(saveBtn, true, "Saving...");
    try {
      if (editingTask) {
        await Api.patch(`/tasks/${editingTask.id}/`, payload);
        toast("Task updated successfully.", "success");
      } else {
        await Api.post("/tasks/", payload);
        toast("Task created successfully.", "success");
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
    const t = lastRows.find((x) => x.id === id);
    const ok = await confirmAction({
      title: "Delete task?",
      message: `This will permanently delete "${t ? t.title : "this task"}". This cannot be undone.`,
      confirmLabel: "Delete",
    });
    if (!ok) return;
    try {
      await Api.delete(`/tasks/${id}/`);
      toast("Task deleted.", "success");
      load();
    } catch (err) {
      toast(err.message || "Unable to delete task.", "error");
    }
  }

  const EXPORT_COLUMNS = [
    { label: "Title", value: (r) => r.title },
    { label: "Project", value: (r) => r.project_name },
    { label: "Assignee", value: (r) => r.assignee_name },
    { label: "Priority", value: (r) => r.priority },
    { label: "Status", value: (r) => r.status },
    { label: "Due Date", value: (r) => r.due_date },
  ];
  document.getElementById("export-csv-btn").addEventListener("click", () => exportToCSV("tasks", lastRows, EXPORT_COLUMNS));
  document.getElementById("export-xlsx-btn").addEventListener("click", () => exportToExcel("tasks", lastRows, EXPORT_COLUMNS));
})();
