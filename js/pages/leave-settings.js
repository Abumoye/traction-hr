import { call, ApiError } from "../api.js";
import { initPage, loading, errorBox } from "../layout.js";
import { esc, openModal, confirmDialog, toast, formatDate, todayLagos } from "../ui.js";

const page = initPage({ active: "leaveSettings", title: "Leave settings" });
if (page) run(page);

async function run({ content }) {
  let year = +todayLagos().slice(0, 4);

  async function load() {
    loading(content);
    try {
      const [types, holidays] = await Promise.all([call("leaveTypes.list"), call("holidays.list", { year })]);
      render(types, holidays);
    } catch (err) {
      errorBox(content, err instanceof ApiError ? err.message : "Could not load settings.");
    }
  }

  function render(types, holidays) {
    content.innerHTML = `
      <div class="card">
        <div class="toolbar" style="margin-bottom:8px"><h2 style="margin:0">Leave types</h2>
          <span class="spacer"><button class="btn btn-sm" id="add-type" type="button">Add leave type</button></span></div>
        <p class="muted">Days are working days (Monday to Friday, without public holidays). Leave the yearly allowance blank for no limit.</p>
        ${types.length ? `<div class="table-wrap"><table class="data"><thead><tr><th>Name</th><th>Days a year</th><th>Carry over (max)</th><th>Paid</th><th>Available to</th><th>Available after</th><th></th></tr></thead><tbody>
          ${types.map((t) => `<tr><td><strong>${esc(t.name)}</strong></td><td>${t.days_per_year === "" ? "No limit" : esc(t.days_per_year)}</td>
            <td>${esc(t.carry_over || "0")}</td><td>${t.paid === "no" ? "Unpaid" : "Paid"}</td>
            <td>${t.applies_to === "female" ? "Female staff only" : t.applies_to === "male" ? "Male staff only" : "<span class='muted'>Everyone</span>"}</td>
            <td>${+t.min_service_months ? esc(t.min_service_months) + " months of service" : "<span class='muted'>Immediately</span>"}</td>
            <td style="text-align:right;white-space:nowrap"><button class="btn btn-ghost btn-sm" data-edit="${esc(t.id)}" type="button">Edit</button>
              <button class="btn btn-ghost btn-sm" data-del="${esc(t.id)}" type="button">Delete</button></td></tr>`).join("")}</tbody></table></div>`
          : `<div class="card empty" style="margin:0">No leave types yet.<br><br><button class="btn" id="seed" type="button">Add suggested leave types</button>
            <p class="muted" style="margin:10px 0 0">Annual 20, Sick 12, Maternity 60 (12 weeks), Paternity 10, Compassionate 5, Unpaid. You can edit them afterwards.</p></div>`}
        <p class="muted" style="margin:12px 0 0">"Available to" limits a leave type to female or male staff (Maternity Leave is for women), which needs a gender on the employee's profile. "Available after" is the months of service an employee must complete before they can request that leave (Annual Leave 12, Maternity Leave 24), counted from their date joined, so every employee needs one on record. For leave types with the part-year share switched on (Annual Leave), someone who qualifies mid-year receives a share of the allowance for the part of the year left; other types give the whole allowance. Carry-over applies to people who were already eligible during the previous year. HR can record leave as an exception to the service period, but never to the gender rule.</p>
      </div>

      <div class="card">
        <div class="toolbar" style="margin-bottom:8px"><h2 style="margin:0">Public holidays</h2>
          <span class="spacer" style="display:flex;gap:8px;align-items:center">
            <button class="btn btn-ghost btn-sm" id="y-prev" type="button" aria-label="Previous year">&larr;</button><strong>${year}</strong>
            <button class="btn btn-ghost btn-sm" id="y-next" type="button" aria-label="Next year">&rarr;</button>
            <button class="btn btn-ghost btn-sm" id="seed-hol" type="button">Add standard holidays</button>
            <button class="btn btn-sm" id="add-hol" type="button">Add holiday</button></span></div>
        <p class="muted">Standard holidays adds the fixed Nigerian dates plus Good Friday and Easter Monday. Eid al-Fitr, Eid al-Adha and Mawlid are declared by the government each year, so add those once announced. If a holiday falls on a weekend and a replacement day is declared, add that day too.</p>
        ${holidays.length ? `<div class="table-wrap"><table class="data"><thead><tr><th>Date</th><th>Holiday</th><th></th></tr></thead><tbody>
          ${holidays.map((h) => `<tr><td>${esc(formatDate(h.date))}</td><td>${esc(h.name)}</td>
            <td style="text-align:right;white-space:nowrap"><button class="btn btn-ghost btn-sm" data-hedit="${esc(h.id)}" type="button">Edit</button>
              <button class="btn btn-ghost btn-sm" data-hdel="${esc(h.id)}" type="button">Delete</button></td></tr>`).join("")}</tbody></table></div>`
          : `<div class="card empty" style="margin:0">No holidays listed for ${year}.</div>`}
      </div>`;

    content.querySelector("#add-type").addEventListener("click", () => editType(null));
    content.querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", () => editType(types.find((t) => t.id === b.dataset.edit))));
    content.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", () => delType(types.find((t) => t.id === b.dataset.del))));
    const seed = content.querySelector("#seed");
    if (seed) seed.addEventListener("click", async () => { try { await call("leaveTypes.seed"); toast("Leave types added."); load(); } catch (e) { toast(e.message, "error"); } });

    content.querySelector("#y-prev").addEventListener("click", () => { year--; load(); });
    content.querySelector("#y-next").addEventListener("click", () => { year++; load(); });
    content.querySelector("#seed-hol").addEventListener("click", async () => {
      try { const r = await call("holidays.seedYear", { year }); toast(r.added ? `${r.added} holidays added.` : "Those holidays are already listed."); load(); } catch (e) { toast(e.message, "error"); }
    });
    content.querySelector("#add-hol").addEventListener("click", () => editHoliday(null));
    content.querySelectorAll("[data-hedit]").forEach((b) => b.addEventListener("click", () => editHoliday(holidays.find((h) => h.id === b.dataset.hedit))));
    content.querySelectorAll("[data-hdel]").forEach((b) => b.addEventListener("click", () => delHoliday(holidays.find((h) => h.id === b.dataset.hdel))));
  }

  function formModal({ title, html, formId, submitText = "Save", onSubmit }) {
    const m = openModal({
      title, narrow: true,
      html: `<div id="m-msg" class="alert alert-error" hidden></div><form id="${formId}" novalidate>${html}</form>`,
      footer: `<button class="btn btn-ghost" data-close type="button">Cancel</button><button class="btn" type="submit" form="${formId}">${submitText}</button>`,
    });
    m.el.querySelector("#" + formId).addEventListener("submit", async (ev) => {
      ev.preventDefault();
      try { await onSubmit(ev.target); m.close(); toast("Saved."); load(); }
      catch (err) { const x = m.el.querySelector("#m-msg"); x.textContent = err instanceof ApiError ? err.message : "Something went wrong."; x.hidden = false; }
    });
  }

  function editType(t) {
    formModal({
      title: t ? "Edit leave type" : "Add leave type", formId: "t-form",
      html: `<div class="field"><label for="t-name">Name</label><input id="t-name" name="name" maxlength="60" value="${esc(t ? t.name : "")}" required></div>
        <div class="field"><label for="t-days">Days a year</label><input id="t-days" name="days" inputmode="numeric" value="${esc(t ? t.days_per_year : "")}"><div class="hint">Leave blank for no limit.</div></div>
        <div class="field"><label for="t-carry">Most days that can carry over to next year</label><input id="t-carry" name="carry" inputmode="numeric" value="${esc(t ? t.carry_over || "0" : "0")}"></div>
        <div class="field"><label for="t-paid">Pay</label><select id="t-paid" name="paid"><option value="yes"${!t || t.paid !== "no" ? " selected" : ""}>Paid</option><option value="no"${t && t.paid === "no" ? " selected" : ""}>Unpaid</option></select></div>
        <div class="field"><label for="t-applies">Available to</label><select id="t-applies" name="applies">
          <option value=""${!t || !t.applies_to ? " selected" : ""}>Everyone</option>
          <option value="female"${t && t.applies_to === "female" ? " selected" : ""}>Female staff only</option>
          <option value="male"${t && t.applies_to === "male" ? " selected" : ""}>Male staff only</option></select>
          <div class="hint">Staff of the other gender will not see this leave. Gender comes from the employee profile.</div></div>
        <div class="field"><label for="t-months">Available after (months of service)</label><input id="t-months" name="months" inputmode="numeric" value="${esc(t ? t.min_service_months || "0" : "0")}">
          <div class="hint">0 means staff can request it straight away. For example 12 for Annual Leave or 24 for Maternity Leave.</div></div>
        <div class="field"><label for="t-prorate">Part-year share in the year people qualify</label><select id="t-prorate" name="prorate">
          <option value="no"${!t || t.prorate !== "yes" ? " selected" : ""}>No - they get the whole allowance</option>
          <option value="yes"${t && t.prorate === "yes" ? " selected" : ""}>Yes - a share for the part of the year left</option></select>
          <div class="hint">Right for annual leave. Not for a fixed entitlement such as maternity leave.</div></div>`,
      onSubmit: (f) => call("leaveTypes.save", { id: t ? t.id : "", name: f.name.value, days_per_year: f.days.value, carry_over: f.carry.value, paid: f.paid.value, min_service_months: f.months.value, applies_to: f.applies.value, prorate: f.prorate.value }),
    });
  }

  async function delType(t) {
    if (!(await confirmDialog(`Delete the "${t.name}" leave type?`, { okText: "Delete", danger: true }))) return;
    try { await call("leaveTypes.delete", { id: t.id }); toast("Leave type deleted."); load(); } catch (e) { toast(e.message, "error"); }
  }

  function editHoliday(h) {
    formModal({
      title: h ? "Edit holiday" : "Add holiday", formId: "h-form",
      html: `<div class="field"><label for="h-date">Date</label><input id="h-date" name="date" type="date" value="${esc(h ? h.date : "")}" required></div>
        <div class="field"><label for="h-name">Name</label><input id="h-name" name="name" maxlength="80" value="${esc(h ? h.name : "")}" required></div>`,
      onSubmit: (f) => call("holidays.save", { id: h ? h.id : "", date: f.date.value, name: f.name.value }),
    });
  }

  async function delHoliday(h) {
    if (!(await confirmDialog(`Remove ${h.name} (${formatDate(h.date)})?`, { okText: "Remove", danger: true }))) return;
    try { await call("holidays.delete", { id: h.id }); toast("Holiday removed."); load(); } catch (e) { toast(e.message, "error"); }
  }

  load();
}
