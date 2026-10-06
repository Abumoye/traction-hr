import { call, ApiError } from "../api.js";
import { initPage, loading, errorBox } from "../layout.js";
import { esc, formatDate, monthLabel } from "../ui.js";
import { naira, nairaInWords } from "../money.js";

const id = new URLSearchParams(location.search).get("id");
const page = initPage({ active: "payslips", title: "Payslip" });
if (page) run(page);

async function run({ role, content }) {
  if (!id) return errorBox(content, "No payslip was chosen.");
  loading(content);
  let p;
  try {
    p = await call("payslips.get", { id });
  } catch (err) {
    return errorBox(content, err instanceof ApiError ? err.message : "Could not load this payslip.");
  }
  const isHr = role === "owner" || role === "hr_admin";
  document.title = `Payslip ${p.employee_name} ${p.period} | Traction Outsourcing HR`;
  const row = (label, amount, cls = "") => `<div class="slip-row ${cls}"><span>${esc(label)}</span><span class="num">${amount === null ? "" : naira(amount)}</span></div>`;
  const subtotal = p.basic + p.housing + p.transport + p.utility + p.meal;
  const draft = p.run_status === "draft";

  content.innerHTML = `
    <div class="toolbar no-print">
      <a class="btn btn-ghost btn-sm" href="${isHr ? "payroll-run.html?id=" + encodeURIComponent(p.run_id) : "payslips.html"}">&larr; Back</a>
      <button class="btn btn-sm spacer" id="print" type="button">Print or save as PDF</button>
    </div>
    ${draft ? `<div class="alert alert-info no-print">Draft: this payslip is not visible to the employee until the run is approved.</div>` : ""}
    <article class="payslip" aria-label="Payslip">
      <header><h2>${esc(p.company_name)}</h2><div>Payslip for ${esc(monthLabel(p.period))}</div></header>
      <div class="slip-meta">
        <div><span>Employee</span><strong>${esc(p.employee_name)}</strong></div><div><span>Employee ID</span><span>${esc(p.employee_no)}</span></div>
        <div><span>Designation</span><span>${esc(p.job_title)}</span></div><div><span>Start date</span><span>${esc(formatDate(p.date_joined))}</span></div>
        <div><span>Days worked</span><span>${p.days_worked} of ${p.days_in_month}</span></div><div><span>Bank</span><span>${esc(p.bank_name)}</span></div>
        <div><span>Tax ID</span><span>${esc(p.tin)}</span></div><div><span>Account number</span><span>${esc(p.account_no)}</span></div>
        <div><span>RSA PIN</span><span>${esc(p.pension_pin)}</span></div><div><span>Department</span><span>${esc(p.department)}</span></div>
      </div>
      <div class="slip-cols">
        <div><h3>Earnings</h3>
          ${row("Basic", p.basic)}${row("Housing", p.housing)}${row("Transport", p.transport)}${row("Utility allowance", p.utility)}${row("Meal", p.meal)}
          ${row("Sub total", subtotal, "sub")}${row("Bonus", p.bonus)}${row("Performance reward", p.perf_reward)}${row("Total earnings", p.gross_pay, "sub")}</div>
        <div><h3>Deductions</h3>
          ${row("Staff pension contribution", p.pension_employee)}${row("Income tax (PAYE)", p.paye)}${row("HMO / life assurance", p.hmo)}${row("NHF", p.nhf)}
          ${row("Other deductions", p.other_deduction)}${row("Loan / salary advance repayment", p.loan_repayment)}${row("Penalty" + (p.penalty_reason ? " - " + p.penalty_reason : ""), p.penalty)}
          ${row("Total deductions", p.total_deductions, "sub")}</div>
      </div>
      <div class="slip-net"><div><div class="muted">Net pay</div><div class="amt">${naira(p.net_pay)}</div></div><div style="max-width:420px;text-align:right">${esc(nairaInWords(p.net_pay))}</div></div>
      <div class="slip-sign"><div>Employer signature</div><div>Employee signature</div></div>
      <p class="slip-foot">This is a system generated payslip.</p>
    </article>`;
  content.querySelector("#print").addEventListener("click", () => window.print());
}
