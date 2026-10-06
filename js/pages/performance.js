import { call, ApiError } from "../api.js";
import { initPage, loading, errorBox, canManageStaff } from "../layout.js";
import { esc, openModal, confirmDialog, toast, formatDate, tabBar, bindTabs, stars } from "../ui.js";

const page = initPage({ active: "performance", title: "Performance" });
if (page) run(page);

const STATUS = { self: "Waiting for self-assessment", manager: "Waiting for manager", completed: "Completed" };

async function run({ session, role, content }) {
  const isHr = canManageStaff(role);
  const isReviewer = isHr || role === "manager";
  const tabs = [{ id: "mine", label: "My reviews" }];
  if (isReviewer) tabs.push({ id: "team", label: isHr ? "All reviews" : "Team reviews" });
  tabs.push({ id: "goals", label: "Goals" });
  if (isHr) tabs.push({ id: "cycles", label: "Review cycles" });
  const wanted = new URLSearchParams(location.search).get("tab");
  let active = tabs.some((t) => t.id === wanted) ? wanted : "mine";

  content.innerHTML = `<div id="tabs">${tabBar(tabs, active)}</div><div id="panel"></div>`;
  const panel = content.querySelector("#panel");
  bindTabs(content.querySelector("#tabs"), (id) => { active = id; show(); });

  function show() {
    if (active === "mine") mineTab();
    else if (active === "team") teamTab();
    else if (active === "goals") goalsTab();
    else cyclesTab();
  }

  const fail = (err, text) => errorBox(panel, err instanceof ApiError ? err.message : text);

  // ------------------------------------------------------------ my reviews
  async function mineTab() {
    loading(panel);
    try {
      const r = await call("performance.reviewsMine");
      if (!r.linked) { panel.innerHTML = `<div class="card"><h2>Your login is not linked to an employee record</h2><p class="muted">Ask HR to link it so your reviews can appear here.</p></div>`; return; }
      panel.innerHTML = r.reviews.length
        ? `<div class="table-wrap"><table class="data"><thead><tr><th>Review</th><th>Status</th><th>Result</th><th></th></tr></thead><tbody>
          ${r.reviews.map((v) => `<tr><td><strong>${esc(v.cycle_name)}</strong><div class="muted">Manager: ${esc(v.reviewer_name)}</div></td>
            <td><span class="badge ${esc(v.status)}">${esc(STATUS[v.status])}</span>${v.status === "completed" && !v.acknowledged ? ' <span class="badge pending">Please acknowledge</span>' : ""}</td>
            <td>${v.final_rating ? `<span class="stars">${stars(v.final_rating)}</span>` : '<span class="muted">Not ready</span>'}</td>
            <td style="text-align:right"><a class="btn btn-sm${v.status === "self" && v.cycle_status === "open" ? "" : " btn-ghost"}" href="review.html?id=${encodeURIComponent(v.id)}">${v.status === "self" && v.cycle_status === "open" ? "Complete self-assessment" : "Open"}</a></td></tr>`).join("")}</tbody></table></div>`
        : `<div class="card empty">No reviews yet. They appear here when HR starts a review cycle.</div>`;
    } catch (err) { fail(err, "Could not load your reviews."); }
  }

  // ------------------------------------------------------------ team / all reviews
  let cycleFilter = "";
  async function teamTab() {
    loading(panel);
    try {
      const [reviews, cycles] = await Promise.all([call("performance.reviewsTeam", { cycleId: cycleFilter }), isHr ? call("performance.cyclesList") : Promise.resolve([])]);
      panel.innerHTML = `
        <div class="toolbar">${isHr ? `<select id="cycle" aria-label="Filter by cycle"><option value="">All cycles</option>${cycles.map((c) => `<option value="${esc(c.id)}"${c.id === cycleFilter ? " selected" : ""}>${esc(c.name)}</option>`).join("")}</select>` : ""}
          <span class="muted">${isHr ? "Every review. Reviews with no manager on file are written by HR." : "Reviews for the people who report to you."}</span></div>
        ${reviews.length ? `<div class="table-wrap"><table class="data"><thead><tr><th>Employee</th><th>Cycle</th><th>Status</th><th>Self</th><th>Manager</th><th>Final</th><th></th></tr></thead><tbody>
          ${reviews.map((v) => `<tr><td><strong>${esc(v.employee_name)}</strong><div class="muted">${esc(v.job_title)}${isHr ? " &middot; " + esc(v.reviewer_name) : ""}</div></td><td>${esc(v.cycle_name)}</td>
            <td><span class="badge ${esc(v.status)}">${esc(STATUS[v.status])}</span></td>
            <td><span class="stars">${stars(v.self_rating || 0)}</span></td><td><span class="stars">${stars(v.manager_rating || 0)}</span></td><td><span class="stars">${stars(v.final_rating || 0)}</span></td>
            <td style="text-align:right"><a class="btn btn-sm${v.status !== "completed" && v.cycle_status === "open" ? "" : " btn-ghost"}" href="review.html?id=${encodeURIComponent(v.id)}">${v.status !== "completed" && v.cycle_status === "open" ? "Write review" : "Open"}</a></td></tr>`).join("")}</tbody></table></div>`
          : `<div class="card empty">No reviews to show.</div>`}`;
      const sel = panel.querySelector("#cycle");
      if (sel) sel.addEventListener("change", (e) => { cycleFilter = e.target.value; teamTab(); });
    } catch (err) { fail(err, "Could not load reviews."); }
  }

  // ------------------------------------------------------------ goals
  let goalPerson = "";
  async function goalsTab() {
    loading(panel);
    try {
      const people = isReviewer ? await call("goals.people") : [];
      const r = await call("goals.list", { employeeId: goalPerson });
      renderGoals(r, people);
    } catch (err) { fail(err, "Could not load goals."); }
  }

  function renderGoals(r, people) {
    const mineView = !goalPerson;
    if (!r.linked && mineView && !people.length) {
      panel.innerHTML = `<div class="card"><h2>Your login is not linked to an employee record</h2><p class="muted">Ask HR to link it so you can set goals.</p></div>`;
      return;
    }
    const ownerName = mineView ? "My goals" : `${r.employee.name}'s goals`;
    panel.innerHTML = `
      <div class="toolbar">
        ${people.length ? `<select id="person" aria-label="Whose goals"><option value="">My goals</option>${people.map((p) => `<option value="${esc(p.id)}"${p.id === goalPerson ? " selected" : ""}>${esc(p.name)}</option>`).join("")}</select>` : ""}
        <h2 style="margin:0">${esc(ownerName)}</h2>
        ${r.linked || !mineView ? `<button class="btn btn-sm spacer" id="add" type="button">${mineView ? "Add a goal" : "Set a goal for " + esc(r.employee.name.split(" ")[0])}</button>` : ""}</div>
      ${r.goals.length ? r.goals.map((g) => `<div class="goal"><h3>${esc(g.title)} <span class="badge ${g.status === "achieved" ? "paid" : "pending"}">${g.status === "achieved" ? "Achieved" : "In progress"}</span></h3>
          <div class="meta">Due ${esc(formatDate(g.due_date))}${g.target ? " &middot; Target: " + esc(g.target) : ""}${g.created_by ? " &middot; set by " + esc(g.created_by) : ""}</div>
          ${g.description ? `<p style="margin:0 0 8px">${esc(g.description)}</p>` : ""}
          <div style="display:flex;gap:10px;align-items:center"><div class="progress" style="flex:1"><span style="width:${g.progress}%"></span></div><strong>${g.progress}%</strong></div>
          ${g.last_note ? `<div class="muted" style="font-size:13px;margin-top:6px">Latest note: ${esc(g.last_note)}</div>` : ""}
          <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-ghost btn-sm" data-progress="${esc(g.id)}" type="button">Update progress</button>
            <button class="btn btn-ghost btn-sm" data-edit="${esc(g.id)}" type="button">Edit</button><button class="btn btn-ghost btn-sm" data-del="${esc(g.id)}" type="button">Delete</button></div></div>`).join("")
        : `<div class="card empty">No goals yet.</div>`}`;
    const sel = panel.querySelector("#person");
    if (sel) sel.addEventListener("change", (e) => { goalPerson = e.target.value; goalsTab(); });
    const add = panel.querySelector("#add");
    if (add) add.addEventListener("click", () => editGoal(null, r));
    panel.querySelectorAll("[data-progress]").forEach((b) => b.addEventListener("click", () => setProgress(r.goals.find((g) => g.id === b.dataset.progress))));
    panel.querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", () => editGoal(r.goals.find((g) => g.id === b.dataset.edit), r)));
    panel.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", async () => {
      const g = r.goals.find((x) => x.id === b.dataset.del);
      if (!(await confirmDialog(`Delete the goal "${g.title}"?`, { okText: "Delete", danger: true }))) return;
      try { await call("goals.delete", { id: g.id }); toast("Goal deleted."); goalsTab(); } catch (err) { toast(err.message, "error"); }
    }));
  }

  function editGoal(g, r) {
    const m = openModal({
      title: g ? "Edit goal" : "New goal",
      html: `<div id="m-msg" class="alert alert-error" hidden></div><form id="goal-form" novalidate>
        <div class="field"><label class="required" for="g-title">Goal</label><input id="g-title" name="title" maxlength="120" value="${esc(g ? g.title : "")}"></div>
        <div class="field"><label for="g-desc">Details</label><textarea id="g-desc" name="description" rows="3" maxlength="600">${esc(g ? g.description : "")}</textarea></div>
        <div class="form-grid"><div class="field"><label for="g-target">How will you measure it?</label><input id="g-target" name="target" maxlength="200" value="${esc(g ? g.target : "")}" placeholder="For example: 20% fewer tickets"></div>
        <div class="field"><label class="required" for="g-due">Due date</label><input id="g-due" name="due_date" type="date" value="${esc(g ? g.due_date : "")}"></div></div></form>`,
      footer: `<button class="btn btn-ghost" data-close type="button">Cancel</button><button class="btn" type="submit" form="goal-form">Save goal</button>`,
    });
    m.el.querySelector("#goal-form").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const f = ev.target;
      try {
        await call("goals.save", { id: g ? g.id : "", employeeId: goalPerson, title: f.title.value, description: f.description.value, target: f.target.value, due_date: f.due_date.value });
        m.close(); toast("Goal saved."); goalsTab();
      } catch (err) { const x = m.el.querySelector("#m-msg"); x.textContent = err.message; x.hidden = false; }
    });
  }

  function setProgress(g) {
    const m = openModal({
      title: "Update progress", narrow: true,
      html: `<div id="m-msg" class="alert alert-error" hidden></div><p><strong>${esc(g.title)}</strong></p><form id="pr-form" novalidate>
        <div class="field"><label for="p-val">Progress: <output id="p-out">${g.progress}</output>%</label><input id="p-val" name="progress" type="range" min="0" max="100" step="5" value="${g.progress}" style="width:100%"></div>
        <div class="field"><label for="p-note">Note (optional)</label><input id="p-note" name="note" maxlength="300" placeholder="What has been done?"></div>
        <div class="hint">100% marks the goal as achieved.</div></form>`,
      footer: `<button class="btn btn-ghost" data-close type="button">Cancel</button><button class="btn" type="submit" form="pr-form">Save</button>`,
    });
    const f = m.el.querySelector("#pr-form");
    f.progress.addEventListener("input", () => { m.el.querySelector("#p-out").textContent = f.progress.value; });
    f.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      try { await call("goals.progress", { id: g.id, progress: f.progress.value, note: f.note.value }); m.close(); toast("Progress saved."); goalsTab(); }
      catch (err) { const x = m.el.querySelector("#m-msg"); x.textContent = err.message; x.hidden = false; }
    });
  }

  // ------------------------------------------------------------ cycles (HR)
  async function cyclesTab() {
    loading(panel);
    try {
      const cycles = await call("performance.cyclesList");
      panel.innerHTML = `
        <div class="toolbar"><span class="muted">Starting a cycle gives every active employee a review: first their self-assessment, then their manager's review.</span><button class="btn spacer" id="new" type="button">Start a review cycle</button></div>
        ${cycles.length ? `<div class="table-wrap"><table class="data"><thead><tr><th>Cycle</th><th>Period</th><th>Status</th><th class="num">Reviews</th><th class="num">Waiting for self</th><th class="num">Waiting for manager</th><th class="num">Completed</th><th></th></tr></thead><tbody>
          ${cycles.map((c) => `<tr><td><strong>${esc(c.name)}</strong></td><td>${esc(formatDate(c.period_start))} &ndash; ${esc(formatDate(c.period_end))}</td>
            <td><span class="badge ${c.status === "open" ? "active" : "cancelled"}">${c.status === "open" ? "Open" : "Closed"}</span></td><td class="num">${c.total}</td><td class="num">${c.awaiting_self}</td><td class="num">${c.awaiting_manager}</td><td class="num">${c.completed}</td>
            <td style="text-align:right"><button class="btn btn-ghost btn-sm" data-toggle="${esc(c.id)}" data-to="${c.status === "open" ? "closed" : "open"}" type="button">${c.status === "open" ? "Close" : "Reopen"}</button></td></tr>`).join("")}</tbody></table></div>`
          : `<div class="card empty">No review cycles yet.</div>`}`;
      panel.querySelector("#new").addEventListener("click", newCycle);
      panel.querySelectorAll("[data-toggle]").forEach((b) => b.addEventListener("click", async () => {
        try { await call("performance.cyclesSetStatus", { id: b.dataset.toggle, status: b.dataset.to }); toast(b.dataset.to === "closed" ? "Cycle closed." : "Cycle reopened."); cyclesTab(); } catch (err) { toast(err.message, "error"); }
      }));
    } catch (err) { fail(err, "Could not load review cycles."); }
  }

  function newCycle() {
    const y = new Date().getFullYear();
    const m = openModal({
      title: "Start a review cycle", narrow: true,
      html: `<div id="m-msg" class="alert alert-error" hidden></div><form id="cy-form" novalidate>
        <div class="field"><label class="required" for="c-name">Name</label><input id="c-name" name="name" maxlength="60" placeholder="For example: H1 ${y}"></div>
        <div class="inline-form"><div class="field" style="flex:1"><label class="required" for="c-start">Period starts</label><input id="c-start" name="period_start" type="date" value="${y}-01-01"></div>
        <div class="field" style="flex:1"><label class="required" for="c-end">Period ends</label><input id="c-end" name="period_end" type="date" value="${y}-06-30"></div></div>
        <p class="muted">Everyone active who joined before the period ended gets a review.</p></form>`,
      footer: `<button class="btn btn-ghost" data-close type="button">Cancel</button><button class="btn" type="submit" form="cy-form">Start cycle</button>`,
    });
    m.el.querySelector("#cy-form").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const f = ev.target;
      try { const c = await call("performance.cyclesCreate", { name: f.name.value, period_start: f.period_start.value, period_end: f.period_end.value }); m.close(); toast(`Cycle started with ${c.total} reviews.`); cyclesTab(); }
      catch (err) { const x = m.el.querySelector("#m-msg"); x.textContent = err.message; x.hidden = false; }
    });
  }

  show();
}
