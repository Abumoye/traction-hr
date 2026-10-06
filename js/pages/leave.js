import { call, ApiError } from "../api.js";
import { initPage, loading, errorBox, canManageStaff } from "../layout.js";
import {
  esc, openModal, confirmDialog, toast, formatDate, STATUS_LABELS, tabBar, bindTabs,
  thisMonth, shiftMonth, monthLabel, countWorkingDays, todayLagos,
} from "../ui.js";

const page = initPage({ active: "leave", title: "Leave" });
if (page) run(page);

const holidayCache = {}; // year -> Set of ISO dates
async function holidaySet(years) {
  const out = new Set();
  for (const y of years) {
    if (!holidayCache[y]) {
      try { holidayCache[y] = (await call("holidays.list", { year: y })).map((h) => h.date); } catch (e) { holidayCache[y] = []; }
    }
    holidayCache[y].forEach((d) => out.add(d));
  }
  return out;
}

async function run({ session, role, content }) {
  const isHr = canManageStaff(role);
  const canApprove = isHr || role === "manager";
  const linked = !!session.user.employeeId;
  const params = new URLSearchParams(location.search);

  let pendingCount = 0;
  if (canApprove) {
    try { pendingCount = (await call("leave.list", { status: "pending" })).filter((r) => r.can_decide).length; } catch (e) {}
  }
  const tabs = [{ id: "mine", label: "My leave" }];
  if (canApprove) tabs.push({ id: "approvals", label: isHr ? "All requests" : "Team requests", badge: pendingCount || "" });
  if (canApprove) tabs.push({ id: "calendar", label: "Calendar" });
  let active = tabs.some((t) => t.id === params.get("tab")) ? params.get("tab") : "mine";

  content.innerHTML = `<div id="tabs">${tabBar(tabs, active)}</div><div id="panel"></div>`;
  const panel = content.querySelector("#panel");
  bindTabs(content.querySelector("#tabs"), (id) => { active = id; show(); });

  function show() {
    if (active === "mine") mineTab();
    else if (active === "approvals") approvalsTab();
    else calendarTab();
  }

  // ------------------------------------------------------------ my leave
  async function mineTab() {
    loading(panel);
    try {
      const [mine, types] = await Promise.all([call("leave.mine"), call("leaveTypes.list")]);
      const employees = isHr ? await call("employees.list") : [];
      renderMine(mine, types, employees);
    } catch (err) {
      errorBox(panel, err instanceof ApiError ? err.message : "Could not load your leave.");
    }
  }

  function renderMine(mine, types, employees) {
    const noTypes = !types.length;
    const actions = `<div class="toolbar">
        ${mine.linked ? `<h2 style="margin:0">Balances for ${mine.year}</h2>` : ""}
        <span class="spacer" style="display:flex;gap:8px">
          ${isHr ? `<button class="btn btn-ghost" id="record" type="button">Record leave for someone</button>` : ""}
          ${mine.linked ? `<button class="btn" id="request" type="button"${noTypes ? " disabled" : ""}>Request leave</button>` : ""}
        </span></div>`;
    if (!mine.linked) {
      panel.innerHTML = `${actions}<div class="card"><h2>Your login is not linked to an employee record</h2>
        <p class="muted">${isHr ? "Link it from User access to request your own leave. You can still record leave for other people." : "Ask HR to link your login to your employee record to request leave."}</p></div>`;
    } else {
      const balances = mine.balances.filter((b) => b.applicable || b.missing_gender).map((b) => {
        if (b.missing_gender) {
          return `<div class="balance" style="background:var(--ground)">
            <div class="name">${esc(b.name)}</div>
            <div class="left" style="font-size:18px">Not available yet</div>
            <div class="meta">HR needs to add your gender to your profile.</div></div>`;
        }
        if (!b.eligible) {
          return `<div class="balance" style="background:var(--ground)">
            <div class="name">${esc(b.name)}</div>
            <div class="left" style="font-size:18px">Not available yet</div>
            <div class="meta">${b.missing_join_date ? "HR needs to add your date of joining." : `Available after ${b.min_service_months} months of service, from ${esc(formatDate(b.eligible_from))}.`}</div></div>`;
        }
        const low = !b.unlimited && b.remaining <= 2;
        return `<div class="balance${low ? " low" : ""}">
          <div class="name">${esc(b.name)}</div>
          <div class="left">${b.unlimited ? "No limit" : `${b.remaining} <small>day${b.remaining === 1 ? "" : "s"} left</small>`}</div>
          <div class="meta">${b.unlimited ? "" : `${b.prorated ? `${b.entitlement} this year (part-year share of ${b.full_allowance})` : `${b.entitlement} a year`}${b.carried ? ` + ${b.carried} carried over` : ""} &middot; `}${b.used} used${b.pending ? ` &middot; ${b.pending} pending` : ""}</div></div>`;
      }).join("");
      const rows = mine.requests.length ? `<div class="table-wrap"><table class="data"><thead><tr>
        <th>Type</th><th>Dates</th><th>Days</th><th>Status</th><th>Details</th><th></th></tr></thead><tbody>
        ${mine.requests.map((r) => {
          const cancellable = r.status === "pending" || (r.status === "approved" && r.start_date > todayLagos());
          return `<tr><td>${esc(r.leave_type_name)}</td>
            <td>${esc(formatDate(r.start_date))}${r.end_date !== r.start_date ? " &ndash; " + esc(formatDate(r.end_date)) : ""}</td>
            <td>${r.days}</td><td><span class="badge ${esc(r.status)}">${esc(STATUS_LABELS[r.status])}</span></td>
            <td class="muted">${esc(r.decision_note || r.reason)}${r.approver_name && r.status !== "cancelled" ? `<div>by ${esc(r.approver_name)}</div>` : ""}</td>
            <td style="text-align:right">${cancellable ? `<button class="btn btn-ghost btn-sm" data-cancel="${esc(r.id)}" type="button">Cancel</button>` : ""}</td></tr>`;
        }).join("")}</tbody></table></div>` : `<div class="card empty">You have not requested any leave yet.</div>`;
      panel.innerHTML = `${actions}${noTypes ? `<div class="alert alert-info">No leave types are set up yet.${isHr ? ' Add them under <a href="leave-settings.html">Leave settings</a>.' : " Ask HR to set them up."}</div>` : ""}
        <div class="balances">${balances}</div><h2>My requests</h2>${rows}`;
    }
    const req = panel.querySelector("#request");
    // Staff can only pick leave types they currently qualify for; HR recording on behalf sees them all.
    const selfTypes = mine.balances.filter((b) => b.applicable || b.missing_gender).map((b) => ({
      id: b.leave_type_id, name: b.name, disabled: !b.eligible || b.missing_gender,
      note: b.missing_gender ? " (needs your gender on file)" : b.eligible ? "" : b.missing_join_date ? " (needs your join date)" : ` (from ${formatDate(b.eligible_from)})`,
    }));
    if (req) req.addEventListener("click", () => openRequest({ types: selfTypes, employees: [], onSaved: mineTab }));
    const rec = panel.querySelector("#record");
    if (rec) rec.addEventListener("click", () => openRequest({ types, employees, onSaved: () => { toast("Leave recorded."); mineTab(); } }));
    panel.querySelectorAll("[data-cancel]").forEach((b) => b.addEventListener("click", () => cancel(b.dataset.cancel, mineTab)));
  }

  async function cancel(id, reload) {
    if (!(await confirmDialog("Cancel this leave request?", { okText: "Cancel request", danger: true }))) return;
    try { await call("leave.cancel", { id }); toast("Request cancelled."); reload(); } catch (err) { toast(err.message, "error"); }
  }

  function openRequest({ types, employees, onSaved }) {
    const onBehalf = employees.length > 0;
    const m = openModal({
      title: onBehalf ? "Record leave for an employee" : "Request leave",
      narrow: true,
      html: `<div id="m-msg" class="alert alert-error" hidden></div>
        <form id="req-form" novalidate>
          ${onBehalf ? `<div class="field"><label for="r-emp">Employee</label><select id="r-emp" name="employeeId">
            ${employees.filter((e) => e.status !== "terminated").map((e) => `<option value="${esc(e.id)}">${esc(e.first_name + " " + e.last_name)} (${esc(e.employee_no)})</option>`).join("")}</select>
            <div class="hint">Recorded leave is approved straight away and may start in the past.</div></div>` : ""}
          <div class="field"><label for="r-type">Leave type</label><select id="r-type" name="leaveTypeId">${types.map((t) => `<option value="${esc(t.id)}"${t.disabled ? " disabled" : ""}>${esc(t.name + (t.note || ""))}</option>`).join("")}</select></div>
          <div class="inline-form" style="margin-bottom:16px">
            <div class="field" style="flex:1"><label for="r-start">From</label><input id="r-start" name="startDate" type="date" required></div>
            <div class="field" style="flex:1"><label for="r-end">To</label><input id="r-end" name="endDate" type="date" required></div>
          </div>
          <div id="r-est" class="hint" style="margin:-6px 0 14px">Choose your dates to see how many working days this uses.</div>
          <div class="field"><label for="r-reason">Reason (optional)</label><textarea id="r-reason" name="reason" rows="2" maxlength="300"></textarea></div>
        </form>`,
      footer: `<button class="btn btn-ghost" data-close type="button">Cancel</button><button class="btn" type="submit" form="req-form" id="r-save">${onBehalf ? "Record leave" : "Submit request"}</button>`,
    });
    const f = m.el.querySelector("#req-form");
    const est = m.el.querySelector("#r-est");
    const firstOk = [...f.leaveTypeId.options].find((o) => !o.disabled);
    if (firstOk) f.leaveTypeId.value = firstOk.value;
    async function estimate() {
      if (!f.startDate.value || !f.endDate.value) return;
      if (f.endDate.value < f.startDate.value) { est.textContent = "The end date is before the start date."; return; }
      const years = [...new Set([f.startDate.value.slice(0, 4), f.endDate.value.slice(0, 4)])];
      const n = countWorkingDays(f.startDate.value, f.endDate.value, await holidaySet(years));
      est.textContent = n ? `This uses ${n} working day${n === 1 ? "" : "s"} (weekends and public holidays are not counted).` : "These dates have no working days.";
    }
    f.startDate.addEventListener("change", () => { if (!f.endDate.value || f.endDate.value < f.startDate.value) f.endDate.value = f.startDate.value; estimate(); });
    f.endDate.addEventListener("change", estimate);
    f.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const btn = m.el.querySelector("#r-save");
      btn.disabled = true;
      try {
        await call("leave.request", {
          employeeId: onBehalf ? f.employeeId.value : "", leaveTypeId: f.leaveTypeId.value,
          startDate: f.startDate.value, endDate: f.endDate.value, reason: f.reason.value,
        });
        m.close();
        if (!onBehalf) toast("Request sent for approval.");
        onSaved();
      } catch (err) {
        const x = m.el.querySelector("#m-msg");
        x.textContent = err.message;
        x.hidden = false;
        btn.disabled = false;
      }
    });
  }

  // ------------------------------------------------------------ approvals
  let statusFilter = "pending";
  async function approvalsTab() {
    loading(panel);
    try {
      renderApprovals(await call("leave.list", { status: statusFilter }));
    } catch (err) {
      errorBox(panel, err instanceof ApiError ? err.message : "Could not load requests.");
    }
  }

  function renderApprovals(list) {
    panel.innerHTML = `<div class="toolbar"><span class="muted">${isHr ? "Every leave request in the company." : "Leave requests from the people who report to you."}</span>
      <select id="status" class="spacer" aria-label="Filter by status">
        ${[["pending", "Waiting for a decision"], ["", "All requests"], ["approved", "Approved"], ["rejected", "Rejected"], ["cancelled", "Cancelled"]]
          .map(([v, l]) => `<option value="${v}"${v === statusFilter ? " selected" : ""}>${l}</option>`).join("")}</select></div>
      ${list.length ? `<div class="table-wrap"><table class="data"><thead><tr><th>Employee</th><th>Type</th><th>Dates</th><th>Days</th><th>Reason</th><th>Status</th><th></th></tr></thead><tbody>
        ${list.map((r) => `<tr><td><strong>${esc(r.employee_name)}</strong><div class="muted">${esc(r.employee_no)}</div></td>
          <td>${esc(r.leave_type_name)}</td>
          <td>${esc(formatDate(r.start_date))}${r.end_date !== r.start_date ? " &ndash; " + esc(formatDate(r.end_date)) : ""}</td><td>${r.days}</td>
          <td class="muted">${esc(r.decision_note && r.status !== "pending" ? r.decision_note : r.reason)}${r.approver_name && r.status !== "pending" && r.status !== "cancelled" ? `<div>by ${esc(r.approver_name)}</div>` : ""}</td>
          <td><span class="badge ${esc(r.status)}">${esc(STATUS_LABELS[r.status])}</span></td>
          <td style="text-align:right;white-space:nowrap">${r.can_decide ? `
            <button class="btn btn-sm" data-approve="${esc(r.id)}" type="button">Approve</button>
            <button class="btn btn-ghost btn-sm" data-reject="${esc(r.id)}" type="button">Reject</button>` : ""}
            ${isHr && (r.status === "pending" || r.status === "approved") ? `<button class="btn btn-ghost btn-sm" data-cancel="${esc(r.id)}" type="button">Cancel</button>` : ""}</td></tr>`).join("")}
        </tbody></table></div>` : `<div class="card empty">Nothing here${statusFilter === "pending" ? " - no requests are waiting for a decision" : ""}.</div>`}`;
    panel.querySelector("#status").addEventListener("change", (e) => { statusFilter = e.target.value; approvalsTab(); });
    panel.querySelectorAll("[data-approve]").forEach((b) => b.addEventListener("click", () => decide(list.find((r) => r.id === b.dataset.approve), "approved")));
    panel.querySelectorAll("[data-reject]").forEach((b) => b.addEventListener("click", () => decide(list.find((r) => r.id === b.dataset.reject), "rejected")));
    panel.querySelectorAll("[data-cancel]").forEach((b) => b.addEventListener("click", () => cancel(b.dataset.cancel, approvalsTab)));
  }

  function decide(r, decision) {
    const approve = decision === "approved";
    const m = openModal({
      title: approve ? "Approve leave" : "Reject leave", narrow: true,
      html: `<div id="m-msg" class="alert alert-error" hidden></div>
        <p><strong>${esc(r.employee_name)}</strong> &middot; ${esc(r.leave_type_name)}<br>
        ${esc(formatDate(r.start_date))}${r.end_date !== r.start_date ? " &ndash; " + esc(formatDate(r.end_date)) : ""} (${r.days} working day${r.days === 1 ? "" : "s"})</p>
        ${r.reason ? `<p class="muted">Reason given: ${esc(r.reason)}</p>` : ""}
        <form id="d-form" novalidate><div class="field"><label for="d-note">${approve ? "Note (optional)" : "Reason for rejecting"}</label>
        <textarea id="d-note" name="note" rows="2" maxlength="300"></textarea></div></form>`,
      footer: `<button class="btn btn-ghost" data-close type="button">Cancel</button><button class="btn${approve ? "" : " btn-danger"}" type="submit" form="d-form">${approve ? "Approve" : "Reject"}</button>`,
    });
    m.el.querySelector("#d-form").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      try {
        await call("leave.decide", { id: r.id, decision, note: ev.target.note.value });
        m.close();
        toast(approve ? "Leave approved." : "Leave rejected.");
        approvalsTab();
      } catch (err) {
        const x = m.el.querySelector("#m-msg");
        x.textContent = err.message;
        x.hidden = false;
      }
    });
  }

  // ------------------------------------------------------------ calendar
  let month = thisMonth();
  async function calendarTab() {
    loading(panel);
    try {
      renderCalendar(await call("leave.calendar", { month }));
    } catch (err) {
      errorBox(panel, err instanceof ApiError ? err.message : "Could not load the calendar.");
    }
  }

  function renderCalendar(cal) {
    const first = month + "-01";
    const holidays = new Map(cal.holidays.map((h) => [h.date, h.name]));
    const people = [];
    cal.entries.forEach((e) => { if (!people.find((p) => p.id === e.employee_id)) people.push({ id: e.employee_id, name: e.employee_name }); });
    people.sort((a, b) => a.name.localeCompare(b.name));
    const dates = Array.from({ length: cal.days }, (_, i) => {
      const d = new Date(first + "T00:00:00Z");
      d.setUTCDate(i + 1);
      return { iso: d.toISOString().slice(0, 10), n: i + 1, wk: d.getUTCDay() === 0 || d.getUTCDay() === 6, dow: "SMTWTFS"[d.getUTCDay()] };
    });
    const cell = (p, d) => {
      const hit = cal.entries.find((e) => e.employee_id === p.id && e.start_date <= d.iso && e.end_date >= d.iso);
      const cls = hit ? (hit.status === "approved" ? "leave-a" : "leave-p") : holidays.has(d.iso) ? "hol" : d.wk ? "wk" : "";
      const tip = hit ? `${p.name}: ${hit.leave_type_name}${hit.status === "pending" ? " (pending)" : ""}` : "";
      return `<td class="${cls}"${tip ? ` title="${esc(tip)}"` : ""}></td>`;
    };
    panel.innerHTML = `
      <div class="month-nav">
        <button class="btn btn-ghost btn-sm" id="prev" type="button" aria-label="Previous month">&larr;</button>
        <strong>${esc(monthLabel(month))}</strong>
        <button class="btn btn-ghost btn-sm" id="next" type="button" aria-label="Next month">&rarr;</button>
        <button class="btn btn-ghost btn-sm" id="today" type="button">This month</button>
      </div>
      ${people.length ? `<div class="cal-scroll"><table class="cal"><thead><tr><th class="name">Employee</th>
        ${dates.map((d) => `<th class="${d.wk ? "wk" : holidays.has(d.iso) ? "hol" : ""}" title="${esc(holidays.get(d.iso) || "")}">${d.n}<br>${d.dow}</th>`).join("")}</tr></thead>
        <tbody>${people.map((p) => `<tr><td class="name">${esc(p.name)}</td>${dates.map((d) => cell(p, d)).join("")}</tr>`).join("")}</tbody></table></div>`
        : `<div class="card empty">No one is on leave in ${esc(monthLabel(month))}.</div>`}
      <div class="legend"><span><i style="background:var(--brand)"></i>Approved</span><span><i style="background:#f3c3a9"></i>Waiting for approval</span>
        <span><i style="background:#e9eefb"></i>Public holiday</span><span><i style="background:#f1efec"></i>Weekend</span></div>
      ${cal.holidays.length ? `<p class="muted">Public holidays: ${cal.holidays.map((h) => `${esc(formatDate(h.date))} (${esc(h.name)})`).join(", ")}</p>` : ""}`;
    panel.querySelector("#prev").addEventListener("click", () => { month = shiftMonth(month, -1); calendarTab(); });
    panel.querySelector("#next").addEventListener("click", () => { month = shiftMonth(month, 1); calendarTab(); });
    panel.querySelector("#today").addEventListener("click", () => { month = thisMonth(); calendarTab(); });
  }

  show(); // last, so every `let` above is initialised first
}
