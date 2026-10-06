import { call, ApiError } from "../api.js";
import { initPage, loading, errorBox, canManageStaff } from "../layout.js";
import {
  esc, openModal, toast, formatDate, STATUS_LABELS, tabBar, bindTabs,
  thisMonth, shiftMonth, monthLabel, todayLagos,
} from "../ui.js";

const page = initPage({ active: "attendance", title: "Attendance" });
if (page) run(page);

const badge = (state) => state ? `<span class="badge ${esc(state)}">${esc(STATUS_LABELS[state] || state)}</span>` : "";

async function run({ role, content }) {
  const isHr = canManageStaff(role);
  const canViewAll = isHr || role === "manager";
  const tabs = [{ id: "today", label: "Today" }];
  if (canViewAll) tabs.push({ id: "team", label: "Team" }, { id: "report", label: "Monthly report" });
  let active = "today";

  content.innerHTML = `<div id="tabs">${tabBar(tabs, active)}</div><div id="panel"></div>`;
  const panel = content.querySelector("#panel");
  bindTabs(content.querySelector("#tabs"), (id) => { active = id; show(); });

  function show() {
    if (active === "today") todayTab();
    else if (active === "team") teamTab();
    else reportTab();
  }

  // ------------------------------------------------------------ today / my month
  let myMonth = thisMonth();
  async function todayTab() {
    loading(panel);
    try {
      const [today, mine] = await Promise.all([call("attendance.today"), call("attendance.mine", { month: myMonth })]);
      renderToday(today, mine);
    } catch (err) {
      errorBox(panel, err instanceof ApiError ? err.message : "Could not load attendance.");
    }
  }

  function renderToday(t, mine) {
    if (!t.linked) {
      panel.innerHTML = `<div class="card"><h2>Your login is not linked to an employee record</h2>
        <p class="muted">${isHr ? "Link it from User access to clock in yourself." : "Ask HR to link your login to your employee record so you can clock in."}</p></div>`;
      return;
    }
    const rec = t.record;
    let note = "";
    if (t.onLeave) note = `You are on approved leave today (${esc(t.onLeave)}).`;
    else if (t.holiday) note = `Today is a public holiday: ${esc(t.holiday)}.`;
    else if (t.weekend) note = "Today is a weekend.";
    const state = rec && rec.check_out ? "done" : rec && rec.check_in ? "in" : "out";
    panel.innerHTML = `
      <div class="card clock-card">
        <div><div class="big">${esc(t.time)}</div><div class="sub">${esc(formatDate(t.date))} &middot; Lagos time &middot; work starts ${esc(t.settings.work_start)}</div>
          ${note ? `<div class="sub" style="margin-top:8px">${note}</div>` : ""}</div>
        <div>${rec ? `<div>${badge(rec.status)}</div><div class="sub">In ${esc(rec.check_in || "-")} &middot; Out ${esc(rec.check_out || "-")}</div>` : `<div class="muted">You have not clocked in today.</div>`}</div>
        <div class="clock-actions">
          ${state === "out" ? `<label><input type="checkbox" id="remote"> Working remotely</label><button class="btn" id="in" type="button">Clock in</button>` : ""}
          ${state === "in" ? `<button class="btn" id="out" type="button">Clock out</button>` : ""}
          ${state === "done" ? `<span class="muted">Done for today</span>` : ""}
        </div>
      </div>
      <div class="month-nav">
        <button class="btn btn-ghost btn-sm" id="prev" type="button" aria-label="Previous month">&larr;</button><strong>${esc(monthLabel(myMonth))}</strong>
        <button class="btn btn-ghost btn-sm" id="next" type="button" aria-label="Next month">&rarr;</button>
      </div>
      <div class="chips">${["present", "late", "remote", "half-day", "absent"].map((k) => `<span class="chip"><b>${mine.summary[k]}</b>${esc(STATUS_LABELS[k])}</span>`).join("")}</div>
      ${mine.records.length ? `<div class="table-wrap"><table class="data"><thead><tr><th>Date</th><th>Status</th><th>In</th><th>Out</th><th>Note</th></tr></thead><tbody>
        ${mine.records.map((r) => `<tr><td>${esc(formatDate(r.date))}</td><td>${badge(r.status)}</td><td>${esc(r.check_in)}</td><td>${esc(r.check_out)}</td><td class="muted">${esc(r.note)}</td></tr>`).join("")}</tbody></table></div>`
        : `<div class="card empty">No attendance recorded for ${esc(monthLabel(myMonth))}.</div>`}`;

    const btnIn = panel.querySelector("#in");
    if (btnIn) btnIn.addEventListener("click", () => act(btnIn, "attendance.clockIn", { remote: panel.querySelector("#remote").checked }, "Clocked in."));
    const btnOut = panel.querySelector("#out");
    if (btnOut) btnOut.addEventListener("click", () => act(btnOut, "attendance.clockOut", {}, "Clocked out."));
    panel.querySelector("#prev").addEventListener("click", () => { myMonth = shiftMonth(myMonth, -1); todayTab(); });
    panel.querySelector("#next").addEventListener("click", () => { myMonth = shiftMonth(myMonth, 1); todayTab(); });
  }

  async function act(btn, action, data, okText) {
    btn.disabled = true;
    try { await call(action, data); toast(okText); todayTab(); }
    catch (err) { toast(err.message, "error"); btn.disabled = false; }
  }

  // ------------------------------------------------------------ team (one day)
  let day = todayLagos();
  async function teamTab() {
    loading(panel);
    try {
      const [d, settings] = await Promise.all([call("attendance.day", { date: day }), call("attendance.settingsGet")]);
      renderTeam(d, settings);
    } catch (err) {
      errorBox(panel, err instanceof ApiError ? err.message : "Could not load the team view.");
    }
  }

  function renderTeam(d, settings) {
    const order = ["present", "late", "remote", "half-day", "absent", "on-leave", "no-record"];
    const chips = order.filter((k) => d.counts[k]).map((k) => `<span class="chip"><b>${d.counts[k]}</b>${esc(STATUS_LABELS[k] || "On leave")}</span>`).join("");
    panel.innerHTML = `
      <div class="toolbar"><input type="date" id="day" value="${esc(day)}" aria-label="Choose a date"><button class="btn btn-ghost btn-sm" id="today-btn" type="button">Today</button>
        ${d.holiday ? `<span class="badge">${esc(d.holiday)}</span>` : d.weekend ? `<span class="badge">Weekend</span>` : ""}</div>
      <div class="chips">${chips || '<span class="muted">Nothing to show for this day.</span>'}</div>
      ${d.rows.length ? `<div class="table-wrap"><table class="data"><thead><tr><th>Employee</th><th>Department</th><th>Status</th><th>In</th><th>Out</th><th></th></tr></thead><tbody>
        ${d.rows.map((r) => `<tr><td><strong>${esc(r.name)}</strong><div class="muted">${esc(r.employee_no)}</div></td><td>${esc(r.department)}</td>
          <td>${r.state === "on-leave" ? `<span class="badge on-leave">${esc(r.leave || "On leave")}</span>` : badge(r.state)}</td>
          <td>${esc(r.record ? r.record.check_in : "")}</td><td>${esc(r.record ? r.record.check_out : "")}</td>
          <td style="text-align:right">${isHr ? `<button class="btn btn-ghost btn-sm" data-edit="${esc(r.employee_id)}" type="button">${r.record ? "Edit" : "Add"}</button>` : ""}</td></tr>`).join("")}
        </tbody></table></div>` : `<div class="card empty">No employees to show.</div>`}
      ${isHr ? settingsCard(settings) : ""}`;

    panel.querySelector("#day").addEventListener("change", (e) => { if (e.target.value) { day = e.target.value; teamTab(); } });
    panel.querySelector("#today-btn").addEventListener("click", () => { day = todayLagos(); teamTab(); });
    panel.querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", () => editRecord(d.rows.find((r) => r.employee_id === b.dataset.edit))));
    const sf = panel.querySelector("#settings-form");
    if (sf) sf.addEventListener("submit", saveSettings);
  }

  function settingsCard(s) {
    return `<div class="card" style="margin-top:24px"><h2>Working hours</h2>
      <p class="muted">Clock-ins after the start time plus the grace period are marked late.</p>
      <div id="s-msg" class="alert alert-error" hidden></div>
      <form id="settings-form" class="inline-form" novalidate>
        <div class="field"><label for="s-start">Work starts</label><input id="s-start" name="work_start" type="time" value="${esc(s.work_start)}" required></div>
        <div class="field"><label for="s-end">Work ends</label><input id="s-end" name="work_end" type="time" value="${esc(s.work_end)}" required></div>
        <div class="field"><label for="s-grace">Grace (minutes)</label><input id="s-grace" name="late_grace_minutes" inputmode="numeric" value="${esc(s.late_grace_minutes)}" style="width:110px"></div>
        <button class="btn" type="submit">Save</button></form></div>`;
  }

  async function saveSettings(ev) {
    ev.preventDefault();
    const f = ev.target;
    const msg = panel.querySelector("#s-msg");
    msg.hidden = true;
    try {
      await call("attendance.settingsSave", { work_start: f.work_start.value, work_end: f.work_end.value, late_grace_minutes: f.late_grace_minutes.value });
      toast("Working hours saved.");
    } catch (err) { msg.textContent = err.message; msg.hidden = false; }
  }

  function editRecord(row) {
    const r = row.record || {};
    const m = openModal({
      title: `Attendance: ${row.name}`, narrow: true,
      html: `<div id="m-msg" class="alert alert-error" hidden></div><p class="muted">${esc(formatDate(day))}</p>
        <form id="a-form" novalidate>
          <div class="field"><label for="a-status">Status</label><select id="a-status" name="status">
            ${["present", "late", "remote", "half-day", "absent"].map((s) => `<option value="${s}"${(r.status || "present") === s ? " selected" : ""}>${esc(STATUS_LABELS[s])}</option>`).join("")}</select></div>
          <div class="inline-form" style="margin-bottom:16px">
            <div class="field" style="flex:1"><label for="a-in">Clock in</label><input id="a-in" name="check_in" type="time" value="${esc(r.check_in)}"></div>
            <div class="field" style="flex:1"><label for="a-out">Clock out</label><input id="a-out" name="check_out" type="time" value="${esc(r.check_out)}"></div></div>
          <div class="field"><label for="a-note">Note</label><input id="a-note" name="note" maxlength="200" value="${esc(r.note)}"></div>
        </form>`,
      footer: `<button class="btn btn-ghost" data-close type="button">Cancel</button><button class="btn" type="submit" form="a-form">Save</button>`,
    });
    m.el.querySelector("#a-form").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const f = ev.target;
      try {
        await call("attendance.save", { employeeId: row.employee_id, date: day, status: f.status.value, check_in: f.check_in.value, check_out: f.check_out.value, note: f.note.value });
        m.close();
        toast("Attendance saved.");
        teamTab();
      } catch (err) { const x = m.el.querySelector("#m-msg"); x.textContent = err.message; x.hidden = false; }
    });
  }

  // ------------------------------------------------------------ monthly report
  let reportMonth = thisMonth();
  async function reportTab() {
    loading(panel);
    try {
      renderReport(await call("attendance.report", { month: reportMonth }));
    } catch (err) {
      errorBox(panel, err instanceof ApiError ? err.message : "Could not load the report.");
    }
  }

  function renderReport(rep) {
    panel.innerHTML = `
      <div class="month-nav">
        <button class="btn btn-ghost btn-sm" id="prev" type="button" aria-label="Previous month">&larr;</button><strong>${esc(monthLabel(reportMonth))}</strong>
        <button class="btn btn-ghost btn-sm" id="next" type="button" aria-label="Next month">&rarr;</button>
        <span class="muted" style="margin-left:12px">${rep.workdays} working day${rep.workdays === 1 ? "" : "s"} so far</span>
      </div>
      ${rep.rows.length ? `<div class="table-wrap"><table class="data"><thead><tr><th>Employee</th><th class="num-cell">Present</th><th class="num-cell">Late</th><th class="num-cell">Remote</th>
        <th class="num-cell">Half day</th><th class="num-cell">Absent</th><th class="num-cell">On leave</th><th class="num-cell">No record</th></tr></thead><tbody>
        ${rep.rows.map((r) => `<tr><td><strong>${esc(r.name)}</strong><div class="muted">${esc(r.employee_no)}</div></td>
          <td class="num-cell">${r.present}</td><td class="num-cell">${r.late}</td><td class="num-cell">${r.remote}</td><td class="num-cell">${r.half_day}</td>
          <td class="num-cell${r.absent ? " row-warn" : ""}">${r.absent}</td><td class="num-cell">${r.leave}</td><td class="num-cell${r.no_record ? " row-warn" : ""}">${r.no_record}</td></tr>`).join("")}
        </tbody></table></div>
        <p class="muted" style="margin-top:10px">"No record" counts working days with no clock-in and no approved leave. HR can add or correct a day from the Team tab.</p>`
        : `<div class="card empty">No employees to report on.</div>`}`;
    panel.querySelector("#prev").addEventListener("click", () => { reportMonth = shiftMonth(reportMonth, -1); reportTab(); });
    panel.querySelector("#next").addEventListener("click", () => { reportMonth = shiftMonth(reportMonth, 1); reportTab(); });
  }

  show(); // last, so every `let` above is initialised first
}
