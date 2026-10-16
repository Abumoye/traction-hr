import { call, ApiError } from "./api.js";
import { esc, openModal, toast, randomPassword, ROLE_LABELS } from "./ui.js";
import { getSession } from "./auth.js";
import { showCredentials } from "./credentials.js";

const TYPES = [["full-time", "Full-time"], ["part-time", "Part-time"], ["contract", "Contract"], ["intern", "Intern"]];
const STATUSES = [["active", "Active"], ["on-leave", "On leave"], ["suspended", "Suspended"], ["terminated", "Terminated"]];
const GENDERS = [["", "Not specified"], ["female", "Female"], ["male", "Male"], ["other", "Other"]];

const options = (list, selected) =>
  list.map(([v, l]) => `<option value="${esc(v)}"${v === selected ? " selected" : ""}>${esc(l)}</option>`).join("");

// Opens the add/edit modal. `employee` is null for a new employee.
// `canSeeSensitive` is false when the viewer has no access to bank/tax fields (they are then omitted).
export function openEmployeeForm({ employee, departments, employees, onSaved }) {
  const e = employee || {};
  const isNew = !employee;
  const hasSensitive = isNew || e.sensitive === true;
  const deptOptions = [["", "No department"], ...departments.map((d) => [d.id, d.name])];
  const mgrOptions = [["", "No manager"], ...employees.filter((x) => x.id !== e.id && x.status !== "terminated")
    .map((x) => [x.id, `${x.first_name} ${x.last_name} (${x.employee_no})`])];

  // Owner and HR can make a login together with a new employee. HR may give manager or employee access; only the owner can give more.
  const viewerRole = (getSession() || { user: {} }).user.role;
  const canLogin = isNew && (viewerRole === "owner" || viewerRole === "hr_admin");
  const loginRoles = viewerRole === "owner" ? ["employee", "manager", "hr_admin", "owner"] : ["employee", "manager"];

  const m = openModal({
    title: isNew ? "Add employee" : "Edit employee",
    html: `
    <div id="form-msg" class="alert alert-error" hidden></div>
    <form id="emp-form" class="form-grid" novalidate>
      <div class="form-section">Personal</div>
      <div class="field"><label class="required" for="f-first">First name</label><input id="f-first" name="first_name" value="${esc(e.first_name)}" maxlength="60" required></div>
      <div class="field"><label class="required" for="f-last">Last name</label><input id="f-last" name="last_name" value="${esc(e.last_name)}" maxlength="60" required></div>
      <div class="field"><label for="f-email">Work email</label><input id="f-email" name="email" type="email" value="${esc(e.email)}" maxlength="120"></div>
      <div class="field"><label for="f-phone">Phone</label><input id="f-phone" name="phone" value="${esc(e.phone)}" maxlength="30"></div>
      <div class="field"><label for="f-gender">Gender</label><select id="f-gender" name="gender">${options(GENDERS, e.gender || "")}</select></div>
      ${hasSensitive ? `
      <div class="field"><label for="f-dob">Date of birth</label><input id="f-dob" name="dob" type="date" value="${esc(e.dob)}"></div>
      <div class="field full"><label for="f-address">Home address</label><textarea id="f-address" name="address" rows="2" maxlength="300">${esc(e.address)}</textarea></div>` : ""}

      <div class="form-section">Employment</div>
      <div class="field"><label for="f-dept">Department</label><select id="f-dept" name="department_id">${options(deptOptions, e.department_id || "")}</select></div>
      <div class="field"><label for="f-title">Job title</label><input id="f-title" name="job_title" value="${esc(e.job_title)}" maxlength="100"></div>
      <div class="field"><label for="f-mgr">Reports to</label><select id="f-mgr" name="manager_id">${options(mgrOptions, e.manager_id || "")}</select></div>
      <div class="field"><label for="f-type">Employment type</label><select id="f-type" name="employment_type">${options(TYPES, e.employment_type || "full-time")}</select></div>
      <div class="field"><label for="f-joined">Date joined</label><input id="f-joined" name="date_joined" type="date" value="${esc(e.date_joined)}"></div>
      <div class="field"><label for="f-status">Status</label><select id="f-status" name="status">${options(STATUSES, e.status || "active")}</select></div>

      ${canLogin ? `
      <div class="form-section">Sign-in access</div>
      <div class="field full"><label style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="f-login" checked> Let this person sign in to the HR system</label>
        <div class="hint">They sign in with the work email above. After you save, you will see a temporary password to give them; they choose their own the first time, and their profile is already set up.</div></div>
      <div class="field" id="f-role-wrap"><label for="f-role">Access level</label><select id="f-role">${loginRoles.map((r) => `<option value="${r}">${esc(ROLE_LABELS[r])}</option>`).join("")}</select></div>` : ""}

      ${hasSensitive ? `
      <div class="form-section">Bank and statutory (visible to HR only)</div>
      <div class="field"><label for="f-bank">Bank name</label><input id="f-bank" name="bank_name" value="${esc(e.bank_name)}" maxlength="80"></div>
      <div class="field"><label for="f-acct">Account number</label><input id="f-acct" name="account_no" value="${esc(e.account_no)}" inputmode="numeric" maxlength="10"><div class="hint">10 digits</div></div>
      <div class="field"><label for="f-tin">Tax ID (TIN)</label><input id="f-tin" name="tin" value="${esc(e.tin)}" maxlength="30"></div>
      <div class="field"><label for="f-pin">Pension PIN</label><input id="f-pin" name="pension_pin" value="${esc(e.pension_pin)}" maxlength="30"></div>` : ""}
    </form>`,
    footer: `<button type="button" class="btn btn-ghost" data-close>Cancel</button>
             <button type="submit" form="emp-form" class="btn" id="emp-save">${isNew ? "Add employee" : "Save changes"}</button>`,
  });

  const form = m.el.querySelector("#emp-form");
  const msg = m.el.querySelector("#form-msg");
  const saveBtn = m.el.querySelector("#emp-save");
  const loginTick = m.el.querySelector("#f-login");
  if (loginTick) loginTick.addEventListener("change", () => { m.el.querySelector("#f-role-wrap").hidden = !loginTick.checked; });

  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    msg.hidden = true;
    const data = {};
    new FormData(form).forEach((v, k) => { data[k] = v; });
    if (!isNew) data.id = e.id;
    let password = "";
    const loginBox = m.el.querySelector("#f-login");
    if (loginBox && loginBox.checked) {
      if (!String(data.email || "").trim()) {
        msg.textContent = "Enter the work email: it is how this person signs in. Or untick \"Let this person sign in\" and add their login later from their profile.";
        msg.hidden = false;
        msg.scrollIntoView({ block: "nearest" });
        return;
      }
      password = randomPassword();
      data.login = { role: m.el.querySelector("#f-role").value, password };
    }
    saveBtn.disabled = true;
    saveBtn.textContent = "Saving...";
    try {
      const saved = await call(isNew ? "employees.create" : "employees.update", data);
      m.close();
      toast(isNew ? "Employee added." : "Changes saved.");
      if (saved && saved.login && saved.login.created) {
        // show the details first; the page moves on (usually to the new profile) when this pop-up is closed
        showCredentials({ name: saved.first_name + " " + saved.last_name, email: saved.login.email, password, title: "Employee added: sign-in details", onClose: () => onSaved(saved) });
      } else {
        onSaved(saved);
      }
    } catch (err) {
      msg.textContent = err instanceof ApiError ? err.message : "Something went wrong.";
      msg.hidden = false;
      msg.scrollIntoView({ block: "nearest" });
      saveBtn.disabled = false;
      saveBtn.textContent = isNew ? "Add employee" : "Save changes";
    }
  });
}
