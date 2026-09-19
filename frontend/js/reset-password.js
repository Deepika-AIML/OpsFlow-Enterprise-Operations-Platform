document.addEventListener("DOMContentLoaded", () => {
  const params = new URLSearchParams(window.location.search);
  const uid = params.get("uid");
  const token = params.get("token");
  const form = document.getElementById("reset-form");
  const errorEl = document.getElementById("form-error");
  const submitBtn = document.getElementById("reset-submit");

  if (!uid || !token) {
    errorEl.textContent = "This password reset link is missing required information. Please request a new one.";
    errorEl.classList.remove("hidden");
    submitBtn.disabled = true;
    return;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorEl.classList.add("hidden");

    const new_password = document.getElementById("new_password").value;
    const new_password_confirm = document.getElementById("new_password_confirm").value;
    if (new_password !== new_password_confirm) {
      errorEl.textContent = "Passwords do not match.";
      errorEl.classList.remove("hidden");
      return;
    }

    setButtonLoading(submitBtn, true, "Resetting...");
    try {
      await Api.post("/auth/password-reset/confirm/", { uid, token, new_password, new_password_confirm });
      toast("Password reset successfully. Please log in.", "success");
      window.location.href = "login.html";
    } catch (err) {
      errorEl.textContent = err.message || "This reset link is invalid or has expired.";
      errorEl.classList.remove("hidden");
    } finally {
      setButtonLoading(submitBtn, false);
    }
  });
});
