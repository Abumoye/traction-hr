import { call, ApiError } from "../api.js";
import { initPage, loading, errorBox, canManageStaff } from "../layout.js";
import { esc, formatDate, initials, rowLinks, STATUS_LABELS } from "../ui.js";

const page = initPage({ active: "dashboard", title: "Dashboard" });
if (page) run(page);

async function run({ session, role, content }) {
  loading(content);
  try {
    const d = await call("dashboard.get");
    content.innerHTML = todoStrip(d.todo) + (d.scope === "self" ? selfView(d, session) : companyView(d, role));
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

function selfView(d, session) {
  const p = d.profile;
  if (!p) {
    return `<div class="card"><h2>Welcome, ${esc(session.user.name)}</h2>
      <p class="muted">Your login is not linked to an employee record yet. Please ask HR to link it.</p></div>`;
  }
  return `<div class="card">
      <div class="profile-head">
        <span class="avatar lg">${esc(initials(p.first_name + " " + p.last_name))}</span>
        <div><h2>Welcome, ${esc(p.first_name)}</h2>
        <div class="muted">${esc(p.job_title || "Employee")}${p.department_name ? " &middot; " + esc(p.department_name) : ""}</div></div>
        <div class="actions"><a class="btn btn-sm" href="employee.html?me=1">View my profile</a></div>
      </div>
      <p class="muted">Leave, payslips and more will appear here as they are added.</p>
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
