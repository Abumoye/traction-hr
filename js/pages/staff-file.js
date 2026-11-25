import { call, ApiError } from "../api.js";
import { initPage, loading, errorBox, canManageStaff } from "../layout.js";
import { esc, cap, formatDate, formatDateTime, openModal, toast, setBusy, confirmDialog, STATUS_LABELS, todayLagos } from "../ui.js";
import { naira } from "../money.js";
import { downloadXlsx } from "../xlsx.js";
import { staffFileSheets, fileBaseName, KIND_LABELS, REASON_LABELS, RECORD_LABELS, DOC_STATE, LOCATION_LABELS, TRAINING_STATE, days } from "../staff-file-sheets.js";

const page = initPage({ active: "staffFile", title: "Staff file" });
if (page) run(page);

const d = (iso) => (iso ? formatDate(iso) : "");
const nice = (kind, v) => (["status", "type", "arrangement"].includes(kind) ? cap(String(v || "").replace(/-/g, " ")) : v);
const stars = (n) => (n ? `${n} of 5` : "");
const dateify = (text) => String(text).replace(/\b\d{4}-\d{2}-\d{2}\b/g, (m) => formatDate(m));

function table(head, rows, empty) {
  if (!rows.length) return `<p class="muted">${esc(empty)}</p>`;
  return `<div class="table-wrap sf-table"><table class="data"><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}
const section = (title, body, note = "", actions = "") => `<section class="card sf-card"><div class="sf-card-head"><h2>${esc(title)}</h2>${actions}</div>${note ? `<p class="muted sf-note">${note}</p>` : ""}${body}</section>`;
const tile = (num, lbl, tone = "") => `<div class="stat ${tone}"><div class="num">${esc(num)}</div><div class="lbl">${esc(lbl)}</div></div>`;
const chips = (items, cap_ = 0) => items.length ? `<div class="sf-chips">${items.map((x) => `<span>${esc(d(x))}</span>`).join("")}</div>${cap_ && items.length >= cap_ ? `<p class="muted sf-note">Only the most recent ${cap_} are listed here. The Excel download lists them all.</p>` : ""}` : "";
const ROLE_NAMES = { manager: "Manager", hr: "HR manager", owner: "Owner", chosen: "Chosen by the sender", everyone: "Everyone" };
const badge = (cls, text) => `<span class="badge ${esc(cls)}">${esc(text)}</span>`;

async function run({ role, content }) {
  if (!canManageStaff(role)) {
    content.innerHTML = `<div class="card"><h2>Staff file</h2><p class="muted">Only HR and the owner can open staff files.</p></div>`;
    return;
  }
  let people = [], departments = [], current = null;

  content.innerHTML = `
    <div class="card no-print">
      <h2>Find a staff member</h2>
      <p class="muted" style="margin:0 0 12px">Search current staff and people who have left. The staff file gathers their whole time with the company in one place, to read on screen, save as a PDF, or download as an Excel workbook.</p>
      <div class="toolbar"><div class="grow"><input id="q" type="search" placeholder="Name, employee number, email or job title" autocomplete="off" aria-label="Search staff"></div>
        <select id="scope" aria-label="Which staff"><option value="all">Current and former</option><option value="current">Current staff</option><option value="former">Former staff</option></select></div>
      <div id="results"></div>
    </div>
    <div id="file"></div>`;
  const q = content.querySelector("#q"), scope = content.querySelector("#scope"), results = content.querySelector("#results"), fileEl = content.querySelector("#file");

  function drawResults() {
    const term = q.value.trim().toLowerCase();
    let list = people.filter((e) => scope.value === "all" || (scope.value === "former") === (e.status === "terminated"));
    if (term) list = list.filter((e) => [e.first_name + " " + e.last_name, e.employee_no, e.email, e.job_title, e.department_name].join(" ").toLowerCase().includes(term));
    list.sort((a, b) => (a.first_name + a.last_name).localeCompare(b.first_name + b.last_name));
    const shown = list.slice(0, 12);
    results.innerHTML = shown.length ? `<div class="table-wrap"><table class="data"><tbody>${shown.map((e) => `<tr class="click" data-id="${esc(e.id)}" tabindex="0">
      <td><strong>${esc(e.first_name + " " + e.last_name)}</strong><div class="muted">${esc(e.employee_no)}${e.job_title ? " &middot; " + esc(e.job_title) : ""}${e.department_name ? " &middot; " + esc(e.department_name) : ""}</div></td>
      <td>${badge(e.status, STATUS_LABELS[e.status] || e.status)}</td>
      <td class="muted">${e.date_joined ? "Joined " + esc(d(e.date_joined)) : "No join date"}${e.status === "terminated" && e.exit_date ? "<br>Left " + esc(d(e.exit_date)) : ""}</td></tr>`).join("")}</tbody></table></div>
      ${list.length > shown.length ? `<p class="muted" style="margin:8px 0 0">Showing ${shown.length} of ${list.length}. Type more of the name to narrow it down.</p>` : ""}`
      : `<p class="muted">No one matches.</p>`;
    results.querySelectorAll("tr.click").forEach((tr) => {
      const go = () => open(tr.dataset.id);
      tr.addEventListener("click", go);
      tr.addEventListener("keydown", (ev) => { if (ev.key === "Enter") go(); });
    });
  }
  q.addEventListener("input", drawResults);
  scope.addEventListener("change", drawResults);

  async function open(id) {
    history.replaceState(null, "", "staff-file.html?id=" + encodeURIComponent(id));
    loading(fileEl, "Gathering the staff file...");
    try {
      current = await call("staffhistory.get", { employeeId: id });
      fileEl.innerHTML = fileHtml(current);
      wire();
      fileEl.scrollIntoView({ block: "start", behavior: "smooth" });
    } catch (err) {
      errorBox(fileEl, err instanceof ApiError ? err.message : "ERROR: Contact Administrator.");
    }
  }

  function wire() {
    const f = current;
    fileEl.querySelector("#sf-print").addEventListener("click", () => { logDownload("pdf"); window.print(); });
    fileEl.querySelector("#sf-excel").addEventListener("click", () => {
      try {
        downloadXlsx(fileBaseName(f) + ".xlsx", staffFileSheets(f));
        logDownload("excel");
      } catch (err) { toast("ERROR: Contact Administrator.", "error"); }
    });
    const add = fileEl.querySelector("#sf-add-period");
    if (add) add.addEventListener("click", () => periodForm(f));
    const rec = fileEl.querySelector("#sf-add-record");
    if (rec) rec.addEventListener("click", () => recordForm(f));
    fileEl.querySelectorAll("[data-del-period]").forEach((b) => b.addEventListener("click", () => removePeriod(f, b.dataset.delPeriod)));
    fileEl.querySelectorAll("[data-void-record]").forEach((b) => b.addEventListener("click", () => voidRecord(f, b.dataset.voidRecord)));
  }

  function logDownload(format) {
    call("staffhistory.logDownload", { employeeId: current.profile.id, format }, { quiet: true }).catch(() => {});
  }

  const reload = () => open(current.profile.id);

  // ---- add past history
  async function periodForm(f) {
    if (!departments.length) { try { departments = await call("departments.list"); } catch (e) { departments = []; } }
    const others = people.filter((e) => e.id !== f.profile.id).sort((a, b) => (a.first_name + a.last_name).localeCompare(b.first_name + b.last_name));
    const valueField = (kind) => {
      if (kind === "manager") return `<label for="pv">Reported to</label><select id="pv" name="value"><option value="">Choose a person</option>${others.map((e) => `<option value="${esc(e.id)}">${esc(e.first_name + " " + e.last_name)} (${esc(e.employee_no)})</option>`).join("")}</select>`;
      if (kind === "department") return `<label for="pv">Department</label><select id="pv" name="value"><option value="">Choose a department</option>${departments.map((x) => `<option value="${esc(x.id)}">${esc(x.name)}</option>`).join("")}</select>`;
      if (kind === "type") return `<label for="pv">Employment type</label><select id="pv" name="value">${f.options.types.map((x) => `<option value="${esc(x)}">${esc(cap(x))}</option>`).join("")}</select>`;
      if (kind === "arrangement") return `<label for="pv">Work arrangement</label><select id="pv" name="value">${f.options.arrangements.map((x) => `<option value="${esc(x)}">${esc(cap(x))}</option>`).join("")}</select>`;
      return `<label for="pv">Job title</label><input id="pv" name="value" maxlength="100">`;
    };
    const m = openModal({
      title: "Add past history",
      html: `<div id="pm" class="alert alert-error" hidden></div>
        <p class="muted" style="margin-top:0">Use this for what happened before the system recorded it, for example who they reported to in 2022. Fill the periods in from the date they joined. What applies today is changed by editing the employee, not here.</p>
        <form id="pf" class="form-grid" novalidate>
          <div class="field full"><label for="pk">What are you adding?</label><select id="pk" name="kind">${f.options.kinds.map((k) => `<option value="${k}">${esc(KIND_LABELS[k])}</option>`).join("")}</select></div>
          <div class="field full" id="pvw">${valueField("manager")}</div>
          <div class="field"><label for="ps">First day</label><input id="ps" name="start_date" type="date" value="${esc(f.profile.date_joined || "")}"></div>
          <div class="field"><label for="pe">Last day</label><input id="pe" name="end_date" type="date"></div>
          <div class="field full"><label for="pn">Note (optional)</label><input id="pn" name="note" maxlength="300" placeholder="For example: from the old personnel file"></div>
        </form>`,
      footer: `<button type="button" class="btn btn-ghost" data-close>Cancel</button><button type="submit" form="pf" class="btn" id="psave">Add to the file</button>`,
    });
    const kindSel = m.el.querySelector("#pk");
    const draw = () => { m.el.querySelector("#pvw").innerHTML = valueField(kindSel.value); };
    kindSel.addEventListener("change", draw);
    draw();
    m.el.querySelector("#pf").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const data = { employeeId: f.profile.id };
      new FormData(ev.target).forEach((v, k) => { data[k] = v; });
      const btn = m.el.querySelector("#psave"), msg = m.el.querySelector("#pm");
      msg.hidden = true;
      setBusy(btn, true, "Saving...");
      try {
        await call("staffhistory.periodAdd", data);
        m.close();
        toast("Added to the staff file.");
        reload();
      } catch (err) {
        msg.textContent = err instanceof ApiError ? err.message : "ERROR: Contact Administrator.";
        msg.hidden = false;
        setBusy(btn, false);
      }
    });
  }

  async function removePeriod(f, id) {
    if (!(await confirmDialog("Remove this period that was added by hand?", { okText: "Remove", danger: true }))) return;
    try {
      await call("staffhistory.periodDelete", { id });
      toast("Removed.");
      reload();
    } catch (err) { toast(err instanceof ApiError ? err.message : "ERROR: Contact Administrator.", "error"); }
  }

  // ---- HR records
  function recordForm(f) {
    const m = openModal({
      title: "Add an HR record",
      html: `<div id="rm" class="alert alert-error" hidden></div>
        <p class="muted" style="margin-top:0">Only the owner and HR can see this. It is never shown to the employee or their manager, and it cannot be deleted, only voided with a reason.</p>
        <form id="rf" class="form-grid" novalidate>
          <div class="field"><label for="rk">Type</label><select id="rk" name="kind">${f.options.record_kinds.map((k) => `<option value="${k}">${esc(RECORD_LABELS[k])}</option>`).join("")}</select></div>
          <div class="field"><label for="rd">Date</label><input id="rd" name="date" type="date" value="${esc(todayLagos())}" max="${esc(todayLagos())}"></div>
          <div class="field full"><label class="required" for="rt">Title</label><input id="rt" name="title" maxlength="120" placeholder="For example: Written warning for lateness"></div>
          <div class="field full"><label for="rx">Details</label><textarea id="rx" name="details" rows="4" maxlength="1500"></textarea></div>
        </form>`,
      footer: `<button type="button" class="btn btn-ghost" data-close>Cancel</button><button type="submit" form="rf" class="btn" id="rsave">Save record</button>`,
    });
    m.el.querySelector("#rf").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const data = { employeeId: f.profile.id };
      new FormData(ev.target).forEach((v, k) => { data[k] = v; });
      const btn = m.el.querySelector("#rsave"), msg = m.el.querySelector("#rm");
      msg.hidden = true;
      setBusy(btn, true, "Saving...");
      try {
        await call("staffhistory.recordAdd", data);
        m.close();
        toast("Record added.");
        reload();
      } catch (err) {
        msg.textContent = err instanceof ApiError ? err.message : "ERROR: Contact Administrator.";
        msg.hidden = false;
        setBusy(btn, false);
      }
    });
  }

  function voidRecord(f, id) {
    const m = openModal({
      title: "Void this record",
      narrow: true,
      html: `<div id="vm" class="alert alert-error" hidden></div>
        <p class="muted" style="margin-top:0">The record stays in the file, marked as voided with your reason.</p>
        <form id="vf" novalidate><div class="field"><label class="required" for="vr">Reason</label><input id="vr" name="reason" maxlength="300"></div></form>`,
      footer: `<button type="button" class="btn btn-ghost" data-close>Cancel</button><button type="submit" form="vf" class="btn btn-danger" id="vsave">Void record</button>`,
    });
    m.el.querySelector("#vf").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const btn = m.el.querySelector("#vsave"), msg = m.el.querySelector("#vm");
      msg.hidden = true;
      setBusy(btn, true, "Saving...");
      try {
        await call("staffhistory.recordVoid", { id, reason: m.el.querySelector("#vr").value });
        m.close();
        toast("Record voided.");
        reload();
      } catch (err) {
        msg.textContent = err instanceof ApiError ? err.message : "ERROR: Contact Administrator.";
        msg.hidden = false;
        setBusy(btn, false);
      }
    });
  }

  // ---- the file
  function fileHtml(f) {
    const p = f.profile, s = f.service, a = f.attendance, l = f.leave, pay = f.pay;
    const gone = s.ended;
    const reportsNow = p.manager || "No one recorded";
    const watch = f.anomalies.filter((x) => x.level === "watch"), info = f.anomalies.filter((x) => x.level === "info");

    const top = `
      <div class="sf-actions no-print">
        <a class="btn btn-ghost btn-sm" href="employee.html?id=${encodeURIComponent(p.id)}">Open profile</a>
        <span class="spacer"></span>
        <button type="button" class="btn btn-ghost btn-sm" id="sf-excel">Download Excel</button>
        <button type="button" class="btn btn-sm" id="sf-print">Print or save as PDF</button>
      </div>
      <header class="sf-head">
        <div class="sf-conf">${esc(f.company)} &middot; Staff file &middot; Confidential: owner and HR only</div>
        <h1>${esc(p.name)}</h1>
        <div class="muted">${esc(p.employee_no)}${p.job_title ? " &middot; " + esc(p.job_title) : ""}${p.department ? " &middot; " + esc(p.department) : ""}</div>
        <div class="sf-badges">${badge(p.status, STATUS_LABELS[p.status] || p.status)} ${p.employment_type ? badge("remote", cap(p.employment_type)) : ""} ${p.work_arrangement ? badge("remote", cap(p.work_arrangement)) : ""}</div>
        <dl class="dl sf-facts">
          <dt>Joined</dt><dd>${esc(d(p.date_joined)) || '<span class="muted">Not recorded</span>'}</dd>
          ${gone ? `<dt>Last working day</dt><dd>${s.end ? esc(d(s.end)) + (s.end_estimated ? " (estimated from their last activity)" : "") : '<span class="muted">Not recorded</span>'}</dd>
          <dt>Reason for leaving</dt><dd>${p.exit_reason ? esc(REASON_LABELS[p.exit_reason] || p.exit_reason) : '<span class="muted">Not recorded</span>'}${p.exit_notes ? `<div class="muted">${esc(p.exit_notes)}</div>` : ""}</dd>` : ""}
          <dt>${gone ? "Time with the company" : "Time with the company so far"}</dt><dd><strong>${esc(s.text) || "Unknown"}</strong>${s.days ? ` <span class="muted">(${days(s.days)})</span>` : ""}</dd>
          <dt>${gone ? "Last reported to" : "Reports to"}</dt><dd>${esc(reportsNow)}</dd>
          <dt>Changes while here</dt><dd>${f.moves.reporting_changes} change${f.moves.reporting_changes === 1 ? "" : "s"} of manager, ${f.moves.title_changes} of job title, ${f.moves.department_changes} of department</dd>
          <dt>File prepared</dt><dd>${esc(d(f.today))} by ${esc(f.generated_by)}</dd>
        </dl>
      </header>`;

    const standout = section("What stands out",
      f.anomalies.length ? `<ul class="sf-flags">${[...watch, ...info].map((x) => `<li class="${x.level}"><span class="dot"></span>${esc(dateify(x.text))}</li>`).join("")}</ul>` : `<p class="muted">Nothing unusual found in the records.</p>`);

    const histBlock = (kind) => {
      const rows = (f.timeline[kind] || []).map((x) => x.gap
        ? [`<span class="muted">Not recorded</span>`, esc(d(x.start)), esc(d(x.end)), esc(x.text || days(x.days)), "", ""]
        : [esc(nice(kind, x.label)), esc(d(x.start)), x.end ? esc(d(x.end)) : (gone ? "" : "Now"), esc(x.text || days(x.days)),
          x.source === "current" ? `<span class="muted">Current record</span>` : `<span class="muted">${esc(cap(x.source))}</span>${x.note ? `<div class="muted">${esc(x.note)}</div>` : ""}`,
          x.source === "manual" ? `<button type="button" class="btn btn-ghost btn-sm no-print" data-del-period="${esc(x.id)}">Remove</button>` : ""]);
      return `<h3 class="sf-sub">${esc(KIND_LABELS[kind])}</h3>${table(["Detail", "From", "To", "Length", "Source", ""], rows, "Nothing recorded.")}`;
    };
    const history = section("Employment history",
      ["manager", "title", "department", "type", "arrangement"].map(histBlock).join("") +
      (f.timeline.status.length > 1 || (f.timeline.status[0] && f.timeline.status[0].label !== "active") ? histBlock("status") : ""),
      "Each line is a period. Changes made from now on are recorded automatically; HR can fill in earlier periods.",
      `<button type="button" class="btn btn-ghost btn-sm no-print" id="sf-add-period">Add past history</button>`);

    const team = section("Who reported to them",
      `<h3 class="sf-sub">Reports to them now</h3>${table(["Name", "Job title", "Since"], f.team.current.map((x) => [esc(x.name) + `<div class="muted">${esc(x.employee_no)}</div>`, esc(x.job_title), esc(d(x.start))]), "No one reports to them at the moment.")}
       <h3 class="sf-sub">Reported to them in the past</h3>${table(["Name", "Job title", "From", "To", "Status now"], f.team.past.map((x) => [esc(x.name) + `<div class="muted">${esc(x.employee_no)}</div>`, esc(x.job_title), esc(d(x.start)), esc(d(x.end)), badge(x.status, STATUS_LABELS[x.status] || x.status)]), "No one else is recorded as having reported to them.")}`,
      "Built from each person's own reporting history, so it includes people who have since left.");

    const where = section("Where and how they worked",
      `<div class="stats">${tile(a.at_site, "Clock-ins at a work site")}${tile(a.remote_total, "Remote days")}${tile(a.away_total, "Away from a site or no usable location", a.away_total ? "warn" : "")}${tile(a.location_exempt + a.location_unchecked, "Not location-checked")}</div>
       ${a.by_site.length ? table(["Work site", "Days at the site"], a.by_site.map((x) => [esc(x.site), String(x.days)]), "") : `<p class="muted">No clock-ins at a work site are recorded.</p>`}
       ${a.remote_days.length ? `<h3 class="sf-sub">Remote days</h3>${chips(a.remote_days.map((x) => x.date), 5000)}` : ""}
       ${a.away_days.length ? `<h3 class="sf-sub">Away from a work site</h3>${table(["Date", "Result", "Nearest site", "Distance"], a.away_days.map((x) => [esc(d(x.date)), esc(LOCATION_LABELS[x.result] || x.result), esc(x.site), x.distance_m ? esc(x.distance_m + " m") : ""]), "")}` : ""}`,
      `Their agreed arrangement and employment type over time are under Employment history. The counts here come from where they actually clocked in.`);

    const attendance = section("Attendance and punctuality",
      a.records || a.no_record_total ? `<div class="stats">${tile(a.attended, "Days at work")}${tile(a.late, "Days late", a.late ? "warn" : "")}${tile(a.late_pct === null ? "-" : a.late_pct + "%", "Late, of days at work")}${tile(a.absent, "Marked absent", a.absent ? "warn" : "")}${tile(a.no_record_total, "Days with no clock-in or leave", a.no_record_total ? "warn" : "")}</div>
        <p class="muted sf-note">Late means clocking in after ${esc(a.work_start)} plus a ${esc(a.grace_minutes)}-minute grace period. First clock-in on record: ${esc(d(a.first_record)) || "none"}.</p>
        <h3 class="sf-sub">Days they were late</h3>${table(["Date", "Clocked in", "Minutes after start time"], a.late_days.map((x) => [esc(d(x.date)), esc(x.check_in), x.minutes_late === "" ? "" : esc(String(x.minutes_late))]), "Never late.")}
        ${a.no_record_total ? `<h3 class="sf-sub">Working days with no clock-in and no approved leave</h3><p class="muted sf-note">Counted from ${esc(d(a.no_record_from))}, when attendance recording began for the company. Weekends, public holidays and approved leave are not counted.</p>${chips(a.no_record_days, 5000)}` : ""}
        ${a.no_clock_out ? `<p class="muted">${a.no_clock_out} day${a.no_clock_out === 1 ? "" : "s"} with a clock-in but no clock-out.</p>` : ""}
        ${a.by_year.length ? `<h3 class="sf-sub">By year</h3>${table(["Year", "On time", "Late", "Remote", "Half days", "Absent"], a.by_year.map((y) => [esc(y.year), String(y.present), String(y.late), String(y.remote), String(y.half_day), String(y.absent)]), "")}` : ""}`
        : `<p class="muted">No attendance has been recorded for this person.</p>`);

    const leave = section("Leave taken",
      l.requests.length ? `<div class="stats">${tile(l.days_taken, "Working days of leave taken")}${l.by_type.slice(0, 4).map((t) => tile(t.days_taken, t.name)).join("")}</div>
        ${table(["Leave type", "Days taken", "Booked ahead", "Requests", "Rejected", "Cancelled"], l.by_type.map((t) => [esc(t.name), String(t.days_taken), String(t.booked_days || ""), String(t.requests), String(t.rejected || ""), String(t.cancelled || "")]), "")}
        ${l.by_year.length ? `<h3 class="sf-sub">By year</h3>${table(["Year", "Days", "Of which"], l.by_year.map((y) => [esc(y.year), String(y.total), esc(Object.keys(y.by_type).map((k) => `${k} ${y.by_type[k]}`).join(", "))]), "")}` : ""}
        ${l.balances.length ? `<h3 class="sf-sub">Balances for ${esc(l.balance_year)}</h3>${table(["Leave type", "Entitlement", "Carried over", "Used", "Remaining"], l.balances.map((b) => [esc(b.name), b.unlimited ? "No limit" : String(b.entitlement), String(b.carried || ""), String(b.used), b.remaining === null ? "" : String(b.remaining)]), "")}` : ""}
        <h3 class="sf-sub">Every request</h3>${table(["Type", "From", "To", "Days", "Status", "Decided by"], l.requests.map((r) => [esc(r.leave_type), esc(d(r.start_date)), esc(d(r.end_date)), String(r.days), badge(r.status, STATUS_LABELS[r.status] || r.status), esc(r.approver)]), "")}`
        : `<p class="muted">No leave has been requested or recorded.</p>`,
      "Working days only: weekends and public holidays are not counted.");

    const dsum = f.documents.summary;
    const docs = section("Documents",
      `<div class="stats">${tile(dsum.approved, "Required, approved")}${tile(dsum.pending, "Waiting for HR")}${tile(dsum.rejected, "Rejected", dsum.rejected ? "warn" : "")}${tile(dsum.missing, "Never submitted", dsum.missing ? "warn" : "")}${tile(f.documents.rejected_ever, "Rejected at some point")}</div>
       ${table(["Required document", "Status", "Submitted", "Reviewed by", "HR note"], f.documents.required.map((x) => [esc(x.label), badge(x.state, DOC_STATE[x.state] || x.state) + (x.expiry === "expired" ? " " + badge("rejected", "Expired") : x.expiry === "soon" ? " " + badge("pending", "Expires soon") : ""), esc(d((x.uploaded_at || "").slice(0, 10))), x.reviewed_by ? esc(x.reviewed_by) + `<div class="muted">${esc(d((x.reviewed_at || "").slice(0, 10)))}</div>` : "", esc(x.review_note)]), "No documents are required.")}
       ${f.documents.uploads.length ? `<h3 class="sf-sub">Every upload</h3>${table(["Document", "File", "Uploaded", "Status", "Reviewed by"], f.documents.uploads.map((x) => [esc(x.label), esc(x.file_name), esc(d((x.uploaded_at || "").slice(0, 10))) + `<div class="muted">${esc(x.uploaded_by)}</div>`, badge(x.status, DOC_STATE[x.status] || x.status), x.reviewed_by ? esc(x.reviewed_by) + `<div class="muted">${esc(d((x.reviewed_at || "").slice(0, 10)))}${x.review_note ? " &middot; " + esc(x.review_note) : ""}</div>` : ""]), "")}` : ""}`);

    const training = section("Training",
      table(["Course", "Status", "Completed", "Expires"], f.training.map((x) => [esc(x.course) + (x.mandatory ? ` <span class="muted">(required)</span>` : ""), esc(TRAINING_STATE[x.state] || x.state), esc(d(x.completed_on)), esc(d(x.expires_on))]), "No training is recorded."));

    const perf = section("Performance",
      `${f.performance.average_final !== null ? `<p>Average final rating: <strong>${esc(String(f.performance.average_final))} of 5</strong></p>` : ""}
       ${table(["Review", "Reviewer", "Self", "Manager", "Final", "Status"], f.performance.reviews.map((r) => [esc(r.cycle), esc(r.reviewer), esc(stars(r.self_rating)), esc(stars(r.manager_rating)), esc(stars(r.final_rating)), badge(r.status, cap(r.status))]), "No reviews yet.")}
       ${f.performance.goals.length ? `<h3 class="sf-sub">Goals</h3>${table(["Goal", "Due", "Progress", "Status"], f.performance.goals.map((g) => [esc(g.title), esc(d(g.due_date)), esc(g.progress + "%"), esc(cap(g.status))]), "")}` : ""}`);

    const payBlock = section("Pay and money",
      `${table(["Salary from", "Monthly gross", "Set by"], pay.salary.map((x) => [esc(d(x.effective_from)), esc(naira(x.monthly_gross, 0)), esc(x.set_by)]), "No salary record.")}
       ${pay.payslips.count ? `<h3 class="sf-sub">Paid through payroll (${esc(d(pay.payslips.first + "-01"))} to ${esc(d(pay.payslips.last + "-01"))})</h3>${table(["Year", "Months", "Gross pay", "Net pay", "PAYE", ...(pay.payslips.attendance ? ["Lost to lateness and no clock-in"] : [])], [...pay.payslips.by_year.map((y) => [esc(y.year), String(y.months), esc(naira(y.gross, 0)), esc(naira(y.net, 0)), esc(naira(y.paye, 0)), ...(pay.payslips.attendance ? [esc(naira(y.attendance, 0))] : [])]), [`<strong>All years</strong>`, `<strong>${pay.payslips.count}</strong>`, `<strong>${esc(naira(pay.payslips.gross, 0))}</strong>`, `<strong>${esc(naira(pay.payslips.net, 0))}</strong>`, `<strong>${esc(naira(pay.payslips.paye, 0))}</strong>`, ...(pay.payslips.attendance ? [`<strong>${esc(naira(pay.payslips.attendance, 0))}</strong>`] : [])]], "")}` : `<p class="muted">No approved payroll run includes this person.</p>`}
       ${pay.advances.length ? `<h3 class="sf-sub">Salary advances</h3>${table(["Requested", "Amount", "Status", "Repaid", "Balance"], pay.advances.map((x) => [esc(d((x.requested_at || "").slice(0, 10))), esc(naira(x.amount, 0)), badge(x.status, STATUS_LABELS[x.status] || cap(x.status)), esc(naira(x.repaid_total, 0)), x.balance ? esc(naira(x.balance, 0)) : ""]), "")}` : ""}
       ${pay.expenses.count ? `<p class="sf-note">Expense claims: ${pay.expenses.count} claim${pay.expenses.count === 1 ? "" : "s"} totalling ${esc(naira(pay.expenses.claimed, 0))}; ${esc(naira(pay.expenses.paid, 0))} paid${pay.expenses.rejected ? `, ${esc(naira(pay.expenses.rejected, 0))} rejected` : ""}.</p>` : ""}`,
      "Visible to the owner and HR only.");

    const hiring = f.hiring || f.onboarding.total ? section("How they joined",
      `${f.hiring ? `<dl class="dl"><dt>Applied</dt><dd>${esc(d((f.hiring.applied_at || "").slice(0, 10)))} for ${esc(f.hiring.job || "a job")}</dd><dt>Found us through</dt><dd>${esc(f.hiring.source) || '<span class="muted">Not recorded</span>'}</dd>
        ${f.hiring.offer ? `<dt>Offer</dt><dd>${esc(f.hiring.offer.job_title)}, starting ${esc(d(f.hiring.offer.start_date))}${f.hiring.offer.probation_months ? `, ${esc(f.hiring.offer.probation_months)}-month probation` : ""}${f.hiring.offer.reports_to ? `, reporting to ${esc(f.hiring.offer.reports_to)}` : ""}</dd>` : ""}</dl>` : ""}
       ${f.onboarding.total ? `<p>Onboarding tasks completed: <strong>${f.onboarding.done} of ${f.onboarding.total}</strong></p>` : ""}`) : "";

    const em = f.emergency || { sent: [], received: [] };
    const choice = (p) => (p.response ? `<span class="badge ${p.response === "acknowledged" ? "approved" : "cancelled"}">${p.response === "acknowledged" ? "Acknowledged" : "Dismissed"}</span><div class="muted">${esc(formatDateTime(p.responded_at))}</div>` : '<span class="badge pending">Still waiting</span>');
    const emergency = section("Medical emergency messages",
      em.sent.length || em.received.length ? `
        ${em.sent.length ? `<h3 class="sf-sub">Sent by this person</h3>${em.sent.map((m) => `<div class="em-sent"><div><strong>${esc(formatDateTime(m.created_at))}</strong>${m.location ? ` <span class="muted">&middot; ${esc(m.location)}</span>` : ""}</div><p>${esc(m.message)}</p>
          ${table(["Told", "Received (first on screen)", "Chose"], m.recipients.map((p) => [esc(p.name) + `<div class="muted">${esc(ROLE_NAMES[p.kind] || p.kind)}</div>`, p.seen_at ? esc(formatDateTime(p.seen_at)) : '<span class="muted">Not yet</span>', choice(p)]), "")}</div>`).join("")}` : ""}
        ${em.received.length ? `<h3 class="sf-sub">Sent to this person</h3>${table(["From", "Message", "Sent", "Received", "Chose"], em.received.map((x) => [esc(x.from), (x.location ? `<em>At ${esc(x.location)}.</em> ` : "") + esc(x.message), esc(formatDateTime(x.sent_at)), x.seen_at ? esc(formatDateTime(x.seen_at)) : '<span class="muted">Not yet</span>', choice(x)]), "")}` : ""}`
        : `<p class="muted">No medical emergency messages sent or received.</p>`,
      "Received means the first time the message reached the person's screen.");

    const records = section("HR record log",
      f.hr_records.length ? `<ul class="sf-records">${f.hr_records.map((r) => `<li class="${r.voided ? "voided" : ""}"><div><strong>${esc(r.title)}</strong> ${badge(r.kind === "commendation" ? "approved" : r.kind === "note" ? "no-record" : "late", RECORD_LABELS[r.kind] || r.kind)} ${r.voided ? badge("cancelled", "Voided") : ""}</div>
        <div class="muted">${esc(d(r.date))} &middot; recorded by ${esc(r.recorded_by)}</div>${r.details ? `<div>${esc(r.details)}</div>` : ""}${r.voided ? `<div class="muted">Voided: ${esc(r.void_reason)}</div>` : `<button type="button" class="btn btn-ghost btn-sm no-print" data-void-record="${esc(r.id)}">Void</button>`}</li>`).join("")}</ul>` : `<p class="muted">No warnings, queries, suspensions or commendations recorded.</p>`,
      "Private to the owner and HR.",
      `<button type="button" class="btn btn-ghost btn-sm no-print" id="sf-add-record">Add a record</button>`);

    const personal = section("Personal and sign-in details",
      `<dl class="dl"><dt>Work email</dt><dd>${esc(p.email) || '<span class="muted">None</span>'}</dd><dt>Phone</dt><dd>${esc(p.phone) || '<span class="muted">None</span>'}</dd>
        <dt>Gender</dt><dd>${esc(cap(p.gender)) || '<span class="muted">Not recorded</span>'}</dd><dt>Date of birth</dt><dd>${esc(d(p.dob)) || '<span class="muted">Not recorded</span>'}</dd>
        <dt>Home address</dt><dd>${esc(p.address) || '<span class="muted">Not recorded</span>'}</dd><dt>Bank</dt><dd>${esc([p.bank_name, p.account_no].filter(Boolean).join(" ")) || '<span class="muted">Not recorded</span>'}</dd>
        <dt>Tax ID (TIN)</dt><dd>${esc(p.tin) || '<span class="muted">Not recorded</span>'}</dd><dt>Pension PIN</dt><dd>${esc(p.pension_pin) || '<span class="muted">Not recorded</span>'}</dd>
        <dt>Sign-in</dt><dd>${f.login.length ? f.login.map((u) => `${esc(u.email)}, ${esc(u.role)}, ${esc(u.status)}; last signed in ${esc(formatDateTime(u.last_login))}`).join("<br>") : '<span class="muted">No login</span>'}</dd></dl>`);

    return `${top}<div class="sf">${standout}${history}${team}${where}${attendance}${leave}${docs}${training}${perf}${payBlock}${hiring}${emergency}${records}${personal}</div>
      <p class="muted sf-foot">Prepared ${esc(d(f.today))} by ${esc(f.generated_by)} from the company's HR records. Confidential: for the owner and HR only.</p>`;
  }

  try {
    const [list] = await Promise.all([call("employees.list")]);
    people = list;
  } catch (err) {
    errorBox(results, err instanceof ApiError ? err.message : "ERROR: Contact Administrator.");
  }
  drawResults();
  const wanted = new URLSearchParams(location.search).get("id");
  if (wanted) open(wanted);
}
