/* Settings - theme preference (persisted in localStorage, applied via a
   data-theme attribute the whole stylesheet keys off of) and the
   change-password flow (POST /api/v1/auth/change-password/). */
(function () {
  Layout.init("settings").then(() => {
    document.getElementById("dark-mode-toggle").checked = getStoredTheme() === "dark";
  });

  document.getElementById("dark-mode-toggle").addEventListener("change", (e) => {
    applyTheme(e.target.checked ? "dark" : "light");
    const themeBtn = document.getElementById("theme-toggle");
    if (themeBtn) themeBtn.innerHTML = e.target.checked ? Icons.sun : Icons.moon;
  });

  const form = document.getElementById("password-form");
  const errorBox = document.getElementById("password-form-error");
  const saveBtn = document.getElementById("password-save-btn");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorBox.classList.add("hidden");
    const old_password = document.getElementById("old-password").value;
    const new_password = document.getElementById("new-password").value;
    const new_password_confirm = document.getElementById("new-password-confirm").value;

    if (new_password !== new_password_confirm) {
      errorBox.textContent = "New passwords do not match.";
      errorBox.classList.remove("hidden");
      return;
    }

    setButtonLoading(saveBtn, true, "Updating...");
    try {
      await Api.post("/auth/change-password/", { old_password, new_password, new_password_confirm });
      toast("Password updated successfully.", "success");
      form.reset();
    } catch (err) {
      errorBox.textContent = err.message;
      errorBox.classList.remove("hidden");
    } finally {
      setButtonLoading(saveBtn, false);
    }
  });
})();
