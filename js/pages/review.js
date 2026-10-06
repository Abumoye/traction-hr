import { call, ApiError } from "../api.js";
import { initPage, loading, errorBox } from "../layout.js";
import { esc, toast, formatDate, formatDateTime, stars, RATING_LABELS } from "../ui.js";

const id = new URLSearchParams(location.search).get("id");
const page = initPage({ active: "performance", title: "Performance review" });
if (page) run(page);

const ratingSelect = (name, value, label) => `<div class="field"><label for="${name}">${esc(label)}</label><select id="${name}" name="${name}">
  <option value="">Choose a rating</option>${[1, 2, 3, 4, 5].map((n) => `<option value="${n}"${Number(value) === n ? " selected" : ""}>${n} - ${RATING_LABELS[n]}</option>`).join("")}</select></div>`;
const ratingRow = (rating) => rating ? `<span class="stars big">${stars(rating)}</span> <strong>${rating}</strong> &middot; ${esc(RATING_LABELS[rating])}` : '<span class="muted">Not rated</span>';

async function run({ content }) {
  if (!id) return errorBox(content, "No review was chosen.");
  loading(content);
  let v;
  async function load() {
    try { v = await call("performance.reviewGet", { id }); render(); }
    catch (err) { errorBox(content, err instanceof ApiError ? err.message : "Could not load this review."); }
  }

  function render() {
    const open = v.cycle_status === "open";
    const isSelf = v.access === "employee";
    const canWrite = (v.access === "hr" || v.access === "reviewer") && v.status !== "completed" && open;
    document.title = `${v.employee_name} review | Traction Outsourcing HR`;
    content.innerHTML = `
      <div class="toolbar"><a class="btn btn-ghost btn-sm" href="performance.html${isSelf ? "" : "?tab=team"}">&larr; Back</a>
        <h2 style="margin:0">${esc(v.employee_name)}</h2><span class="muted">${esc(v.cycle_name)} &middot; ${esc(formatDate(v.period_start))} to ${esc(formatDate(v.period_end))} &middot; reviewer: ${esc(v.reviewer_name)}</span>
        <span class="badge ${esc(v.status)} spacer">${v.status === "self" ? "Waiting for self-assessment" : v.status === "manager" ? "Waiting for manager" : "Completed"}</span></div>
      ${!open && v.status !== "completed" ? `<div class="alert alert-info">This review cycle is closed. HR can reopen it.</div>` : ""}
      <div class="two-col">
        <div>
          <div class="card review-section"><h2>Self-assessment</h2>${selfSection(isSelf, open)}</div>
          <div class="card review-section"><h2>Manager's review</h2>${managerSection(isSelf, canWrite)}</div>
          ${v.status === "completed" ? `<div class="card review-section"><h2>Result</h2>
            <div class="rating-box">${ratingRow(v.final_rating)}</div>${v.hr_comments ? `<p><strong>HR comments:</strong> ${esc(v.hr_comments)}</p>` : ""}
            ${v.access === "hr" ? hrSection() : ""}
            ${isSelf ? (v.acknowledged_at ? `<p class="muted">You acknowledged this review on ${esc(formatDateTime(v.acknowledged_at))}.</p>` : `<button class="btn" id="ack" type="button">I have read this review</button>`) : (v.acknowledged_at ? `<p class="muted">Acknowledged by the employee on ${esc(formatDateTime(v.acknowledged_at))}.</p>` : '<p class="muted">Not yet acknowledged by the employee.</p>')}</div>` : ""}
        </div>
        <div class="card review-section"><h2>Goals</h2>${v.goals.length ? v.goals.map((g) => `<div class="goal"><h3>${esc(g.title)} <span class="badge ${g.status === "achieved" ? "paid" : "pending"}">${g.status === "achieved" ? "Achieved" : "In progress"}</span></h3>
          <div class="meta">Due ${esc(formatDate(g.due_date))}${g.target ? " &middot; " + esc(g.target) : ""}</div><div style="display:flex;gap:10px;align-items:center"><div class="progress" style="flex:1"><span style="width:${g.progress}%"></span></div><strong>${g.progress}%</strong></div></div>`).join("") : '<p class="muted">No goals set.</p>'}
          <a href="performance.html?tab=goals" class="muted">Manage goals</a></div>
      </div>`;
    wire();
  }

  function selfSection(isSelf, open) {
    if (v.self_rating) return `<div class="rating-box">${ratingRow(v.self_rating)}</div>${v.self_comments ? `<p>${esc(v.self_comments)}</p>` : ""}`;
    if (isSelf && open && v.status === "self") {
      return `<div id="self-msg" class="alert alert-error" hidden></div><form id="self-form" novalidate>${ratingSelect("rating", "", "How would you rate your own performance?")}
        <div class="field"><label for="self-comments">What went well, and what could be better?</label><textarea id="self-comments" name="comments" rows="5" maxlength="1500"></textarea></div>
        <button class="btn" type="submit">Submit self-assessment</button></form>`;
    }
    return '<p class="muted">The employee has not submitted a self-assessment.</p>';
  }

  function managerSection(isSelf, canWrite) {
    if (v.status === "completed") {
      return `<div class="rating-box">${ratingRow(v.manager_rating)}</div>${v.manager_comments ? `<p>${esc(v.manager_comments)}</p>` : ""}
        ${v.strengths ? `<p><strong>Strengths:</strong> ${esc(v.strengths)}</p>` : ""}${v.development ? `<p><strong>Development areas:</strong> ${esc(v.development)}</p>` : ""}`;
    }
    if (canWrite) {
      return `<div id="mgr-msg" class="alert alert-error" hidden></div><form id="mgr-form" novalidate>${ratingSelect("rating", "", "Overall rating")}
        <div class="field"><label for="m-comments">Comments</label><textarea id="m-comments" name="comments" rows="4" maxlength="1500"></textarea></div>
        <div class="field"><label for="m-str">Strengths</label><textarea id="m-str" name="strengths" rows="2" maxlength="800"></textarea></div>
        <div class="field"><label for="m-dev">Areas to develop</label><textarea id="m-dev" name="development" rows="2" maxlength="800"></textarea></div>
        <p class="hint">Submitting completes the review and shows it to the employee.</p><button class="btn" type="submit">Complete review</button></form>`;
    }
    return isSelf ? '<p class="muted">Your manager has not completed their review yet. You will see it here when it is done.</p>' : '<p class="muted">Not written yet.</p>';
  }

  function hrSection() {
    return `<hr style="border:0;border-top:1px solid var(--line);margin:14px 0"><div id="hr-msg" class="alert alert-error" hidden></div><form id="hr-form" novalidate>
      <strong>HR calibration</strong>${ratingSelect("final_rating", v.final_rating, "Final rating")}
      <div class="field"><label for="hr-comments">HR comments</label><textarea id="hr-comments" name="hr_comments" rows="2" maxlength="1500">${esc(v.hr_comments)}</textarea></div>
      <button class="btn btn-ghost" type="submit">Save final rating</button></form>`;
  }

  function wire() {
    const bind = (sel, fn, msgSel) => {
      const f = content.querySelector(sel);
      if (!f) return;
      f.addEventListener("submit", async (e) => {
        e.preventDefault();
        const msg = content.querySelector(msgSel);
        msg.hidden = true;
        try { await fn(f); await load(); } catch (err) { msg.className = "alert alert-error"; msg.textContent = err.message; msg.hidden = false; }
      });
    };
    bind("#self-form", async (f) => { await call("performance.reviewSelf", { id, rating: f.rating.value, comments: f.comments.value }); toast("Self-assessment submitted."); }, "#self-msg");
    bind("#mgr-form", async (f) => { await call("performance.reviewManager", { id, rating: f.rating.value, comments: f.comments.value, strengths: f.strengths.value, development: f.development.value }); toast("Review completed."); }, "#mgr-msg");
    bind("#hr-form", async (f) => { await call("performance.reviewFinalize", { id, final_rating: f.final_rating.value, hr_comments: f.hr_comments.value }); toast("Final rating saved."); }, "#hr-msg");
    const ack = content.querySelector("#ack");
    if (ack) ack.addEventListener("click", async () => { try { await call("performance.reviewAcknowledge", { id }); toast("Thank you."); load(); } catch (err) { toast(err.message, "error"); } });
  }

  load();
}
