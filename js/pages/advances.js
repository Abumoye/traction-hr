import { call, ApiError } from "../api.js";
import { initPage, loading, errorBox, canManageStaff } from "../layout.js";
import { esc, openModal, confirmDialog, toast, formatDate, tabBar, bindTabs, todayLagos, monthLabel } from "../ui.js";
import { naira } from "../money.js";

const page = initPage({ active: "advances", title: "Salary advance" });
if (page) run(page);

const LABEL = { submitted: "Waiting for approval", approved: "Approved, to be paid", repaying: "Being repaid", cleared: "Fully repaid", rejected: "Rejected", cancelled: "Cancelled" };

async function run({ session, role, content }) {
  const isHr = canManageStaff(role);
  const linked = !!session.user.employeeId;
  const tabs = [];
  if (linked || !isHr) tabs.push({ id: "mine", label: "My advance" });
  if (isHr) tabs.push({ id: "requests", label: "Requests" }, { id: "rules", label: "Rules" });
  const wanted = new URLSearchParams(location.search).get("tab");
  let active = tabs.some((t) => t.id === wanted) ? wanted : tabs[0].id;

  content.innerHTML = `<div id="tabs">${tabBar(tabs, active)}</div><div id="panel"></div>`;
  const panel = content.querySelector("#panel");
  bindTabs(content.querySelector("#tabs"), (id) => { active = id; show(); });
  function show() { if (active === "mine") mineTab(); else if (active === "requests") requestsTab(); else rulesTab(); }
  const fail = (err, text) => errorBox(panel, err instanceof ApiError ? err.message : text);
  const badge = (s) => `<span class="badge ${esc(s)}">${esc(LABEL[s] || s)}</span>`;

  // ---------------------------------------------------------------- one advance in detail
  async function detail(id) {
    try {
      const a = await call("advances.get", { id });
      const reps = a.repayments.length
        ? `<table class="data"><thead><tr><th>Month</th><th class="num">Taken from pay</th></tr></thead><tbody>${a.repayments.map((r) => `<tr><td>${esc(monthLabel(r.period))}</td><td class="num">${naira(r.amount)}</td></tr>`).join("")}</tbody></table>`
        : '<p class="muted">Nothing has been taken from pay yet.</p>';
      const next = a.schedule.length
        ? `<table class="data"><thead><tr><th>Month</th><th class="num">Still to come</th></tr></thead><tbody>${a.schedule.map((r) => `<tr><td>${esc(monthLabel(r.period))}</td><td class="num">${naira(r.amount)}</td></tr>`).join("")}</tbody></table>` : "";
      openModal({
        title: "Salary advance", narrow: true,
        html: `<p>${badge(a.status)}</p>
          <dl class="dl"><dt>Employee</dt><dd>${esc(a.employee_name)}</dd><dt>Amount</dt><dd>${naira(a.amount)}</dd>
          <dt>Repaid over</dt><dd>${a.repay_months} month${a.repay_months === 1 ? "" : "s"} (${naira(a.monthly_deduction)} a month)</dd>
          <dt>Requested</dt><dd>${esc(formatDate(a.created_at.slice(0, 10)))}</dd><dt>Reason</dt><dd>${esc(a.reason)}</dd>
          ${a.decided_at ? `<dt>Decision</dt><dd>${esc(a.approver_name)}${a.decision_note ? ": " + esc(a.decision_note) : ""}</dd>` : ""}
          ${a.disbursed_on ? `<dt>Paid out</dt><dd>${esc(formatDate(a.disbursed_on))}${a.payment_ref ? " &middot; " + esc(a.payment_ref) : ""}</dd><dt>Repayment starts</dt><dd>${esc(monthLabel(a.repay_start))}</dd>` : ""}
          ${a.disbursed_on ? `<dt>Balance</dt><dd><strong>${naira(a.balance)}</strong> (${naira(a.repaid_total)} repaid)</dd>` : ""}</dl>
          ${a.disbursed_on ? `<h3>Taken from pay</h3>${reps}${next ? `<h3>Still to come</h3>${next}` : ""}` : ""}`,
        footer: `<button class="btn btn-ghost" data-close type="button">Close</button>`,
      });
    } catch (err) { toast(err.message, "error"); }
  }

  // ---------------------------------------------------------------- my advance
  async function mineTab() {
    loading(panel);
    try { renderMine(await call("advances.mine")); } catch (err) { fail(err, "Could not load your salary advances."); }
  }

  function renderMine(r) {
    if (!r.linked) { panel.innerHTML = `<div class="card"><h2>Your login is not linked to an employee record</h2><p class="muted">Ask HR to link it so you can ask for a salary advance.</p></div>`; return; }
    const el = r.eligibility, s = r.settings;
    const active = r.advances.find((a) => a.status === "repaying");
    panel.innerHTML = `
      <div class="stats compact money">
        <div class="stat${active ? " accent" : ""}"><div class="num" style="font-size:22px">${naira(r.outstanding)}</div><div class="lbl">Still to repay</div></div>
        <div class="stat"><div class="num" style="font-size:22px">${active ? naira(active.monthly_deduction) : "None"}</div><div class="lbl">Taken from pay each month</div></div>
        <div class="stat"><div class="num" style="font-size:22px">${el.max_amount ? naira(el.max_amount, 0) : "-"}</div><div class="lbl">Most you can ask for</div></div></div>
      ${el.eligible
        ? `<div class="toolbar"><span class="muted">Up to ${s.max_pct}% of your monthly pay, repaid over 1 to ${s.max_repay_months} months straight from your payslip.</span><button class="btn spacer" id="new" type="button">Request an advance</button></div>`
        : `<div class="card"><p class="muted" style="margin:0">${esc(el.reason)}</p></div>`}
      ${r.advances.length ? `<div class="table-wrap"><table class="data"><thead><tr><th>Requested</th><th class="num">Amount</th><th>Repaid over</th><th>Status</th><th class="num">Balance</th><th></th></tr></thead><tbody>
        ${r.advances.map((a) => `<tr class="click" data-open="${esc(a.id)}"><td>${esc(formatDate(a.created_at.slice(0, 10)))}<div class="muted">${esc(a.reason)}</div></td><td class="num"><strong>${naira(a.amount)}</strong></td>
          <td>${a.repay_months} month${a.repay_months === 1 ? "" : "s"}<div class="muted">${naira(a.monthly_deduction)} a month</div></td>
          <td>${badge(a.status)}${a.decision_note && a.status !== "cancelled" ? `<div class="muted" style="font-size:12px">${esc(a.decision_note)}</div>` : ""}</td>
          <td class="num">${a.status === "repaying" ? naira(a.balance) : ""}</td>
          <td style="text-align:right">${a.status === "submitted" ? `<button class="btn btn-ghost btn-sm" data-cancel="${esc(a.id)}" type="button">Cancel</button>` : ""}</td></tr>`).join("")}</tbody></table></div>`
        : `<div class="card empty">You have not asked for a salary advance yet.</div>`}`;
    const nw = panel.querySelector("#new");
    if (nw) nw.addEventListener("click", () => requestModal(r));
    panel.querySelectorAll("[data-open]").forEach((tr) => tr.addEventListener("click", (e) => { if (!e.target.closest("button")) detail(tr.dataset.open); }));
    panel.querySelectorAll("[data-cancel]").forEach((b) => b.addEventListener("click", async () => {
      if (!(await confirmDialog("Cancel this request?", { okText: "Cancel request", danger: true }))) return;
      try { await call("advances.cancel", { id: b.dataset.cancel }); toast("Request cancelled."); mineTab(); } catch (err) { toast(err.message, "error"); }
    }));
  }

  function requestModal(r) {
    const s = r.settings, el = r.eligibility;
    const m = openModal({
      title: "Request a salary advance", narrow: true,
      html: `<div id="m-msg" class="alert alert-error" hidden></div><form id="adv-form" novalidate>
        <div class="field"><label class="required" for="a-amt">Amount (&#8358;)</label><input id="a-amt" name="amount" inputmode="decimal" placeholder="For example 100000"><div class="hint">From ${naira(r.min_amount, 0)} up to ${naira(el.max_amount, 0)}.</div></div>
        <div class="field"><label class="required" for="a-mon">Repay over</label><select id="a-mon" name="repay_months">${Array.from({ length: s.max_repay_months }, (_, i) => `<option value="${i + 1}">${i + 1} month${i ? "s" : ""}</option>`).join("")}</select></div>
        <div id="a-calc" class="alert alert-info" hidden></div>
        <div class="field"><label class="required" for="a-why">Reason</label><textarea id="a-why" name="reason" rows="3" maxlength="300" placeholder="For example: School fees for the new term"></textarea></div></form>`,
      footer: `<button class="btn btn-ghost" data-close type="button">Cancel</button><button class="btn" type="submit" form="adv-form" id="a-save">Send request</button>`,
    });
    const f = m.el.querySelector("#adv-form"), calc = m.el.querySelector("#a-calc");
    const preview = () => {
      const amount = Number(String(f.amount.value).replace(/[, ]/g, "")), months = Number(f.repay_months.value);
      if (!(amount >= r.min_amount)) { calc.hidden = true; return; }
      const per = Math.ceil(amount / months), cap = el.monthly_gross * s.max_deduction_pct / 100;
      calc.hidden = false;
      calc.className = "alert " + (per > cap || amount > el.max_amount ? "alert-error" : "alert-info");
      calc.textContent = per > cap
        ? `That would take ${naira(per, 0)} from your pay each month, which is more than the ${s.max_deduction_pct}% allowed. Choose more months or a smaller amount.`
        : `${naira(per, 0)} a month will be taken from your payslip for ${months} month${months === 1 ? "" : "s"}.`;
    };
    f.amount.addEventListener("input", preview);
    f.repay_months.addEventListener("change", preview);
    f.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const btn = m.el.querySelector("#a-save"), msg = m.el.querySelector("#m-msg");
      msg.hidden = true; btn.disabled = true;
      try {
        await call("advances.request", { amount: f.amount.value.replace(/[, ]/g, ""), repay_months: f.repay_months.value, reason: f.reason.value });
        m.close(); toast("Request sent."); mineTab();
      } catch (err) { msg.textContent = err.message; msg.hidden = false; btn.disabled = false; }
    });
  }

  // ---------------------------------------------------------------- requests (HR and owner)
  let status = "";
  async function requestsTab() {
    loading(panel);
    try { renderRequests(await call("advances.list", { status })); } catch (err) { fail(err, "Could not load the requests."); }
  }

  function renderRequests(r) {
    const t = r.totals;
    panel.innerHTML = `
      <div class="stats compact">
        <div class="stat${t.awaiting_decision ? " accent" : ""}"><div class="num">${t.awaiting_decision}</div><div class="lbl">Waiting for a decision</div></div>
        <div class="stat${t.awaiting_payment ? " accent" : ""}"><div class="num">${t.awaiting_payment}</div><div class="lbl">Approved, to be paid out</div></div>
        <div class="stat"><div class="num">${t.repaying}</div><div class="lbl">Being repaid</div></div>
        <div class="stat"><div class="num" style="font-size:22px">${naira(t.outstanding, 0)}</div><div class="lbl">Owed back to the company</div></div></div>
      <div class="toolbar"><span class="muted">Repayments come off each payslip automatically when a payroll run is built and approved.</span>
        <select id="status" class="spacer" aria-label="Filter by status">${[["", "All"], ["submitted", "Waiting for approval"], ["approved", "Approved, to be paid"], ["repaying", "Being repaid"], ["cleared", "Fully repaid"], ["rejected", "Rejected"], ["cancelled", "Cancelled"]].map(([v, l]) => `<option value="${v}"${v === status ? " selected" : ""}>${l}</option>`).join("")}</select></div>
      ${r.advances.length ? `<div class="table-wrap"><table class="data"><thead><tr><th>Employee</th><th class="num">Amount</th><th>Repaid over</th><th>Status</th><th class="num">Balance</th><th></th></tr></thead><tbody>
        ${r.advances.map((a) => `<tr class="click" data-open="${esc(a.id)}"><td><strong>${esc(a.employee_name)}</strong><div class="muted">${esc(formatDate(a.created_at.slice(0, 10)))} &middot; ${esc(a.reason)}</div></td><td class="num"><strong>${naira(a.amount)}</strong></td>
          <td>${a.repay_months} month${a.repay_months === 1 ? "" : "s"}<div class="muted">${naira(a.monthly_deduction)} a month</div></td>
          <td>${badge(a.status)}${a.decision_note ? `<div class="muted" style="font-size:12px">${esc(a.decision_note)}</div>` : ""}</td>
          <td class="num">${a.status === "repaying" ? naira(a.balance) : ""}</td>
          <td style="text-align:right;white-space:nowrap">
            ${a.can_decide ? `<button class="btn btn-sm" data-approve="${esc(a.id)}" type="button">Approve</button><button class="btn btn-ghost btn-sm" data-reject="${esc(a.id)}" type="button">Reject</button>` : ""}
            ${a.can_disburse ? `<button class="btn btn-sm" data-pay="${esc(a.id)}" type="button">Mark as paid</button>` : ""}
            ${a.can_cancel ? `<button class="btn btn-ghost btn-sm" data-cancel="${esc(a.id)}" type="button">Cancel</button>` : ""}</td></tr>`).join("")}</tbody></table></div>`
        : `<div class="card empty">Nothing here.</div>`}`;
    panel.querySelector("#status").addEventListener("change", (e) => { status = e.target.value; requestsTab(); });
    panel.querySelectorAll("[data-open]").forEach((tr) => tr.addEventListener("click", (e) => { if (!e.target.closest("button")) detail(tr.dataset.open); }));
    const find = (id) => r.advances.find((x) => x.id === id);
    panel.querySelectorAll("[data-approve]").forEach((b) => b.addEventListener("click", () => decide(find(b.dataset.approve), "approved")));
    panel.querySelectorAll("[data-reject]").forEach((b) => b.addEventListener("click", () => decide(find(b.dataset.reject), "rejected")));
    panel.querySelectorAll("[data-pay]").forEach((b) => b.addEventListener("click", () => pay(find(b.dataset.pay))));
    panel.querySelectorAll("[data-cancel]").forEach((b) => b.addEventListener("click", async () => {
      if (!(await confirmDialog("Cancel this request?", { okText: "Cancel request", danger: true }))) return;
      try { await call("advances.cancel", { id: b.dataset.cancel }); toast("Request cancelled."); requestsTab(); } catch (err) { toast(err.message, "error"); }
    }));
  }

  function decide(a, decision) {
    const approve = decision === "approved";
    const m = openModal({
      title: approve ? "Approve salary advance" : "Reject salary advance", narrow: true,
      html: `<div id="m-msg" class="alert alert-error" hidden></div><p><strong>${esc(a.employee_name)}</strong> asks for ${naira(a.amount)}, repaid over ${a.repay_months} month${a.repay_months === 1 ? "" : "s"} (${naira(a.monthly_deduction)} a month).<br><span class="muted">${esc(a.reason)}</span></p>
        <form id="d-form" novalidate><div class="field"><label for="d-note">${approve ? "Note (optional)" : "Reason for rejecting"}</label><input id="d-note" name="note" maxlength="300"></div></form>`,
      footer: `<button class="btn btn-ghost" data-close type="button">Cancel</button><button class="btn${approve ? "" : " btn-danger"}" type="submit" form="d-form">${approve ? "Approve" : "Reject"}</button>`,
    });
    m.el.querySelector("#d-form").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      try { await call("advances.decide", { id: a.id, decision, note: ev.target.note.value }); m.close(); toast(approve ? "Request approved." : "Request rejected."); requestsTab(); }
      catch (err) { const e = m.el.querySelector("#m-msg"); e.textContent = err.message; e.hidden = false; }
    });
  }

  function pay(a) {
    const m = openModal({
      title: "Mark as paid", narrow: true,
      html: `<div id="m-msg" class="alert alert-error" hidden></div><p>${naira(a.amount)} to <strong>${esc(a.employee_name)}</strong>, taken back as ${naira(a.monthly_deduction)} a month over ${a.repay_months} month${a.repay_months === 1 ? "" : "s"}.</p>
        <form id="pd-form" novalidate>
          <div class="field"><label for="pd-date">Date paid</label><input id="pd-date" name="paid_on" type="date" value="${todayLagos()}" max="${todayLagos()}"></div>
          <div class="field"><label for="pd-ref">Payment reference (optional)</label><input id="pd-ref" name="payment_ref" maxlength="60"></div>
          <div class="field"><label for="pd-start">First repayment month (optional)</label><input id="pd-start" name="repay_start" type="month"><div class="hint">Leave blank to start with the first payroll run that is not yet approved.</div></div></form>`,
      footer: `<button class="btn btn-ghost" data-close type="button">Cancel</button><button class="btn" type="submit" form="pd-form">Mark as paid</button>`,
    });
    m.el.querySelector("#pd-form").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const f = ev.target;
      try { await call("advances.disburse", { id: a.id, paid_on: f.paid_on.value, payment_ref: f.payment_ref.value, repay_start: f.repay_start.value }); m.close(); toast("Marked as paid."); requestsTab(); }
      catch (err) { const e = m.el.querySelector("#m-msg"); e.textContent = err.message; e.hidden = false; }
    });
  }

  // ---------------------------------------------------------------- rules (HR and owner)
  async function rulesTab() {
    loading(panel);
    try {
      const s = await call("advances.settingsGet");
      panel.innerHTML = `<div class="card" style="max-width:560px"><h2>Rules</h2><div id="s-msg" hidden></div><form id="set-form" novalidate>
        <div class="field"><label for="s-pct">The most an advance can be (% of monthly pay)</label><input id="s-pct" name="max_pct" inputmode="numeric" value="${s.max_pct}"></div>
        <div class="field"><label for="s-mon">The longest repayment period (months)</label><input id="s-mon" name="max_repay_months" inputmode="numeric" value="${s.max_repay_months}"></div>
        <div class="field"><label for="s-ded">The most taken from pay each month (% of monthly pay)</label><input id="s-ded" name="max_deduction_pct" inputmode="numeric" value="${s.max_deduction_pct}"><div class="hint">This protects staff from taking home too little.</div></div>
        <div class="field"><label for="s-srv">Months of service needed before someone can ask</label><input id="s-srv" name="min_service_months" inputmode="numeric" value="${s.min_service_months}"></div>
        <p class="muted">Each person can have one advance at a time. HR or the owner approves it, and nobody approves their own request except the owner.</p>
        <button class="btn" type="submit">Save rules</button></form></div>`;
      panel.querySelector("#set-form").addEventListener("submit", async (ev) => {
        ev.preventDefault();
        const f = ev.target, msg = panel.querySelector("#s-msg");
        msg.hidden = true;
        try {
          await call("advances.settingsSave", { max_pct: f.max_pct.value, max_repay_months: f.max_repay_months.value, max_deduction_pct: f.max_deduction_pct.value, min_service_months: f.min_service_months.value });
          toast("Rules saved.");
        } catch (err) { msg.className = "alert alert-error"; msg.textContent = err.message; msg.hidden = false; }
      });
    } catch (err) { fail(err, "Could not load the rules."); }
  }

  show();
}
