import { call, ApiError } from "../api.js";
import { initPage, loading, errorBox, canManageStaff } from "../layout.js";
import { esc, cap, formatDate, initials, toast, STATUS_LABELS } from "../ui.js";
import { openEmployeeForm } from "../employee-form.js";

const params = new URLSearchParams(location.search);
const isMe = params.get("me") === "1";
const page = initPage({ active: isMe ? "profile" : "employees", title: isMe ? "My profile" : "Employee profile" });
if (page) run(page);

const MAX_CV = 4 * 1024 * 1024;

async function run({ session, role, content }) {
  const canWrite = canManageStaff(role);
  const id = isMe ? session.user.employeeId : params.get("id");
  if (!id) {
    return content.innerHTML = `<div class="card"><h2>No employee record</h2><p class="muted">Your login is not linked to an employee record yet. Please ask HR to link it.</p></div>`;
  }

  async function load() {
    loading(content);
    try {
      const emp = await call("employees.get", { id });
      render(emp);
    } catch (err) {
      errorBox(content, err instanceof ApiError ? err.message : "Could not load this profile.");
    }
  }

  function row(label, value) {
    return `<dt>${esc(label)}</dt><dd>${value ? esc(value) : '<span class="muted">Not provided</span>'}</dd>`;
  }

  function render(e) {
    const name = e.first_name + " " + e.last_name;
    const canDownload = e.has_cv && (canWrite || e.id === session.user.employeeId);
    content.innerHTML = `
      <div class="card">
        <div class="profile-head">
          <span class="avatar lg">${esc(initials(name))}</span>
          <div>
            <h2>${esc(name)}</h2>
            <div class="muted">${esc(e.job_title || "No job title")}${e.department_name ? " &middot; " + esc(e.department_name) : ""} &middot; ${esc(e.employee_no)}</div>
            <div style="margin-top:6px"><span class="badge ${esc(e.status)}">${esc(STATUS_LABELS[e.status] || e.status)}</span></div>
          </div>
          <div class="actions">
            ${!isMe ? `<a class="btn btn-ghost btn-sm" href="employees.html">All employees</a>` : ""}
            ${canWrite ? `<button type="button" class="btn btn-sm" id="edit">Edit</button>` : ""}
          </div>
        </div>
      </div>
      <div class="two-col">
        <div class="card"><h2>Contact and personal</h2><dl class="dl">
          ${row("Work email", e.email)}${row("Phone", e.phone)}${row("Gender", cap(e.gender))}
          ${e.sensitive ? row("Date of birth", formatDate(e.dob)) + row("Home address", e.address) : ""}
        </dl>${e.sensitive ? "" : `<p class="muted" style="margin:12px 0 0">Personal and bank details are visible to HR only.</p>`}</div>
        <div class="card"><h2>Employment</h2><dl class="dl">
          ${row("Department", e.department_name)}${row("Job title", e.job_title)}${row("Reports to", e.manager_name)}
          ${row("Employment type", cap(e.employment_type))}${row("Date joined", formatDate(e.date_joined))}
        </dl></div>
      </div>
      ${e.sensitive ? `<div class="card"><h2>Bank and statutory</h2><dl class="dl">
          ${row("Bank", e.bank_name)}${row("Account number", e.account_no)}${row("Tax ID (TIN)", e.tin)}${row("Pension PIN", e.pension_pin)}
        </dl></div>` : ""}
      <div class="card" id="leave-card" hidden><h2>Leave balances (${new Date().getFullYear()})</h2><div id="leave-body"></div></div>
      <div class="card"><h2>Documents</h2>
        <div id="cv-msg" class="alert alert-error" hidden></div>
        <p style="margin-bottom:12px">${e.has_cv ? `CV: <strong>${esc(e.cv_file_name || "uploaded")}</strong>` : `<span class="muted">No CV uploaded yet.</span>`}</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
          ${canDownload ? `<button type="button" class="btn btn-ghost btn-sm" id="cv-download">Download CV</button>` : ""}
          ${canWrite ? `<label class="btn btn-sm" for="cv-file" style="margin:0">${e.has_cv ? "Replace CV" : "Upload CV"}</label>
            <input id="cv-file" type="file" accept=".pdf,.doc,.docx" hidden><span class="hint" style="margin:0">PDF, DOC or DOCX, up to 4 MB</span>` : ""}
        </div>
      </div>`;

    const edit = content.querySelector("#edit");
    if (edit) edit.addEventListener("click", async () => {
      try {
        const [departments, employees] = await Promise.all([call("departments.list"), call("employees.list")]);
        openEmployeeForm({ employee: e, departments, employees, onSaved: load });
      } catch (err) { toast(err.message, "error"); }
    });

    // Leave balances: shown only when the server allows it for this viewer.
    call("leave.balances", { employeeId: e.id }).then((r) => {
      const shown = r.balances.filter((b) => b.applicable || b.missing_gender);
      if (!shown.length) return;
      content.querySelector("#leave-body").innerHTML = `<div class="balances" style="margin:0">${shown.map((b) => b.missing_gender ? `
        <div class="balance" style="background:var(--ground)"><div class="name">${esc(b.name)}</div>
        <div class="left" style="font-size:16px">Not available yet</div>
        <div class="meta">Add a gender to check eligibility.</div></div>` : !b.eligible ? `
        <div class="balance" style="background:var(--ground)"><div class="name">${esc(b.name)}</div>
        <div class="left" style="font-size:16px">Not available yet</div>
        <div class="meta">${b.missing_join_date ? "Add a date joined to check eligibility." : `After ${b.min_service_months} months, from ${esc(formatDate(b.eligible_from))}.`}</div></div>` : `
        <div class="balance"><div class="name">${esc(b.name)}</div>
        <div class="left">${b.unlimited ? "No limit" : `${b.remaining} <small>left</small>`}</div>
        <div class="meta">${b.unlimited ? "" : `${b.prorated ? `${b.entitlement} this year (part-year of ${b.full_allowance})` : `${b.entitlement} a year`}${b.carried ? ` + ${b.carried} carried` : ""} &middot; `}${b.used} used${b.pending ? ` &middot; ${b.pending} pending` : ""}</div></div>`).join("")}</div>`;
      content.querySelector("#leave-card").hidden = false;
    }).catch(() => {});

    const dl = content.querySelector("#cv-download");
    if (dl) dl.addEventListener("click", () => downloadCv(e, dl));
    const file = content.querySelector("#cv-file");
    if (file) file.addEventListener("change", () => uploadCv(e, file));
  }

  async function downloadCv(e, btn) {
    btn.disabled = true;
    try {
      const f = await call("files.downloadCv", { employeeId: e.id });
      const bytes = Uint8Array.from(atob(f.data), (c) => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: f.mimeType }));
      const a = document.createElement("a");
      a.href = url;
      a.download = f.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (err) {
      toast(err.message, "error");
    } finally {
      btn.disabled = false;
    }
  }

  async function uploadCv(e, input) {
    const msg = content.querySelector("#cv-msg");
    msg.hidden = true;
    const f = input.files[0];
    if (!f) return;
    if (f.size > MAX_CV) { msg.textContent = "That file is larger than 4 MB."; msg.hidden = false; input.value = ""; return; }
    if (!/\.(pdf|docx?)$/i.test(f.name)) { msg.textContent = "Choose a PDF, DOC or DOCX file."; msg.hidden = false; input.value = ""; return; }
    try {
      const data = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result).split(",")[1] || "");
        r.onerror = () => reject(new Error("Could not read the file."));
        r.readAsDataURL(f);
      });
      toast("Uploading...");
      await call("files.uploadCv", { employeeId: e.id, fileName: f.name, data });
      toast("CV uploaded.");
      load();
    } catch (err) {
      msg.textContent = err.message;
      msg.hidden = false;
      input.value = "";
    }
  }

  load();
}
