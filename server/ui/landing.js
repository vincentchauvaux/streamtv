const form = document.getElementById("login-form");
const errEl = document.getElementById("login-err");
const btn = document.getElementById("login-btn");

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  errEl.hidden = true;
  btn.disabled = true;
  const fd = new FormData(form);
  const email = String(fd.get("email") || "").trim();
  const password = String(fd.get("password") || "");
  try {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      errEl.textContent = data.error || "Connexion refusée";
      errEl.hidden = false;
      btn.disabled = false;
      return;
    }
    location.replace("/app");
  } catch {
    errEl.textContent = "Impossible de joindre le serveur";
    errEl.hidden = false;
    btn.disabled = false;
  }
});
