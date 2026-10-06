import { call, ApiError } from "../api.js";
import { initPage, loading, errorBox } from "../layout.js";
import { esc, openModal, toast, formatDateTime, randomPassword, ROLE_LABELS, STATUS_LABELS } from "../ui.js";

const page = initPage({ active: "users", title: "User access" });
if (page) run(page);

async function run({ session, role, content }) {
  // Owners can assign any role; HR admins only manager/employee (the server enforces this too).
  const assignable = role === "owner" ? ["owner", "hr_admin", "manager", "employee"] : ["manager", "employee"];
  let users = [], employees = [];

  async function load() {
    loading(content);
    try {
      [users, employees] = await Promise.all([call("users.list"), call("employees.list")]);
      render();
    } catch (err) {
      errorBox(content, err instanceof ApiError ? err.message : "Could not load users.");
    }
  }

  const empName = (id) => {
    const e = employees.find((x) => x.id === id);
    return e ? `${e.first_name} ${e.last_name}` : "";
  };
  const canTouch = (u) => role === "owner" || ["manager", "employee"].includes(u.role);

  function render() {
    content.innerHTML = `
      <div class="toolbar"><span class="muted">People who can sign in to this company's HR system.</span>
        <button class="btn spacer" id="add" type="button">Add user</button></div>
      <div class="table-wrap"><table class="data"><thead><tr><th>User</th><th>Role</th><th>Linked employee</th><th>Status</th><th>Last sign-in</th><th></th></tr></thead><tbody>
      ${users.map((u) => `<tr>
        <td><strong>${esc(u.full_name)}</strong><div class="muted">${esc(u.email)}</div></td>
        <td><span class="badge ${esc(u.role)}">${esc(ROLE_LABELS[u.role] || u.role)}</span></td>
        <td>${esc(empName(u.employee_id)) || '<span class="muted">None</span>'}</td>
        <td><span class="badge ${esc(u.status)}">${esc(STATUS_LABELS[u.status] || u.status)}</span></td>
        <td class="muted">${esc(formatDateTime(u.last_login))}</td>
        <td style="text-align:right;white-space:nowrap">${canTouch(u) ? `
          <button class="btn btn-ghost btn-sm" data-edit="${esc(u.id)}" type="button">Edit</button>
          ${u.id !== session.user.id ? `<button class="btn btn-ghost btn-sm" data-reset="${esc(u.id)}" type="button">Reset password</button>` : ""}` : ""}</td>
      </tr>`).join("")}</tbody></table></div>`;
    content.querySelector("#add").addEventListener("click", addUser);
    content.querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", () => editUser(users.find((u) => u.id === b.dataset.edit))));
    content.querySelectorAll("[data-reset]").forEach((b) => b.addEventListener("click", () => resetPassword(users.find((u) => u.id === b.dataset.reset))));
  }

  const roleOptions = (list, sel) => list.map((r) => `<option value="${r}"${r === sel ? " selected" : ""}>${ROLE_LABELS[r]}</option>`).join("");
  const linkOptions = (currentId) => {
    const taken = new Set(users.map((u) => u.employee_id).filter((x) => x && x !== currentId));
    return `<option value="">Not linked</option>` + employees.filter((e) => !taken.has(e.id) && e.status !== "terminated")
      .map((e) => `<option value="${esc(e.id)}"${e.id === currentId ? " selected" : ""}>${esc(e.first_name + " " + e.last_name)} (${esc(e.employee_no)})</option>`).join("");
  };

  function passwordField(id) {
    return `<div class="field"><label for="${id}">Temporary password</label>
      <div class="pw-row"><input id="${id}" name="password" value="${esc(randomPassword())}" autocomplete="off" required>
      <button class="btn btn-ghost btn-sm" type="button" data-gen>Generate</button></div>
      <div class="hint">Share this securely. The person must choose their own password at first sign-in.</div></div>`;
  }
  const wireGenerate = (m) => m.el.querySelector("[data-gen]").addEventListener("click", () => {
    m.el.querySelector("input[name=password]").value = randomPassword();
  });

  function addUser() {
    const m = openModal({
      title: "Add user", narrow: true,
      html: `<div id="m-msg" class="alert alert-error" hidden></div>
        <form id="u-form" novalidate>
          <div class="field"><label for="u-name">Full name</label><input id="u-name" name="fullName" maxlength="80" required></div>
          <div class="field"><label for="u-email">Email (used to sign in)</label><input id="u-email" name="email" type="email" maxlength="120" required></div>
          <div class="field"><label for="u-role">Role</label><select id="u-role" name="role">${roleOptions(assignable, "employee")}</select></div>
          <div class="field"><label for="u-emp">Linked employee</label><select id="u-emp" name="employeeId">${linkOptions("")}</select>
            <div class="hint">Link staff logins to their employee record so they can see their own profile.</div></div>
          ${passwordField("u-pw")}
        </form>`,
      footer: `<button class="btn btn-ghost" data-close type="button">Cancel</button><button class="btn" type="submit" form="u-form">Create login</button>`,
    });
    wireGenerate(m);
    m.el.querySelector("#u-form").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const f = ev.target;
      const password = f.password.value;
      try {
        await call("users.create", { fullName: f.fullName.value, email: f.email.value, role: f.role.value, employeeId: f.employeeId.value, password });
        m.close();
        showCredentials(f.email.value, password);
        load();
      } catch (err) { const x = m.el.querySelector("#m-msg"); x.textContent = err.message; x.hidden = false; }
    });
  }

  function showCredentials(email, password) {
    openModal({
      title: "Login created", narrow: true,
      html: `<p>Give these details to the user. The password is shown only now.</p>
        <dl class="dl" style="grid-template-columns:90px 1fr"><dt>Email</dt><dd>${esc(email)}</dd><dt>Password</dt><dd><code>${esc(password)}</code></dd></dl>`,
      footer: `<button class="btn" data-close type="button">Done</button>`,
    });
  }

  function editUser(u) {
    const self = u.id === session.user.id;
    const roles = assignable.includes(u.role) ? assignable : [u.role, ...assignable];
    const m = openModal({
      title: "Edit user", narrow: true,
      html: `<div id="m-msg" class="alert alert-error" hidden></div>
        <p><strong>${esc(u.full_name)}</strong><br><span class="muted">${esc(u.email)}</span></p>
        <form id="e-form" novalidate>
          <div class="field"><label for="e-role">Role</label><select id="e-role" name="role"${self ? " disabled" : ""}>${roleOptions(roles, u.role)}</select></div>
          <div class="field"><label for="e-status">Status</label><select id="e-status" name="status"${self ? " disabled" : ""}>
            <option value="active"${u.status === "active" ? " selected" : ""}>Active</option><option value="inactive"${u.status === "inactive" ? " selected" : ""}>Inactive (cannot sign in)</option></select>
            ${self ? `<div class="hint">You cannot change your own role or status.</div>` : ""}</div>
          <div class="field"><label for="e-emp">Linked employee</label><select id="e-emp" name="employeeId">${linkOptions(u.employee_id)}</select></div>
        </form>`,
      footer: `<button class="btn btn-ghost" data-close type="button">Cancel</button><button class="btn" type="submit" form="e-form">Save</button>`,
    });
    m.el.querySelector("#e-form").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const f = ev.target;
      const patch = { id: u.id, employeeId: f.employeeId.value };
      if (!self) { patch.role = f.role.value; patch.status = f.status.value; }
      try {
        await call("users.update", patch);
        m.close();
        toast("User updated. Changes to role or status sign them out.");
        load();
      } catch (err) { const x = m.el.querySelector("#m-msg"); x.textContent = err.message; x.hidden = false; }
    });
  }

  function resetPassword(u) {
    const m = openModal({
      title: "Reset password", narrow: true,
      html: `<div id="m-msg" class="alert alert-error" hidden></div>
        <p>Set a new temporary password for <strong>${esc(u.full_name)}</strong>. They will be signed out and must choose a new password.</p>
        <form id="r-form" novalidate>${passwordField("r-pw")}</form>`,
      footer: `<button class="btn btn-ghost" data-close type="button">Cancel</button><button class="btn" type="submit" form="r-form">Reset password</button>`,
    });
    wireGenerate(m);
    m.el.querySelector("#r-form").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const password = ev.target.password.value;
      try {
        await call("users.resetPassword", { id: u.id, newPassword: password });
        m.close();
        showCredentials(u.email, password);
        load();
      } catch (err) { const x = m.el.querySelector("#m-msg"); x.textContent = err.message; x.hidden = false; }
    });
  }

  load();
}
