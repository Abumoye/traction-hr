import { call, ApiError } from "../api.js";
import { initPage, loading, errorBox } from "../layout.js";
import { esc, openModal, confirmDialog, toast, formatDate, monthLabel, STATUS_LABELS, todayLagos } from "../ui.js";
import { naira, downloadCsv } from "../money.js";

const runId = new URLSearchParams(location.search).get("id");
const page = initPage({ active: "payroll", title: "Payroll run" });
if (page) run(page);

async function run({ role, content }) {
  if (!runId) return errorBox(content, "No payroll run was chosen.");
  const isOwner = role === "owner";
  let data = null;

  async function load() {
    loading(content);
    try {
      data = await call("payroll.runsGet", { id: runId });
      render();
    } catch (err) {
      errorBox(content, err instanceof ApiError ? err.message : "Could not load this run.");
    }
  }

  function render() {
    const d = data, t = d.totals, draft = d.status === "draft";
    const other = (l) => l.nhf + l.hmo + l.other_deduction + l.loan_repayment + l.penalty;
    document.title = `${monthLabel(d.period)} payroll | Traction Outsourcing HR`;
    content.innerHTML = `
      <div class="toolbar">
        <a class="btn btn-ghost btn-sm" href="payroll.html">&larr; All runs</a>
        <h2 style="margin:0">${esc(monthLabel(d.period))}</h2><span class="badge ${esc(d.status)}">${esc(STATUS_LABELS[d.status] || d.status)}</span>
        <span class="spacer" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
          ${draft ? `<button class="btn btn-ghost btn-sm" id="recalc" type="button">Recalculate</button>
            <button class="btn btn-ghost btn-sm" id="add" type="button">Add employee</button>
            <button class="btn btn-ghost btn-sm" id="del" type="button">Delete run</button>
            ${d.can_approve ? `<button class="btn btn-sm" id="approve" type="button">Approve</button>` : ""}` : ""}
          ${d.status === "approved" ? `<button class="btn btn-sm" id="paid" type="button">Mark as paid</button>${isOwner ? `<button class="btn btn-ghost btn-sm" id="reopen" type="button">Reopen</button>` : ""}` : ""}
          <span class="menu-wrap"><button class="btn btn-ghost btn-sm" id="export" type="button" aria-haspopup="true">Export</button></span>
        </span>
      </div>
      ${draft ? `<div class="alert alert-info">This run is a draft: staff cannot see their payslips yet. ${d.can_approve ? "Check the figures, then approve it." : "Another person (the owner or a different HR admin) must approve it."}</div>` : ""}
      ${d.status === "approved" ? `<div class="alert alert-ok">Approved by ${esc(d.approved_by)} on ${esc(formatDate(d.approved_at.slice(0, 10)))}. Payslips are visible to staff.</div>` : ""}
      ${d.status === "paid" ? `<div class="alert alert-ok">Paid on ${esc(formatDate(d.paid_on))}. This run is final.</div>` : ""}
      ${t.negative_net ? `<div class="alert alert-error">${t.negative_net} payslip${t.negative_net === 1 ? " has" : "s have"} a negative net pay (highlighted). Fix before approving.</div>` : ""}
      <div class="stats compact money">
        <div class="stat"><div class="num">${t.employees}</div><div class="lbl">Staff paid</div></div>
        <div class="stat"><div class="num" style="font-size:22px">${naira(t.gross_pay)}</div><div class="lbl">Gross pay</div></div>
        <div class="stat"><div class="num" style="font-size:22px">${naira(t.paye)}</div><div class="lbl">PAYE to remit</div></div>
        <div class="stat"><div class="num" style="font-size:22px">${naira(t.pension_employee + t.pension_employer)}</div><div class="lbl">Pension (${naira(t.pension_employee, 0)} + ${naira(t.pension_employer, 0)} employer)</div></div>
        <div class="stat accent"><div class="num" style="font-size:22px">${naira(t.net_pay)}</div><div class="lbl">Net pay</div></div>
      </div>
      <div class="table-wrap"><table class="data"><thead><tr><th>Employee</th><th class="num">Days</th><th class="num">Gross pay</th><th class="num">Pension</th><th class="num">PAYE</th><th class="num">Other deductions</th><th class="num">Net pay</th><th></th></tr></thead><tbody>
        ${d.lines.map((l) => `<tr class="${l.net_pay < 0 ? "neg" : ""}"><td><strong>${esc(l.employee_name)}</strong><div class="muted">${esc(l.employee_no)}${l.job_title ? " &middot; " + esc(l.job_title) : ""}</div></td>
          <td class="num">${l.days_worked}/${l.days_in_month}</td><td class="num">${naira(l.gross_pay)}${l.bonus + l.perf_reward ? `<div class="muted" style="font-size:12px">incl. ${naira(l.bonus + l.perf_reward)} bonus</div>` : ""}</td>
          <td class="num">${naira(l.pension_employee)}</td><td class="num">${naira(l.paye)}</td>
          <td class="num">${naira(other(l))}${l.penalty ? `<div class="muted" style="font-size:12px">${esc(l.penalty_reason)}</div>` : ""}</td>
          <td class="num"><strong>${naira(l.net_pay)}</strong></td>
          <td style="text-align:right;white-space:nowrap"><a class="btn btn-ghost btn-sm" href="payslip.html?id=${encodeURIComponent(l.id)}">Payslip</a>
            ${draft ? `<button class="btn btn-ghost btn-sm" data-edit="${esc(l.id)}" type="button">Edit</button><button class="btn btn-ghost btn-sm" data-remove="${esc(l.id)}" type="button">Remove</button>` : ""}</td></tr>`).join("")}
      </tbody></table></div>`;

    const on = (id, fn) => { const el = content.querySelector("#" + id); if (el) el.addEventListener("click", fn); };
    on("recalc", recalc); on("add", addEmployee); on("del", del); on("approve", approve); on("paid", markPaid); on("reopen", reopen);
    on("export", openExportMenu);
    content.querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", () => editLine(d.lines.find((l) => l.id === b.dataset.edit))));
    content.querySelectorAll("[data-remove]").forEach((b) => b.addEventListener("click", () => removeLine(d.lines.find((l) => l.id === b.dataset.remove))));
  }

  async function act(fn, okText) {
    try { await fn(); if (okText) toast(okText); load(); } catch (err) { toast(err.message, "error"); }
  }

  const recalc = () => act(async () => {
    const r = await call("payroll.runsRecalculate", { id: runId });
    if (r.problems.length) toast(r.problems.join("; "), "error");
  }, "Recalculated from the latest salary records.");

  async function approve() {
    if (!(await confirmDialog(`Approve the ${monthLabel(data.period)} payroll? Staff will be able to see their payslips and the run can no longer be edited.`, { okText: "Approve" }))) return;
    act(() => call("payroll.runsApprove", { id: runId }), "Payroll approved.");
  }

  async function markPaid() {
    const m = openModal({
      title: "Mark as paid", narrow: true,
      html: `<div id="m-msg" class="alert alert-error" hidden></div><form id="paid-form" novalidate><div class="field"><label for="paid-on">Date paid</label><input id="paid-on" name="paid_on" type="date" value="${todayLagos()}" required></div>
        <p class="muted">A paid run is final and cannot be reopened.</p></form>`,
      footer: `<button class="btn btn-ghost" data-close type="button">Cancel</button><button class="btn" type="submit" form="paid-form">Mark as paid</button>`,
    });
    m.el.querySelector("#paid-form").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      try { await call("payroll.runsMarkPaid", { id: runId, paid_on: ev.target.paid_on.value }); m.close(); toast("Marked as paid."); load(); }
      catch (err) { const x = m.el.querySelector("#m-msg"); x.textContent = err.message; x.hidden = false; }
    });
  }

  async function reopen() {
    if (!(await confirmDialog("Reopen this run as a draft? Staff will stop seeing these payslips until it is approved again.", { okText: "Reopen" }))) return;
    act(() => call("payroll.runsReopen", { id: runId }), "Run reopened.");
  }

  async function del() {
    if (!(await confirmDialog(`Delete the ${monthLabel(data.period)} draft and all its payslips?`, { okText: "Delete", danger: true }))) return;
    try { await call("payroll.runsDelete", { id: runId }); location.href = "payroll.html"; } catch (err) { toast(err.message, "error"); }
  }

  async function removeLine(l) {
    if (!(await confirmDialog(`Remove ${l.employee_name} from this run?`, { okText: "Remove", danger: true }))) return;
    act(() => call("payroll.linesRemove", { runId, lineId: l.id }), "Removed. You can add them back later.");
  }

  async function addEmployee() {
    let list;
    try { list = (await call("payroll.structuresList")).filter((r) => r.has_salary && !data.lines.some((l) => l.employee_id === r.employee_id)); }
    catch (err) { return toast(err.message, "error"); }
    if (!list.length) return toast("Everyone with a salary record is already in this run.");
    const m = openModal({
      title: "Add employee to this run", narrow: true,
      html: `<div id="m-msg" class="alert alert-error" hidden></div><form id="add-form" novalidate><div class="field"><label for="add-emp">Employee</label>
        <select id="add-emp" name="employeeId">${list.map((r) => `<option value="${esc(r.employee_id)}">${esc(r.name)} (${esc(r.employee_no)})</option>`).join("")}</select></div></form>`,
      footer: `<button class="btn btn-ghost" data-close type="button">Cancel</button><button class="btn" type="submit" form="add-form">Add</button>`,
    });
    m.el.querySelector("#add-form").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      try { await call("payroll.linesAdd", { runId, employeeId: ev.target.employeeId.value }); m.close(); toast("Added."); load(); }
      catch (err) { const x = m.el.querySelector("#m-msg"); x.textContent = err.message; x.hidden = false; }
    });
  }

  function editLine(l) {
    const m = openModal({
      title: `Adjust payslip: ${l.employee_name}`,
      html: `<div id="m-msg" class="alert alert-error" hidden></div>
        <form id="line-form" novalidate>
          <div class="form-grid">
            <div class="field"><label for="l-days">Days worked (of ${l.days_in_month})</label><input id="l-days" name="days_worked" inputmode="numeric" value="${l.days_worked}"><div class="hint">Lower this for unpaid leave or a part month.</div></div>
            <div class="field"></div>
            <div class="field"><label for="l-bonus">Bonus (&#8358;)</label><input id="l-bonus" name="bonus" inputmode="decimal" value="${l.bonus}"></div>
            <div class="field"><label for="l-perf">Performance reward (&#8358;)</label><input id="l-perf" name="perf_reward" inputmode="decimal" value="${l.perf_reward}"></div>
            <div class="form-section">Deductions</div>
            <div class="field"><label for="l-nhf">NHF (&#8358;)</label><input id="l-nhf" name="nhf" inputmode="decimal" value="${l.nhf}"></div>
            <div class="field"><label for="l-hmo">HMO / life assurance (&#8358;)</label><input id="l-hmo" name="hmo" inputmode="decimal" value="${l.hmo}"></div>
            <div class="field"><label for="l-loan">Loan repayment (&#8358;)</label><input id="l-loan" name="loan_repayment" inputmode="decimal" value="${l.loan_repayment}"></div>
            <div class="field"><label for="l-other">Other deduction (&#8358;)</label><input id="l-other" name="other_deduction" inputmode="decimal" value="${l.other_deduction}"></div>
            <div class="field"><label for="l-pen">Penalty (&#8358;)</label><input id="l-pen" name="penalty" inputmode="decimal" value="${l.penalty}"></div>
            <div class="field"><label for="l-reason">Penalty reason</label><input id="l-reason" name="penalty_reason" maxlength="200" value="${esc(l.penalty_reason)}"></div>
          </div>
        </form>`,
      footer: `<button class="btn btn-ghost" data-close type="button">Cancel</button><button class="btn" type="submit" form="line-form">Save and recalculate</button>`,
    });
    m.el.querySelector("#line-form").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const f = ev.target;
      const patch = { runId, lineId: l.id };
      ["days_worked", "bonus", "perf_reward", "nhf", "hmo", "loan_repayment", "other_deduction", "penalty", "penalty_reason"].forEach((k) => { patch[k] = f[k].value; });
      try { await call("payroll.linesUpdate", patch); m.close(); toast("Payslip updated."); load(); }
      catch (err) { const x = m.el.querySelector("#m-msg"); x.textContent = err.message; x.hidden = false; x.scrollIntoView({ block: "nearest" }); }
    });
  }

  // ------------------------------------------------------------ exports
  function openExportMenu(ev) {
    const btn = ev.currentTarget;
    const wrap = btn.parentElement;
    const existing = wrap.querySelector(".menu-pop");
    if (existing) { existing.remove(); return; }
    const pop = document.createElement("div");
    pop.className = "menu-pop";
    pop.innerHTML = `<button type="button" data-kind="register">Payroll register (all figures)</button>
      <button type="button" data-kind="bank">Bank transfer schedule</button>
      <button type="button" data-kind="paye">PAYE schedule (tax authority)</button>
      <button type="button" data-kind="pension">Pension schedule (PFAs)</button>`;
    wrap.appendChild(pop);
    const close = () => { pop.remove(); document.removeEventListener("click", outside, true); };
    const outside = (e) => { if (!wrap.contains(e.target)) close(); };
    setTimeout(() => document.addEventListener("click", outside, true), 0);
    pop.querySelectorAll("[data-kind]").forEach((b) => b.addEventListener("click", () => { exportCsv(b.dataset.kind); close(); }));
  }

  function exportCsv(kind) {
    const L = data.lines, p = data.period;
    const m = (n) => Number(n).toFixed(2);
    if (kind === "bank") {
      const bad = L.filter((l) => !/^\d{10}$/.test(l.account_no)).length;
      downloadCsv(`bank-schedule-${p}.csv`, ["Employee No", "Name", "Bank", "Account Number", "Net Pay"], L.map((l) => [l.employee_no, l.employee_name, l.bank_name, l.account_no, m(l.net_pay)]));
      if (bad) toast(`${bad} employee${bad === 1 ? " has" : "s have"} a missing or invalid account number.`, "error");
    } else if (kind === "paye") {
      const bad = L.filter((l) => !l.tin).length;
      downloadCsv(`paye-schedule-${p}.csv`, ["Employee No", "Name", "Tax ID (TIN)", "Gross Pay", "Employee Pension", "Annual Rent", "Rent Relief (annual)", "Annual Chargeable Income", "PAYE"],
        L.map((l) => [l.employee_no, l.employee_name, l.tin, m(l.gross_pay), m(l.pension_employee), m(l.annual_rent), m(l.rent_relief), m(l.annual_chargeable), m(l.paye)]));
      if (bad) toast(`${bad} employee${bad === 1 ? " has" : "s have"} no Tax ID on record.`, "error");
    } else if (kind === "pension") {
      const bad = L.filter((l) => !l.pension_pin).length;
      downloadCsv(`pension-schedule-${p}.csv`, ["Employee No", "Name", "RSA PIN", "Pensionable Pay (Basic+Housing+Transport)", "Employee Pension", "Employer Pension", "Total"],
        L.map((l) => [l.employee_no, l.employee_name, l.pension_pin, m(l.basic + l.housing + l.transport), m(l.pension_employee), m(l.pension_employer), m(l.pension_employee + l.pension_employer)]));
      if (bad) toast(`${bad} employee${bad === 1 ? " has" : "s have"} no RSA PIN on record.`, "error");
    } else {
      downloadCsv(`payroll-register-${p}.csv`,
        ["Employee No", "Name", "Job Title", "Days Worked", "Basic", "Housing", "Transport", "Utility", "Meal", "Bonus", "Performance Reward", "Gross Pay", "Employee Pension", "PAYE", "NHF", "HMO/Life", "Other Deduction", "Loan Repayment", "Penalty", "Penalty Reason", "Total Deductions", "Net Pay", "Employer Pension"],
        L.map((l) => [l.employee_no, l.employee_name, l.job_title, l.days_worked, m(l.basic), m(l.housing), m(l.transport), m(l.utility), m(l.meal), m(l.bonus), m(l.perf_reward), m(l.gross_pay), m(l.pension_employee), m(l.paye), m(l.nhf), m(l.hmo), m(l.other_deduction), m(l.loan_repayment), m(l.penalty), l.penalty_reason, m(l.total_deductions), m(l.net_pay), m(l.pension_employer)]));
    }
  }

  load();
}
