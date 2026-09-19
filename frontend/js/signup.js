/* Public signup. Deliberately sends only full_name/email/password/
   password_confirm - there is no role field anywhere on this page, and
   the backend would ignore one even if it were added here. */
(function () {
  if (Auth.isLoggedIn()) {
    window.location.href = "dashboard.html";
    return;
  }

  const form = document.getElementById("signup-form");
  const errorBox = document.getElementById("form-error");
  const submitBtn = document.getElementById("signup-submit");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorBox.classList.add("hidden");

    const payload = {
      full_name: document.getElementById("full_name").value.trim(),
      email: document.getElementById("email").value.trim(),
      password: document.getElementById("password").value,
      password_confirm: document.getElementById("password_confirm").value,
    };

    if (payload.password !== payload.password_confirm) {
      errorBox.textContent = "Passwords do not match.";
      errorBox.classList.remove("hidden");
      return;
    }

    setButtonLoading(submitBtn, true, "Creating account...");
    try {
      await Api.post("/auth/register/", payload);
      const data = await Api.post("/auth/token/", { email: payload.email, password: payload.password });
      Auth.setTokens(data.access, data.refresh);
      Auth.setUser(data.user);
      window.location.href = "dashboard.html";
    } catch (err) {
      errorBox.textContent = err.message || "Unable to create your account.";
      errorBox.classList.remove("hidden");
    } finally {
      setButtonLoading(submitBtn, false);
    }
  });
})();
