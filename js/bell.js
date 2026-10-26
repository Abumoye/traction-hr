// The bell in the top bar: a number for unread notifications, refreshed quietly (no loading bar) while the page is open.
import { call } from "./api.js";
import { toast } from "./ui.js";
import { registerWorker, pushState, enablePush, dismissedRecently, dismissPrompt, syncDevice } from "./push.js";

const POLL_MS = 120000;
const KEY = "tol_bell";

export function setBellCount(n) {
  const badge = document.getElementById("bell-badge");
  const bell = document.getElementById("bell");
  if (!badge || !bell) return;
  badge.textContent = n > 99 ? "99+" : String(n);
  badge.hidden = !(n > 0);
  bell.setAttribute("aria-label", n > 0 ? `Notifications, ${n} unread` : "Notifications");
}

function remembered() {
  try { return JSON.parse(sessionStorage.getItem(KEY) || "null"); } catch (e) { return null; }
}

function remember(v) {
  try { sessionStorage.setItem(KEY, JSON.stringify(v)); } catch (e) { /* private window: no toast memory, nothing else lost */ }
}

export function startBell() {
  if (!document.getElementById("bell")) return;
  async function poll() {
    if (document.visibilityState === "hidden") return;
    try {
      const r = await call("notifications.count", {}, { quiet: true });
      setBellCount(r.unread);
      const before = remembered();
      const id = r.latest ? r.latest.id : "";
      // a short message when something new arrives while the page is open (not for what was already waiting at sign-in)
      if (before && r.unread > before.unread && id && id !== before.id) toast("New notification: " + r.latest.title);
      remember({ id, unread: r.unread });
    } catch (e) { /* the bell keeps its last number; the next poll tries again */ }
  }
  poll();
  setInterval(poll, POLL_MS);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") poll(); });
}

// Phone alerts: get the service worker ready, and (once, politely) offer to turn alerts on. Never asks without a tap.
export async function startPhoneAlerts() {
  const bar = document.getElementById("push-bar");
  await registerWorker();
  syncDevice();
  if (!bar || dismissedRecently()) return;
  const state = await pushState();
  if (state !== "off" && state !== "install") return;
  const later = '<button class="btn btn-ghost btn-sm" id="push-later" type="button">Not now</button>';
  bar.innerHTML = state === "off"
    ? '<span><strong>Get alerts on this phone.</strong> A pop-up, vibration and sound when something needs you, even when the app is closed.</span>'
      + '<span class="push-actions"><button class="btn btn-sm" id="push-on" type="button">Turn on</button>' + later + '</span>'
    : '<span><strong>Get alerts on your iPhone.</strong> Tap the Share button in Safari, choose Add to Home Screen, then open the app from your Home Screen and turn alerts on there.</span>'
      + '<span class="push-actions">' + later + '</span>';
  bar.hidden = false;
  bar.querySelector("#push-later").addEventListener("click", () => { dismissPrompt(); bar.hidden = true; });
  const on = bar.querySelector("#push-on");
  if (on) on.addEventListener("click", async () => {
    on.disabled = true;
    try { await enablePush(); toast("Phone alerts are on for this device."); bar.hidden = true; }
    catch (err) { toast(err.message, "error"); on.disabled = false; if ((await pushState()) === "blocked") bar.hidden = true; }
  });
}
