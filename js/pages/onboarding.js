import { call, ApiError } from "../api.js";
import { initPage, loading, errorBox } from "../layout.js";
import { esc, openModal, confirmDialog, toast, formatDate, tabBar, bindTabs, rowLinks, todayLagos } from "../ui.js";

const page = initPage({ active: "onboarding", title: "Onboarding" });
if (page) run(page);

const CATS = ["HR", "IT", "Manager", "Employee"];

async function run({ content }) {
  const employeeId = new URLSearchParams(location.search).get("employee");
  if (employeeId) return checklist(content, employeeId);

  let active = "hires";
  content.innerHTML = `<div id="tabs">${tabBar([{ id: "hires", label: "New hires" }, { id: "template", label: "Checklist template" }], active)}</div><div id="panel"></div>`;
  const panel = content.querySelector("#panel");
  bindTabs(content.querySelector("#tabs"), (id) => { active = id; show(); });
  function show() { if (active === "hires") hiresTab(); else templateTab(); }

  async function hiresTab() {
    loading(panel);
    try {
      const rows = await call("onboarding.list");
      panel.innerHTML = rows.length
        ? `<p class="muted">Everyone who has an onboarding checklist. Hiring someone from Recruitment creates theirs automatically.</p>
          <div class="table-wrap"><table class="data"><thead><tr><th>Employee</th><th>Started</th><th>Progress</th><th>Next due</th><th></th></tr></thead><tbody>
          ${rows.map((r) => `<tr class="click" data-href="onboarding.html?employee=${encodeURIComponent(r.employee_id)}"><td><strong>${esc(r.name)}</strong><div class="muted">${esc(r.job_title)}${r.department ? " &middot; " + esc(r.department) : ""}</div></td>
            <td>${esc(formatDate(r.date_joined))}</td>
            <td><div style="display:flex;gap:10px;align-items:center"><div class="progress"><span style="width:${Math.round((r.done / r.total) * 100)}%"></span></div><span>${r.done}/${r.total}</span></div></td>
            <td>${r.done === r.total ? '<span class="badge paid">Complete</span>' : esc(formatDate(r.next_due))}</td>
            <td>${r.overdue ? `<span class="badge rejected">${r.overdue} overdue</span>` : ""}</td></tr>`).join("")}</tbody></table></div>`
        : `<div class="card empty">No onboarding checklists yet. They appear when you hire someone from <a href="recruitment.html">Recruitment</a>.</div>`;
      rowLinks(panel);
    } catch (err) { errorBox(panel, err instanceof ApiError ? err.message : "Could not load onboarding."); }
  }

  async function templateTab() {
    loading(panel);
    try {
      const tpl = await call("onboarding.templateList");
      panel.innerHTML = `
        <div class="toolbar"><span class="muted">These tasks are added to every new hire. "Due" is the number of days after their start date.</span><button class="btn spacer" id="add" type="button">Add task</button></div>
        <div class="table-wrap"><table class="data"><thead><tr><th>Task</th><th>Owner</th><th class="num">Due (days after start)</th><th></th></tr></thead><tbody>
        ${tpl.map((t) => `<tr><td>${esc(t.task)}</td><td>${esc(t.category)}</td><td class="num">${t.due_days === 0 ? "On the start date" : "Day " + t.due_days}</td>
          <td style="text-align:right;white-space:nowrap"><button class="btn btn-ghost btn-sm" data-edit="${esc(t.id)}" type="button">Edit</button><button class="btn btn-ghost btn-sm" data-del="${esc(t.id)}" type="button">Delete</button></td></tr>`).join("")}</tbody></table></div>
        <p class="muted" style="margin-top:10px">Changes apply to people hired from now on, not to existing checklists.</p>`;
      panel.querySelector("#add").addEventListener("click", () => editTask(null));
      panel.querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", () => editTask(tpl.find((t) => t.id === b.dataset.edit))));
      panel.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", async () => {
        const t = tpl.find((x) => x.id === b.dataset.del);
        if (!(await confirmDialog(`Remove "${t.task}" from the template?`, { okText: "Remove", danger: true }))) return;
        try { await call("onboarding.templateDelete", { id: t.id }); toast("Removed."); templateTab(); } catch (err) { toast(err.message, "error"); }
      }));
    } catch (err) { errorBox(panel, err instanceof ApiError ? err.message : "Could not load the template."); }
  }

  function editTask(t) {
    const m = openModal({
      title: t ? "Edit task" : "Add task", narrow: true,
      html: `<div id="m-msg" class="alert alert-error" hidden></div><form id="t-form" novalidate>
        <div class="field"><label class="required" for="t-task">Task</label><input id="t-task" name="task" maxlength="150" value="${esc(t ? t.task : "")}"></div>
        <div class="field"><label for="t-cat">Owner</label><select id="t-cat" name="category">${CATS.map((c) => `<option${t && t.category === c ? " selected" : ""}>${c}</option>`).join("")}</select></div>
        <div class="field"><label for="t-days">Due (days after the start date)</label><input id="t-days" name="due_days" inputmode="numeric" value="${t ? t.due_days : 0}"></div></form>`,
      footer: `<button class="btn btn-ghost" data-close type="button">Cancel</button><button class="btn" type="submit" form="t-form">Save</button>`,
    });
    m.el.querySelector("#t-form").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const f = ev.target;
      try { await call("onboarding.templateSave", { id: t ? t.id : "", task: f.task.value, category: f.category.value, due_days: f.due_days.value }); m.close(); toast("Saved."); templateTab(); }
      catch (err) { const x = m.el.querySelector("#m-msg"); x.textContent = err.message; x.hidden = false; }
    });
  }

  show();
}

