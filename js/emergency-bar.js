// The red bar for medical emergency messages. It sits at the top of every page and stays until the person chooses one of its two
// buttons: Acknowledged or Dismiss. Nothing else removes it (not the next page, not a refresh, not signing in again).
// bell.js feeds it from the same quiet check that updates the bell; the last list is remembered for the next page so the bar
// is there at once instead of after the next check.
import { call, ApiError } from "./api.js";
import { esc, toast } from "./ui.js";

const KEY = "tol_em";
let items = [];
let baseTitle = null;

export function recallEmergency() {
  try { return JSON.parse(sessionStorage.getItem(KEY) || "[]"); } catch (e) { return []; }
}

function remember() {
  try { sessionStorage.setItem(KEY, JSON.stringify(items)); } catch (e) { /* no memory between pages; the next check still shows it */ }
}

// list: what the server says is waiting for this person ([] when nothing is).
export function setEmergency(list) {
  items = Array.isArray(list) ? list : [];
  remember();
  draw();
}

function timeText(iso) {
  const d = new Date(iso);
  return isNaN(d) ? "" : d.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function draw() {
  const bar = document.getElementById("emergency-bar");
  if (!bar) return;
  if (baseTitle === null) baseTitle = document.title;
  // the Medical emergency page shows these messages itself, so the bar steps aside there
  const onPage = document.body.dataset.page === "emergency";
  if (!items.length || onPage) {
    bar.hidden = true;
    bar.innerHTML = "";
    document.title = baseTitle;
    return;
  }
  const first = items[0];
  bar.innerHTML = `<div class="em-main">
      <strong>MEDICAL EMERGENCY from ${esc(first.from)}</strong> <span class="em-time">${esc(timeText(first.sent_at))}</span>
      <p>${first.location ? `At ${esc(first.location)}. ` : ""}${esc(first.message)}</p>
      ${items.length > 1 ? `<small>${items.length - 1} more waiting after this one</small>` : ""}
    </div>
    <div class="em-actions">
      <button type="button" class="btn em-ack" data-r="acknowledged">Acknowledged</button>
      <button type="button" class="btn btn-ghost em-dismiss" data-r="dismissed">Dismiss</button>
      <a href="emergency.html" class="em-open">Open</a>
    </div>`;
  bar.hidden = false;
  document.title = "(!) Medical emergency | " + baseTitle;
  bar.querySelectorAll("button[data-r]").forEach((b) => b.addEventListener("click", () => answer(first.id, b.dataset.r, bar)));
}

async function answer(id, response, bar) {
  bar.querySelectorAll("button").forEach((b) => { b.disabled = true; });
  try {
    await call("emergency.respond", { id, response });
    items = items.filter((x) => x.id !== id);
    remember();
    draw();
    toast(response === "acknowledged" ? "Acknowledged. The sender has been told." : "Dismissed. The sender has been told.");
  } catch (err) {
    const msg = err instanceof ApiError ? err.message : "ERROR: Contact Administrator.";
    if (/already answered|not addressed to you/.test(msg)) { items = items.filter((x) => x.id !== id); remember(); draw(); return; }
    toast(msg, "error");
    bar.querySelectorAll("button").forEach((b) => { b.disabled = false; });
  }
}
