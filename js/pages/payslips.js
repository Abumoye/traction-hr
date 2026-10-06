import { call, ApiError } from "../api.js";
import { initPage, loading, errorBox } from "../layout.js";
import { esc, monthLabel, STATUS_LABELS, rowLinks } from "../ui.js";
import { naira } from "../money.js";

const page = initPage({ active: "payslips", title: "My payslips" });
if (page) run(page);

async function run({ content }) {
  loading(content);
  try {
    const r = await call("payslips.mine");
    if (!r.linked) {
      content.innerHTML = `<div class="card"><h2>Your login is not linked to an employee record</h2>
        <p class="muted">Ask HR to link it so your payslips can appear here.</p></div>`;
      return;
    }
    content.innerHTML = r.payslips.length
      ? `<p class="muted">Payslips appear here once payroll for the month has been approved.</p>
        <div class="table-wrap"><table class="data"><thead><tr><th>Month</th><th class="num">Gross pay</th><th class="num">Net pay</th><th>Status</th></tr></thead><tbody>
        ${r.payslips.map((p) => `<tr class="click" data-href="payslip.html?id=${encodeURIComponent(p.id)}"><td><strong>${esc(monthLabel(p.period))}</strong></td>
          <td class="num">${naira(p.gross_pay)}</td><td class="num"><strong>${naira(p.net_pay)}</strong></td>
          <td><span class="badge ${esc(p.status)}">${esc(p.status === "paid" ? "Paid" : "Ready")}</span></td></tr>`).join("")}</tbody></table></div>`
      : `<div class="card empty">You have no payslips yet. They appear here after each month's payroll is approved.</div>`;
    rowLinks(content);
  } catch (err) {
    errorBox(content, err instanceof ApiError ? err.message : "Could not load your payslips.");
  }
}
