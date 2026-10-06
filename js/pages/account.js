import { call, ApiError } from "../api.js";
import { getSession, saveSession } from "../auth.js";
import { initPage } from "../layout.js";
import { esc, showMessage, hideMessage, setBusy, ROLE_LABELS } from "../ui.js";

const forced = new URLSearchParams(location.search).get("forced") === "1";
const page = initPage({ active: "account", title: "My account" });
if (page) run(page);

function run({ session, content }) {
  content.innerHTML = `
    ${session.mustChange ? `<div class="alert alert-info">For your security, please choose a new password before continuing.</div>` : ""}
    <div class="card" style="max-width:520px">
      <h2>Your details</h2>
      <dl class="dl" style="grid-template-columns:100px 1fr">
        <dt>Name</dt><dd>${esc(session.user.name)}</dd>
        <dt>Email</dt><dd>${esc(session.user.email)}</dd>
        <dt>Role</dt><dd>${esc(ROLE_LABELS[session.user.role] || session.user.role)}</dd>
        <dt>Company</dt><dd>${esc(session.company.name)}</dd>
      </dl>
    </div>
    <div class="card" style="max-width:520px">
      <h2>Change password</h2>
      <div id="msg" hidden></div>
      <form id="pw-form" novalidate>
        <div class="field"><label for="cur">Current password</label><input id="cur" name="current" type="password" autocomplete="current-password" required></div>
        <div class="field"><label for="new">New password</label><input id="new" name="next" type="password" autocomplete="new-password" required><div class="hint">At least 8 characters.</div></div>
        <div class="field"><label for="conf">Confirm new password</label><input id="conf" name="confirm" type="password" autocomplete="new-password" required></div>
        <button class="btn" id="pw-btn" type="submit">Change password</button>
      </form>
    </div>`;

  const form = content.querySelector("#pw-form");
  const msg = content.querySelector("#msg");
  const btn = content.querySelector("#pw-btn");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    hideMessage(msg);
    if (form.next.value !== form.confirm.value) return showMessage(msg, "The new passwords do not match.");
    setBusy(btn, true, "Saving...");
    try {
      const r = await call("account.changePassword", { currentPassword: form.current.value, newPassword: form.next.value });
      saveSession({ ...getSession(), token: r.token, mustChange: false });
      if (forced || session.mustChange) { location.href = "dashboard.html"; return; }
      form.reset();
      showMessage(msg, "Password changed.", "ok");
    } catch (err) {
      showMessage(msg, err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setBusy(btn, false);
    }
  });
}
