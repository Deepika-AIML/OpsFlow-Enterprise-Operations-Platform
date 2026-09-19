document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("forgot-form");
  const submitBtn = document.getElementById("forgot-submit");
  const resultBox = document.getElementById("result-box");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    setButtonLoading(submitBtn, true, "Sending...");
    try {
      const email = document.getElementById("email").value.trim();
      await Api.post("/auth/password-reset/", { email });
      resultBox.classList.remove("hidden");
      resultBox.innerHTML = `
        <strong>Check your email.</strong> If an account exists for <em>${escapeHtml(email)}</em>,
        a reset link has been sent.<br><br>
        Since this is a local development environment with no real mail server,
        the email (including the reset link) was printed to the <code>web</code>
        container's logs instead - run <code>docker compose logs web</code> to find it.`;
      form.classList.add("hidden");
    } catch (err) {
      toastError(err);
    } finally {
      setButtonLoading(submitBtn, false);
    }
  });
});
