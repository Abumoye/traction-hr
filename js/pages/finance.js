import { call, ApiError } from "../api.js";
import { initPage, loading, errorBox } from "../layout.js";
import { esc, openModal, toast, formatDate, tabBar, bindTabs, todayLagos, thisMonth, shiftMonth, monthLabel, fileToBase64, saveBase64 } from "../ui.js";
import { naira, downloadCsv } from "../money.js";

const page = initPage({ active: "finance", title: "Finance" });
if (page) run(page);

const CATEGORIES = ["Transport", "Fuel", "Meals and entertainment", "Accommodation", "Communication", "Office supplies", "Training", "Other"];
const METHODS = ["bank transfer", "cash", "cheque", "card", "other"];
const MAX = 4 * 1024 * 1024;
const STATE = { open: "Open", overdue: "Overdue", paid: "Paid", void: "Voided" };

async function run({ content }) {
  const tabs = [
    { id: "overview", label: "Overview" }, { id: "budgets", label: "Budgets" }, { id: "petty", label: "Petty cash" },
    { id: "invoices", label: "Invoices and bills" }, { id: "monthend", label: "Month-end" },
  ];
  const wanted = new URLSearchParams(location.search).get("tab");
  let active = tabs.some((t) => t.id === wanted) ? wanted : "overview";
  content.innerHTML = `<div id="tabs">${tabBar(tabs, active)}</div><div id="panel"></div>`;
  const panel = content.querySelector("#panel");
  bindTabs(content.querySelector("#tabs"), (id) => { active = id; show(); });
  const fail = (err, text) => errorBox(panel, err instanceof ApiError ? err.message : text);
  const stateBadge = (v) => `<span class="badge fin-${esc(v.state)}">${esc(STATE[v.state] || v.state)}${v.state === "overdue" ? ` (${v.days_overdue} d)` : ""}</span>`;
  const catOptions = (sel) => CATEGORIES.map((c) => `<option${c === sel ? " selected" : ""}>${esc(c)}</option>`).join("");
  const fail2 = (m, err) => { const e = m.el.querySelector("#m-msg"); e.textContent = err.message; e.hidden = false; };
  const monthNav = (month) => `<div class="month-nav"><button class="btn btn-ghost btn-sm" id="prev" type="button" aria-label="Previous month">&larr;</button><strong>${esc(monthLabel(month))}</strong>
    <button class="btn btn-ghost btn-sm" id="next" type="button" aria-label="Next month">&rarr;</button></div>`;
  const bindMonth = (get, set, reload) => {
    panel.querySelector("#prev").addEventListener("click", () => { set(shiftMonth(get(), -1)); reload(); });
    panel.querySelector("#next").addEventListener("click", () => { set(shiftMonth(get(), 1)); reload(); });
  };
  async function readFile(input) {
    const f = input.files[0];
    if (!f) return null;
    if (f.size > MAX) throw new Error("That file is larger than 4 MB.");
    if (!/\.(pdf|png|jpe?g)$/i.test(f.name)) throw new Error("Choose a PDF, PNG or JPG file.");
    return { fileName: f.name, data: await fileToBase64(f) };
  }
  const download = async (action, id) => {
    try { const f = await call(action, { id }); saveBase64(f.name, f.mimeType, f.data); } catch (err) { toast(err.message, "error"); }
  };

  function show() {
    if (active === "overview") overviewTab();
    else if (active === "budgets") budgetsTab();
    else if (active === "petty") pettyTab();
    else if (active === "invoices") invoicesTab();
    else monthEndTab();
  }

  // ------------------------------------------------------------ overview
  async function overviewTab() {
    loading(panel);
    try {
      const o = await call("finance.overview");
      const stat = (num, label, href, accent) => `<${href ? `a href="${href}"` : "div"} class="stat${accent ? " accent" : ""}"><div class="num" style="font-size:22px">${num}</div><div class="lbl">${label}</div></${href ? "a" : "div"}>`;
      panel.innerHTML = `
        <div class="stats money">
          ${stat(naira(o.petty_cash), "Petty cash in the box", "finance.html?tab=petty")}
          ${stat(naira(o.receivable.outstanding), `Owed to you (${o.receivable.open_count} invoice${o.receivable.open_count === 1 ? "" : "s"})`, "finance.html?tab=invoices", o.receivable.overdue_count > 0)}
          ${stat(naira(o.payable.outstanding), `You owe (${o.payable.open_count} bill${o.payable.open_count === 1 ? "" : "s"})`, "finance.html?tab=invoices", o.payable.overdue_count > 0)}
          ${stat(naira(o.advances_owed), "Salary advances still to be repaid", "advances.html?tab=requests")}
        </div>
        ${o.receivable.overdue_count || o.payable.overdue_count ? `<div class="alert alert-error">${o.receivable.overdue_count ? `${o.receivable.overdue_count} invoice${o.receivable.overdue_count === 1 ? " is" : "s are"} overdue (${naira(o.receivable.overdue)}). ` : ""}${o.payable.overdue_count ? `${o.payable.overdue_count} bill${o.payable.overdue_count === 1 ? " is" : "s are"} overdue (${naira(o.payable.overdue)}).` : ""}</div>` : ""}
        <div class="two-col">
          <div class="card"><h2>${esc(monthLabel(o.month))}: spend against budget</h2>
            <dl class="dl"><dt>Budget</dt><dd>${o.expenses.budget ? naira(o.expenses.budget) : '<span class="muted">Not set</span>'}</dd><dt>Spent or approved</dt><dd>${naira(o.expenses.actual)}</dd>
            <dt>Waiting for approval</dt><dd>${naira(o.expenses.waiting)}</dd></dl>
            <p style="margin-top:10px"><a class="btn btn-ghost btn-sm" href="finance.html?tab=budgets">Open budgets</a></p></div>
          <div class="card"><h2>Waiting for you to pay</h2>
            <dl class="dl"><dt>Approved expense claims</dt><dd>${o.to_pay.claims}</dd><dt>Approved salary advances</dt><dd>${o.to_pay.advances}</dd></dl>
            <p style="margin-top:10px"><a class="btn btn-ghost btn-sm" href="expenses.html?tab=approvals">Expense claims</a> <a class="btn btn-ghost btn-sm" href="advances.html?tab=requests">Salary advances</a></p></div>
        </div>
        ${o.payroll ? `<div class="card"><h2>Latest payroll: ${esc(monthLabel(o.payroll.period))} (${esc(o.payroll.status)})</h2>
          <div class="stats compact money" style="margin:0">
            ${stat(naira(o.payroll.totals.gross_pay), "Gross pay")}${stat(naira(o.payroll.totals.paye), "PAYE to remit")}
            ${stat(naira(o.payroll.totals.pension_employee + o.payroll.totals.pension_employer), "Pension to remit")}${stat(naira(o.payroll.totals.net_pay), "Net pay to staff", "", true)}</div>
          <p style="margin-top:10px"><a class="btn btn-ghost btn-sm" href="payroll.html">Open payroll</a></p></div>` : ""}`;
    } catch (err) { fail(err, "Could not load the overview."); }
  }

  // ------------------------------------------------------------ budgets
  let bMonth = thisMonth();
  async function budgetsTab() {
    loading(panel);
    try {
      const b = await call("finance.budgetsGet", { month: bMonth });
      panel.innerHTML = `${monthNav(bMonth)}
        <p class="muted" style="margin-bottom:10px">A budget is a monthly amount per expense category. It stays in force until you set a new one. Spent = approved or paid expense claims plus petty cash paid out.</p>
        <div class="table-wrap"><table class="data"><thead><tr><th>Category</th><th class="num">Budget</th><th class="num">Claims</th><th class="num">Petty cash</th><th class="num">Spent</th><th class="num">Left</th><th>Used</th><th></th></tr></thead><tbody>
        ${b.rows.map((r) => `<tr><td><strong>${esc(r.category)}</strong>${r.waiting ? `<div class="muted" style="font-size:12px">${naira(r.waiting)} waiting for approval</div>` : ""}</td>
          <td class="num">${r.budget ? naira(r.budget) : '<span class="muted">-</span>'}</td><td class="num">${naira(r.claims)}</td><td class="num">${naira(r.petty_cash)}</td>
          <td class="num"><strong>${naira(r.actual)}</strong></td><td class="num ${r.budget && r.variance < 0 ? "row-warn" : ""}">${r.budget ? naira(r.variance) : ""}</td>
          <td>${r.used_pct === null ? "" : `<div class="progress" style="min-width:90px"><span style="width:${Math.min(100, r.used_pct)}%;background:${r.used_pct > 100 ? "var(--danger)" : "var(--ok)"}"></span></div><span class="muted" style="font-size:12px">${r.used_pct}%</span>`}</td>
          <td style="text-align:right"><button class="btn btn-ghost btn-sm" data-set="${esc(r.category)}" data-cur="${r.budget}" type="button">Set budget</button></td></tr>`).join("")}
        <tr><td><strong>Total</strong></td><td class="num"><strong>${naira(b.totals.budget)}</strong></td><td></td><td></td><td class="num"><strong>${naira(b.totals.actual)}</strong></td><td class="num"><strong>${b.totals.budget ? naira(b.totals.variance) : ""}</strong></td><td></td><td></td></tr>
        </tbody></table></div>`;
      bindMonth(() => bMonth, (m) => { bMonth = m; }, budgetsTab);
      panel.querySelectorAll("[data-set]").forEach((x) => x.addEventListener("click", () => setBudget(x.dataset.set, Number(x.dataset.cur))));
    } catch (err) { fail(err, "Could not load budgets."); }
  }

  function setBudget(category, current) {
    const m = openModal({
      title: `Budget: ${category}`, narrow: true,
      html: `<div id="m-msg" class="alert alert-error" hidden></div><form id="b-form" novalidate>
        <div class="field"><label for="b-amt">Monthly budget (&#8358;)</label><input id="b-amt" name="monthly_amount" inputmode="decimal" value="${current || ""}" required><div class="hint">Use 0 for no budget.</div></div>
        <div class="field"><label for="b-from">Applies from</label><input id="b-from" name="effective_from" type="month" value="${bMonth}" required><div class="hint">It stays in force until a new one is set. Earlier months are not changed.</div></div></form>`,
      footer: `<button class="btn btn-ghost" data-close type="button">Cancel</button><button class="btn" type="submit" form="b-form">Save</button>`,
    });
    m.el.querySelector("#b-form").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      try { await call("finance.budgetSave", { category, monthly_amount: ev.target.monthly_amount.value, effective_from: ev.target.effective_from.value }); m.close(); toast("Budget saved."); budgetsTab(); }
      catch (err) { fail2(m, err); }
    });
  }

  // ------------------------------------------------------------ petty cash
  let pMonth = thisMonth();
  async function pettyTab() {
    loading(panel);
    try {
      const p = await call("finance.pettyList", { month: pMonth });
      panel.innerHTML = `${monthNav(pMonth)}
        <div class="chips"><span class="chip"><b>${naira(p.opening)}</b>Opening</span><span class="chip"><b>${naira(p.totals.in)}</b>Money in</span><span class="chip"><b>${naira(p.totals.out)}</b>Money out</span>
          <span class="chip"><b>${naira(p.closing)}</b>Closing</span><span class="chip"><b>${naira(p.balance_now)}</b>In the box now</span></div>
        <div class="toolbar"><span class="muted">Every entry stays on record. A wrong one is voided with a reason, never deleted.</span>
          <span class="spacer" style="display:flex;gap:8px"><button class="btn btn-sm" id="p-in" type="button">Money in</button><button class="btn btn-sm" id="p-out" type="button">Money out</button></span></div>
        ${p.entries.length ? `<div class="table-wrap"><table class="data"><thead><tr><th>Date</th><th>Description</th><th class="num">In</th><th class="num">Out</th><th class="num">Balance</th><th></th></tr></thead><tbody>
          ${p.entries.map((e) => `<tr class="${e.voided ? "muted-row" : ""}"><td>${esc(formatDate(e.date))}</td>
            <td>${e.voided ? "<s>" : ""}${esc(e.description)}${e.voided ? "</s>" : ""}<div class="muted" style="font-size:12px">${esc(e.category)}${e.ref ? " &middot; " + esc(e.ref) : ""}${e.voided ? ` &middot; VOIDED: ${esc(e.void_reason)}` : ""}</div></td>
            <td class="num">${e.kind === "in" ? naira(e.amount) : ""}</td><td class="num">${e.kind === "out" ? naira(e.amount) : ""}</td><td class="num">${e.voided ? "" : naira(e.balance)}</td>
            <td style="text-align:right;white-space:nowrap">${e.has_receipt ? `<button class="btn btn-ghost btn-sm" data-rc="${esc(e.id)}" type="button">Receipt</button>` : ""}${e.voided ? "" : `<button class="btn btn-ghost btn-sm" data-void="${esc(e.id)}" type="button">Void</button>`}</td></tr>`).join("")}</tbody></table></div>`
          : `<div class="card empty">No entries in ${esc(monthLabel(pMonth))}.</div>`}`;
      bindMonth(() => pMonth, (m) => { pMonth = m; }, pettyTab);
      panel.querySelector("#p-in").addEventListener("click", () => addPetty("in"));
      panel.querySelector("#p-out").addEventListener("click", () => addPetty("out"));
      panel.querySelectorAll("[data-rc]").forEach((b) => b.addEventListener("click", () => download("finance.pettyReceipt", b.dataset.rc)));
      panel.querySelectorAll("[data-void]").forEach((b) => b.addEventListener("click", () => voidPetty(b.dataset.void)));
    } catch (err) { fail(err, "Could not load the petty cash book."); }
  }

  function addPetty(kind) {
    const out = kind === "out";
    const m = openModal({
      title: out ? "Petty cash: money out" : "Petty cash: money in", narrow: true,
      html: `<div id="m-msg" class="alert alert-error" hidden></div><form id="pc-form" novalidate>
        <div class="field"><label for="pc-date">Date</label><input id="pc-date" name="date" type="date" value="${todayLagos()}" max="${todayLagos()}" required></div>
        <div class="field"><label for="pc-amt">Amount (&#8358;)</label><input id="pc-amt" name="amount" inputmode="decimal" required></div>
        <div class="field"><label for="pc-desc">${out ? "What was it for?" : "Where did the money come from?"}</label><input id="pc-desc" name="description" maxlength="200" required placeholder="${out ? "For example: Courier to Lagos" : "For example: Opening float from the bank"}"></div>
        ${out ? `<div class="field"><label for="pc-cat">Category</label><select id="pc-cat" name="category">${catOptions("")}</select></div>` : ""}
        <div class="field"><label for="pc-ref">Reference (optional)</label><input id="pc-ref" name="ref" maxlength="60"></div>
        ${out ? `<div class="field"><label for="pc-file">Receipt</label><input id="pc-file" name="file" type="file" accept=".pdf,.png,.jpg,.jpeg"><div class="hint">Needed for payments of &#8358;5,000 or more (or whatever limit is set under Expenses). PDF, PNG or JPG, up to 4 MB.</div></div>` : ""}</form>`,
      footer: `<button class="btn btn-ghost" data-close type="button">Cancel</button><button class="btn" type="submit" form="pc-form">Save</button>`,
    });
    m.el.querySelector("#pc-form").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const f = ev.target;
      try {
        const receipt = out ? await readFile(f.file) : null;
        await call("finance.pettyAdd", { kind, date: f.date.value, amount: f.amount.value, description: f.description.value, category: out ? f.category.value : "", ref: f.ref.value, receipt });
        m.close(); toast("Saved."); pettyTab();
      } catch (err) { fail2(m, err); }
    });
  }

  function voidPetty(id) {
    const m = openModal({
      title: "Void this entry", narrow: true,
      html: `<div id="m-msg" class="alert alert-error" hidden></div><p>The entry stays on the page, marked as voided, and no longer counts in the balance.</p>
        <form id="v-form" novalidate><div class="field"><label for="v-why">Reason</label><input id="v-why" name="reason" maxlength="200" required></div></form>`,
      footer: `<button class="btn btn-ghost" data-close type="button">Cancel</button><button class="btn btn-danger" type="submit" form="v-form">Void entry</button>`,
    });
    m.el.querySelector("#v-form").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      try { await call("finance.pettyVoid", { id, reason: ev.target.reason.value }); m.close(); toast("Entry voided."); pettyTab(); }
      catch (err) { fail2(m, err); }
    });
  }

  // ------------------------------------------------------------ invoices and bills
  let iDir = "", iState = "unpaid";
  async function invoicesTab() {
    loading(panel);
    try {
      const l = await call("finance.invoicesList", { direction: iDir, state: iState });
      const dirOpts = [["", "Invoices and bills"], ["receivable", "Invoices (owed to you)"], ["payable", "Bills (you owe)"]];
      const stOpts = [["unpaid", "Unpaid"], ["overdue", "Overdue"], ["paid", "Paid"], ["void", "Voided"], ["", "All"]];
      panel.innerHTML = `
        <div class="chips"><span class="chip"><b>${naira(l.totals.outstanding)}</b>Outstanding (${l.totals.open_count})</span><span class="chip"><b>${naira(l.totals.overdue)}</b>Overdue (${l.totals.overdue_count})</span></div>
        <div class="toolbar">
          <select id="dir" aria-label="Show">${dirOpts.map(([v, t]) => `<option value="${v}"${v === iDir ? " selected" : ""}>${t}</option>`).join("")}</select>
          <select id="st" aria-label="Status">${stOpts.map(([v, t]) => `<option value="${v}"${v === iState ? " selected" : ""}>${t}</option>`).join("")}</select>
          <span class="spacer" style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-ghost btn-sm" id="parties" type="button">Customers and vendors</button>
            <button class="btn btn-sm" id="new-inv" type="button">New invoice</button><button class="btn btn-ghost btn-sm" id="new-bill" type="button">New bill</button></span></div>
        ${l.invoices.length ? `<div class="table-wrap"><table class="data"><thead><tr><th>Number</th><th>Customer or vendor</th><th>Issued</th><th>Due</th><th class="num">Due amount</th><th class="num">Paid</th><th class="num">Balance</th><th>Status</th></tr></thead><tbody>
          ${l.invoices.map((v) => `<tr class="click" data-open="${esc(v.id)}"><td><strong>${esc(v.number)}</strong><div class="muted" style="font-size:12px">${v.direction === "receivable" ? "Invoice" : "Bill"}</div></td>
            <td>${esc(v.party_name)}</td><td>${esc(formatDate(v.issue_date))}</td><td>${esc(formatDate(v.due_date))}</td><td class="num">${naira(v.net_due)}</td><td class="num">${naira(v.paid)}</td>
            <td class="num"><strong>${naira(v.balance)}</strong></td><td>${stateBadge(v)}${v.part_paid ? '<div class="muted" style="font-size:12px">Part paid</div>' : ""}</td></tr>`).join("")}</tbody></table></div>`
          : `<div class="card empty">Nothing matches. Add an invoice or a bill, or change the filter.</div>`}`;
      panel.querySelector("#dir").addEventListener("change", (e) => { iDir = e.target.value; invoicesTab(); });
      panel.querySelector("#st").addEventListener("change", (e) => { iState = e.target.value; invoicesTab(); });
      panel.querySelector("#new-inv").addEventListener("click", () => editInvoice("receivable", null));
      panel.querySelector("#new-bill").addEventListener("click", () => editInvoice("payable", null));
      panel.querySelector("#parties").addEventListener("click", partiesDialog);
      panel.querySelectorAll("[data-open]").forEach((r) => r.addEventListener("click", () => invoiceDetail(r.dataset.open)));
    } catch (err) { fail(err, "Could not load invoices and bills."); }
  }

  async function invoiceDetail(id) {
    try {
      const v = await call("finance.invoiceGet", { id });
      const live = v.state !== "void";
      const m = openModal({
        title: `${v.direction === "receivable" ? "Invoice" : "Bill"} ${v.number}`,
        html: `<div id="m-msg" class="alert alert-error" hidden></div>
          <p>${stateBadge(v)} &nbsp;<strong>${esc(v.party_name)}</strong> &middot; issued ${esc(formatDate(v.issue_date))}, due ${esc(formatDate(v.due_date))}</p>
          ${v.description ? `<p class="muted">${esc(v.description)}</p>` : ""}${v.state === "void" ? `<div class="alert alert-error">Voided: ${esc(v.void_reason)}</div>` : ""}
          <dl class="dl" style="grid-template-columns:200px 1fr"><dt>Amount</dt><dd>${naira(v.amount)}</dd><dt>VAT (${v.vat_pct}%)</dt><dd>${naira(v.vat)}</dd><dt>Total billed</dt><dd>${naira(v.total)}</dd>
            <dt>Withholding tax (${v.wht_pct}%)</dt><dd>-${naira(v.wht)}</dd><dt>Net amount due</dt><dd><strong>${naira(v.net_due)}</strong></dd><dt>Paid so far</dt><dd>${naira(v.paid)}</dd><dt>Balance</dt><dd><strong>${naira(v.balance)}</strong></dd></dl>
          <h3 style="margin:14px 0 6px">Payments</h3>
          ${v.payments.length ? `<table class="data"><thead><tr><th>Date</th><th>Method</th><th class="num">Amount</th><th></th></tr></thead><tbody>${v.payments.map((p) => `<tr class="${p.reversed ? "muted-row" : ""}"><td>${esc(formatDate(p.date))}</td>
            <td>${esc(p.method)}${p.reference ? " &middot; " + esc(p.reference) : ""}${p.reversed ? `<div class="muted" style="font-size:12px">REVERSED: ${esc(p.reverse_reason)}</div>` : ""}</td><td class="num">${p.reversed ? "<s>" : ""}${naira(p.amount)}${p.reversed ? "</s>" : ""}</td>
            <td style="text-align:right">${p.reversed || !live ? "" : `<button class="btn btn-ghost btn-sm" data-rev="${esc(p.id)}" type="button">Reverse</button>`}</td></tr>`).join("")}</tbody></table>` : '<p class="muted">No payments yet.</p>'}
          ${live && v.balance > 0 ? `<form id="pay-form" novalidate style="margin-top:14px"><h3 style="margin:0 0 8px">${v.direction === "receivable" ? "Record a payment received" : "Record a payment made"}</h3>
            <div class="inline-form"><div class="field"><label for="py-date">Date</label><input id="py-date" name="date" type="date" value="${todayLagos()}" max="${todayLagos()}"></div>
              <div class="field"><label for="py-amt">Amount (&#8358;)</label><input id="py-amt" name="amount" inputmode="decimal" value="${v.balance}" style="width:150px"></div>
              <div class="field"><label for="py-m">Method</label><select id="py-m" name="method">${METHODS.map((x) => `<option>${x}</option>`).join("")}</select></div>
              <div class="field"><label for="py-ref">Reference</label><input id="py-ref" name="reference" maxlength="60" style="width:150px"></div>
              <button class="btn" type="submit">Record</button></div></form>` : ""}`,
        footer: `${v.has_file ? `<button class="btn btn-ghost" id="dl" type="button">Open file</button>` : ""}${live ? `<button class="btn btn-ghost" id="edit" type="button">Edit</button><button class="btn btn-ghost" id="void" type="button">Void</button>` : ""}<button class="btn" data-close type="button">Close</button>`,
      });
      const reload = () => { m.close(); invoicesTab(); };
      const dl = m.el.querySelector("#dl");
      if (dl) dl.addEventListener("click", () => download("finance.invoiceFile", v.id));
      const ed = m.el.querySelector("#edit");
      if (ed) ed.addEventListener("click", () => { m.close(); editInvoice(v.direction, v); });
      const vd = m.el.querySelector("#void");
      if (vd) vd.addEventListener("click", () => { m.close(); voidInvoice(v); });
      m.el.querySelectorAll("[data-rev]").forEach((b) => b.addEventListener("click", () => { m.close(); reversePayment(v, b.dataset.rev); }));
      const pf = m.el.querySelector("#pay-form");
      if (pf) pf.addEventListener("submit", async (ev) => {
        ev.preventDefault();
        try { await call("finance.paymentAdd", { invoice_id: v.id, date: pf.date.value, amount: pf.amount.value, method: pf.method.value, reference: pf.reference.value }); toast("Payment recorded."); reload(); }
        catch (err) { fail2(m, err); }
      });
    } catch (err) { toast(err.message, "error"); }
  }

  function reversePayment(v, paymentId) {
    const m = openModal({
      title: "Reverse this payment", narrow: true,
      html: `<div id="m-msg" class="alert alert-error" hidden></div><p>The payment stays on record, marked as reversed, and the balance goes back up.</p>
        <form id="r-form" novalidate><div class="field"><label for="r-why">Reason</label><input id="r-why" name="reason" maxlength="200" required placeholder="For example: cheque bounced"></div></form>`,
      footer: `<button class="btn btn-ghost" data-close type="button">Cancel</button><button class="btn btn-danger" type="submit" form="r-form">Reverse payment</button>`,
    });
    m.el.querySelector("#r-form").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      try { await call("finance.paymentReverse", { id: paymentId, reason: ev.target.reason.value }); m.close(); toast("Payment reversed."); invoicesTab(); }
      catch (err) { fail2(m, err); }
    });
  }

  function voidInvoice(v) {
    const m = openModal({
      title: `Void ${v.direction === "receivable" ? "invoice" : "bill"} ${v.number}`, narrow: true,
      html: `<div id="m-msg" class="alert alert-error" hidden></div><p>It stays on record, marked as voided. This only works if no live payment is recorded against it.</p>
        <form id="vi-form" novalidate><div class="field"><label for="vi-why">Reason</label><input id="vi-why" name="reason" maxlength="200" required></div></form>`,
      footer: `<button class="btn btn-ghost" data-close type="button">Cancel</button><button class="btn btn-danger" type="submit" form="vi-form">Void</button>`,
    });
    m.el.querySelector("#vi-form").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      try { await call("finance.invoiceVoid", { id: v.id, reason: ev.target.reason.value }); m.close(); toast("Voided."); invoicesTab(); }
      catch (err) { fail2(m, err); }
    });
  }

  async function editInvoice(direction, v) {
    let parties;
    try { parties = await call("finance.partiesList", { kind: direction === "receivable" ? "customer" : "vendor" }); }
    catch (err) { return toast(err.message, "error"); }
    const recv = direction === "receivable";
    const m = openModal({
      title: `${v ? "Edit" : "New"} ${recv ? "invoice" : "bill"}`,
      html: `<div id="m-msg" class="alert alert-error" hidden></div><form id="i-form" novalidate class="form-grid">
        <div class="field"><label for="i-party">${recv ? "Customer" : "Vendor"}</label><select id="i-party" name="party_id">${parties.length ? "" : '<option value="">Add one first</option>'}${parties.map((p) => `<option value="${esc(p.id)}"${v && v.party_id === p.id ? " selected" : ""}>${esc(p.name)}</option>`).join("")}</select>
          <div class="hint"><a href="#" id="add-party">Add a new ${recv ? "customer" : "vendor"}</a></div></div>
        <div class="field"><label for="i-num">${recv ? "Invoice" : "Bill"} number</label><input id="i-num" name="number" maxlength="40" value="${v ? esc(v.number) : ""}" required></div>
        <div class="field"><label for="i-issue">Issue date</label><input id="i-issue" name="issue_date" type="date" value="${v ? v.issue_date : todayLagos()}" required></div>
        <div class="field"><label for="i-due">Due date</label><input id="i-due" name="due_date" type="date" value="${v ? v.due_date : ""}" required></div>
        <div class="field"><label for="i-amt">Amount before VAT (&#8358;)</label><input id="i-amt" name="amount" inputmode="decimal" value="${v ? v.amount : ""}" required></div>
        <div class="field"><label for="i-vat">VAT %</label><input id="i-vat" name="vat_pct" inputmode="decimal" value="${v ? v.vat_pct : "7.5"}"><div class="hint">Nigeria's VAT rate is 7.5%. Use 0 if none.</div></div>
        <div class="field"><label for="i-wht">Withholding tax %</label><input id="i-wht" name="wht_pct" inputmode="decimal" value="${v ? v.wht_pct : "0"}"><div class="hint">Kept back by whoever pays, and remitted to the tax authority. Often 5% or 10% on services.</div></div>
        <div class="field full"><label for="i-desc">Description</label><input id="i-desc" name="description" maxlength="200" value="${v ? esc(v.description) : ""}"></div>
        <div class="field full"><label for="i-file">Attach the ${recv ? "invoice" : "bill"} (optional)</label><input id="i-file" name="file" type="file" accept=".pdf,.png,.jpg,.jpeg"></div>
        <div class="preview full" id="i-prev" aria-live="polite"></div></form>`,
      footer: `<button class="btn btn-ghost" data-close type="button">Cancel</button><button class="btn" type="submit" form="i-form">Save</button>`,
    });
    const f = m.el.querySelector("#i-form");
    const prev = m.el.querySelector("#i-prev");
    const show = () => {
      const a = Number(String(f.amount.value).replace(/,/g, "")) || 0, vat = a * (Number(f.vat_pct.value) || 0) / 100, wht = a * (Number(f.wht_pct.value) || 0) / 100;
      prev.innerHTML = a ? `<dl><dt>Amount</dt><dd>${naira(a)}</dd><dt>VAT</dt><dd>${naira(vat)}</dd><dt>Total billed</dt><dd>${naira(a + vat)}</dd><dt>Withholding tax kept back</dt><dd>-${naira(wht)}</dd><dt class="total">Net amount due</dt><dd class="total">${naira(a + vat - wht)}</dd></dl>` : "";
    };
    f.addEventListener("input", show);
    show();
    m.el.querySelector("#add-party").addEventListener("click", (e) => { e.preventDefault(); m.close(); partyForm(recv ? "customer" : "vendor", null, () => editInvoice(direction, v)); });
    f.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      try {
        const attachment = await readFile(f.file);
        await call("finance.invoiceSave", { id: v ? v.id : undefined, direction, party_id: f.party_id.value, number: f.number.value, issue_date: f.issue_date.value, due_date: f.due_date.value,
          amount: f.amount.value, vat_pct: f.vat_pct.value, wht_pct: f.wht_pct.value, description: f.description.value, attachment });
        m.close(); toast("Saved."); invoicesTab();
      } catch (err) { fail2(m, err); }
    });
  }

  // ------------------------------------------------------------ customers and vendors
  async function partiesDialog() {
    try {
      const list = await call("finance.partiesList", {});
      const m = openModal({
        title: "Customers and vendors",
        html: `${list.length ? `<table class="data"><thead><tr><th>Name</th><th>Kind</th><th>Contact</th><th></th></tr></thead><tbody>${list.map((p) => `<tr><td><strong>${esc(p.name)}</strong>${p.tin ? `<div class="muted" style="font-size:12px">TIN ${esc(p.tin)}</div>` : ""}</td><td>${p.kind === "customer" ? "Customer" : "Vendor"}</td>
          <td class="muted">${esc([p.email, p.phone].filter(Boolean).join(" · "))}</td><td style="text-align:right"><button class="btn btn-ghost btn-sm" data-ed="${esc(p.id)}" type="button">Edit</button></td></tr>`).join("")}</tbody></table>` : '<p class="muted">None yet.</p>'}`,
        footer: `<button class="btn btn-ghost" id="add-c" type="button">Add a customer</button><button class="btn btn-ghost" id="add-v" type="button">Add a vendor</button><button class="btn" data-close type="button">Close</button>`,
      });
      m.el.querySelector("#add-c").addEventListener("click", () => { m.close(); partyForm("customer", null, partiesDialog); });
      m.el.querySelector("#add-v").addEventListener("click", () => { m.close(); partyForm("vendor", null, partiesDialog); });
      m.el.querySelectorAll("[data-ed]").forEach((b) => b.addEventListener("click", () => { m.close(); partyForm("", list.find((p) => p.id === b.dataset.ed), partiesDialog); }));
    } catch (err) { toast(err.message, "error"); }
  }

  function partyForm(kind, p, then) {
    const k = p ? p.kind : kind;
    const m = openModal({
      title: `${p ? "Edit" : "Add"} ${k === "customer" ? "customer" : "vendor"}`, narrow: true,
      html: `<div id="m-msg" class="alert alert-error" hidden></div><form id="pt-form" novalidate>
        <div class="field"><label for="pt-name">Name</label><input id="pt-name" name="name" maxlength="100" value="${p ? esc(p.name) : ""}" required></div>
        <div class="field"><label for="pt-email">Email</label><input id="pt-email" name="email" type="email" maxlength="120" value="${p ? esc(p.email) : ""}"></div>
        <div class="field"><label for="pt-phone">Phone</label><input id="pt-phone" name="phone" maxlength="30" value="${p ? esc(p.phone) : ""}"></div>
        <div class="field"><label for="pt-tin">Tax ID (TIN)</label><input id="pt-tin" name="tin" maxlength="30" value="${p ? esc(p.tin) : ""}"></div>
        <div class="field"><label for="pt-addr">Address</label><input id="pt-addr" name="address" maxlength="200" value="${p ? esc(p.address) : ""}"></div></form>`,
      footer: `<button class="btn btn-ghost" data-close type="button">Cancel</button><button class="btn" type="submit" form="pt-form">Save</button>`,
      onClose: null,
    });
    m.el.querySelector("#pt-form").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const f = ev.target;
      try { await call("finance.partySave", { id: p ? p.id : undefined, kind: k, name: f.name.value, email: f.email.value, phone: f.phone.value, tin: f.tin.value, address: f.address.value }); m.close(); toast("Saved."); if (then) then(); }
      catch (err) { fail2(m, err); }
    });
  }

  // ------------------------------------------------------------ month-end pack
  let meMonth = thisMonth();
  async function monthEndTab() {
    loading(panel);
    try {
      const p = await call("finance.monthEnd", { month: meMonth });
      panel.innerHTML = `${monthNav(meMonth)}
        <div class="toolbar"><span class="muted">Everything the books need for the month, in one place. Download each section as a CSV file for your accounting software or spreadsheet.</span>
          <span class="spacer"><button class="btn btn-ghost btn-sm" id="print" type="button">Print</button></span></div>
        ${p.sections.map((s) => `<div class="card" data-sec="${esc(s.id)}"><div class="toolbar" style="margin-bottom:8px"><h2 style="margin:0">${esc(s.title)}</h2>
            ${s.rows.length ? `<button class="btn btn-ghost btn-sm spacer" data-csv="${esc(s.id)}" type="button">Download CSV</button>` : ""}</div>
          ${s.rows.length ? `<div class="table-wrap"><table class="data"><thead><tr>${s.columns.map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead><tbody>
            ${s.rows.map((r) => `<tr>${r.map((c) => `<td${typeof c === "number" ? ' class="num"' : ""}>${typeof c === "number" ? naira(c) : esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>` : '<p class="muted">Nothing for this month.</p>'}
          ${s.note ? `<p class="muted" style="margin-top:8px">${esc(s.note)}</p>` : ""}</div>`).join("")}`;
      bindMonth(() => meMonth, (m) => { meMonth = m; }, monthEndTab);
      panel.querySelector("#print").addEventListener("click", () => window.print());
      panel.querySelectorAll("[data-csv]").forEach((b) => b.addEventListener("click", () => {
        const s = p.sections.find((x) => x.id === b.dataset.csv);
        downloadCsv(`${s.id}-${p.month}.csv`, s.columns, s.rows);
      }));
    } catch (err) { fail(err, "Could not build the month-end pack."); }
  }

  show();
}
