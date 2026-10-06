import { call, ApiError } from "../api.js";
import { initPage, loading, errorBox, canManageStaff } from "../layout.js";
import { esc, openModal, confirmDialog, toast, formatDate, tabBar, bindTabs, fileToBase64, saveBase64, todayLagos } from "../ui.js";

const page = initPage({ active: "training", title: "Training" });
if (page) run(page);

const STATE = { valid: "Valid", expiring: "Expiring soon", expired: "Expired", missing: "Not done", assigned: "Assigned", overdue: "Overdue" };
const CATEGORIES = ["Compliance", "Technical", "Soft skills", "Safety", "Induction", "Other"];
const MAX = 4 * 1024 * 1024;

async function run({ role, content }) {
  const isHr = canManageStaff(role);
  const isViewer = isHr || role === "manager";
  const tabs = [{ id: "mine", label: "My training" }];
  if (isViewer) tabs.push({ id: "compliance", label: "Compliance" }, { id: "records", label: "Records" }, { id: "courses", label: "Courses" });
  const wanted = new URLSearchParams(location.search).get("tab");
  let active = tabs.some((t) => t.id === wanted) ? wanted : "mine";

  content.innerHTML = `<div id="tabs">${tabBar(tabs, active)}</div><div id="panel"></div>`;
  const panel = content.querySelector("#panel");
  bindTabs(content.querySelector("#tabs"), (id) => { active = id; show(); });
  function show() {
    if (active === "mine") mineTab();
    else if (active === "compliance") complianceTab();
    else if (active === "records") recordsTab();
    else coursesTab();
  }
  const fail = (err, text) => errorBox(panel, err instanceof ApiError ? err.message : text);
  const badge = (s) => `<span class="badge ${esc(s)}">${esc(STATE[s] || s)}</span>`;

  async function downloadCert(id) {
    try { const f = await call("training.certificate", { id }); saveBase64(f.name, f.mimeType, f.data); } catch (err) { toast(err.message, "error"); }
  }

  const recordsTable = (list, withEmployee, canDelete) => list.length
    ? `<div class="table-wrap"><table class="data"><thead><tr>${withEmployee ? "<th>Employee</th>" : ""}<th>Course</th><th>Status</th><th>Completed</th><th>Expires / due</th><th></th></tr></thead><tbody>
      ${list.map((r) => `<tr>${withEmployee ? `<td><strong>${esc(r.employee_name)}</strong></td>` : ""}<td>${esc(r.course_title)}${r.mandatory ? ' <span class="badge pending">Mandatory</span>' : ""}</td><td>${badge(r.state)}</td>
        <td>${r.completed_on ? esc(formatDate(r.completed_on)) : '<span class="muted">-</span>'}</td>
        <td>${r.status === "completed" ? (r.expires_on ? esc(formatDate(r.expires_on)) : '<span class="muted">Never</span>') : (r.due_date ? "Due " + esc(formatDate(r.due_date)) : "")}</td>
        <td style="text-align:right;white-space:nowrap">${r.has_certificate ? `<button class="btn btn-ghost btn-sm" data-cert="${esc(r.id)}" type="button">Certificate</button>` : ""}
          ${canDelete ? `<button class="btn btn-ghost btn-sm" data-delrec="${esc(r.id)}" type="button">Delete</button>` : ""}</td></tr>`).join("")}</tbody></table></div>`
    : '<div class="card empty">Nothing here yet.</div>';

  function wireTable(root, reload) {
    root.querySelectorAll("[data-cert]").forEach((b) => b.addEventListener("click", () => downloadCert(b.dataset.cert)));
    root.querySelectorAll("[data-delrec]").forEach((b) => b.addEventListener("click", async () => {
      if (!(await confirmDialog("Delete this training record and its certificate?", { okText: "Delete", danger: true }))) return;
      try { await call("training.deleteRecord", { id: b.dataset.delrec }); toast("Record deleted."); reload(); } catch (err) { toast(err.message, "error"); }
    }));
  }

  // ------------------------------------------------------------ my training
  async function mineTab() {
    loading(panel);
    try {
      const r = await call("training.mine");
      if (!r.linked) { panel.innerHTML = `<div class="card"><h2>Your login is not linked to an employee record</h2><p class="muted">Ask HR to link it so your training can appear here.</p></div>`; return; }
      panel.innerHTML = `
        ${r.missing.length ? `<div class="alert alert-info"><strong>Training you still need to complete:</strong><ul style="margin:6px 0 0;padding-left:20px">${r.missing.map((m) => `<li>${esc(m.title)} - ${m.state === "expired" ? "expired, please renew" : "not done yet"}</li>`).join("")}</ul>Tell HR or your manager when you have completed it, with your certificate.</div>` : ""}
        ${recordsTable(r.records, false, false)}`;
      wireTable(panel, mineTab);
    } catch (err) { fail(err, "Could not load your training."); }
  }

  // ------------------------------------------------------------ compliance matrix
  let onlyGaps = false;
  async function complianceTab() {
    loading(panel);
    try {
      const [m, employees] = await Promise.all([call("training.compliance"), call("employees.list")]);
      const s = m.summary;
      const rows = onlyGaps ? m.rows.filter((r) => r.problems) : m.rows;
      panel.innerHTML = `
        <div class="chips"><span class="chip"><b>${s.valid}</b>Valid</span><span class="chip"><b>${s.expiring}</b>Expiring soon</span><span class="chip"><b>${s.expired}</b>Expired</span><span class="chip"><b>${s.missing}</b>Not done</span></div>
        ${m.courses.length ? `<div class="toolbar"><label style="display:flex;gap:6px;align-items:center;font-weight:400;margin:0"><input type="checkbox" id="gaps"${onlyGaps ? " checked" : ""}> Show only people with gaps</label>
          <span class="muted">Click a status to record training for that person.</span></div>
          <div class="table-wrap"><table class="data matrix"><thead><tr><th>Employee</th>${m.courses.map((c) => `<th style="text-align:center">${esc(c.title)}${c.validity_months ? `<div class="muted" style="font-weight:400;text-transform:none">every ${c.validity_months} months</div>` : ""}</th>`).join("")}</tr></thead><tbody>
          ${rows.map((r) => `<tr><td><strong>${esc(r.name)}</strong><div class="muted">${esc(r.department)}</div></td>${m.courses.map((c) => `<td class="cell ${esc(r.cells[c.id])}"><button type="button" data-rec="${esc(r.employee_id)}|${esc(c.id)}">${esc(STATE[r.cells[c.id]])}</button></td>`).join("")}</tr>`).join("")}</tbody></table></div>`
          : `<div class="card empty">No mandatory courses yet. Mark a course as mandatory on the <strong>Courses</strong> tab to see who has done it.</div>`}`;
      const g = panel.querySelector("#gaps");
      if (g) g.addEventListener("change", () => { onlyGaps = g.checked; complianceTab(); });
      panel.querySelectorAll("[data-rec]").forEach((b) => b.addEventListener("click", () => {
        const [empId, courseId] = b.dataset.rec.split("|");
        recordModal({ employees, courses: m.courses, employeeId: empId, courseId, after: complianceTab });
      }));
    } catch (err) { fail(err, "Could not load the compliance view."); }
  }

  function recordModal({ employees, courses, employeeId = "", courseId = "", after }) {
    const m = openModal({
      title: "Record training", narrow: true,
      html: `<div id="m-msg" class="alert alert-error" hidden></div><form id="rec-form" novalidate>
        <div class="field"><label for="r-emp">Employee</label><select id="r-emp" name="employeeId">${employees.filter((e) => e.status !== "terminated").map((e) => `<option value="${esc(e.id)}"${e.id === employeeId ? " selected" : ""}>${esc(e.first_name + " " + e.last_name)}</option>`).join("")}</select></div>
        <div class="field"><label for="r-course">Course</label><select id="r-course" name="courseId">${courses.map((c) => `<option value="${esc(c.id)}"${c.id === courseId ? " selected" : ""}>${esc(c.title)}</option>`).join("")}</select></div>
        <div class="field"><label class="required" for="r-date">Date completed</label><input id="r-date" name="completed_on" type="date" value="${todayLagos()}" max="${todayLagos()}"></div>
        <div class="field"><label for="r-cert">Certificate (PDF, PNG or JPG, up to 4 MB)</label><input id="r-cert" name="certificate" type="file" accept=".pdf,.png,.jpg,.jpeg"></div>
        <div class="field"><label for="r-note">Note (optional)</label><input id="r-note" name="note" maxlength="300"></div>
        <div class="hint">The expiry date is worked out from the course's validity period.</div></form>`,
      footer: `<button class="btn btn-ghost" data-close type="button">Cancel</button><button class="btn" type="submit" form="rec-form" id="r-save">Save</button>`,
    });
    m.el.querySelector("#rec-form").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const f = ev.target, msg = m.el.querySelector("#m-msg"), btn = m.el.querySelector("#r-save");
      msg.hidden = true;
      const file = f.certificate.files[0];
      if (file && file.size > MAX) { msg.textContent = "The certificate is larger than 4 MB."; msg.hidden = false; return; }
      btn.disabled = true;
      try {
        const certificate = file ? { fileName: file.name, data: await fileToBase64(file) } : null;
        await call("training.record", { employeeId: f.employeeId.value, courseId: f.courseId.value, completed_on: f.completed_on.value, note: f.note.value, certificate });
        m.close(); toast("Training recorded."); after();
      } catch (err) { msg.textContent = err.message; msg.hidden = false; btn.disabled = false; }
    });
  }

  // ------------------------------------------------------------ all records
  let stateFilter = "";
  async function recordsTab() {
    loading(panel);
    try {
      const [records, courses, employees] = await Promise.all([call("training.recordsList"), call("training.coursesList"), call("employees.list")]);
      const list = records.filter((r) => !stateFilter || r.state === stateFilter);
      panel.innerHTML = `
        <div class="toolbar"><select id="state" aria-label="Filter by status"><option value="">All statuses</option>${Object.keys(STATE).map((k) => `<option value="${k}"${k === stateFilter ? " selected" : ""}>${STATE[k]}</option>`).join("")}</select>
          <button class="btn spacer" id="rec" type="button"${courses.length ? "" : " disabled"}>Record training</button></div>
        ${recordsTable(list, true, isHr)}`;
      panel.querySelector("#state").addEventListener("change", (e) => { stateFilter = e.target.value; recordsTab(); });
      panel.querySelector("#rec").addEventListener("click", () => recordModal({ employees: isHr ? employees : employees, courses, after: recordsTab }));
      wireTable(panel, recordsTab);
    } catch (err) { fail(err, "Could not load training records."); }
  }

  // ------------------------------------------------------------ courses
  async function coursesTab() {
    loading(panel);
    try {
      const courses = await call("training.coursesList");
      panel.innerHTML = `
        <div class="toolbar"><span class="muted">${isHr ? "The training your company offers. Mandatory courses are checked against everyone on the Compliance tab." : "The company's training catalogue."}</span>${isHr ? `<button class="btn spacer" id="add" type="button">Add course</button>` : ""}</div>
        ${courses.length ? `<div class="table-wrap"><table class="data"><thead><tr><th>Course</th><th>Category</th><th>Mandatory</th><th>Valid for</th><th class="num">Records</th>${isHr ? "<th></th>" : ""}</tr></thead><tbody>
          ${courses.map((c) => `<tr><td><strong>${esc(c.title)}</strong><div class="muted">${esc(c.provider)}</div></td><td>${esc(c.category)}</td><td>${c.mandatory ? '<span class="badge pending">Mandatory</span>' : '<span class="muted">Optional</span>'}</td>
            <td>${c.validity_months ? c.validity_months + " months" : "<span class='muted'>Never expires</span>"}</td><td class="num">${c.records}</td>
            ${isHr ? `<td style="text-align:right;white-space:nowrap"><button class="btn btn-ghost btn-sm" data-assign="${esc(c.id)}" type="button">Assign</button><button class="btn btn-ghost btn-sm" data-edit="${esc(c.id)}" type="button">Edit</button><button class="btn btn-ghost btn-sm" data-del="${esc(c.id)}" type="button">Delete</button></td>` : ""}</tr>`).join("")}</tbody></table></div>`
          : `<div class="card empty">No courses yet.</div>`}`;
      const add = panel.querySelector("#add");
      if (add) add.addEventListener("click", () => editCourse(null));
      panel.querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", () => editCourse(courses.find((c) => c.id === b.dataset.edit))));
      panel.querySelectorAll("[data-assign]").forEach((b) => b.addEventListener("click", () => assign(courses.find((c) => c.id === b.dataset.assign))));
      panel.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", async () => {
        const c = courses.find((x) => x.id === b.dataset.del);
        if (!(await confirmDialog(`Delete the course "${c.title}"?`, { okText: "Delete", danger: true }))) return;
        try { await call("training.coursesDelete", { id: c.id }); toast("Course deleted."); coursesTab(); } catch (err) { toast(err.message, "error"); }
      }));
    } catch (err) { fail(err, "Could not load courses."); }
  }

  function editCourse(c) {
    const m = openModal({
      title: c ? "Edit course" : "Add course",
      html: `<div id="m-msg" class="alert alert-error" hidden></div><form id="c-form" novalidate><div class="form-grid">
        <div class="field full"><label class="required" for="c-title">Course title</label><input id="c-title" name="title" maxlength="100" value="${esc(c ? c.title : "")}"></div>
        <div class="field"><label for="c-prov">Provider</label><input id="c-prov" name="provider" maxlength="80" value="${esc(c ? c.provider : "")}"></div>
        <div class="field"><label for="c-cat">Category</label><select id="c-cat" name="category">${CATEGORIES.map((x) => `<option${c && c.category === x ? " selected" : ""}>${x}</option>`).join("")}</select></div>
        <div class="field"><label for="c-man">Mandatory?</label><select id="c-man" name="mandatory"><option value="no"${!c || !c.mandatory ? " selected" : ""}>No - optional</option><option value="yes"${c && c.mandatory ? " selected" : ""}>Yes - everyone must have it</option></select></div>
        <div class="field"><label for="c-val">Valid for (months)</label><input id="c-val" name="validity_months" inputmode="numeric" value="${c ? c.validity_months : 0}"><div class="hint">0 means it never expires.</div></div>
        <div class="field full"><label for="c-desc">Description</label><textarea id="c-desc" name="description" rows="2" maxlength="500">${esc(c ? c.description : "")}</textarea></div></div></form>`,
      footer: `<button class="btn btn-ghost" data-close type="button">Cancel</button><button class="btn" type="submit" form="c-form">Save course</button>`,
    });
    m.el.querySelector("#c-form").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const data = { id: c ? c.id : "" };
      new FormData(ev.target).forEach((v, k) => { data[k] = v; });
      try { await call("training.coursesSave", data); m.close(); toast("Course saved."); coursesTab(); }
      catch (err) { const x = m.el.querySelector("#m-msg"); x.textContent = err.message; x.hidden = false; }
    });
  }

  async function assign(course) {
    let employees = [], depts = [];
    try { [employees, depts] = await Promise.all([call("employees.list"), call("departments.list")]); } catch (e) {}
    const m = openModal({
      title: `Assign: ${course.title}`,
      html: `<div id="m-msg" class="alert alert-error" hidden></div><form id="as-form" novalidate>
        <div class="field"><label for="a-scope">Who?</label><select id="a-scope" name="scope"><option value="all">Everyone</option><option value="department">A department</option><option value="employees">Chosen people</option></select></div>
        <div class="field" id="dept-box" hidden><label for="a-dept">Department</label><select id="a-dept" name="departmentId">${depts.map((d) => `<option value="${esc(d.id)}">${esc(d.name)}</option>`).join("")}</select></div>
        <div class="field" id="emp-box" hidden><label>People</label><div class="chk-list">${employees.filter((e) => e.status !== "terminated").map((e) => `<label><input type="checkbox" name="emp" value="${esc(e.id)}"> ${esc(e.first_name + " " + e.last_name)}</label>`).join("")}</div></div>
        <div class="field"><label for="a-due">Due date</label><input id="a-due" name="due_date" type="date"></div>
        <div class="hint">People who already have this open, or are up to date, are skipped.</div></form>`,
      footer: `<button class="btn btn-ghost" data-close type="button">Cancel</button><button class="btn" type="submit" form="as-form">Assign</button>`,
    });
    const f = m.el.querySelector("#as-form");
    const sync = () => { m.el.querySelector("#dept-box").hidden = f.scope.value !== "department"; m.el.querySelector("#emp-box").hidden = f.scope.value !== "employees"; };
    f.scope.addEventListener("change", sync);
    sync();
    f.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      try {
        const r = await call("training.assign", {
          courseId: course.id, scope: f.scope.value, departmentId: f.departmentId.value, due_date: f.due_date.value,
          employeeIds: [...f.querySelectorAll("input[name=emp]:checked")].map((c) => c.value),
        });
        m.close(); toast(`Assigned to ${r.assigned} ${r.assigned === 1 ? "person" : "people"}${r.skipped ? `, ${r.skipped} skipped` : ""}.`); coursesTab();
      } catch (err) { const x = m.el.querySelector("#m-msg"); x.textContent = err.message; x.hidden = false; }
    });
  }

  show();
}
