import { call, ApiError } from "../api.js";
import { initPage, loading, errorBox } from "../layout.js";
import { esc, toast, formatDateTime, tabBar, bindTabs } from "../ui.js";
import { downloadCsv } from "../money.js";

const page = initPage({ active: "audit", title: "Audit and backups" });
if (page) run(page);

async function run({ content }) {
  const tabs = [{ id: "log", label: "Activity log" }, { id: "backups", label: "Backups" }];
  let active = new URLSearchParams(location.search).get("tab") === "backups" ? "backups" : "log";
  content.innerHTML = `<div id="tabs">${tabBar(tabs, active)}</div><div id="panel"></div>`;
  const panel = content.querySelector("#panel");
  bindTabs(content.querySelector("#tabs"), (id) => { active = id; show(); });
  function show() { if (active === "log") logTab(); else backupsTab(); }

  // ------------------------------------------------------------ activity log
  let filters = { action: "", userId: "", from: "", to: "", q: "" };
  let shown = [];

  async function logTab() {
    loading(panel);
    shown = [];
    try {
      const first = await call("audit.list", filters);
      shown = first.rows;
      draw(first);
    } catch (err) { errorBox(panel, err instanceof ApiError ? err.message : "Could not load the activity log."); }
  }

  function draw(r) {
    panel.innerHTML = `
      <p class="muted">A permanent record of sensitive actions: who did what, and when. Nobody can edit or delete it, and only the owner can read it. Passwords are never recorded.</p>
      <form id="filters" class="toolbar" novalidate>
        <select name="action" aria-label="Action"><option value="">All actions</option>${r.actions.map((a) => `<option${a === filters.action ? " selected" : ""}>${esc(a)}</option>`).join("")}</select>
        <select name="userId" aria-label="Person"><option value="">Everyone</option>${r.users.map((u) => `<option value="${esc(u.id)}"${u.id === filters.userId ? " selected" : ""}>${esc(u.name)}</option>`).join("")}</select>
        <input name="from" type="date" value="${esc(filters.from)}" aria-label="From date"><input name="to" type="date" value="${esc(filters.to)}" aria-label="To date">
        <input name="q" type="search" placeholder="Search" value="${esc(filters.q)}" aria-label="Search" class="grow" style="min-width:140px">
        <button class="btn btn-sm" type="submit">Search</button><button class="btn btn-ghost btn-sm" id="reset" type="button">Clear</button>
        <button class="btn btn-ghost btn-sm spacer" id="export" type="button"${shown.length ? "" : " disabled"}>Export CSV</button></form>
      ${r.truncated ? `<div class="alert alert-info">Showing the newest ${r.searched.toLocaleString()} entries. Older ones are still in the Sheet's Audit_Log tab.</div>` : ""}
      ${shown.length ? `<div class="table-wrap"><table class="data"><thead><tr><th>When</th><th>Who</th><th>What</th><th>About</th><th>Details</th></tr></thead><tbody>
        ${shown.map((x) => `<tr><td style="white-space:nowrap">${esc(formatDateTime(x.at))}</td><td><strong>${esc(x.user_name || "-")}</strong><div class="muted">${esc(x.role)}</div></td>
          <td><span class="badge ${/denied|locked|Failed/.test(x.action) ? "rejected" : "cancelled"}">${esc(x.action)}</span></td><td>${esc(x.target)}</td><td class="muted">${esc(x.detail)}</td></tr>`).join("")}</tbody></table></div>
        <p class="muted" style="margin-top:10px">Showing ${shown.length} of ${r.total}.</p>
        ${shown.length < r.total ? `<button class="btn btn-ghost" id="more" type="button">Load more</button>` : ""}`
        : `<div class="card empty">No activity matches.</div>`}`;
    const f = panel.querySelector("#filters");
    f.addEventListener("submit", (e) => {
      e.preventDefault();
      filters = { action: f.action.value, userId: f.userId.value, from: f.from.value, to: f.to.value, q: f.q.value.trim() };
      logTab();
    });
    panel.querySelector("#reset").addEventListener("click", () => { filters = { action: "", userId: "", from: "", to: "", q: "" }; logTab(); });
    panel.querySelector("#export").addEventListener("click", () => downloadCsv("audit-log.csv", ["When", "Who", "Role", "Action", "About", "Details"], shown.map((x) => [x.at, x.user_name, x.role, x.action, x.target, x.detail])));
    const more = panel.querySelector("#more");
    if (more) more.addEventListener("click", async () => {
      more.disabled = true;
      try { const next = await call("audit.list", { ...filters, offset: shown.length }); shown = shown.concat(next.rows); draw(next); } catch (err) { toast(err.message, "error"); more.disabled = false; }
    });
  }

  // ------------------------------------------------------------ backups
  async function backupsTab() {
    loading(panel);
    try {
      const r = await call("backup.list");
      panel.innerHTML = `
        <div class="card">
          <h2>Keep a copy of your data</h2>
          <p>A backup is a full copy of your company's HR data (employees, leave, payroll, reviews and everything else). It is saved in your company's own <strong>Backups</strong> folder in Google Drive, and the newest ${r.keep} are kept.</p>
          <p class="muted">Uploaded files such as CVs, receipts and certificates stay where they are and are not copied again. Your system administrator can also schedule a backup every night.</p>
          <button class="btn" id="now" type="button">Back up now</button>
        </div>
        <h2>Your backups</h2>
        ${r.backups.length ? `<div class="table-wrap"><table class="data"><thead><tr><th>Backup</th><th>Made</th></tr></thead><tbody>
          ${r.backups.map((b) => `<tr><td>${esc(b.name)}</td><td>${esc(formatDateTime(b.created))}</td></tr>`).join("")}</tbody></table></div>
          <p class="muted" style="margin-top:10px">To go back to one of these, ask your system administrator to restore it. Nothing is deleted when that happens: the current data is kept alongside.</p>`
          : `<div class="card empty">No backups yet. Click <strong>Back up now</strong> to make the first one.</div>`}`;
      panel.querySelector("#now").addEventListener("click", async (e) => {
        e.currentTarget.disabled = true;
        toast("Making a backup. This can take a few seconds.");
        try { await call("backup.now"); toast("Backup saved."); backupsTab(); } catch (err) { toast(err.message, "error"); e.currentTarget.disabled = false; }
      });
    } catch (err) { errorBox(panel, err instanceof ApiError ? err.message : "Could not load backups."); }
  }

  show();
}
