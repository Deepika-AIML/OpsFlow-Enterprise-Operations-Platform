/* User Management - Admin-only. Role changes and activate/deactivate are
   the only writable actions (PATCH /admin/users/<id>/); the backend
   independently protects the sole remaining Admin from being demoted or
   deactivated, and every change here is captured in the Audit Logs. */
(function () {
  let currentOrdering = "-date_joined";
  let editingId = null;
  let lastRows = [];

  Layout.init("user-management").then(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("role")) document.getElementById("role-filter").value = params.get("role");
    if (params.get("is_active")) document.getElementById("status-filter").value = params.get("is_active");
    load();
  });

  ["search-input", "role-filter", "status-filter"].forEach((id) => {
    const el = document.getElementById(id);
    el.addEventListener(id === "search-input" ? "input" : "change", id === "search-input" ? debounce(load, 350) : load);
  });

  document.querySelectorAll("#user-table th.sortable").forEach((th) => {
    th.addEventListener("click", () => {
      const field = th.dataset.sort;
      currentOrdering = currentOrdering === field ? `-${field}` : field;
      load();
    });
  });

  async function load() {
    const tbody = document.getElementById("user-tbody");
    tbody.innerHTML = loadingRow(5);
    try {
      const data = await Api.get("/admin/users/", {
        search: document.getElementById("search-input").value.trim() || undefined,
        role: document.getElementById("role-filter").value || undefined,
        is_active: document.getElementById("status-filter").value || undefined,
        ordering: currentOrdering,
        page_size: 100,
      });
      lastRows = data.results || data;
      renderRows(lastRows);
    } catch (err) {
      tbody.innerHTML = errorStateRow(5, err.message);
    }
  }

  function renderRows(rows) {
    const tbody = document.getElementById("user-tbody");
    if (!rows.length) {
      tbody.innerHTML = emptyStateRow(5, { icon: "users", title: "No users found", message: "Try a different search or filter." });
      return;
    }
    const me = Auth.getUser();
    tbody.innerHTML = rows.map((u) => `
      <tr>
        <td><div class="cell-primary">${escapeHtml(u.first_name || "")} ${escapeHtml(u.last_name || "")}</div><div class="cell-muted text-sm">${escapeHtml(u.email)}</div></td>
        <td>${statusBadge(u.role, u.role)}</td>
        <td>${u.is_active ? statusBadge("ACTIVE", "Active") : statusBadge("CANCELLED", "Inactive")}</td>
        <td class="cell-muted">${formatDate(u.date_joined)}</td>
        <td>
          <div class="row-actions">
            <button class="btn btn-outline btn-sm" data-edit="${u.id}">${u.id === me.id ? "View" : "Edit"}</button>
          </div>
        </td>
      </tr>
    `).join("");
    tbody.querySelectorAll("[data-edit]").forEach((btn) => btn.addEventListener("click", () => openEditModal(btn.dataset.edit)));
  }

  const modal = document.getElementById("user-modal");
  const errorBox = document.getElementById("user-form-error");
  const saveBtn = document.getElementById("user-save-btn");

  document.getElementById("add-user-btn").addEventListener("click", openCreateModal);
  document.getElementById("user-cancel-btn").addEventListener("click", closeModal);
  document.getElementById("user-modal-close").addEventListener("click", closeModal);
  modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });

  function openCreateModal() {
    editingId = null;
    errorBox.classList.add("hidden");
    document.getElementById("user-form").reset();
    document.getElementById("user-modal-title").textContent = "New User";
    document.getElementById("create-fields").classList.remove("hidden");
    document.getElementById("user-active-group").classList.add("hidden");
    document.getElementById("user-role").disabled = false;
    modal.classList.add("open");
  }

  function openEditModal(id) {
    editingId = id;
    errorBox.classList.add("hidden");
    document.getElementById("user-form").reset();
    const u = lastRows.find((x) => x.id === id);
    const isSelf = id === Auth.getUser().id;

    document.getElementById("user-modal-title").textContent = isSelf ? "Your Account" : `Edit ${u.first_name || u.email}`;
    document.getElementById("create-fields").classList.add("hidden");
    document.getElementById("user-active-group").classList.remove("hidden");
    document.getElementById("user-role").value = u.role === "ADMIN" ? "EMPLOYEE" : u.role;
    document.getElementById("user-role").disabled = isSelf || u.role === "ADMIN";
    document.getElementById("user-active").checked = u.is_active;
    document.getElementById("user-active").disabled = isSelf;
    saveBtn.classList.toggle("hidden", isSelf);
    if (u.role === "ADMIN") {
      document.getElementById("user-form-error").classList.remove("hidden");
      document.getElementById("user-form-error").textContent = "This account is an Admin. Admin role changes must be made directly via a pre-configured process, not through this screen.";
      saveBtn.classList.add("hidden");
    } else {
      errorBox.classList.add("hidden");
    }
    modal.classList.add("open");
  }

  function closeModal() { modal.classList.remove("open"); }

  saveBtn.addEventListener("click", async () => {
    errorBox.classList.add("hidden");
    setButtonLoading(saveBtn, true, "Saving...");
    try {
      if (editingId) {
        await Api.patch(`/admin/users/${editingId}/`, {
          role: document.getElementById("user-role").value,
          is_active: document.getElementById("user-active").checked,
        });
        toast("User updated successfully.", "success");
      } else {
        const email = document.getElementById("user-email").value.trim();
        const password = document.getElementById("user-password").value;
        if (!email || !password) {
          errorBox.textContent = "Email and a temporary password are required.";
          errorBox.classList.remove("hidden");
          setButtonLoading(saveBtn, false);
          return;
        }
        await Api.post("/admin/users/", {
          email, password,
          first_name: document.getElementById("user-first-name").value.trim(),
          last_name: document.getElementById("user-last-name").value.trim(),
          role: document.getElementById("user-role").value,
        });
        toast("User created successfully.", "success");
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
})();
