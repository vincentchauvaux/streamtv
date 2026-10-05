const login = document.getElementById("login-form");
const register = document.getElementById("register-form");
document.getElementById("to-register").onclick = () => {
  login.hidden = true;
  register.hidden = false;
};
document.getElementById("to-login").onclick = () => {
  register.hidden = true;
  login.hidden = false;
};
async function post(url, body, errEl) {
  errEl.hidden = true;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    errEl.textContent = data.error || "Erreur";
    errEl.hidden = false;
    return;
  }
  location.href = "/app";
}
login.onsubmit = (e) => {
  e.preventDefault();
  const fd = new FormData(login);
  post(
    "/api/auth/login",
    { email: fd.get("email"), password: fd.get("password") },
    document.getElementById("login-err")
  );
};
register.onsubmit = (e) => {
  e.preventDefault();
  const fd = new FormData(register);
  post(
    "/api/auth/register",
    {
      email: fd.get("email"),
      password: fd.get("password"),
      name: fd.get("name") || undefined,
      acceptTerms: fd.get("acceptTerms") === "on",
    },
    document.getElementById("register-err")
  );
};
