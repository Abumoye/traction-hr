// One employee's location rule: exempt from the location check, and/or limited to chosen work sites.
// Used from the employee's profile and from Attendance > Team. HR and the owner only (the server enforces it).
import { call } from "./api.js";
import { esc, openModal, toast } from "./ui.js";

// A plain-language line for a rule as returned by attendance.rulesGet.
export function describeRule(r) {
  if (r.exempt) return "Exempt from the location check: their location is never asked for or stored, and they can clock in from anywhere.";
  if (r.site_ids.length) {
    const names = r.sites.filter((s) => r.site_ids.includes(s.id)).map((s) => s.name);
    return `Can clock in at: ${names.join(", ")}. Clock-ins anywhere else are flagged or blocked.`;
  }
  return "Follows the company rule: any of the company's work sites.";
}

export async function openLocationRules({ employeeId, onSaved }) {
  let r;
  try { r = await call("attendance.rulesGet", { employeeId }); }
  catch (err) { toast(err.message, "error"); return; }

  const m = openModal({
    title: `Clock-in location: ${r.employee_name}`, narrow: true,
    html: `<div id="m-msg" class="alert alert-error" hidden></div>
      ${r.mode === "off" ? `<div class="alert alert-info">The company's location check is switched off, so this takes effect only when it is switched on (Attendance &gt; Team &gt; Location check).</div>` : ""}
      <form id="rule-form" novalidate>
        <div class="field"><label class="check"><input type="checkbox" id="r-exempt" name="exempt"${r.exempt ? " checked" : ""}> Exempt from the location check</label>
          <div class="hint">Their location is never asked for or stored. Use it for drivers, sales staff or anyone who works away from a fixed place. They can also clock in as remote when the company blocks remote clock-in.</div></div>
        <div id="r-sites">
          <div class="field"><label>Work sites they can clock in at</label>
            ${r.sites.length ? r.sites.map((s) => `<label class="check" style="margin:4px 0"><input type="checkbox" name="site" value="${esc(s.id)}"${r.site_ids.includes(s.id) ? " checked" : ""}> ${esc(s.name)}</label>`).join("")
              : `<p class="muted">The company has no work sites yet. Add them under Attendance &gt; Team &gt; Location check.</p>`}
            <div class="hint">Leave all unticked to allow every work site.</div></div>
        </div>
      </form>`,
    footer: `<button class="btn btn-ghost" data-close type="button">Cancel</button><button class="btn" type="submit" form="rule-form">Save</button>`,
  });

  const form = m.el.querySelector("#rule-form");
  const exempt = m.el.querySelector("#r-exempt");
  const sites = m.el.querySelector("#r-sites");
  const sync = () => { sites.hidden = exempt.checked; }; // an exempt person is not compared with any site
  exempt.addEventListener("change", sync);
  sync();

  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const siteIds = exempt.checked ? [] : [...form.querySelectorAll('input[name="site"]:checked')].map((c) => c.value);
    try {
      await call("attendance.rulesSave", { employeeId, exempt: exempt.checked, siteIds });
      m.close();
      toast("Location rule saved.");
      if (onSaved) onSaved();
    } catch (err) {
      const x = m.el.querySelector("#m-msg");
      x.textContent = err.message;
      x.hidden = false;
    }
  });
}
