import { call, ApiError } from "../api.js";
import { initPage, loading, errorBox, canManageStaff } from "../layout.js";
import { esc, formatDate, initials, rowLinks, STATUS_LABELS } from "../ui.js";
import { naira } from "../money.js";

const page = initPage({ active: "dashboard", title: "Dashboard" });
if (page) run(page);

async function run({ session, role, content }) {
  loading(content);
  try {
    const d = await call("dashboard.get");
    const extras = d.scope === "self" && d.profile ? await loadHomeData() : null;
    content.innerHTML = todoStrip(d.todo) + (d.scope === "self" ? selfView(d, session, extras) : companyView(d, role));
    rowLinks(content);
  } catch (err) {
    errorBox(content, err instanceof ApiError ? err.message : "Could not load the dashboard.");
  }
}


function todoStrip(todo) {
  if (!todo) return "";
  const items = [
    [todo.selfReviews, "Self-assessment to complete", "performance.html"],
    [todo.reviewsToWrite, "Reviews for you to write", "performance.html?tab=team"],
    [todo.expensesToReview, "Expense claims to review", "expenses.html?tab=approvals"],
    [todo.trainingDue, "Training for you to do", "training.html"],
    [todo.trainingProblems, "Training gaps in your team", "training.html?tab=compliance"],
  ].filter(([n]) => n > 0);
  if (!items.length) return "";
  return `<div class="todo-list">${items.map(([n, label, href]) => `<a class="todo" href="${href}"><strong>${n}</strong>${esc(label)}</a>`).join("")}</div>`;
}

// What an employee sees first: today's clock-in, leave balance, latest payslip and what is coming up.
async function loadHomeData() {
  const year = new Date().getFullYear();
  const [today, slips, leave, holidays] = await Promise.allSettled([
    call("attendance.today"), call("payslips.mine"), call("leave.mine"), call("holidays.list", { year }),
  ]);
  const val = (r) => (r.status === "fulfilled" ? r.value : null);
  return { today: val(today), slips: val(slips), leave: val(leave), holidays: val(holidays) };
}

function clockTile(t) {
  let main = "Not clocked in", sub = "Tap to clock in", cls = " accent";
  if (!t || !t.linked) { main = "Attendance"; sub = "Open"; cls = ""; }
  else if (t.holiday) { main = "Public holiday"; sub = t.holiday; cls = ""; }
  else if (t.onLeave) { main = "On leave"; sub = "Enjoy your time off"; cls = ""; }
  else if (t.weekend) { main = "Weekend"; sub = "No clock-in needed"; cls = ""; }
  else if (t.record && t.record.check_out) { main = "Clocked out " + t.record.check_out; sub = "In at " + t.record.check_in; cls = ""; }
  else if (t.record) { main = "Clocked in " + t.record.check_in; sub = "Tap to clock out"; cls = ""; }
  return `<a class="quick-tile${cls}" href="attendance.html"><div class="q-lbl">Today</div><strong>${esc(main)}</strong><div class="q-sub">${esc(sub)}</div></a>`;
}

function leaveTile(l) {
  const list = (l && l.balances) || [];
  const annual = list.find((b) => /annual/i.test(b.name) && b.applicable) || list.find((b) => b.applicable && !b.unlimited);
  if (!annual) return `<a class="quick-tile" href="leave.html"><div class="q-lbl">Leave</div><strong>Request leave</strong><div class="q-sub">See your balances</div></a>`;
  const pending = annual.pending ? `${annual.pending} day${annual.pending === 1 ? "" : "s"} awaiting approval` : "Request time off";
  return `<a class="quick-tile" href="leave.html"><div class="q-lbl">${esc(annual.name)}</div><strong>${esc(annual.remaining)} days left</strong><div class="q-sub">${esc(pending)}</div></a>`;
}

function payslipTile(sl) {
  const p = sl && (sl.payslips || [])[0];
  if (!p) return `<a class="quick-tile" href="payslips.html"><div class="q-lbl">Payslips</div><strong>None yet</strong><div class="q-sub">They appear after payroll is approved</div></a>`;
  const [y, m] = p.period.split("-").map(Number);
  const label = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
  return `<a class="quick-tile" href="payslip.html?id=${encodeURIComponent(p.id)}"><div class="q-lbl">Latest payslip</div><strong>${esc(naira(p.net_pay))}</strong><div class="q-sub">${esc(label)} &middot; net pay</div></a>`;
}

function holidayTile(list) {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" });
  const next = (list || []).filter((h) => h.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0];
  if (!next) return `<a class="quick-tile" href="leave.html?tab=calendar"><div class="q-lbl">Calendar</div><strong>Team calendar</strong><div class="q-sub">See who is away</div></a>`;
  return `<a class="quick-tile" href="leave.html?tab=calendar"><div class="q-lbl">Next public holiday</div><strong>${esc(next.name)}</strong><div class="q-sub">${esc(formatDate(next.date))}</div></a>`;
}

