import { call, ApiError } from "../api.js";
import { initPage, loading, errorBox } from "../layout.js";
import { esc, formatDateTime, toast, setBusy } from "../ui.js";

const page = initPage({ active: "emergency", title: "Medical emergency" });
if (page) run(page);

const ROLE = { manager: "Manager", hr: "HR manager", owner: "Owner", hr_admin: "HR manager" };
const when = (iso) => (iso ? formatDateTime(iso) : "");

async function run({ content }) {
  loading(content);
  let data;
  try {
    data = await call("emergency.list");
  } catch (err) {
    return errorBox(content, err instanceof ApiError ? err.message : "Could not load this page.");
  }

  const r = data.reach;
  const managerText = r.manager_reachable ? `My manager: <strong>${esc(r.manager_name)}</strong>`
    : `My manager <span class="muted">(${r.manager_name ? esc(r.manager_name) + " cannot be reached here" : "none on record"}: HR will be told instead)</span>`;
  const hrText = r.hr_count ? `HR manager${r.hr_count === 1 ? "" : "s"} <span class="muted">(${r.hr_count})</span>` : `HR <span class="muted">(no HR manager: the owner will be told)</span>`;

  content.innerHTML = `
    <div class="alert alert-error"><strong>If anyone's life is in danger, call the emergency services first (112).</strong> This tells people at work; it does not call for help.</div>
    <div id="waiting"></div>
    <section class="card">
      <h2>Tell my manager or HR</h2>
      <p class="muted" style="margin-top:0">Your message appears at the top of their screen, and as a phone alert if they have turned phone alerts on, until they acknowledge or dismiss it. HR and the owner keep a record of it.</p>
      <div id="send-msg" class="alert alert-error" hidden></div>
      <form id="send-form" novalidate>
        <div class="field"><label class="required" for="em-msg">What is happening?</label><textarea id="em-msg" name="message" rows="4" maxlength="1000" placeholder="For example: I feel very unwell and cannot continue working."></textarea></div>
        <div class="field"><label for="em-loc">Where are you? (optional)</label><input id="em-loc" name="location" maxlength="200" placeholder="For example: Lagos office, 2nd floor, or at home"></div>
        <fieldset class="field"><legend>Who should be told?</legend>
          <label class="check"><input type="checkbox" name="toManager" checked> ${managerText}</label>
          <label class="check"><input type="checkbox" name="toHr" checked> ${hrText}</label>
        </fieldset>
        <button type="submit" class="btn btn-danger" id="send-btn">Send emergency message</button>
      </form>
      <div id="sent-ok" hidden></div>
    </section>
    <div id="lists"></div>`;

  const waiting = content.querySelector("#waiting"), lists = content.querySelector("#lists");

  function recipientsTable(recs) {
    return `<div class="table-wrap"><table class="data"><thead><tr><th>Told</th><th>Saw it</th><th>Chose</th></tr></thead><tbody>${recs.map((p) => `<tr>
      <td><strong>${esc(p.name)}</strong><div class="muted">${esc(ROLE[p.kind] || p.kind)}</div></td>
      <td>${p.seen_at ? esc(when(p.seen_at)) : '<span class="muted">Not yet</span>'}</td>
      <td>${p.response ? `<span class="badge ${p.response === "acknowledged" ? "approved" : "cancelled"}">${p.response === "acknowledged" ? "Acknowledged" : "Dismissed"}</span><div class="muted">${esc(when(p.responded_at))}</div>` : '<span class="badge pending">Waiting</span>'}</td></tr>`).join("")}</tbody></table></div>`;
  }

  function draw(d) {
    waiting.innerHTML = d.pending.length ? d.pending.map((p) => `<section class="card em-card" data-id="${esc(p.id)}">
        <div class="em-head"><strong>MEDICAL EMERGENCY from ${esc(p.from)}</strong><span class="muted">${esc(when(p.sent_at))}</span></div>
        <p>${p.location ? `<em>At ${esc(p.location)}.</em> ` : ""}${esc(p.message)}</p>
        <div class="em-btns"><button type="button" class="btn" data-answer="acknowledged">Acknowledged</button><button type="button" class="btn btn-ghost" data-answer="dismissed">Dismiss</button></div>
        <p class="muted" style="margin:8px 0 0;font-size:13px">This stays on your screen until you choose one. Your choice and the time are recorded and the sender is told.</p>
      </section>`).join("") : "";
    waiting.querySelectorAll(".em-card").forEach((card) => card.querySelectorAll("[data-answer]").forEach((b) => b.addEventListener("click", async () => {
      card.querySelectorAll("button").forEach((x) => { x.disabled = true; });
      try {
        await call("emergency.respond", { id: card.dataset.id, response: b.dataset.answer });
        toast(b.dataset.answer === "acknowledged" ? "Acknowledged. The sender has been told." : "Dismissed. The sender has been told.");
        refresh();
      } catch (err) {
        toast(err instanceof ApiError ? err.message : "ERROR: Contact Administrator.", "error");
        card.querySelectorAll("button").forEach((x) => { x.disabled = false; });
      }
    })));

    lists.innerHTML = `
      <section class="card"><h2>Sent by me</h2>${d.sent.length ? d.sent.map((m) => `<div class="em-sent">
          <div><strong>${esc(when(m.created_at))}</strong>${m.location ? ` <span class="muted">&middot; ${esc(m.location)}</span>` : ""}</div>
          <p>${esc(m.message)}</p>${recipientsTable(m.recipients)}</div>`).join("") : `<p class="muted">You have not sent any emergency messages.</p>`}</section>
      ${d.received.length ? `<section class="card"><h2>Messages I answered</h2><div class="table-wrap"><table class="data"><thead><tr><th>From</th><th>Message</th><th>Sent</th><th>I chose</th></tr></thead><tbody>${d.received.map((x) => `<tr>
        <td><strong>${esc(x.from)}</strong></td><td>${x.location ? `<em>At ${esc(x.location)}.</em> ` : ""}${esc(x.message)}</td><td>${esc(when(x.sent_at))}</td>
        <td><span class="badge ${x.response === "acknowledged" ? "approved" : "cancelled"}">${x.response === "acknowledged" ? "Acknowledged" : "Dismissed"}</span><div class="muted">${esc(when(x.responded_at))}</div></td></tr>`).join("")}</tbody></table></div></section>` : ""}`;
  }

  async function refresh() {
    try { draw(await call("emergency.list", {}, { quiet: true })); } catch (err) { /* keep what is on screen */ }
  }

  draw(data);

  // what the people told have done shows up here without reloading the page
  setInterval(() => { if (document.visibilityState === "visible" && !content.querySelector("#em-msg:focus")) refresh(); }, 30000);

  const form = content.querySelector("#send-form"), msg = content.querySelector("#send-msg"), okBox = content.querySelector("#sent-ok");
  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    msg.hidden = true;
    const btn = content.querySelector("#send-btn");
    const body = { message: form.message.value, location: form.location.value, toManager: form.toManager.checked, toHr: form.toHr.checked };
    if (!body.toManager && !body.toHr) { msg.textContent = "Choose who to tell: your manager, HR, or both."; msg.hidden = false; return; }
    if (body.message.trim().length < 5) { msg.textContent = "Say what is happening, in a few words at least."; msg.hidden = false; return; }
    setBusy(btn, true, "Sending...");
    try {
      const r2 = await call("emergency.send", body);
      form.message.value = "";
      okBox.hidden = false;
      okBox.innerHTML = `<div class="alert alert-ok" role="status"><strong>Sent.</strong> ${r2.recipients.map((p) => esc(p.name)).join(" and ")} ${r2.recipients.length === 1 ? "has" : "have"} been told.
        ${r2.notes.map((n) => `<div>${esc(n)}</div>`).join("")}<div class="muted">This page shows when they have seen it and what they chose.</div></div>`;
      refresh();
    } catch (err) {
      msg.textContent = err instanceof ApiError ? err.message : "ERROR: Contact Administrator.";
      msg.hidden = false;
    }
    setBusy(btn, false);
  });
}
