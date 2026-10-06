import { call, ApiError } from "../api.js";
import { initPage, loading, errorBox, canManageStaff } from "../layout.js";
import { esc, cap, formatDate, initials, rowLinks, STATUS_LABELS } from "../ui.js";
import { openEmployeeForm } from "../employee-form.js";

const page = initPage({ active: "employees", title: "Employees" });
if (page) run(page);

async function run({ role, content }) {
  const canWrite = canManageStaff(role);
  loading(content);
  let employees, departments;
  try {
    [employees, departments] = await Promise.all([call("employees.list"), call("departments.list")]);
  } catch (err) {
    return errorBox(content, err instanceof ApiError ? err.message : "Could not load employees.");
  }

  content.innerHTML = `
    <div class="toolbar">
      <div class="grow"><input id="q" type="search" placeholder="Search by name, number, email or job title" aria-label="Search employees"></div>
      <select id="f-dept" aria-label="Filter by department"><option value="">All departments</option>${departments.map((d) => `<option value="${esc(d.id)}">${esc(d.name)}</option>`).join("")}</select>
      <select id="f-status" aria-label="Filter by status">
        <option value="">All statuses</option><option value="active">Active</option><option value="on-leave">On leave</option>
        <option value="suspended">Suspended</option><option value="terminated">Terminated</option>
      </select>
      ${canWrite ? `<button class="btn spacer" id="add" type="button">Add employee</button>` : ""}
    </div>
    <div id="results"></div>`;

  const q = content.querySelector("#q");
  const fd = content.querySelector("#f-dept");
  const fs = content.querySelector("#f-status");
  const results = content.querySelector("#results");

  function render() {
    const needle = q.value.trim().toLowerCase();
    const rows = employees.filter((e) =>
      (!fd.value || e.department_id === fd.value) &&
      (!fs.value || e.status === fs.value) &&
      (!needle || [e.first_name, e.last_name, e.employee_no, e.email, e.job_title].join(" ").toLowerCase().includes(needle)));
    if (!employees.length) {
      results.innerHTML = `<div class="card empty">No employees yet.${canWrite ? " Click <strong>Add employee</strong> to create the first one." : ""}</div>`;
      return;
    }
    if (!rows.length) {
      results.innerHTML = `<div class="card empty">No employees match your search.</div>`;
      return;
    }
    results.innerHTML = `<div class="table-wrap"><table class="data">
      <thead><tr><th>Employee</th><th>No.</th><th>Department</th><th>Job title</th><th>Type</th><th>Joined</th><th>Status</th></tr></thead>
      <tbody>${rows.map((e) => `
        <tr class="click" data-href="employee.html?id=${encodeURIComponent(e.id)}">
          <td><div class="cell-person"><span class="avatar">${esc(initials(e.first_name + " " + e.last_name))}</span>
            <div><strong>${esc(e.first_name + " " + e.last_name)}</strong><div class="muted">${esc(e.email)}</div></div></div></td>
          <td>${esc(e.employee_no)}</td><td>${esc(e.department_name)}</td><td>${esc(e.job_title)}</td>
          <td>${esc(cap(e.employment_type))}</td><td>${esc(formatDate(e.date_joined))}</td>
          <td><span class="badge ${esc(e.status)}">${esc(STATUS_LABELS[e.status] || e.status)}</span></td>
        </tr>`).join("")}</tbody></table></div>
      <p class="muted" style="margin-top:10px">${rows.length} of ${employees.length} employees</p>`;
    rowLinks(results);
  }

  [q, fd, fs].forEach((el) => el.addEventListener("input", render));
  render();

  const open = () => openEmployeeForm({
    employee: null, departments, employees,
    onSaved: (saved) => { location.href = "employee.html?id=" + encodeURIComponent(saved.id); },
  });
  const addBtn = content.querySelector("#add");
  if (addBtn) addBtn.addEventListener("click", open);
  if (canWrite && new URLSearchParams(location.search).get("new")) open();
}
