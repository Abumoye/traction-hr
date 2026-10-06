import { call, ApiError } from "../api.js";
import { initPage, loading, errorBox } from "../layout.js";
import { esc, toast, confirmDialog, formatDate } from "../ui.js";
import { naira } from "../money.js";

const id = new URLSearchParams(location.search).get("id");
const page = initPage({ active: "recruitment", title: "Offer letter" });
if (page) run(page);

async function run({ content }) {
  if (!id) return errorBox(content, "No offer was chosen.");
  let o = null;
  let editing = false;

  async function load() {
    loading(content);
    try { o = await call("recruitment.offersGet", { id }); render(); }
    catch (err) { errorBox(content, err instanceof ApiError ? err.message : "Could not load this offer."); }
  }

  const label = { draft: "Draft", sent: "Sent", accepted: "Accepted", declined: "Declined" };

  function render() {
    document.title = `Offer for ${o.applicant_name} | Traction Outsourcing HR`;
    const draft = o.status === "draft";
    content.innerHTML = `
      <div class="toolbar no-print">
        <a class="btn btn-ghost btn-sm" href="applicant.html?id=${encodeURIComponent(o.applicant_id)}">&larr; ${esc(o.applicant_name)}</a>
        <span class="badge ${o.status === "accepted" ? "paid" : o.status === "declined" ? "rejected" : o.status === "sent" ? "approved" : "draft"}">${esc(label[o.status])}</span>
        <span class="muted">${naira(o.monthly_gross)} a month &middot; starts ${esc(formatDate(o.start_date))} &middot; reply by ${esc(formatDate(o.valid_until))}</span>
        <span class="spacer" style="display:flex;gap:8px;flex-wrap:wrap">
          ${draft ? `<button class="btn btn-ghost btn-sm" id="edit" type="button">${editing ? "Cancel editing" : "Edit text"}</button>` : ""}
          <button class="btn btn-ghost btn-sm" id="print" type="button">Print or save as PDF</button>
          ${draft ? `<button class="btn btn-sm" id="sent" type="button">Mark as sent</button><button class="btn btn-ghost btn-sm" id="del" type="button">Delete draft</button>` : ""}
          ${o.status === "sent" ? `<button class="btn btn-sm" id="accepted" type="button">Accepted</button><button class="btn btn-ghost btn-sm" id="declined" type="button">Declined</button>` : ""}
        </span>
      </div>
      ${draft ? `<div class="alert alert-info no-print">This is a draft built from your payroll, working-hours and leave settings. Check it, edit anything you need, then print it and mark it as sent.</div>` : ""}
      ${o.status === "accepted" ? `<div class="alert alert-ok no-print">Accepted. You can now hire ${esc(o.applicant_name)} from their applicant page.</div>` : ""}
      ${editing ? `<div class="card no-print"><form id="body-form" novalidate><div class="field"><label for="body">Letter text</label>
        <textarea id="body" name="body" rows="24" style="font-family:inherit;line-height:1.5">${esc(o.body)}</textarea></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" type="submit">Save text</button>
        <button class="btn btn-ghost" id="regen" type="button">Rebuild from the details</button></div></form></div>` : ""}
      <article class="letter" aria-label="Offer letter">
        <header><h2>${esc(o.company_name)}</h2></header>
        <div class="body">${esc(o.body)}</div>
        <div class="accept"><strong>Acceptance</strong><br>I, ${esc(o.applicant_name)}, accept this offer of employment on the terms above.
          <div class="sig"><div>Signature</div><div>Date</div></div></div>
      </article>`;

    const on = (sel, fn) => { const el = content.querySelector(sel); if (el) el.addEventListener("click", fn); };
    on("#print", () => window.print());
    on("#edit", () => { editing = !editing; render(); });
    on("#sent", () => setStatus("sent", "Marked as sent."));
    on("#accepted", () => setStatus("accepted", "Offer accepted."));
    on("#declined", async () => { if (await confirmDialog("Mark this offer as declined?", { okText: "Declined" })) setStatus("declined", "Offer declined."); });
    on("#del", async () => {
      if (!(await confirmDialog("Delete this draft offer?", { okText: "Delete", danger: true }))) return;
      try { await call("recruitment.offersDelete", { id }); location.href = "applicant.html?id=" + encodeURIComponent(o.applicant_id); } catch (err) { toast(err.message, "error"); }
    });
    const form = content.querySelector("#body-form");
    if (form) {
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        try { o = await call("recruitment.offersUpdate", { id, body: form.body.value }); editing = false; toast("Saved."); render(); } catch (err) { toast(err.message, "error"); }
      });
      content.querySelector("#regen").addEventListener("click", async () => {
        if (!(await confirmDialog("Rebuild the letter from the offer details? Your edits to the text will be replaced.", { okText: "Rebuild" }))) return;
        try { o = await call("recruitment.offersUpdate", { id, regenerate: true }); editing = false; toast("Letter rebuilt."); render(); } catch (err) { toast(err.message, "error"); }
      });
    }
  }

  async function setStatus(status, text) {
    try { o = await call("recruitment.offersSetStatus", { id, status }); toast(text); render(); } catch (err) { toast(err.message, "error"); }
  }

  load();
}
