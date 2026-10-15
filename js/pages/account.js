import { call, ApiError, timing } from "../api.js";
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
      <h2>Speed check</h2>
      <p class="muted">If pages feel slow, this shows whether the wait is your internet connection, Google's servers, or the system's own work.</p>
      <div id="speed-out" aria-live="polite"></div>
      <button class="btn btn-ghost btn-sm" id="speed-btn" type="button">Run speed check</button>
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

  content.querySelector("#speed-btn").addEventListener("click", (e) => speedCheck(e.currentTarget, content.querySelector("#speed-out")));

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

// Measures where the waiting goes. Each step is tried twice and the faster one is shown, because the first request after a
// quiet spell is often slower while Google wakes the server up.
const secs = (ms) => (ms / 1000).toFixed(1) + " s";

async function best(fn) {
  const first = await fn();
  const second = await fn();
  return { ...(second.total < first.total ? second : first), firstTotal: first.total };
}

async function speedCheck(btn, out) {
  btn.disabled = true;
  out.innerHTML = `<p class="muted"><span class="spinner"></span>Measuring... this takes about 10 seconds.</p>`;
  try {
    // 1. a small file from this website's own host: your connection, without Google
    const site = await best(async () => {
      const t0 = performance.now();
      await fetch("css/tokens.css?speed=" + Date.now(), { cache: "no-store" });
      return { total: Math.round(performance.now() - t0) };
    });
    // 2. the server asked to do nothing: Google's fixed cost per request, plus the distance to it
    const ping = await best(async () => { await call("ping"); return { ...timing.last }; });
    // 3. a real signed-in request: adds the system's own work (sign-in check, reading your company's data)
    const me = await best(async () => { await call("me"); return { ...timing.last }; });

    const lines = [
      ["Loading a small file from this website", secs(site.total)],
      ["Reaching the HR server with nothing to do", secs(ping.total) + (ping.server !== null ? ` (server work ${secs(ping.server)})` : "")],
      ["A normal signed-in request", secs(me.total) + (me.server !== null ? ` (server work ${secs(me.server)})` : "")],
    ];
    const verdict = [];
    if (site.total > 1500) verdict.push("Your internet connection looks slow: even a small file from the website takes " + secs(site.total) + ". Every page loads several files, so this alone makes everything feel slow.");
    if (ping.total > 2000) verdict.push("Google's servers take about " + secs(ping.total) + " to answer even an empty request. Every action in the app pays this once. It comes from Google and the distance to it, not from the work the system does.");
    if (me.server !== null && me.server > 1000) verdict.push("The system itself spent " + secs(me.server) + " working on that request, which is longer than it should. Please tell Traction Outsourcing.");
    if (!verdict.length) verdict.push("Nothing here looks unusually slow. If a page still feels slow, it may be asking for a lot of data: tell us which page.");
    out.innerHTML = `<dl class="dl" style="grid-template-columns:1fr auto;margin-bottom:10px">${lines.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>
      ${verdict.map((v) => `<p class="hint" style="margin:6px 0">${esc(v)}</p>`).join("")}`;
  } catch (err) {
    out.innerHTML = `<div class="alert alert-error">${esc(err instanceof ApiError ? err.message : "The speed check could not finish.")}</div>`;
  } finally {
    btn.disabled = false;
  }
}
