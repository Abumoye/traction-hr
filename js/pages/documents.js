import { call, ApiError } from "../api.js";
import { initPage, loading, errorBox, canManageStaff } from "../layout.js";
import { esc, toast, formatDate, tabBar, bindTabs } from "../ui.js";
import { renderEmployeeDocuments, downloadDoc, openReviewDialog } from "../documents-ui.js";

const page = initPage({ active: "documents", title: "Documents" });
if (page) run(page);

async function run({ session, role, content }) {
  const isHr = canManageStaff(role);
  const linked = !!session.user.employeeId;
  const tabs = [];
  if (isHr) tabs.push({ id: "review", label: "To review" }, { id: "missing", label: "Missing" }, { id: "expiring", label: "Expiring" });
  if (linked) tabs.push({ id: "mine", label: "My documents" });
  if (isHr) tabs.push({ id: "required", label: "Required documents" });
  if (!tabs.length) return errorBox(content, "Your login is not linked to an employee record yet. Ask HR to link it.");
  const wanted = new URLSearchParams(location.search).get("tab");
  let active = tabs.some((t) => t.id === wanted) ? wanted : tabs[0].id;

  content.innerHTML = `${tabs.length > 1 ? `<div id="tabs">${tabBar(tabs, active)}</div>` : ""}<div id="panel"></div>`;
  const panel = content.querySelector("#panel");
  const tabsEl = content.querySelector("#tabs");
  if (tabsEl) bindTabs(tabsEl, (id) => { active = id; show(); });
  const fail = (err, text) => errorBox(panel, err instanceof ApiError ? err.message : text);
  function show() {
    if (active === "mine") return mineTab();
    if (active === "review") return queueTab("review");
    if (active === "missing") return queueTab("missing");
    if (active === "expiring") return queueTab("expiring");
    return requiredTab();
  }

  // ------------------------------------------------------------ my own documents
  async function mineTab() {
    loading(panel);
    try {
      const data = await call("docs.list", {});
      const need = data.checklist.filter((c) => c.state === "missing" || c.state === "rejected").length;
      panel.innerHTML = `<div class="card"><h2>My documents</h2>
        <p class="muted">${need ? `${need} required document${need === 1 ? " is" : "s are"} still needed.` : "Everything required is uploaded."} Upload each one; HR reviews it, and asks you to upload it again if something is wrong. You can upload documents but not delete them.</p>
        <div id="docs"></div></div>`;
      renderEmployeeDocuments(panel.querySelector("#docs"), data, { mySelf: true, onChange: mineTab });
    } catch (err) { fail(err, "Could not load your documents."); }
  }

  // ------------------------------------------------------------ HR queues
  async function queueTab(which) {
    loading(panel);
    try {
      const q = await call("docs.queue");
      if (which === "review") {
        panel.innerHTML = q.pending.length
          ? `<div class="table-wrap"><table class="data"><thead><tr><th>Employee</th><th>Document</th><th>Uploaded</th><th></th></tr></thead><tbody>
            ${q.pending.map((d) => `<tr><td><strong>${esc(d.employee_name)}</strong><div class="muted">${esc(d.employee_no)}</div></td>
              <td>${esc(d.label)}<div class="muted">${esc(d.file_name)}${d.note ? " &middot; " + esc(d.note) : ""}</div></td>
              <td class="muted">${esc(d.uploaded_by)}<div style="font-size:12px">${esc(formatDate(d.uploaded_at.slice(0, 10)))}</div></td>
              <td style="text-align:right;white-space:nowrap"><button class="btn btn-ghost btn-sm" data-dl="${esc(d.id)}" type="button">Open</button>
                <button class="btn btn-sm" data-ok="${esc(d.id)}" type="button">Approve</button><button class="btn btn-ghost btn-sm" data-no="${esc(d.id)}" type="button">Reject</button></td></tr>`).join("")}</tbody></table></div>`
          : `<div class="card empty">Nothing is waiting for review.</div>`;
        panel.querySelectorAll("[data-dl]").forEach((b) => b.addEventListener("click", () => downloadDoc(b.dataset.dl)));
        const find = (id) => q.pending.find((d) => d.id === id);
        panel.querySelectorAll("[data-ok]").forEach((b) => b.addEventListener("click", () => openReviewDialog(find(b.dataset.ok), "approved", () => queueTab("review"))));
        panel.querySelectorAll("[data-no]").forEach((b) => b.addEventListener("click", () => openReviewDialog(find(b.dataset.no), "rejected", () => queueTab("review"))));
      } else if (which === "missing") {
        panel.innerHTML = q.missing.length
          ? `<p class="muted" style="margin-bottom:12px">Active staff who have not uploaded every required document, or whose upload was rejected. Open a person to upload for them or to follow up.</p>
            <div class="table-wrap"><table class="data"><thead><tr><th>Employee</th><th>Not uploaded</th><th>Rejected</th><th></th></tr></thead><tbody>
            ${q.missing.map((m) => `<tr><td><strong>${esc(m.name)}</strong><div class="muted">${esc(m.employee_no)}${m.waiting ? ` &middot; ${m.waiting} waiting for review` : ""}</div></td>
              <td>${m.missing.length ? esc(m.missing.join(", ")) : '<span class="muted">None</span>'}</td><td>${m.rejected.length ? esc(m.rejected.join(", ")) : '<span class="muted">None</span>'}</td>
              <td style="text-align:right"><a class="btn btn-ghost btn-sm" href="employee.html?id=${encodeURIComponent(m.employee_id)}">Open profile</a></td></tr>`).join("")}</tbody></table></div>`
          : `<div class="card empty">Everyone has uploaded every required document.</div>`;
      } else {
        panel.innerHTML = q.expiring.length
          ? `<div class="table-wrap"><table class="data"><thead><tr><th>Employee</th><th>Document</th><th>Expires</th><th></th></tr></thead><tbody>
            ${q.expiring.map((d) => `<tr><td><strong>${esc(d.employee_name)}</strong></td><td>${esc(d.label)}</td><td>${esc(formatDate(d.expires_on))} <span class="badge doc-${d.expiry === "expired" ? "rejected" : "pending"}">${d.expiry === "expired" ? "Expired" : "Expires soon"}</span></td>
              <td style="text-align:right"><a class="btn btn-ghost btn-sm" href="employee.html?id=${encodeURIComponent(d.employee_id)}">Open profile</a></td></tr>`).join("")}</tbody></table></div>`
          : `<div class="card empty">No approved document is expired or about to expire (within 30 days).</div>`;
      }
    } catch (err) { fail(err, "Could not load the list."); }
  }

  // ------------------------------------------------------------ which documents are required
  async function requiredTab() {
    loading(panel);
    try {
      const q = await call("docs.queue");
      panel.innerHTML = `<div class="card" style="max-width:560px"><h2>Required documents</h2>
        <p class="muted">Every employee is asked for these. They show on the employee's Documents page and on HR's Missing list.</p>
        <div id="r-msg" class="alert alert-error" hidden></div>
        <form id="req-form" novalidate>${q.types.filter((t) => t.id !== "other").map((t) => `<div class="field"><label class="check"><input type="checkbox" name="req" value="${esc(t.id)}"${q.required.includes(t.id) ? " checked" : ""}> ${esc(t.label)}</label></div>`).join("")}
          <button class="btn" type="submit">Save</button></form></div>`;
      panel.querySelector("#req-form").addEventListener("submit", async (ev) => {
        ev.preventDefault();
        const required = [...ev.target.querySelectorAll("input[name=req]:checked")].map((c) => c.value);
        try { await call("docs.settingsSave", { required }); toast("Saved."); }
        catch (err) { const m = panel.querySelector("#r-msg"); m.textContent = err.message; m.hidden = false; }
      });
    } catch (err) { fail(err, "Could not load the settings."); }
  }

  show();
}
