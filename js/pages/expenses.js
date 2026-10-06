import { call, ApiError } from "../api.js";
import { initPage, loading, errorBox, canManageStaff } from "../layout.js";
import { esc, openModal, confirmDialog, toast, formatDate, tabBar, bindTabs, fileToBase64, saveBase64, todayLagos, thisMonth, shiftMonth, monthLabel } from "../ui.js";
import { naira } from "../money.js";

const page = initPage({ active: "expenses", title: "Expenses" });
if (page) run(page);

const LABEL = { submitted: "Waiting for approval", approved: "Approved", rejected: "Rejected", paid: "Paid", cancelled: "Cancelled" };
const MAX = 4 * 1024 * 1024;

async function run({ role, content }) {
  const isHr = canManageStaff(role);
  const isApprover = isHr || role === "manager";
  const tabs = [{ id: "mine", label: "My claims" }];
  if (isApprover) tabs.push({ id: "approvals", label: isHr ? "All claims" : "Team claims" });
  if (isHr) tabs.push({ id: "summary", label: "Summary" });
  const wanted = new URLSearchParams(location.search).get("tab");
  let active = tabs.some((t) => t.id === wanted) ? wanted : "mine";
  let settings = null;

  content.innerHTML = `<div id="tabs">${tabBar(tabs, active)}</div><div id="panel"></div>`;
  const panel = content.querySelector("#panel");
  bindTabs(content.querySelector("#tabs"), (id) => { active = id; show(); });
  function show() { if (active === "mine") mineTab(); else if (active === "approvals") approvalsTab(); else summaryTab(); }
  const fail = (err, text) => errorBox(panel, err instanceof ApiError ? err.message : text);
  const badge = (s) => `<span class="badge ${esc(s)}">${esc(LABEL[s] || s)}</span>`;

  async function downloadReceipt(claimId) {
    try { const f = await call("expenses.receipt", { id: claimId }); saveBase64(f.name, f.mimeType, f.data); } catch (err) { toast(err.message, "error"); }
  }

  // ------------------------------------------------------------ my claims
  async function mineTab() {
    loading(panel);
    try {
      const [r, s] = await Promise.all([call("expenses.mine"), call("expenses.settingsGet")]);
      settings = s;
      render(r);
    } catch (err) { fail(err, "Could not load your claims."); }
  }

  function render(r) {
    if (!r.linked) { panel.innerHTML = `<div class="card"><h2>Your login is not linked to an employee record</h2><p class="muted">Ask HR to link it so you can claim expenses.</p></div>`; return; }
    panel.innerHTML = `
      <div class="stats compact">
        <div class="stat"><div class="num" style="font-size:22px">${naira(r.totals.waiting)}</div><div class="lbl">Waiting for approval</div></div>
        <div class="stat"><div class="num" style="font-size:22px">${naira(r.totals.to_be_paid)}</div><div class="lbl">Approved, to be paid</div></div>
        <div class="stat"><div class="num" style="font-size:22px">${naira(r.totals.paid_this_year)}</div><div class="lbl">Paid this year</div></div></div>
      <div class="toolbar"><span class="muted">Claim within ${settings.max_age_days} days of the expense. A receipt is needed from ${naira(settings.receipt_above, 0)}.</span><button class="btn spacer" id="new" type="button">New claim</button></div>
      ${r.claims.length ? `<div class="table-wrap"><table class="data"><thead><tr><th>Date</th><th>Claim</th><th class="num">Amount</th><th>Status</th><th></th></tr></thead><tbody>
        ${r.claims.map((x) => `<tr><td>${esc(formatDate(x.date))}</td><td><strong>${esc(x.description)}</strong><div class="muted">${esc(x.category)}</div></td><td class="num">${naira(x.amount)}</td>
          <td>${badge(x.status)}${x.decision_note && x.status !== "cancelled" ? `<div class="muted" style="font-size:12px">${esc(x.decision_note)}</div>` : ""}${x.status === "paid" ? `<div class="muted" style="font-size:12px">${esc(formatDate(x.paid_on))}</div>` : ""}</td>
          <td style="text-align:right;white-space:nowrap">${x.has_receipt ? `<button class="btn btn-ghost btn-sm" data-receipt="${esc(x.id)}" type="button">Receipt</button>` : x.status === "submitted" ? `<label class="btn btn-ghost btn-sm" for="att-${esc(x.id)}" style="margin:0">Add receipt</label><input id="att-${esc(x.id)}" data-attach="${esc(x.id)}" type="file" accept=".pdf,.png,.jpg,.jpeg" hidden>` : ""}
            ${x.status === "submitted" ? `<button class="btn btn-ghost btn-sm" data-cancel="${esc(x.id)}" type="button">Cancel</button>` : ""}</td></tr>`).join("")}</tbody></table></div>`
        : `<div class="card empty">No claims yet.</div>`}`;
    panel.querySelector("#new").addEventListener("click", newClaim);
    panel.querySelectorAll("[data-receipt]").forEach((b) => b.addEventListener("click", () => downloadReceipt(b.dataset.receipt)));
    panel.querySelectorAll("[data-cancel]").forEach((b) => b.addEventListener("click", async () => {
      if (!(await confirmDialog("Cancel this claim?", { okText: "Cancel claim", danger: true }))) return;
      try { await call("expenses.cancel", { id: b.dataset.cancel }); toast("Claim cancelled."); mineTab(); } catch (err) { toast(err.message, "error"); }
    }));
    panel.querySelectorAll("[data-attach]").forEach((inp) => inp.addEventListener("change", async () => {
      const f = inp.files[0];
      if (!f) return;
      if (f.size > MAX) return toast("That file is larger than 4 MB.", "error");
      try { await call("expenses.attachReceipt", { id: inp.dataset.attach, fileName: f.name, data: await fileToBase64(f) }); toast("Receipt added."); mineTab(); } catch (err) { toast(err.message, "error"); }
    }));
  }

  function newClaim() {
    const m = openModal({
      title: "New expense claim", narrow: true,
      html: `<div id="m-msg" class="alert alert-error" hidden></div><form id="claim-form" novalidate>
        <div class="field"><label class="required" for="x-date">Date of expense</label><input id="x-date" name="date" type="date" value="${todayLagos()}" max="${todayLagos()}"></div>
        <div class="field"><label class="required" for="x-cat">Category</label><select id="x-cat" name="category">${settings.categories.map((c) => `<option>${esc(c)}</option>`).join("")}</select></div>
        <div class="field"><label class="required" for="x-desc">What was it for?</label><input id="x-desc" name="description" maxlength="200" placeholder="For example: Taxi to client meeting"></div>
        <div class="field"><label class="required" for="x-amt">Amount (&#8358;)</label><input id="x-amt" name="amount" inputmode="decimal"></div>
        <div class="field"><label for="x-rc">Receipt (PDF, PNG or JPG, up to 4 MB)</label><input id="x-rc" name="receipt" type="file" accept=".pdf,.png,.jpg,.jpeg"><div class="hint" id="rc-hint">Required for claims of ${naira(settings.receipt_above, 0)} or more.</div></div></form>`,
      footer: `<button class="btn btn-ghost" data-close type="button">Cancel</button><button class="btn" type="submit" form="claim-form" id="x-save">Submit claim</button>`,
    });
    m.el.querySelector("#claim-form").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const f = ev.target, btn = m.el.querySelector("#x-save"), msg = m.el.querySelector("#m-msg");
      msg.hidden = true;
      const file = f.receipt.files[0];
      if (file && file.size > MAX) { msg.textContent = "The receipt is larger than 4 MB."; msg.hidden = false; return; }
      btn.disabled = true;
      try {
        const receipt = file ? { fileName: file.name, data: await fileToBase64(file) } : null;
        await call("expenses.submit", { date: f.date.value, category: f.category.value, description: f.description.value, amount: f.amount.value, receipt });
        m.close(); toast("Claim submitted."); mineTab();
      } catch (err) { msg.textContent = err.message; msg.hidden = false; btn.disabled = false; }
    });
  }

  // ------------------------------------------------------------ approvals
  let status = "submitted";
  async function approvalsTab() {
    loading(panel);
    try {
      const [list, s] = await Promise.all([call("expenses.list", { status }), call("expenses.settingsGet")]);
      settings = s;
      renderApprovals(list);
    } catch (err) { fail(err, "Could not load claims."); }
  }

  function renderApprovals(list) {
    const payable = list.filter((x) => x.status === "approved");
    panel.innerHTML = `
      <div class="toolbar"><span class="muted">${isHr ? "Every claim in the company." : `Claims from your team. You can approve up to ${naira(settings.manager_limit, 0)}; larger claims go to HR.`}</span>
        <select id="status" class="spacer" aria-label="Filter by status">${[["submitted", "Waiting for approval"], ["approved", "Approved, to be paid"], ["paid", "Paid"], ["rejected", "Rejected"], ["cancelled", "Cancelled"], ["", "All"]].map(([v, l]) => `<option value="${v}"${v === status ? " selected" : ""}>${l}</option>`).join("")}</select>
        ${isHr && status === "approved" && payable.length ? `<button class="btn btn-sm" id="pay" type="button">Mark selected as paid</button>` : ""}</div>
      ${list.length ? `<div class="table-wrap"><table class="data"><thead><tr>${isHr && status === "approved" ? '<th><input type="checkbox" id="all" aria-label="Select all"></th>' : ""}<th>Employee</th><th>Claim</th><th class="num">Amount</th><th>Status</th><th></th></tr></thead><tbody>
        ${list.map((x) => `<tr>${isHr && status === "approved" ? `<td><input type="checkbox" data-pick="${esc(x.id)}" aria-label="Select"></td>` : ""}
          <td><strong>${esc(x.employee_name)}</strong><div class="muted">${esc(formatDate(x.date))}</div></td>
          <td>${esc(x.description)}<div class="muted">${esc(x.category)}</div></td><td class="num"><strong>${naira(x.amount)}</strong></td>
          <td>${badge(x.status)}${x.needs_hr ? '<div class="muted" style="font-size:12px">Above your limit: HR must approve</div>' : ""}${x.decision_note ? `<div class="muted" style="font-size:12px">${esc(x.decision_note)}</div>` : ""}</td>
          <td style="text-align:right;white-space:nowrap">${x.has_receipt ? `<button class="btn btn-ghost btn-sm" data-receipt="${esc(x.id)}" type="button">Receipt</button>` : '<span class="muted" style="font-size:12px">No receipt</span>'}
            ${x.can_decide ? `<button class="btn btn-sm" data-approve="${esc(x.id)}" type="button">Approve</button><button class="btn btn-ghost btn-sm" data-reject="${esc(x.id)}" type="button">Reject</button>` : ""}
            ${isHr && (x.status === "submitted" || x.status === "approved") ? `<button class="btn btn-ghost btn-sm" data-cancel="${esc(x.id)}" type="button">Cancel</button>` : ""}</td></tr>`).join("")}</tbody></table></div>`
        : `<div class="card empty">Nothing here.</div>`}`;
    panel.querySelector("#status").addEventListener("change", (e) => { status = e.target.value; approvalsTab(); });
    panel.querySelectorAll("[data-receipt]").forEach((b) => b.addEventListener("click", () => downloadReceipt(b.dataset.receipt)));
    panel.querySelectorAll("[data-approve]").forEach((b) => b.addEventListener("click", () => decide(list.find((x) => x.id === b.dataset.approve), "approved")));
    panel.querySelectorAll("[data-reject]").forEach((b) => b.addEventListener("click", () => decide(list.find((x) => x.id === b.dataset.reject), "rejected")));
    panel.querySelectorAll("[data-cancel]").forEach((b) => b.addEventListener("click", async () => {
      if (!(await confirmDialog("Cancel this claim?", { okText: "Cancel claim", danger: true }))) return;
      try { await call("expenses.cancel", { id: b.dataset.cancel }); toast("Claim cancelled."); approvalsTab(); } catch (err) { toast(err.message, "error"); }
    }));
    const all = panel.querySelector("#all");
    if (all) all.addEventListener("change", () => panel.querySelectorAll("[data-pick]").forEach((c) => { c.checked = all.checked; }));
    const pay = panel.querySelector("#pay");
    if (pay) pay.addEventListener("click", () => markPaid(list));
  }

  function decide(x, decision) {
    const approve = decision === "approved";
    const m = openModal({
      title: approve ? "Approve claim" : "Reject claim", narrow: true,
      html: `<div id="m-msg" class="alert alert-error" hidden></div><p><strong>${esc(x.employee_name)}</strong>: ${esc(x.description)}<br>${naira(x.amount)} &middot; ${esc(formatDate(x.date))}</p>
        <form id="d-form" novalidate><div class="field"><label for="d-note">${approve ? "Note (optional)" : "Reason for rejecting"}</label><input id="d-note" name="note" maxlength="300"></div></form>`,
      footer: `<button class="btn btn-ghost" data-close type="button">Cancel</button><button class="btn${approve ? "" : " btn-danger"}" type="submit" form="d-form">${approve ? "Approve" : "Reject"}</button>`,
    });
    m.el.querySelector("#d-form").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      try { await call("expenses.decide", { id: x.id, decision, note: ev.target.note.value }); m.close(); toast(approve ? "Claim approved." : "Claim rejected."); approvalsTab(); }
      catch (err) { const e = m.el.querySelector("#m-msg"); e.textContent = err.message; e.hidden = false; }
    });
  }

  function markPaid(list) {
    const ids = [...panel.querySelectorAll("[data-pick]:checked")].map((c) => c.dataset.pick);
    if (!ids.length) return toast("Tick the claims you have paid.", "error");
    const total = list.filter((x) => ids.includes(x.id)).reduce((a, x) => a + x.amount, 0);
    const m = openModal({
      title: "Mark as paid", narrow: true,
      html: `<div id="m-msg" class="alert alert-error" hidden></div><p>${ids.length} claim${ids.length === 1 ? "" : "s"}, ${naira(total)} in total.</p><form id="pd-form" novalidate>
        <div class="field"><label for="pd-date">Date paid</label><input id="pd-date" name="paid_on" type="date" value="${todayLagos()}" max="${todayLagos()}"></div>
        <div class="field"><label for="pd-ref">Payment reference (optional)</label><input id="pd-ref" name="payment_ref" maxlength="60"></div></form>`,
      footer: `<button class="btn btn-ghost" data-close type="button">Cancel</button><button class="btn" type="submit" form="pd-form">Mark as paid</button>`,
    });
    m.el.querySelector("#pd-form").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      try { await call("expenses.markPaid", { ids, paid_on: ev.target.paid_on.value, payment_ref: ev.target.payment_ref.value }); m.close(); toast("Marked as paid."); approvalsTab(); }
      catch (err) { const e = m.el.querySelector("#m-msg"); e.textContent = err.message; e.hidden = false; }
    });
  }

  // ------------------------------------------------------------ summary and settings (HR)
  let month = thisMonth();
  let allTime = false;
  async function summaryTab() {
    loading(panel);
    try {
      const [sum, s] = await Promise.all([call("expenses.summary", { month: allTime ? "" : month }), call("expenses.settingsGet")]);
      const rows = (map) => Object.keys(map).sort().map((k) => `<tr><td>${esc(LABEL[k] || k)}</td><td class="num">${map[k].count}</td><td class="num">${naira(map[k].amount)}</td></tr>`).join("") || '<tr><td colspan="3" class="muted">Nothing yet</td></tr>';
      panel.innerHTML = `
        <div class="month-nav"><button class="btn btn-ghost btn-sm" id="prev" type="button"${allTime ? " disabled" : ""} aria-label="Previous month">&larr;</button><strong>${allTime ? "All time" : esc(monthLabel(month))}</strong>
          <button class="btn btn-ghost btn-sm" id="next" type="button"${allTime ? " disabled" : ""} aria-label="Next month">&rarr;</button>
          <button class="btn btn-ghost btn-sm" id="all" type="button">${allTime ? "Show a month" : "Show all time"}</button></div>
        <div class="two-col"><div class="card"><h2>By status (${sum.claims} claims)</h2><table class="data"><thead><tr><th>Status</th><th class="num">Claims</th><th class="num">Amount</th></tr></thead><tbody>${rows(sum.by_status)}</tbody></table></div>
          <div class="card"><h2>Approved and paid, by category</h2><table class="data"><thead><tr><th>Category</th><th class="num">Claims</th><th class="num">Amount</th></tr></thead><tbody>${rows(sum.by_category)}</tbody></table></div></div>
        <div class="card" style="max-width:560px"><h2>Rules</h2><div id="s-msg" hidden></div><form id="set-form" novalidate>
          <div class="field"><label for="s-rc">A receipt is required from (&#8358;)</label><input id="s-rc" name="receipt_above" inputmode="decimal" value="${s.receipt_above}"><div class="hint">Use 0 to require a receipt on every claim.</div></div>
          <div class="field"><label for="s-lim">Managers can approve up to (&#8358;)</label><input id="s-lim" name="manager_limit" inputmode="decimal" value="${s.manager_limit}"><div class="hint">Larger claims wait for HR or the owner. Use 0 so only HR approves.</div></div>
          <button class="btn" type="submit">Save rules</button></form></div>`;
      panel.querySelector("#prev").addEventListener("click", () => { month = shiftMonth(month, -1); summaryTab(); });
      panel.querySelector("#next").addEventListener("click", () => { month = shiftMonth(month, 1); summaryTab(); });
      panel.querySelector("#all").addEventListener("click", () => { allTime = !allTime; summaryTab(); });
      panel.querySelector("#set-form").addEventListener("submit", async (ev) => {
        ev.preventDefault();
        const msg = panel.querySelector("#s-msg");
        msg.hidden = true;
        try { await call("expenses.settingsSave", { receipt_above: ev.target.receipt_above.value, manager_limit: ev.target.manager_limit.value }); toast("Rules saved."); }
        catch (err) { msg.className = "alert alert-error"; msg.textContent = err.message; msg.hidden = false; }
      });
    } catch (err) { fail(err, "Could not load the summary."); }
  }

  show();
}
