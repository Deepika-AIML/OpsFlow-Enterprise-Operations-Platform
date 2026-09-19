/* Profile - self-service, GET/PATCH /api/v1/auth/me/. Only first/last name
   are writable; the backend silently ignores anything else in the body
   (role/status/org changes always go through Admin User Management). */
(function () {
  Layout.init("profile").then(load);

  const form = document.getElementById("profile-form");
  const errorBox = document.getElementById("profile-form-error");
  const saveBtn = document.getElementById("profile-save-btn");
  const ROLE_LABELS = { ADMIN: "Admin", MANAGER: "Manager", EMPLOYEE: "Employee" };

  async function load() {
    try {
      const me = await Api.get("/auth/me/");
      document.getElementById("first-name").value = me.first_name || "";
      document.getElementById("last-name").value = me.last_name || "";
      document.getElementById("profile-email").value = me.email;
      document.getElementById("profile-role").value = ROLE_LABELS[me.role] || me.role;
      document.getElementById("profile-org").value = me.organization_name || "";
    } catch (err) {
      toastError(err);
    }
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorBox.classList.add("hidden");
    setButtonLoading(saveBtn, true, "Saving...");
    try {
      const updated = await Api.patch("/auth/me/", {
        first_name: document.getElementById("first-name").value.trim(),
        last_name: document.getElementById("last-name").value.trim(),
      });
      Auth.setUser({ ...Auth.getUser(), ...updated });
      toast("Profile updated successfully.", "success");
    } catch (err) {
      errorBox.textContent = err.message;
      errorBox.classList.remove("hidden");
    } finally {
      setButtonLoading(saveBtn, false);
    }
  });
})();
