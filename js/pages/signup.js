import { call, ApiError } from "../api.js";
import { showMessage, hideMessage, setBusy } from "../ui.js";
import { PRETTY_HOST } from "../pretty-url.js";

const form = document.getElementById("signup-form");
const msg = document.getElementById("message");
const btn = document.getElementById("signup-btn");

const preview = document.getElementById("link-preview");
const showPreview = () => { preview.textContent = PRETTY_HOST + "/" + (form.companyCode.value.trim().toLowerCase() || "your-company"); };
form.companyCode.addEventListener("input", showPreview);
form.companyName.addEventListener("input", () => setTimeout(showPreview));
showPreview();

let codeEdited = false;
form.companyCode.addEventListener("input", () => { codeEdited = true; });
form.companyName.addEventListener("input", () => {
  if (codeEdited) return;
  form.companyCode.value = form.companyName.value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 20);
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  hideMessage(msg);
  if (form.adminPassword.value !== form.confirmPassword.value) {
    showMessage(msg, "The two passwords do not match.");
    return;
  }
  setBusy(btn, true, "Creating your company (this can take a few seconds)...");
  try {
    const r = await call("createCompany", {
      inviteCode: form.inviteCode.value.trim(),
      companyName: form.companyName.value.trim(),
      companyCode: form.companyCode.value.trim(),
      adminName: form.adminName.value.trim(),
      adminEmail: form.adminEmail.value.trim(),
      adminPassword: form.adminPassword.value,
    });
    window.location.href = "index.html?created=1&company=" + encodeURIComponent(r.companyCode);
  } catch (err) {
    showMessage(msg, err instanceof ApiError ? err.message : "Something went wrong.");
    setBusy(btn, false);
  }
});