// ------------------------------------------------------------ one person's checklist
async function checklist(content, employeeId) {
  async function load() {
    loading(content);
    try {
      const r = await call("onboarding.get", { employeeId });
      render(r);
    } catch (err) { errorBox(content, err instanceof ApiError ? err.message : "Could not load this checklist."); }
  }

  function render({ employee, tasks }) {
    const today = todayLagos();
    const done = tasks.filter((t) => t.done).length;
    content.innerHTML = `
      <div class="toolbar"><a class="btn btn-ghost btn-sm" href="onboarding.html">&larr; All new hires</a>
        <h2 style="margin:0">${esc(employee.name)}</h2><span class="muted">${esc(employee.job_title)} &middot; started ${esc(formatDate(employee.date_joined))}</span>
        <span class="spacer" style="display:flex;gap:8px"><a class="btn btn-ghost btn-sm" href="employee.html?id=${encodeURIComponent(employee.id)}">Employee profile</a><button class="btn btn-sm" id="add" type="button">Add task</button></span></div>
      <div class="card"><div style="display:flex;gap:12px;align-items:center;margin-bottom:8px"><div class="progress" style="flex:1"><span style="width:${tasks.length ? Math.round((done / tasks.length) * 100) : 0}%"></span></div><strong>${done} of ${tasks.length} done</strong></div>
        ${tasks.length ? tasks.map((t) => `<div class="check-row${t.done ? " done" : ""}"><input type="checkbox" id="c-${esc(t.id)}" data-task="${esc(t.id)}"${t.done ? " checked" : ""} aria-label="${esc(t.task)}">
          <label class="t" for="c-${esc(t.id)}" style="margin:0;font-weight:400;cursor:pointer"><span>${esc(t.task)}</span><br>
            <span class="muted" style="font-size:13px">${esc(t.category)} &middot; due ${esc(formatDate(t.due_date))}${!t.done && t.due_date < today ? ' <span class="late">overdue</span>' : ""}${t.done ? " &middot; done by " + esc(t.done_by) : ""}</span></label>
          <button class="btn btn-ghost btn-sm" data-del="${esc(t.id)}" type="button" aria-label="Remove task">Remove</button></div>`).join("") : '<p class="muted">No tasks.</p>'}</div>`;
    content.querySelectorAll("[data-task]").forEach((c) => c.addEventListener("change", async () => {
      try { await call("onboarding.toggle", { taskId: c.dataset.task, done: c.checked }); load(); } catch (err) { toast(err.message, "error"); c.checked = !c.checked; }
    }));
    content.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", async () => {
      if (!(await confirmDialog("Remove this task from their checklist?", { okText: "Remove", danger: true }))) return;
      try { await call("onboarding.deleteTask", { taskId: b.dataset.del }); load(); } catch (err) { toast(err.message, "error"); }
    }));
    content.querySelector("#add").addEventListener("click", () => {
      const m = openModal({
        title: "Add task", narrow: true,
        html: `<div id="m-msg" class="alert alert-error" hidden></div><form id="a-form" novalidate>
          <div class="field"><label class="required" for="a-task">Task</label><input id="a-task" name="task" maxlength="150"></div>
          <div class="field"><label for="a-cat">Owner</label><select id="a-cat" name="category">${CATS.map((c) => `<option>${c}</option>`).join("")}</select></div>
          <div class="field"><label class="required" for="a-due">Due date</label><input id="a-due" name="due_date" type="date" value="${esc(today)}"></div></form>`,
        footer: `<button class="btn btn-ghost" data-close type="button">Cancel</button><button class="btn" type="submit" form="a-form">Add</button>`,
      });
      m.el.querySelector("#a-form").addEventListener("submit", async (ev) => {
        ev.preventDefault();
        const f = ev.target;
        try { await call("onboarding.addTask", { employeeId, task: f.task.value, category: f.category.value, due_date: f.due_date.value }); m.close(); load(); }
        catch (err) { const x = m.el.querySelector("#m-msg"); x.textContent = err.message; x.hidden = false; }
      });
    });
  }

  load();
}
