import { call, ApiError } from "../api.js";
import { initPage, loading, errorBox, canManageStaff } from "../layout.js";
import { getPosition, locationPermission, GeoError } from "../geo.js";
import { openLocationRules } from "../geo-rules.js";
import {
  esc, openModal, confirmDialog, toast, formatDate, STATUS_LABELS, tabBar, bindTabs,
  thisMonth, shiftMonth, monthLabel, todayLagos,
} from "../ui.js";

const page = initPage({ active: "attendance", title: "Attendance" });
if (page) run(page);

const badge = (state) => state ? `<span class="badge ${esc(state)}">${esc(STATUS_LABELS[state] || state)}</span>` : "";

// ---- location display ----
const mapLink = (lat, lng) => (lat !== "" && lng !== "" && lat != null && lng != null && isFinite(Number(lat)) && isFinite(Number(lng)))
  ? `<a href="https://www.google.com/maps?q=${encodeURIComponent(lat)},${encodeURIComponent(lng)}" target="_blank" rel="noopener noreferrer">Map</a>` : "";

function geoBadge(flag, dist, site) {
  switch (flag) {
    case "ok": return `<span class="badge geo-ok">At ${esc(site || "work site")}</span>`;
    case "outside": return `<span class="badge geo-attn">Outside site${dist ? ` (${esc(dist)} m)` : ""}</span>`;
    case "weak": return `<span class="badge geo-attn">Location unclear</span>`;
    case "none": return `<span class="badge geo-none">No location</span>`;
    case "remote": return `<span class="badge remote">Remote</span>`;
    case "nosite": return `<span class="badge geo-none">Location logged</span>`;
    case "exempt": return `<span class="badge geo-none">Exempt</span>`;
    default: return "";
  }
}

// Where the person clocked in and out, for a table cell.
function geoCell(r) {
  if (!r || (!r.in_geo && !r.out_geo)) return "";
  const parts = [];
  if (r.in_geo) parts.push(`<span>${geoBadge(r.in_geo, r.in_dist, r.in_site)} ${mapLink(r.in_lat, r.in_lng)}</span>`);
  // only mention clock-out when it needs attention, so the common case stays one line
  if (["outside", "weak", "none"].includes(r.out_geo)) parts.push(`<span>Out: ${geoBadge(r.out_geo, r.out_dist)} ${mapLink(r.out_lat, r.out_lng)}</span>`);
  return `<div class="geo-cell">${parts.join("")}</div>`;
}

