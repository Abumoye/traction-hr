import { call, ApiError } from "../api.js";
import { saveSession, getSession } from "../auth.js";
import { showMessage, hideMessage, setBusy } from "../ui.js";
import { companyLinks } from "../pretty-url.js";

const form = document.getElementById("login-form");
const msg = document.getElementById("message");
const btn = document.getElementById("login-btn");
const testBtn = document.getElementById("test-connection");

const params = new URLSearchParams(location.search);
let hint = "";
try { hint = sessionStorage.getItem("tol_company_hint") || ""; } catch (e) {}

// Someone already signed in goes straight to their company, unless the address named a different company.
const existing = getSession();
if (existing && (!params.get("company") || params.get("company").toLowerCase() === existing.company.code)) {
  window.location.href = "dashboard.html";
}
if (params.get("company") || hint) form.companyCode.value = params.get("company") || hint;
if (params.get("timeout")) showMessage(msg, "You were signed out because the page was idle for a while. Please sign in again.", "info");
if (params.get("created")) {
  const links = params.get("company") ? companyLinks(params.get("company")) : null;
  showMessage(msg, "Company created. Sign in with the email and password you just chose." + (links ? " Your company's sign-in link is " + links.signIn + " (share this with your staff)." : ""), "ok");
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  hideMessage(msg);
  setBusy(btn, true, "Signing in...");
  try {
    const session = await call("login", {
      companyCode: form.companyCode.value.trim(),
      email: form.email.value.trim(),
      password: form.password.value,
    });
    saveSession(session);
    window.location.href = "dashboard.html";
  } catch (err) {
    showMessage(msg, err instanceof ApiError ? err.message : "Something went wrong.");
  } finally {
    setBusy(btn, false);
  }
});

testBtn.addEventListener("click", async () => {
  hideMessage(msg);
  try {
    const r = await call("ping");
    showMessage(msg, r.message, "ok");
  } catch (err) {
    showMessage(msg, err.message, "info");
  }
});