function selfView(d, session, extras) {
  const p = d.profile;
  if (!p) {
    return `<div class="card"><h2>Welcome, ${esc(session.user.name)}</h2>
      <p class="muted">Your login is not linked to an employee record yet. Please ask HR to link it.</p></div>`;
  }
  const x = extras || {};
  return `<div class="card">
      <div class="profile-head">
        <span class="avatar lg">${esc(initials(p.first_name + " " + p.last_name))}</span>
        <div><h2>Welcome, ${esc(p.first_name)}</h2>
        <div class="muted">${esc(p.job_title || "Employee")}${p.department_name ? " &middot; " + esc(p.department_name) : ""}</div></div>
        <div class="actions"><a class="btn btn-sm" href="employee.html?me=1">View my profile</a></div>
      </div>
    </div>
    <div class="quick">${clockTile(x.today)}${leaveTile(x.leave)}${payslipTile(x.slips)}${holidayTile(x.holidays)}</div>
    <div class="card"><h2>Quick actions</h2>
      <div class="action-row">
        <a class="btn btn-sm" href="leave.html">Request leave</a>
        <a class="btn btn-sm btn-ghost" href="expenses.html">New expense claim</a>
        <a class="btn btn-sm btn-ghost" href="payslips.html">My payslips</a>
        <a class="btn btn-sm btn-ghost" href="training.html">My training</a>
      </div>
    </div>`;
}

function companyView(d, role) {
  const max = Math.max(1, ...d.byDepartment.map((x) => x.count));
  const bars = d.byDepartment.length
    ? d.byDepartment.map((x) => `<div class="bar-row"><span>${esc(x.name)}</span><div class="bar"><span style="width:${Math.round((x.count / max) * 100)}%"></span></div><strong>${x.count}</strong></div>`).join("")
    : `<p class="muted">No employees yet.</p>`;
  const recent = d.recentHires.length
    ? `<div class="table-wrap"><table class="data"><thead><tr><th>Name</th><th>Role</th><th>Joined</th></tr></thead><tbody>${
        d.recentHires.map((e) => `<tr class="click" data-href="employee.html?id=${encodeURIComponent(e.id)}">
          <td><div class="cell-person"><span class="avatar">${esc(initials(e.first_name + " " + e.last_name))}</span>${esc(e.first_name + " " + e.last_name)}</div></td>
          <td>${esc(e.job_title)}</td><td>${esc(formatDate(e.date_joined))}</td></tr>`).join("")}</tbody></table></div>`
    : `<p class="muted">Hires will show here once employees have a join date.</p>`;
  const add = canManageStaff(role) ? `<a class="btn btn-sm" href="employees.html?new=1">Add employee</a>` : "";
  return `
    <div class="stats">
      <div class="stat accent"><div class="num">${d.counts.active || 0}</div><div class="lbl">Active employees</div></div>
      <div class="stat"><div class="num">${d.outToday.length}</div><div class="lbl">Out on leave today</div>
        ${d.outToday.length ? `<div class="muted" style="font-size:12px;margin-top:6px">${esc(d.outToday.slice(0, 3).join(", "))}${d.outToday.length > 3 ? ` +${d.outToday.length - 3} more` : ""}</div>` : ""}</div>
      <a class="stat${d.pendingApprovals ? " accent" : ""}" href="leave.html?tab=approvals" style="text-decoration:none;color:inherit"><div class="num">${d.pendingApprovals}</div><div class="lbl">Leave requests to review</div></a>
      <div class="stat"><div class="num">${d.newThisMonth}</div><div class="lbl">Joined this month</div></div>
      <div class="stat"><div class="num">${d.total}</div><div class="lbl">Total on record</div></div>
    </div>
    ${d.recruitment ? `<div class="stats compact">
      <a class="stat" href="recruitment.html?tab=jobs" style="text-decoration:none;color:inherit"><div class="num">${d.recruitment.openJobs}</div><div class="lbl">Open jobs</div></a>
      <a class="stat${d.recruitment.newApplicants ? " accent" : ""}" href="recruitment.html" style="text-decoration:none;color:inherit"><div class="num">${d.recruitment.newApplicants}</div><div class="lbl">New applicants to review</div></a>
      <a class="stat" href="recruitment.html" style="text-decoration:none;color:inherit"><div class="num">${d.recruitment.activeApplicants}</div><div class="lbl">Applicants in progress</div></a>
      <a class="stat${d.recruitment.onboardingOpen ? " accent" : ""}" href="onboarding.html" style="text-decoration:none;color:inherit"><div class="num">${d.recruitment.onboardingOpen}</div><div class="lbl">Overdue onboarding tasks</div></a>
    </div>` : ""}
    <div class="two-col">
      <div class="card"><h2>Headcount by department</h2>${bars}</div>
      <div class="card"><h2 style="display:flex;align-items:center;gap:10px">Recent hires <span style="margin-left:auto">${add}</span></h2>${recent}</div>
    </div>
    <p class="muted">${Object.keys(d.counts).filter((k) => d.counts[k] && k !== "active").map((k) => `${d.counts[k]} ${STATUS_LABELS[k] || k}`).join(" &middot; ")}</p>`;
}
