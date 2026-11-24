import { call, loadFast, ApiError } from "../api.js";
import { initPage, loading, errorBox } from "../layout.js";
import { esc, openModal, toast, formatDate, tabBar, bindTabs, STATUS_LABELS, monthLabel, thisMonth, rowLinks } from "../ui.js";
import { naira } from "../money.js";

const page = initPage({ active: "payroll", title: "Payroll" });
if (page) run(page);

async function run({ role, content }) {
  const canManage = role === "owner" || role === "hr_admin"; // the accountant reads payroll (every run, salary and payslip) but cannot change it
  const tabs = [{ id: "runs", label: "Payroll runs" }, { id: "salaries", label: "Salaries" }].concat(canManage ? [{ id: "settings", label: "Settings" }] : []);
  let active = new URLSearchParams(location.search).get("tab");
  if (!tabs.some((t) => t.id === active)) active = "runs";
  content.innerHTML = `<div id="tabs">${tabBar(tabs, active)}</div><div id="panel"></div>`;
  const panel = content.querySelector("#panel");
  bindTabs(content.querySelector("#tabs"), (id) => { active = id; show(); });

  function show() {
    if (active === "runs") runsTab();
    else if (active === "salaries") salariesTab();
    else settingsTab();
  }

  // ------------------------------------------------------------ runs
  async function runsTab() {
    loading(panel);
    try {
      await loadFast([["payroll.runsList", {}]], ([runs]) => renderRuns(runs));
    } catch (err) {
      errorBox(panel, err instanceof ApiError ? err.message : "Could not load payroll runs.");
    }
  }

  function renderRuns(runs) {
    panel.innerHTML = `
      <div class="toolbar"><span class="muted">${canManage ? "One payroll run per month. Build it, adjust it, then approve it to publish payslips." : "Every payroll run. You can read all of them and open any payslip; changes are made by HR."}</span>
        ${canManage ? `<button class="btn spacer" id="new-run" type="button">New payroll run</button>` : ""}</div>
      ${runs.length ? `<div class="table-wrap"><table class="data"><thead><tr><th>Month</th><th>Status</th><th class="num">Staff</th><th class="num">Gross pay</th><th class="num">PAYE</th><th class="num">Net pay</th><th>Created by</th></tr></thead><tbody>
        ${runs.map((r) => `<tr class="click" data-href="payroll-run.html?id=${encodeURIComponent(r.id)}">
          <td><strong>${esc(monthLabel(r.period))}</strong></td><td><span class="badge ${esc(r.status)}">${esc(STATUS_LABELS[r.status] || r.status)}</span></td>
          <td class="num">${r.totals.employees}</td><td class="num">${naira(r.totals.gross_pay)}</td><td class="num">${naira(r.totals.paye)}</td>
          <td class="num"><strong>${naira(r.totals.net_pay)}</strong></td><td class="muted">${esc(r.created_by)}</td></tr>`).join("")}</tbody></table></div>`
        : `<div class="card empty">${canManage ? "No payroll runs yet. Make sure salaries are set on the <strong>Salaries</strong> tab, then start a new run." : "No payroll runs yet. HR will start one when salaries are ready."}</div>`}`;
    rowLinks(panel);
    const nr = panel.querySelector("#new-run");
    if (nr) nr.addEventListener("click", newRun);
  }

  function newRun() {
    const m = openModal({
      title: "New payroll run", narrow: true,
      html: `<div id="m-msg" class="alert alert-error" hidden></div>
        <form id="run-form" novalidate><div class="field"><label for="run-period">Pay month</label><input id="run-period" name="period" type="month" value="${thisMonth()}" max="${thisMonth()}" required>
        <div class="hint">Everyone with a salary record is included. Part-month joiners are pro-rated automatically.</div></div></form>`,
      footer: `<button class="btn btn-ghost" data-close type="button">Cancel</button><button class="btn" type="submit" form="run-form">Create run</button>`,
    });
    m.el.querySelector("#run-form").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      try {
        const r = await call("payroll.runsCreate", { period: ev.target.period.value });
        m.close();
        if (r.skipped.length) {
          const info = openModal({
            title: "Run created", narrow: true,
            html: `<p>${r.totals.employees} payslips were created. These people were left out:</p>
              <ul>${r.skipped.map((s) => `<li><strong>${esc(s.name)}</strong> <span class="muted">- ${esc(s.reason)}</span></li>`).join("")}</ul>
              <p class="muted">Add their salary on the Salaries tab, then use "Add employee" inside the run.</p>`,
            footer: `<button class="btn" id="open-run" type="button">Open run</button>`,
          });
          info.el.querySelector("#open-run").addEventListener("click", () => { location.href = "payroll-run.html?id=" + encodeURIComponent(r.id); });
        } else {
          location.href = "payroll-run.html?id=" + encodeURIComponent(r.id);
        }
      } catch (err) { const x = m.el.querySelector("#m-msg"); x.textContent = err.message; x.hidden = false; }
    });
  }

  // ------------------------------------------------------------ salaries
  async function salariesTab() {
    loading(panel);
    try {
      renderSalaries(await call("payroll.structuresList"));
    } catch (err) {
      errorBox(panel, err instanceof ApiError ? err.message : "Could not load salaries.");
    }
  }

  function renderSalaries(list) {
    const missing = list.filter((r) => !r.has_salary).length;
    panel.innerHTML = `
      <div class="toolbar"><span class="muted">Monthly gross salary and tax details for each employee.${canManage ? " A change applies from its effective date." : " Read only."}</span></div>
      ${missing ? `<div class="alert alert-info">${missing} employee${missing === 1 ? " has" : "s have"} no salary record yet and will not be paid in a run.</div>` : ""}
      ${list.length ? `<div class="table-wrap"><table class="data"><thead><tr><th>Employee</th><th class="num">Monthly gross</th><th class="num">Annual rent</th><th class="num">NHF</th><th class="num">HMO / life</th><th>From</th><th></th></tr></thead><tbody>
        ${list.map((r) => `<tr><td><strong>${esc(r.name)}</strong><div class="muted">${esc(r.employee_no)}${r.job_title ? " &middot; " + esc(r.job_title) : ""}</div></td>
          ${r.has_salary ? `<td class="num"><strong>${naira(r.monthly_gross)}</strong></td><td class="num">${naira(r.annual_rent)}</td><td class="num">${naira(r.nhf_monthly)}</td><td class="num">${naira(r.hmo_monthly)}</td><td>${esc(formatDate(r.effective_from))}</td>`
            : `<td colspan="5"><span class="badge pending">No salary record</span></td>`}
          <td style="text-align:right">${canManage ? `<button class="btn btn-ghost btn-sm" data-sal="${esc(r.employee_id)}" type="button">${r.has_salary ? "Change" : "Set salary"}</button>` : ""}</td></tr>`).join("")}</tbody></table></div>`
        : `<div class="card empty">Add employees first.</div>`}`;
    panel.querySelectorAll("[data-sal]").forEach((b) => b.addEventListener("click", () => editSalary(list.find((r) => r.employee_id === b.dataset.sal))));
  }

  function editSalary(r) {
    const first = thisMonth() + "-01";
    const m = openModal({
      title: `Salary: ${r.name}`,
      html: `<div id="m-msg" class="alert alert-error" hidden></div>
        <form id="sal-form" novalidate>
          <div class="form-grid">
            <div class="field"><label class="required" for="s-gross">Monthly gross salary (&#8358;)</label><input id="s-gross" name="monthly_gross" inputmode="decimal" value="${r.has_salary ? esc(r.monthly_gross) : ""}" required></div>
            <div class="field"><label for="s-rent">Annual rent (&#8358;)</label><input id="s-rent" name="annual_rent" inputmode="decimal" value="${r.has_salary ? esc(r.annual_rent) : "0"}"><div class="hint">Rent relief is 20% of this, up to &#8358;500,000 a year.</div></div>
            <div class="field"><label for="s-nhf">NHF each month (&#8358;)</label><input id="s-nhf" name="nhf_monthly" inputmode="decimal" value="${r.has_salary ? esc(r.nhf_monthly) : "0"}"><div class="hint">A tax relief. Leave at 0 if not applicable.</div></div>
            <div class="field"><label for="s-hmo">HMO / life assurance each month (&#8358;)</label><input id="s-hmo" name="hmo_monthly" inputmode="decimal" value="${r.has_salary ? esc(r.hmo_monthly) : "0"}"></div>
            <div class="field"><label for="s-from">Applies from</label><input id="s-from" name="effective_from" type="date" value="${r.has_salary && r.effective_from > first ? esc(r.effective_from) : first}" required></div>
          </div>
          <div class="preview" id="prev" aria-live="polite">Enter a salary to see the monthly breakdown.</div>
        </form>`,
      footer: `<button class="btn btn-ghost" data-close type="button">Cancel</button><button class="btn" type="submit" form="sal-form">Save salary</button>`,
    });
    const f = m.el.querySelector("#sal-form");
    const prev = m.el.querySelector("#prev");
    let timer = null;
    async function preview() {
      if (!f.monthly_gross.value) return;
      try {
        const p = await call("payroll.preview", { monthly_gross: f.monthly_gross.value, annual_rent: f.annual_rent.value, nhf_monthly: f.nhf_monthly.value, hmo_monthly: f.hmo_monthly.value });
        prev.innerHTML = `<dl><dt>Gross pay</dt><dd>${naira(p.gross_pay)}</dd>
          <dt>Employee pension</dt><dd>-${naira(p.pension_employee)}</dd>
          <dt>PAYE (annual ${naira(p.annual_paye, 0)})</dt><dd>-${naira(p.paye)}</dd>
          ${p.nhf ? `<dt>NHF</dt><dd>-${naira(p.nhf)}</dd>` : ""}${p.hmo ? `<dt>HMO / life assurance</dt><dd>-${naira(p.hmo)}</dd>` : ""}
          <dt class="total">Net pay</dt><dd class="total">${naira(p.net_pay)}</dd>
          <dt>Employer pension (not deducted)</dt><dd>${naira(p.pension_employer)}</dd></dl>`;
      } catch (err) { prev.textContent = err.message; }
    }
    f.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(preview, 400); });
    preview();
    f.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      try {
        await call("payroll.structuresSave", {
          employeeId: r.employee_id, monthly_gross: f.monthly_gross.value, annual_rent: f.annual_rent.value,
          nhf_monthly: f.nhf_monthly.value, hmo_monthly: f.hmo_monthly.value, effective_from: f.effective_from.value,
        });
        m.close();
        toast("Salary saved.");
        salariesTab();
      } catch (err) { const x = m.el.querySelector("#m-msg"); x.textContent = err.message; x.hidden = false; }
    });
  }

  // ------------------------------------------------------------ settings
  async function settingsTab() {
    loading(panel);
    try {
      renderSettings(await call("payroll.settingsGet"));
      await attendanceCard();
    } catch (err) {
      errorBox(panel, err instanceof ApiError ? err.message : "Could not load settings.");
    }
  }

  function renderSettings(s) {
    panel.innerHTML = `
      <div class="card" style="max-width:760px">
        <h2>Salary breakdown and pension</h2>
        <div id="s-msg" hidden></div>
        <form id="set-form" novalidate>
          <p class="muted">How a monthly gross salary is split on the payslip (must add up to 100%).</p>
          <div class="split-grid">
            ${[["split_basic", "Basic"], ["split_housing", "Housing"], ["split_transport", "Transport"], ["split_utility", "Utility"], ["split_meal", "Meal"]]
              .map(([k, l]) => `<div class="field"><label for="${k}">${l} %</label><input id="${k}" name="${k}" inputmode="decimal" value="${esc(s[k])}"></div>`).join("")}
          </div>
          <div class="hint" id="split-total" style="margin:-4px 0 16px"></div>
          <div class="inline-form" style="margin-bottom:16px">
            <div class="field"><label for="pension_employee_pct">Employee pension %</label><input id="pension_employee_pct" name="pension_employee_pct" inputmode="decimal" value="${esc(s.pension_employee_pct)}" style="width:120px"></div>
            <div class="field"><label for="pension_employer_pct">Employer pension %</label><input id="pension_employer_pct" name="pension_employer_pct" inputmode="decimal" value="${esc(s.pension_employer_pct)}" style="width:120px"></div>
          </div>
          <p class="hint" style="margin-top:-6px">Pension is worked out on basic + housing + transport. The legal minimums are 8% (employee) and 10% (employer).</p>
          <div class="field" style="max-width:420px"><label for="tax_one_off_pay">Tax on bonuses and performance rewards</label>
            <select id="tax_one_off_pay" name="tax_one_off_pay"><option value="yes"${s.tax_one_off_pay !== "no" ? " selected" : ""}>Tax them in the month they are paid (recommended)</option>
            <option value="no"${s.tax_one_off_pay === "no" ? " selected" : ""}>Do not tax them</option></select>
            <div class="hint">Bonuses are taxed once, at the rate that applies on top of the employee's annual income. Your existing payroll sheet does not tax them.</div></div>
          <button class="btn" id="set-save" type="submit">Save settings</button>
        </form>
      </div>
      <div class="card" style="max-width:760px">
        <h2>Tax rules (Nigeria Tax Act, from 2026)</h2>
        <p class="muted">These are set by law and cannot be edited here.</p>
        <div class="table-wrap"><table class="data"><thead><tr><th>Annual chargeable income</th><th class="num">Rate</th></tr></thead><tbody>
          ${s.bands.map((b, i, all) => `<tr><td>${esc(i === 0 ? "First " + naira(b.up_to, 0) : b.up_to === null ? "Above " + naira(all[i - 1].up_to, 0) : "Up to " + naira(b.up_to, 0))}</td><td class="num">${b.rate}%</td></tr>`).join("")}</tbody></table></div>
        <ul class="muted" style="margin:14px 0 0;padding-left:20px">
          <li>Chargeable income = 12 &times; (monthly gross &minus; employee pension &minus; NHF) &minus; rent relief.</li>
          <li>Rent relief = ${s.rent_relief_rate}% of annual rent, up to ${naira(s.rent_relief_cap, 0)} a year.</li>
          <li>Monthly gross under ${naira(s.paye_min_monthly, 0)} pays no PAYE.</li>
        </ul>
      </div>`;
    const f = panel.querySelector("#set-form");
    const totalEl = panel.querySelector("#split-total");
    const keys = ["split_basic", "split_housing", "split_transport", "split_utility", "split_meal"];
    const updateTotal = () => {
      const total = keys.reduce((a, k) => a + (Number(f[k].value) || 0), 0);
      totalEl.textContent = `Total: ${Math.round(total * 100) / 100}%` + (Math.abs(total - 100) > 0.0001 ? " - must be 100%" : "");
      totalEl.style.color = Math.abs(total - 100) > 0.0001 ? "var(--danger)" : "";
    };
    f.addEventListener("input", updateTotal);
    updateTotal();
    f.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const msg = panel.querySelector("#s-msg");
      msg.hidden = true;
      const data = {};
      new FormData(f).forEach((v, k) => { data[k] = v; });
      try { await call("payroll.settingsSave", data); toast("Settings saved."); }
      catch (err) { msg.className = "alert alert-error"; msg.textContent = err.message; msg.hidden = false; }
    });
  }

  // Lateness and days with no clock-in: what they cost on the payslip. Sits under the salary settings.
  async function attendanceCard() {
    const [a, people] = await Promise.all([call("payroll.attendanceGet"), call("employees.list")]);
    const canSave = role === "owner" || role === "hr_admin";
    const hour = (a.hours_per_day || 8);
    const card = document.createElement("div");
    card.className = "card";
    card.style.maxWidth = "760px";
    card.innerHTML = `
      <h2>Lateness and days with no clock-in</h2>
      <p class="muted" style="margin-top:0">A day's pay is the monthly gross salary divided by the days in that month. Everything below comes off <strong>before tax</strong>, so PAYE and pension are worked out on the pay actually earned. Each payslip shows the amount with its explanation, and you can change or waive it on a draft payslip.</p>
      <div id="a-msg" hidden></div>
      <form id="att-form" novalidate>
        <fieldset class="field"><legend>When someone arrives late</legend>
          <label class="check"><input type="radio" name="late_rule" value="none"${a.late_rule === "none" ? " checked" : ""}> Do nothing <span class="muted">(the default)</span></label>
          <label class="check"><input type="radio" name="late_rule" value="half_day"${a.late_rule === "half_day" ? " checked" : ""}> Deduct half a day's salary for each late day</label>
          <label class="check"><input type="radio" name="late_rule" value="hourly"${a.late_rule === "hourly" ? " checked" : ""}> Deduct an hour's salary for each hour of lateness</label>
          <div class="hint">Late means clocking in after ${esc(a.work_start)} plus the ${esc(a.grace_minutes)}-minute grace period (set under Attendance). With the hourly rule the lateness is counted from ${esc(a.work_start)}, and being even one minute into an hour costs that whole hour. An hour is a day's pay divided by the ${hour} working hours of a day (${esc(a.work_start)} to ${esc(a.work_end)}), and one day never costs more than a day's pay.</div></fieldset>
        <div class="field"><label class="check"><input type="checkbox" name="absence_rule"${a.absence_rule === "deduct" ? " checked" : ""}> A working day with no clock-in loses that whole day's pay</label>
          <div class="hint">Weekends, public holidays and approved leave are never counted. People with no sign-in to the system cannot clock in, so they are never charged.</div></div>
        <div class="field" style="max-width:300px"><label for="a-from">Count from (optional)</label><input id="a-from" name="attendance_from" type="date" value="${esc(a.attendance_from)}">
          <div class="hint">Days before this date are never counted. Days before anyone in the company first clocked in are never counted either.</div></div>
        <fieldset class="field"><legend>Never charged (for example directors, or staff who work away and do not clock in)</legend>
          <div class="check-grid">${people.filter((e) => e.status !== "terminated").sort((x, y) => (x.first_name + x.last_name).localeCompare(y.first_name + y.last_name))
            .map((e) => `<label class="check"><input type="checkbox" name="exempt" value="${esc(e.id)}"${a.exempt.includes(e.id) ? " checked" : ""}> ${esc(e.first_name + " " + e.last_name)}</label>`).join("")}</div></fieldset>
        ${canSave ? `<button class="btn" id="att-save" type="submit">Save these rules</button>` : `<p class="muted">Only HR and the owner can change these.</p>`}
      </form>`;
    const first = panel.querySelector(".card");
    if (first) first.after(card); else panel.appendChild(card);
    const f = card.querySelector("#att-form");
    if (!canSave) f.querySelectorAll("input").forEach((i) => { i.disabled = true; });
    f.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const msg = card.querySelector("#a-msg");
      msg.hidden = true;
      const body = {
        late_rule: f.late_rule.value, absence_rule: f.absence_rule.checked ? "deduct" : "none", attendance_from: f.attendance_from.value,
        exempt: [...f.querySelectorAll("input[name=exempt]:checked")].map((i) => i.value),
      };
      try { await call("payroll.attendanceSave", body); toast("Saved. They apply to payroll runs from now on; recalculate a draft run to apply them to it."); }
      catch (err) { msg.className = "alert alert-error"; msg.textContent = err.message; msg.hidden = false; }
    });
  }

  show();
}