const clockInSentence = (r) => {
  if (r.in_geo === "outside") return `Clocked in. You are about ${r.in_dist} m from ${r.in_site}, so HR will see this as outside the work site.`;
  if (r.in_geo === "weak") return "Clocked in, but your location was too imprecise to confirm. HR will see this.";
  return "Clocked in.";
};

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
    const geoCol = t.settings.geo_mode !== "off";                                   // the company uses the location check
    const geoOn = geoCol && !t.geo_exempt, geoBlock = t.settings.geo_mode === "block" && !t.geo_exempt; // this person is checked
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
          ${state === "out" ? `${geoBlock ? "" : `<label><input type="checkbox" id="remote"> Working remotely</label>`}<button class="btn" id="in" type="button">Clock in</button>` : ""}
          ${state === "in" ? `<button class="btn" id="out" type="button">Clock out</button>` : ""}
          ${state === "done" ? `<span class="muted">Done for today</span>` : ""}
        </div>
        ${geoCol && state !== "done" ? `<div class="geo-note" id="geo-note" style="flex-basis:100%">${t.geo_exempt
          ? "You are exempt from the location check, so your location is not asked for."
          : (geoBlock
            ? "Location is checked when you clock in: you must be at a work site. Your browser will ask permission the first time."
            : "Your location is recorded when you clock in and out. Your browser will ask permission the first time.")
            + (t.geo_sites.length ? ` You can clock in at: ${esc(t.geo_sites.join(", "))}.` : "")}</div>` : ""}
      </div>
      <div class="month-nav">
        <button class="btn btn-ghost btn-sm" id="prev" type="button" aria-label="Previous month">&larr;</button><strong>${esc(monthLabel(myMonth))}</strong>
        <button class="btn btn-ghost btn-sm" id="next" type="button" aria-label="Next month">&rarr;</button>
      </div>
      <div class="chips">${["present", "late", "remote", "half-day", "absent"].map((k) => `<span class="chip"><b>${mine.summary[k]}</b>${esc(STATUS_LABELS[k])}</span>`).join("")}</div>
      ${mine.records.length ? `<div class="table-wrap"><table class="data"><thead><tr><th>Date</th><th>Status</th><th>In</th><th>Out</th>${geoCol ? "<th>Location</th>" : ""}<th>Note</th></tr></thead><tbody>
        ${mine.records.map((r) => `<tr><td>${esc(formatDate(r.date))}</td><td>${badge(r.status)}</td><td>${esc(r.check_in)}</td><td>${esc(r.check_out)}</td>${geoCol ? `<td>${geoCell(r)}</td>` : ""}<td class="muted">${esc(r.note)}</td></tr>`).join("")}</tbody></table></div>`
        : `<div class="card empty">No attendance recorded for ${esc(monthLabel(myMonth))}.</div>`}`;

    const btnIn = panel.querySelector("#in");
    if (btnIn) btnIn.addEventListener("click", () => clock(btnIn, "attendance.clockIn", { remote: !!(panel.querySelector("#remote") || {}).checked }, geoOn, true));
    const btnOut = panel.querySelector("#out");
    if (btnOut) btnOut.addEventListener("click", () => clock(btnOut, "attendance.clockOut", {}, geoOn, false));
    if (geoOn && state === "out") showPermissionWarning(); // only the clock-in is stopped by a denied permission
    panel.querySelector("#prev").addEventListener("click", () => { myMonth = shiftMonth(myMonth, -1); todayTab(); });
    panel.querySelector("#next").addEventListener("click", () => { myMonth = shiftMonth(myMonth, 1); todayTab(); });
  }

  // Clock in or out. With the location check on, the position is read first and sent along; the server decides what it means.
  // Clocking in needs a position. Clocking out goes ahead without one (nobody should be stuck at work), and HR sees "No location".
  async function clock(btn, action, data, withLocation, required) {
    const label = btn.textContent;
    btn.disabled = true;
    try {
      let geo = null;
      if (withLocation) {
        btn.textContent = "Finding your location...";
        try { geo = await getPosition(); }
        catch (e) {
          if (required || !(e instanceof GeoError)) throw e;
          toast(e.message + " Clocking out without a location.", "error");
        }
      }
      const rec = await call(action, geo ? { ...data, geo } : data);
      toast(action === "attendance.clockIn" ? clockInSentence(rec) : (rec.out_geo === "outside" ? "Clocked out. You are away from the work site; HR will see this." : "Clocked out."));
      todayTab();
    } catch (err) {
      toast(err.message, "error");
      btn.disabled = false;
      btn.textContent = label;
    }
  }

  async function showPermissionWarning() {
    if ((await locationPermission()) !== "denied") return;
    const note = panel.querySelector("#geo-note");
    if (!note) return;
    note.classList.add("warn");
    note.textContent = "Location is turned off for this website, so you cannot clock in. Turn it on: tap the lock or settings icon next to the address, choose Site settings, set Location to Allow, then reload. If you opened this link inside WhatsApp or another app, open it in Chrome or Safari instead.";
  }

  // ------------------------------------------------------------ team (one day)
  let day = todayLagos();
  async function teamTab() {
    loading(panel);
    try {
      const [d, settings, geo] = await Promise.all([call("attendance.day", { date: day }), call("attendance.settingsGet"), isHr ? call("attendance.sitesList") : null]);
      renderTeam(d, settings, geo);
    } catch (err) {
      errorBox(panel, err instanceof ApiError ? err.message : "Could not load the team view.");
    }
  }

  function renderTeam(d, settings, geo) {
    const geoOn = settings.geo_mode !== "off";
    const order = ["present", "late", "remote", "half-day", "absent", "on-leave", "no-record"];
    const chips = order.filter((k) => d.counts[k]).map((k) => `<span class="chip"><b>${d.counts[k]}</b>${esc(STATUS_LABELS[k] || "On leave")}</span>`).join("");
    panel.innerHTML = `
      <div class="toolbar"><input type="date" id="day" value="${esc(day)}" aria-label="Choose a date"><button class="btn btn-ghost btn-sm" id="today-btn" type="button">Today</button>
        ${d.holiday ? `<span class="badge">${esc(d.holiday)}</span>` : d.weekend ? `<span class="badge">Weekend</span>` : ""}</div>
      <div class="chips">${chips || '<span class="muted">Nothing to show for this day.</span>'}</div>
      ${d.rows.length ? `<div class="table-wrap"><table class="data"><thead><tr><th>Employee</th><th>Department</th><th>Status</th><th>In</th><th>Out</th>${geoOn ? "<th>Location</th>" : ""}<th></th></tr></thead><tbody>
        ${d.rows.map((r) => `<tr><td><strong>${esc(r.name)}</strong><div class="muted">${esc(r.employee_no)}</div></td><td>${esc(r.department)}</td>
          <td>${r.state === "on-leave" ? `<span class="badge on-leave">${esc(r.leave || "On leave")}</span>` : badge(r.state)}</td>
          <td>${esc(r.record ? r.record.check_in : "")}</td><td>${esc(r.record ? r.record.check_out : "")}</td>${geoOn ? `<td>${geoCell(r.record)}</td>` : ""}
          <td style="text-align:right">${isHr ? `<button class="btn btn-ghost btn-sm" data-edit="${esc(r.employee_id)}" type="button">${r.record ? "Edit" : "Add"}</button>` : ""}</td></tr>`).join("")}
        </tbody></table></div>` : `<div class="card empty">No employees to show.</div>`}
      ${isHr ? settingsCard(settings) + geoCard(geo) : ""}`;

    panel.querySelector("#day").addEventListener("change", (e) => { if (e.target.value) { day = e.target.value; teamTab(); } });
    panel.querySelector("#today-btn").addEventListener("click", () => { day = todayLagos(); teamTab(); });
    panel.querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", () => editRecord(d.rows.find((r) => r.employee_id === b.dataset.edit))));
    const sf = panel.querySelector("#settings-form");
    if (sf) sf.addEventListener("submit", saveSettings);
    const gf = panel.querySelector("#geo-form");
    if (gf) {
      gf.addEventListener("submit", saveGeoMode);
      panel.querySelector("#site-add").addEventListener("click", () => editSite(null));
      panel.querySelectorAll("[data-site-edit]").forEach((b) => b.addEventListener("click", () => editSite(geo.sites.find((s) => s.id === b.dataset.siteEdit))));
      panel.querySelectorAll("[data-site-del]").forEach((b) => b.addEventListener("click", () => deleteSite(geo.sites.find((s) => s.id === b.dataset.siteDel))));
      panel.querySelectorAll("[data-rule-edit]").forEach((b) => b.addEventListener("click", () => openLocationRules({ employeeId: b.dataset.ruleEdit, onSaved: teamTab })));
    }
  }

  // ------------------------------------------------------------ location check and work sites (HR)
  const MODE_TEXT = {
    off: "Off: no location is asked for or stored.",
    flag: "Flag: staff must share their location to clock in. Clock-ins away from a work site are accepted but marked for HR to see.",
    block: "Block: staff can only clock in at a work site. Remote clock-in is switched off (HR can still record a remote day). Clocking out is never blocked.",
  };

  function geoCard(g) {
    return `<div class="card" style="margin-top:24px"><h2>Location check</h2>
      <p class="muted">When on, the phone's location is recorded each time someone clocks in and out, and compared with your work sites. Tell your staff this is happening and why.</p>
      <div id="g-msg" class="alert alert-error" hidden></div>
      <form id="geo-form" class="inline-form" novalidate>
        <div class="field"><label for="g-mode">Mode</label><select id="g-mode" name="mode">
          ${["flag", "block", "off"].map((m) => `<option value="${m}"${g.mode === m ? " selected" : ""}>${m === "flag" ? "Flag (recommended)" : m === "block" ? "Block" : "Off"}</option>`).join("")}</select></div>
        <button class="btn" type="submit">Save</button></form>
      <p class="hint" id="g-mode-text">${esc(MODE_TEXT[g.mode])}</p>
      <h3 style="margin-top:20px">Work sites</h3>
      ${g.sites.length ? g.sites.map((s) => `<div class="site-row"><div><strong>${esc(s.name)}</strong><div class="muted">${esc(s.radius_m)} m radius &middot; ${esc(s.lat)}, ${esc(s.lng)} &middot; ${mapLink(s.lat, s.lng)}</div></div>
        <div><button class="btn btn-ghost btn-sm" data-site-edit="${esc(s.id)}" type="button">Edit</button> <button class="btn btn-ghost btn-sm" data-site-del="${esc(s.id)}" type="button">Remove</button></div></div>`).join("")
        : `<p class="muted">No work sites yet. Until you add one, locations are recorded but nothing is compared, so nobody is marked outside.</p>`}
      <p style="margin-top:12px"><button class="btn btn-sm" id="site-add" type="button">Add a work site</button></p>
      <h3 style="margin-top:24px">People with their own rule</h3>
      <p class="muted">By default everyone follows the company rule above. Open someone's profile under Employees, then <strong>Clock-in location</strong>, to exempt them or limit them to certain work sites.</p>
      ${g.rules.map((r) => `<div class="site-row"><div><strong>${esc(r.name)}</strong><div class="muted">${r.exempt ? "Exempt from the location check" : `Only at: ${esc(r.site_names.join(", "))}`}</div></div>
        <div><button class="btn btn-ghost btn-sm" data-rule-edit="${esc(r.employee_id)}" type="button">Change</button></div></div>`).join("")}</div>`;
  }

  async function saveGeoMode(ev) {
    ev.preventDefault();
    const msg = panel.querySelector("#g-msg");
    msg.hidden = true;
    try {
      await call("attendance.geoSave", { mode: ev.target.mode.value });
      toast("Location check saved.");
      teamTab();
    } catch (err) { msg.textContent = err.message; msg.hidden = false; }
  }

  function editSite(site) {
    const s = site || { name: "", lat: "", lng: "", radius_m: "150" };
    const m = openModal({
      title: site ? "Edit work site" : "Add a work site", narrow: true,
      html: `<div id="m-msg" class="alert alert-error" hidden></div>
        <form id="site-form" novalidate>
          <div class="field"><label for="s-name">Name</label><input id="s-name" name="name" maxlength="80" value="${esc(s.name)}" placeholder="Head Office"></div>
          <p><button class="btn btn-ghost btn-sm" id="here" type="button">Use my current location</button></p>
          <p class="hint" id="here-note">Stand at the office, tap the button, and check the accuracy shown. Or paste the numbers from Google Maps (right-click the place, then click the numbers shown).</p>
          <div class="inline-form" style="margin-bottom:16px">
            <div class="field" style="flex:1"><label for="s-lat">Latitude</label><input id="s-lat" name="lat" inputmode="decimal" value="${esc(s.lat)}" placeholder="6.5244"></div>
            <div class="field" style="flex:1"><label for="s-lng">Longitude</label><input id="s-lng" name="lng" inputmode="decimal" value="${esc(s.lng)}" placeholder="3.3792"></div></div>
          <div class="field"><label for="s-rad">Radius in metres</label><input id="s-rad" name="radius_m" inputmode="numeric" value="${esc(s.radius_m)}" style="width:120px">
            <div class="hint">How far from the centre still counts as being at work (30 to 5000). Phones are often off by 10 to 30 metres, so 100 to 200 suits most offices.</div></div>
        </form>`,
      footer: `<button class="btn btn-ghost" data-close type="button">Cancel</button><button class="btn" type="submit" form="site-form">Save</button>`,
    });
    const form = m.el.querySelector("#site-form");
    const note = m.el.querySelector("#here-note");
    m.el.querySelector("#here").addEventListener("click", async (ev) => {
      const btn = ev.currentTarget;
      btn.disabled = true;
      note.textContent = "Finding your location...";
      try {
        const p = await getPosition();
        form.lat.value = p.lat.toFixed(5);
        form.lng.value = p.lng.toFixed(5);
        note.textContent = `Accurate to about ${Math.round(p.accuracy)} m.` + (p.accuracy > 100 ? " That is rough: try again outdoors, or paste the numbers from Google Maps." : "");
      } catch (err) { note.textContent = err.message; }
      btn.disabled = false;
    });
    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      try {
        await call("attendance.siteSave", { id: site ? site.id : undefined, name: form.name.value, lat: form.lat.value.trim(), lng: form.lng.value.trim(), radius_m: form.radius_m.value.trim() });
        m.close();
        toast("Work site saved.");
        teamTab();
      } catch (err) { const x = m.el.querySelector("#m-msg"); x.textContent = err.message; x.hidden = false; }
    });
  }

  async function deleteSite(site) {
    if (!(await confirmDialog(`Remove the work site "${site.name}"? Past attendance records keep their location.`, { okText: "Remove", danger: true }))) return;
    try { await call("attendance.siteDelete", { id: site.id }); toast("Work site removed."); teamTab(); }
    catch (err) { toast(err.message, "error"); }
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
        <th class="num-cell">Half day</th><th class="num-cell">Absent</th><th class="num-cell">On leave</th><th class="num-cell">No record</th>${rep.location ? '<th class="num-cell">Off site</th>' : ""}</tr></thead><tbody>
        ${rep.rows.map((r) => `<tr><td><strong>${esc(r.name)}</strong><div class="muted">${esc(r.employee_no)}</div></td>
          <td class="num-cell">${r.present}</td><td class="num-cell">${r.late}</td><td class="num-cell">${r.remote}</td><td class="num-cell">${r.half_day}</td>
          <td class="num-cell${r.absent ? " row-warn" : ""}">${r.absent}</td><td class="num-cell">${r.leave}</td><td class="num-cell${r.no_record ? " row-warn" : ""}">${r.no_record}</td>${rep.location ? `<td class="num-cell${r.off_site ? " row-warn" : ""}">${r.off_site}</td>` : ""}</tr>`).join("")}
        </tbody></table></div>
        <p class="muted" style="margin-top:10px">"No record" counts working days with no clock-in and no approved leave. HR can add or correct a day from the Team tab.${rep.location ? ' "Off site" counts clock-ins marked outside the work site, too imprecise to confirm, or with no location.' : ""}</p>`
        : `<div class="card empty">No employees to report on.</div>`}`;
    panel.querySelector("#prev").addEventListener("click", () => { reportMonth = shiftMonth(reportMonth, -1); reportTab(); });
    panel.querySelector("#next").addEventListener("click", () => { reportMonth = shiftMonth(reportMonth, 1); reportTab(); });
  }

  show(); // last, so every `let` above is initialised first
}
