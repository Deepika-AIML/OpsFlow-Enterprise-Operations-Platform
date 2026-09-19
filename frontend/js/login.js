/* Login page. No role selection anywhere - the backend alone determines
   the authenticated user's role, and this page simply reflects it. */
(function () {
  if (Auth.isLoggedIn()) {
    window.location.href = "dashboard.html";
    return;
  }
  consumeFlash();

  const form = document.getElementById("login-form");
  const errorBox = document.getElementById("form-error");
  const submitBtn = document.getElementById("login-submit");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorBox.classList.add("hidden");
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;

    setButtonLoading(submitBtn, true, "Logging in...");
    try {
      const data = await Api.post("/auth/token/", { email, password });
      Auth.setTokens(data.access, data.refresh);
      Auth.setUser(data.user);
      window.location.href = "dashboard.html";
    } catch (err) {
      const message = err.status === 401
        ? "Incorrect email or password."
        : (err.message || "Unable to log in right now.");
      errorBox.textContent = message;
      errorBox.classList.remove("hidden");
    } finally {
      setButtonLoading(submitBtn, false);
    }
  });
})();
