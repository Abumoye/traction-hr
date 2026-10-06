import { call, ApiError } from "../api.js";
import { initPage, loading, errorBox } from "../layout.js";
import { esc, openModal, confirmDialog, toast, formatDate, formatDateTime, initials, todayLagos } from "../ui.js";
import { naira } from "../money.js";

const id = new URLSearchParams(location.search).get("id");
const page = initPage({ active: "recruitment", title: "Applicant" });
if (page) run(page);

const STAGES = [["applied", "Applied"], ["screening", "Screening"], ["interview", "Interview"], ["offer", "Offer"]];
const SOURCES = ["Careers page", "Referral", "Job board", "Social media", "Walk-in", "Other"];
const TYPES = [["full-time", "Full-time"], ["part-time", "Part-time"], ["contract", "Contract"], ["intern", "Intern"]];
const stars = (n) => "★".repeat(n) + "☆".repeat(5 - n);
const addDays = (iso, n) => { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

async function run({ content }) {
  if (!id) return errorBox(content, "No applicant was chosen.");
  let a = null;

  async function load() {
    loading(content);
    try { a = await call("recruitment.applicantsGet", { id }); render(); }
    catch (err) { errorBox(content, err instanceof ApiError ? err.message : "Could not load this applicant."); }
  }

  const name = () => a.first_name + " " + a.last_name;

  function render() {
    const closed = a.stage === "hired" || a.stage === "rejected";
    document.title = `${name()} | Traction Outsourcing HR`;
    content.innerHTML = `
      <div class="toolbar"><a class="btn btn-ghost btn-sm" href="recruitment.html${a.job_id ? "?job=" + encodeURIComponent(a.job_id) : ""}">&larr; Applicants</a></div>
      <div class="card">
        <div class="profile-head">
          <span class="avatar lg">${esc(initials(name()))}</span>
          <div><h2>${esc(name())}</h2>
            <div class="muted">${esc(a.job_title)} &middot; applied ${esc(formatDate(a.created_at.slice(0, 10)))} &middot; ${esc(a.source)}</div>
            <div style="margin-top:6px"><span class="badge ${a.stage === "hired" ? "paid" : a.stage === "rejected" ? "rejected" : "pending"}">${esc(a.stage.charAt(0).toUpperCase() + a.stage.slice(1))}</span>
              ${a.interview_at && a.stage === "interview" ? ` <span class="muted">Interview ${esc(a.interview_at.replace("T", " at "))}</span>` : ""}
              ${a.stage === "rejected" && a.rejection_reason ? ` <span class="muted">- ${esc(a.rejection_reason)}</span>` : ""}</div></div>
          <div class="actions">
            ${a.stage === "hired" ? `<a class="btn btn-sm" href="employee.html?id=${encodeURIComponent(a.hired_employee_id)}">View employee</a>` : ""}
            ${!closed ? `<button class="btn btn-sm" id="hire" type="button">Hire</button><button class="btn btn-ghost btn-sm" id="reject" type="button">Reject</button>` : ""}
            ${a.stage === "rejected" ? `<button class="btn btn-ghost btn-sm" id="reopen" type="button">Reopen</button>` : ""}
          </div>
        </div>
        ${!closed ? `<div class="stepper" role="group" aria-label="Move to stage">${STAGES.map(([s, l]) => `<button type="button" class="step${a.stage === s ? " on" : ""}" data-stage="${s}"${a.stage === s ? " disabled" : ""}>${l}</button>`).join("")}</div>` : ""}
      </div>

      <div class="two-col">
        <div>
          <div class="card"><div class="toolbar" style="margin-bottom:10px"><h2 style="margin:0">Details</h2><button class="btn btn-ghost btn-sm spacer" id="edit" type="button">Edit</button></div>
            <dl class="dl">
              <dt>Email</dt><dd>${a.email ? esc(a.email) : '<span class="muted">Not provided</span>'}</dd>
              <dt>Phone</dt><dd>${a.phone ? esc(a.phone) : '<span class="muted">Not provided</span>'}</dd>
              <dt>Expected salary</dt><dd>${a.expected_salary ? naira(a.expected_salary) + " a month" : '<span class="muted">Not provided</span>'}</dd>
              <dt>Rating</dt><dd><select id="rating" aria-label="Rating"><option value="0">Not rated</option>${[1, 2, 3, 4, 5].map((n) => `<option value="${n}"${a.rating === n ? " selected" : ""}>${stars(n)}</option>`).join("")}</select></dd>
              <dt>Interview</dt><dd>${a.interview_at ? esc(a.interview_at.replace("T", " at ")) : '<span class="muted">Not scheduled</span>'} ${!closed ? `<button class="btn btn-ghost btn-sm" id="sched" type="button">${a.interview_at ? "Change" : "Schedule"}</button>` : ""}</dd>
            </dl></div>
          <div class="card"><h2>CV</h2><div id="cv-msg" class="alert alert-error" hidden></div>
            <p>${a.has_cv ? `<strong>${esc(a.cv_file_name)}</strong>` : '<span class="muted">No CV uploaded.</span>'}</p>
            <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
              ${a.has_cv ? `<button class="btn btn-ghost btn-sm" id="cv-down" type="button">Download</button>` : ""}
              <label class="btn btn-ghost btn-sm" for="cv-file" style="margin:0">${a.has_cv ? "Replace CV" : "Upload CV"}</label><input id="cv-file" type="file" accept=".pdf,.doc,.docx" hidden>
              <span class="hint" style="margin:0">PDF, DOC or DOCX, up to 4 MB</span></div></div>
          <div class="card"><div class="toolbar" style="margin-bottom:10px"><h2 style="margin:0">Offer letters</h2>${!closed ? `<button class="btn btn-sm spacer" id="offer" type="button">Create offer</button>` : ""}</div>
            ${a.offers.length ? `<div class="table-wrap"><table class="data"><tbody>${a.offers.map((o) => `<tr class="click" data-href="offer.html?id=${encodeURIComponent(o.id)}"><td><strong>${esc(o.job_title)}</strong><div class="muted">${naira(o.monthly_gross)} a month &middot; starts ${esc(formatDate(o.start_date))}</div></td>
              <td><span class="badge ${o.status === "accepted" ? "paid" : o.status === "declined" ? "rejected" : o.status === "sent" ? "approved" : "draft"}">${esc(o.status.charAt(0).toUpperCase() + o.status.slice(1))}</span></td></tr>`).join("")}</tbody></table></div>`
              : '<p class="muted" style="margin:0">No offer yet.</p>'}</div>
        </div>
        <div class="card"><h2>Notes and history</h2>
          <form id="note-form" novalidate style="margin-bottom:14px"><div class="field" style="margin-bottom:8px"><label for="note" class="sr-only" style="position:absolute;left:-9999px">Add a note</label>
            <textarea id="note" name="text" rows="2" maxlength="1000" placeholder="Add a note about this applicant"></textarea></div><button class="btn btn-sm" type="submit">Add note</button></form>
          <ul class="timeline">${a.notes.map((n) => `<li class="${esc(n.kind)}"><div>${esc(n.text)}</div><div class="when">${esc(n.by)} &middot; ${esc(formatDateTime(n.at))}</div></li>`).join("")}</ul>
        </div>
      </div>
      ${a.stage === "hired" ? "" : `<p style="margin-top:6px"><button class="btn btn-ghost btn-sm" id="delete" type="button">Delete applicant and their data</button></p>`}`;

    const on = (sel, fn) => { const el = content.querySelector(sel); if (el) el.addEventListener("click", fn); };
    content.querySelectorAll("[data-stage]").forEach((b) => b.addEventListener("click", () => moveTo(b.dataset.stage)));
    on("#hire", hire); on("#reject", reject); on("#reopen", () => moveTo("applied")); on("#edit", edit); on("#sched", () => schedule());
    on("#offer", createOffer); on("#cv-down", downloadCv); on("#delete", del);
    content.querySelectorAll("tr[data-href]").forEach((tr) => tr.addEventListener("click", () => { location.href = tr.dataset.href; }));
    content.querySelector("#cv-file").addEventListener("change", uploadCv);
    content.querySelector("#rating").addEventListener("change", async (e) => {
      try { await call("recruitment.applicantsUpdate", { id, rating: e.target.value }); toast("Rating saved."); load(); } catch (err) { toast(err.message, "error"); }
    });
    content.querySelector("#note-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const text = e.target.text.value.trim();
      if (!text) return;
      try { await call("recruitment.addNote", { id, text }); load(); } catch (err) { toast(err.message, "error"); }
    });
  }

  async function moveTo(stage) {
    if (stage === "interview") return schedule(true);
    try { await call("recruitment.applicantsMove", { id, stage }); toast("Moved."); load(); } catch (err) { toast(err.message, "error"); }
  }

  // Interview time: used both when moving to Interview and when rescheduling.
  function schedule(move = false) {
    const cur = a.interview_at || "";
    const m = openModal({
      title: "Interview", narrow: true,
      html: `<div id="m-msg" class="alert alert-error" hidden></div><form id="iv-form" novalidate>
        <div class="inline-form"><div class="field" style="flex:1"><label for="iv-date">Date</label><input id="iv-date" name="date" type="date" value="${esc(cur.slice(0, 10))}"></div>
        <div class="field" style="flex:1"><label for="iv-time">Time</label><input id="iv-time" name="time" type="time" value="${esc(cur.slice(11, 16))}"></div></div>
        <div class="hint">Optional. Leave blank if the time is not fixed yet.</div></form>`,
      footer: `<button class="btn btn-ghost" data-close type="button">Cancel</button><button class="btn" type="submit" form="iv-form">${move ? "Move to interview" : "Save"}</button>`,
    });
    m.el.querySelector("#iv-form").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const f = ev.target;
      const when = f.date.value ? f.date.value + (f.time.value ? "T" + f.time.value : "") : "";
      try {
        if (move) await call("recruitment.applicantsMove", { id, stage: "interview", interview_at: when });
        else await call("recruitment.applicantsUpdate", { id, interview_at: when });
        m.close(); toast("Saved."); load();
      } catch (err) { const x = m.el.querySelector("#m-msg"); x.textContent = err.message; x.hidden = false; }
    });
  }

  function reject() {
    const m = openModal({
      title: "Reject applicant", narrow: true,
      html: `<div id="m-msg" class="alert alert-error" hidden></div><form id="rj-form" novalidate><div class="field"><label for="rj-reason">Reason</label>
        <input id="rj-reason" name="reason" maxlength="300" placeholder="For example: not enough experience" required></div>
        <p class="muted">The reason is kept in their history. You can reopen them later.</p></form>`,
      footer: `<button class="btn btn-ghost" data-close type="button">Cancel</button><button class="btn btn-danger" type="submit" form="rj-form">Reject</button>`,
    });
    m.el.querySelector("#rj-form").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      try { await call("recruitment.applicantsMove", { id, stage: "rejected", reason: ev.target.reason.value }); m.close(); toast("Applicant rejected."); load(); }
      catch (err) { const x = m.el.querySelector("#m-msg"); x.textContent = err.message; x.hidden = false; }
    });
  }

  function edit() {
    const m = openModal({
      title: "Edit details", narrow: true,
      html: `<div id="m-msg" class="alert alert-error" hidden></div><form id="ed-form" novalidate>
        <div class="form-grid"><div class="field"><label for="e-first">First name</label><input id="e-first" name="first_name" value="${esc(a.first_name)}" maxlength="60"></div>
        <div class="field"><label for="e-last">Last name</label><input id="e-last" name="last_name" value="${esc(a.last_name)}" maxlength="60"></div>
        <div class="field"><label for="e-email">Email</label><input id="e-email" name="email" type="email" value="${esc(a.email)}" maxlength="120"></div>
        <div class="field"><label for="e-phone">Phone</label><input id="e-phone" name="phone" value="${esc(a.phone)}" maxlength="30"></div>
        <div class="field"><label for="e-src">Source</label><select id="e-src" name="source">${SOURCES.map((s) => `<option${a.source === s ? " selected" : ""}>${s}</option>`).join("")}</select></div>
        <div class="field"><label for="e-sal">Expected monthly salary (&#8358;)</label><input id="e-sal" name="expected_salary" inputmode="decimal" value="${a.expected_salary || ""}"></div></div></form>`,
      footer: `<button class="btn btn-ghost" data-close type="button">Cancel</button><button class="btn" type="submit" form="ed-form">Save</button>`,
    });
    m.el.querySelector("#ed-form").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const data = { id };
      new FormData(ev.target).forEach((v, k) => { data[k] = v; });
      try { await call("recruitment.applicantsUpdate", data); m.close(); toast("Saved."); load(); }
      catch (err) { const x = m.el.querySelector("#m-msg"); x.textContent = err.message; x.hidden = false; }
    });
  }

  function createOffer() {
    const last = a.offers[0];
    const m = openModal({
      title: "Create offer letter",
      html: `<div id="m-msg" class="alert alert-error" hidden></div><form id="of-form" novalidate><div class="form-grid">
        <div class="field"><label class="required" for="o-title">Job title</label><input id="o-title" name="job_title" maxlength="100" value="${esc(last ? last.job_title : a.job_title)}"></div>
        <div class="field"><label for="o-dept">Department</label><input id="o-dept" name="department" maxlength="80" value="${esc(last ? last.department : "")}"></div>
        <div class="field"><label class="required" for="o-gross">Monthly gross salary (&#8358;)</label><input id="o-gross" name="monthly_gross" inputmode="decimal" value="${last ? last.monthly_gross : a.expected_salary || ""}"></div>
        <div class="field"><label for="o-prob">Probation (months)</label><input id="o-prob" name="probation_months" inputmode="numeric" value="3"></div>
        <div class="field"><label class="required" for="o-start">Start date</label><input id="o-start" name="start_date" type="date" value="${esc(addDays(todayLagos(), 30))}"></div>
        <div class="field"><label class="required" for="o-valid">Reply by</label><input id="o-valid" name="valid_until" type="date" value="${esc(addDays(todayLagos(), 7))}"></div>
        <div class="field full"><label for="o-rep">Reports to</label><input id="o-rep" name="reports_to" maxlength="80" placeholder="Name or role"></div></div>
        <p class="muted">The letter is drafted for you from your payroll and working-hours settings. You can edit the text before sending.</p></form>`,
      footer: `<button class="btn btn-ghost" data-close type="button">Cancel</button><button class="btn" type="submit" form="of-form">Create letter</button>`,
    });
    m.el.querySelector("#of-form").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const data = { applicantId: id };
      new FormData(ev.target).forEach((v, k) => { data[k] = v; });
      try { const o = await call("recruitment.offersCreate", data); location.href = "offer.html?id=" + encodeURIComponent(o.id); }
      catch (err) { const x = m.el.querySelector("#m-msg"); x.textContent = err.message; x.hidden = false; }
    });
  }

  async function hire() {
    let depts = [], employees = [];
    try { [depts, employees] = await Promise.all([call("departments.list"), call("employees.list")]); } catch (e) {}
    const offer = a.offers.find((o) => o.status === "accepted" || o.status === "sent") || a.offers[0];
    const m = openModal({
      title: `Hire ${name()}`,
      html: `<div id="m-msg" class="alert alert-error" hidden></div><form id="hire-form" novalidate><div class="form-grid">
        <div class="field"><label class="required" for="h-start">Start date</label><input id="h-start" name="start_date" type="date" value="${esc(offer ? offer.start_date : addDays(todayLagos(), 14))}"></div>
        <div class="field"><label for="h-title">Job title</label><input id="h-title" name="job_title" maxlength="100" value="${esc(offer ? offer.job_title : a.job_title)}"></div>
        <div class="field"><label for="h-dept">Department</label><select id="h-dept" name="department_id"><option value="">None</option>${depts.map((d) => `<option value="${esc(d.id)}"${offer && offer.department === d.name ? " selected" : ""}>${esc(d.name)}</option>`).join("")}</select></div>
        <div class="field"><label for="h-type">Employment type</label><select id="h-type" name="employment_type">${TYPES.map(([v, l]) => `<option value="${v}">${l}</option>`).join("")}</select></div>
        <div class="field"><label for="h-gross">Monthly gross salary (&#8358;)</label><input id="h-gross" name="monthly_gross" inputmode="decimal" value="${offer ? offer.monthly_gross : a.expected_salary || ""}"><div class="hint">Creates their salary record for payroll. Leave blank to add it later.</div></div>
        <div class="field"><label for="h-mgr">Reports to</label><select id="h-mgr" name="manager_id"><option value="">No manager</option>${employees.filter((e) => e.status !== "terminated").map((e) => `<option value="${esc(e.id)}">${esc(e.first_name + " " + e.last_name)}</option>`).join("")}</select></div></div>
        <div class="alert alert-info">This creates their employee record, keeps their CV, sets up their salary, and starts the onboarding checklist.</div></form>`,
      footer: `<button class="btn btn-ghost" data-close type="button">Cancel</button><button class="btn" type="submit" form="hire-form">Hire</button>`,
    });
    m.el.querySelector("#hire-form").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const data = { applicantId: id };
      new FormData(ev.target).forEach((v, k) => { data[k] = v; });
      try {
        const r = await call("recruitment.hire", data);
        m.close();
        const done = openModal({
          title: "Hired", narrow: true,
          html: `<p><strong>${esc(name())}</strong> is now employee <strong>${esc(r.employee.employee_no)}</strong>.</p>
            <ul><li>${r.salary_recorded ? "Salary record created for payroll." : "No salary record yet. Add one under Payroll &rarr; Salaries."}</li>
            <li>${r.onboarding_tasks} onboarding tasks created.</li></ul>
            <p class="muted">Remember to give them a login under User access when they start.</p>`,
          footer: `<a class="btn btn-ghost" href="onboarding.html?employee=${encodeURIComponent(r.employee.id)}">Open checklist</a><a class="btn" href="employee.html?id=${encodeURIComponent(r.employee.id)}">View employee</a>`,
          onClose: load,
        });
      } catch (err) { const x = m.el.querySelector("#m-msg"); x.textContent = err.message; x.hidden = false; }
    });
  }

  async function downloadCv() {
    try {
      const f = await call("recruitment.downloadCv", { applicantId: id });
      const bytes = Uint8Array.from(atob(f.data), (c) => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: f.mimeType }));
      const link = document.createElement("a");
      link.href = url; link.download = f.name;
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (err) { toast(err.message, "error"); }
  }

  async function uploadCv(e) {
    const msg = content.querySelector("#cv-msg");
    msg.hidden = true;
    const f = e.target.files[0];
    if (!f) return;
    const fail = (t) => { msg.textContent = t; msg.hidden = false; e.target.value = ""; };
    if (f.size > 4 * 1024 * 1024) return fail("That file is larger than 4 MB.");
    if (!/\.(pdf|docx?)$/i.test(f.name)) return fail("Choose a PDF, DOC or DOCX file.");
    try {
      const data = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result).split(",")[1] || "");
        r.onerror = () => reject(new Error("Could not read the file."));
        r.readAsDataURL(f);
      });
      toast("Uploading...");
      await call("recruitment.uploadCv", { applicantId: id, fileName: f.name, data });
      toast("CV uploaded.");
      load();
    } catch (err) { fail(err.message); }
  }

  async function del() {
    if (!(await confirmDialog(`Permanently delete ${name()} and all their data (CV, notes, offers)? This cannot be undone.`, { okText: "Delete", danger: true }))) return;
    try { await call("recruitment.applicantsDelete", { id }); location.href = "recruitment.html"; } catch (err) { toast(err.message, "error"); }
  }

  load();
}
