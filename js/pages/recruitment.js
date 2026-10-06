import { call, ApiError } from "../api.js";
import { initPage, loading, errorBox } from "../layout.js";
import { esc, openModal, confirmDialog, toast, formatDate, tabBar, bindTabs } from "../ui.js";

const page = initPage({ active: "recruitment", title: "Recruitment" });
if (page) run(page);

const STAGES = [["applied", "Applied"], ["screening", "Screening"], ["interview", "Interview"], ["offer", "Offer"]];
const SOURCES = ["Careers page", "Referral", "Job board", "Social media", "Walk-in", "Other"];
const TYPES = [["full-time", "Full-time"], ["part-time", "Part-time"], ["contract", "Contract"], ["intern", "Intern"]];
const stars = (n) => (n ? "★".repeat(n) + "☆".repeat(5 - n) : "");

async function run({ session, content }) {
  const params = new URLSearchParams(location.search);
  let active = params.get("tab") === "jobs" ? "jobs" : "pipeline";
  let jobFilter = params.get("job") || "";
  let showClosed = false;

  content.innerHTML = `<div id="tabs">${tabBar([{ id: "pipeline", label: "Applicants" }, { id: "jobs", label: "Jobs" }], active)}</div><div id="panel"></div>`;
  const panel = content.querySelector("#panel");
  bindTabs(content.querySelector("#tabs"), (id) => { active = id; show(); });

  function show() { if (active === "pipeline") pipelineTab(); else jobsTab(); }

  // ------------------------------------------------------------ applicants board
  async function pipelineTab() {
    loading(panel);
    try {
      const [jobs, apps] = await Promise.all([call("recruitment.jobsList"), call("recruitment.applicantsList", { jobId: jobFilter })]);
      renderPipeline(jobs, apps);
    } catch (err) {
      errorBox(panel, err instanceof ApiError ? err.message : "Could not load applicants.");
    }
  }

  function card(a, withJob) {
    return `<a class="cand" href="applicant.html?id=${encodeURIComponent(a.id)}">
      <strong>${esc(a.first_name + " " + a.last_name)}</strong>
      ${withJob ? `<div class="sub">${esc(a.job_title)}</div>` : ""}
      <div class="sub">${a.rating ? `<span class="stars">${stars(a.rating)}</span> &middot; ` : ""}Applied ${esc(formatDate(a.created_at.slice(0, 10)))}</div>
      ${a.interview_at && a.stage === "interview" ? `<div class="sub">Interview ${esc(a.interview_at.replace("T", " "))}</div>` : ""}</a>`;
  }

  function renderPipeline(jobs, apps) {
    const live = apps.filter((a) => a.stage !== "hired" && a.stage !== "rejected");
    const hired = apps.filter((a) => a.stage === "hired"), rejected = apps.filter((a) => a.stage === "rejected");
    panel.innerHTML = `
      <div class="toolbar">
        <select id="job" aria-label="Filter by job"><option value="">All jobs</option>${jobs.map((j) => `<option value="${esc(j.id)}"${j.id === jobFilter ? " selected" : ""}>${esc(j.title)}${j.status !== "open" ? " (" + j.status + ")" : ""}</option>`).join("")}</select>
        <span class="muted">${live.length} in progress &middot; ${hired.length} hired &middot; ${rejected.length} not taken forward</span>
        <button class="btn spacer" id="add" type="button"${jobs.length ? "" : " disabled"}>Add applicant</button>
      </div>
      ${jobs.length ? "" : `<div class="alert alert-info">Create a job on the <strong>Jobs</strong> tab first, then applicants can be added to it.</div>`}
      <div class="board">${STAGES.map(([id, label]) => {
        const list = live.filter((a) => a.stage === id);
        return `<div class="column"><h3><span>${label}</span><span>${list.length}</span></h3>${list.map((a) => card(a, !jobFilter)).join("") || `<div class="muted" style="font-size:13px;padding:6px 4px">Nobody here</div>`}</div>`;
      }).join("")}</div>
      <p style="margin-top:14px"><button class="btn btn-ghost btn-sm" id="toggle" type="button">${showClosed ? "Hide" : "Show"} hired and rejected (${hired.length + rejected.length})</button></p>
      ${showClosed ? `<div class="two-col"><div class="column"><h3><span>Hired</span><span>${hired.length}</span></h3>${hired.map((a) => card(a, !jobFilter)).join("") || '<div class="muted">None yet</div>'}</div>
        <div class="column"><h3><span>Rejected</span><span>${rejected.length}</span></h3>${rejected.map((a) => card(a, !jobFilter)).join("") || '<div class="muted">None</div>'}</div></div>` : ""}`;
    panel.querySelector("#job").addEventListener("change", (e) => { jobFilter = e.target.value; pipelineTab(); });
    panel.querySelector("#toggle").addEventListener("click", () => { showClosed = !showClosed; renderPipeline(jobs, apps); });
    panel.querySelector("#add").addEventListener("click", () => addApplicant(jobs));
  }

  function addApplicant(jobs) {
    const m = openModal({
      title: "Add applicant", narrow: true,
      html: `<div id="m-msg" class="alert alert-error" hidden></div>
        <form id="app-form" novalidate>
          <div class="field"><label class="required" for="a-job">Job</label><select id="a-job" name="job_id">${jobs.filter((j) => j.status !== "closed").map((j) => `<option value="${esc(j.id)}"${j.id === jobFilter ? " selected" : ""}>${esc(j.title)}</option>`).join("")}</select></div>
          <div class="form-grid">
            <div class="field"><label class="required" for="a-first">First name</label><input id="a-first" name="first_name" maxlength="60" required></div>
            <div class="field"><label class="required" for="a-last">Last name</label><input id="a-last" name="last_name" maxlength="60" required></div>
            <div class="field"><label for="a-email">Email</label><input id="a-email" name="email" type="email" maxlength="120"></div>
            <div class="field"><label for="a-phone">Phone</label><input id="a-phone" name="phone" maxlength="30"></div>
            <div class="field"><label for="a-source">Source</label><select id="a-source" name="source">${SOURCES.map((s) => `<option${s === "Referral" ? " selected" : ""}>${s}</option>`).join("")}</select></div>
            <div class="field"><label for="a-sal">Expected monthly salary (&#8358;)</label><input id="a-sal" name="expected_salary" inputmode="decimal"></div>
          </div>
          <div class="hint">An email or a phone number is needed. You can upload their CV on the next page.</div>
        </form>`,
      footer: `<button class="btn btn-ghost" data-close type="button">Cancel</button><button class="btn" type="submit" form="app-form">Add applicant</button>`,
    });
    m.el.querySelector("#app-form").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const data = {};
      new FormData(ev.target).forEach((v, k) => { data[k] = v; });
      try { const a = await call("recruitment.applicantsCreate", data); m.close(); location.href = "applicant.html?id=" + encodeURIComponent(a.id); }
      catch (err) { const x = m.el.querySelector("#m-msg"); x.textContent = err.message; x.hidden = false; }
    });
  }

  // ------------------------------------------------------------ jobs
  async function jobsTab() {
    loading(panel);
    try {
      const [jobs, depts] = await Promise.all([call("recruitment.jobsList"), call("departments.list")]);
      renderJobs(jobs, depts);
    } catch (err) {
      errorBox(panel, err instanceof ApiError ? err.message : "Could not load jobs.");
    }
  }

  function renderJobs(jobs, depts) {
    const link = `${location.origin}${location.pathname.replace(/[^/]*$/, "")}careers.html?company=${encodeURIComponent(session.company.code)}`;
    panel.innerHTML = `
      <div class="copy-box"><span class="muted">Careers page for candidates:</span><code id="link">${esc(link)}</code>
        <button class="btn btn-ghost btn-sm" id="copy" type="button">Copy link</button><a class="btn btn-ghost btn-sm" href="${esc(link)}" target="_blank" rel="noopener">Open</a></div>
      <div class="toolbar"><span class="muted">Only jobs that are <strong>Open</strong> and shown publicly appear on the careers page.</span><button class="btn spacer" id="add" type="button">Add job</button></div>
      ${jobs.length ? `<div class="table-wrap"><table class="data"><thead><tr><th>Job</th><th>Department</th><th>Status</th><th>Public</th><th class="num">Openings</th><th class="num">Applicants</th><th></th></tr></thead><tbody>
        ${jobs.map((j) => `<tr><td><strong>${esc(j.title)}</strong><div class="muted">${esc(j.location)}${j.location ? " &middot; " : ""}${esc(j.employment_type)}</div></td>
          <td>${esc(j.department_name)}</td><td><span class="badge ${j.status === "open" ? "active" : j.status === "draft" ? "pending" : "cancelled"}">${esc(j.status.charAt(0).toUpperCase() + j.status.slice(1))}</span></td>
          <td>${j.public ? "Yes" : "<span class='muted'>No</span>"}</td><td class="num">${j.openings}</td>
          <td class="num"><a href="recruitment.html?job=${encodeURIComponent(j.id)}">${j.active_applicants} active</a> <span class="muted">/ ${j.applicants}</span></td>
          <td style="text-align:right;white-space:nowrap"><button class="btn btn-ghost btn-sm" data-edit="${esc(j.id)}" type="button">Edit</button>
            ${j.status === "open" ? `<button class="btn btn-ghost btn-sm" data-status="closed" data-id="${esc(j.id)}" type="button">Close</button>` : `<button class="btn btn-ghost btn-sm" data-status="open" data-id="${esc(j.id)}" type="button">${j.status === "closed" ? "Reopen" : "Publish"}</button>`}
            ${j.applicants === 0 ? `<button class="btn btn-ghost btn-sm" data-del="${esc(j.id)}" type="button">Delete</button>` : ""}</td></tr>`).join("")}</tbody></table></div>`
        : `<div class="card empty">No jobs yet. Add your first opening.</div>`}`;
    panel.querySelector("#copy").addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(link); toast("Link copied."); } catch (e) { toast("Select the link and copy it.", "error"); }
    });
    panel.querySelector("#add").addEventListener("click", () => editJob(null, depts));
    panel.querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", () => editJob(jobs.find((j) => j.id === b.dataset.edit), depts)));
    panel.querySelectorAll("[data-status]").forEach((b) => b.addEventListener("click", async () => {
      const j = jobs.find((x) => x.id === b.dataset.id);
      try { await call("recruitment.jobsSave", { ...j, public: j.public, status: b.dataset.status }); toast(b.dataset.status === "open" ? "Job is open." : "Job closed."); jobsTab(); } catch (err) { toast(err.message, "error"); }
    }));
    panel.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", async () => {
      const j = jobs.find((x) => x.id === b.dataset.del);
      if (!(await confirmDialog(`Delete the "${j.title}" job?`, { okText: "Delete", danger: true }))) return;
      try { await call("recruitment.jobsDelete", { id: j.id }); toast("Job deleted."); jobsTab(); } catch (err) { toast(err.message, "error"); }
    }));
  }

  function editJob(j, depts) {
    const m = openModal({
      title: j ? "Edit job" : "Add job",
      html: `<div id="m-msg" class="alert alert-error" hidden></div>
        <form id="job-form" novalidate>
          <div class="form-grid">
            <div class="field full"><label class="required" for="j-title">Job title</label><input id="j-title" name="title" maxlength="100" value="${esc(j ? j.title : "")}" required></div>
            <div class="field"><label for="j-dept">Department</label><select id="j-dept" name="department_id"><option value="">None</option>${depts.map((d) => `<option value="${esc(d.id)}"${j && j.department_id === d.id ? " selected" : ""}>${esc(d.name)}</option>`).join("")}</select></div>
            <div class="field"><label for="j-loc">Location</label><input id="j-loc" name="location" maxlength="80" value="${esc(j ? j.location : "")}"></div>
            <div class="field"><label for="j-type">Employment type</label><select id="j-type" name="employment_type">${TYPES.map(([v, l]) => `<option value="${v}"${j && j.employment_type === v ? " selected" : ""}>${l}</option>`).join("")}</select></div>
            <div class="field"><label for="j-open">Openings</label><input id="j-open" name="openings" inputmode="numeric" value="${j ? j.openings : 1}"></div>
            <div class="field full"><label for="j-desc">Description</label><textarea id="j-desc" name="description" rows="4" maxlength="4000">${esc(j ? j.description : "")}</textarea></div>
            <div class="field full"><label for="j-req">Requirements</label><textarea id="j-req" name="requirements" rows="3" maxlength="3000">${esc(j ? j.requirements : "")}</textarea></div>
            <div class="field"><label for="j-status">Status</label><select id="j-status" name="status">${[["draft", "Draft (not visible)"], ["open", "Open"], ["closed", "Closed"]].map(([v, l]) => `<option value="${v}"${(j ? j.status : "draft") === v ? " selected" : ""}>${l}</option>`).join("")}</select></div>
            <div class="field"><label for="j-pub">Show on the careers page</label><select id="j-pub" name="public"><option value="yes"${!j || j.public ? " selected" : ""}>Yes</option><option value="no"${j && !j.public ? " selected" : ""}>No (internal only)</option></select></div>
          </div>
        </form>`,
      footer: `<button class="btn btn-ghost" data-close type="button">Cancel</button><button class="btn" type="submit" form="job-form">Save job</button>`,
    });
    m.el.querySelector("#job-form").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const data = { id: j ? j.id : "" };
      new FormData(ev.target).forEach((v, k) => { data[k] = v; });
      try { await call("recruitment.jobsSave", data); m.close(); toast("Job saved."); jobsTab(); }
      catch (err) { const x = m.el.querySelector("#m-msg"); x.textContent = err.message; x.hidden = false; x.scrollIntoView({ block: "nearest" }); }
    });
  }

  show();
}
