// The bell in the top bar: a number for unread notifications, refreshed quietly (no loading bar) while the page is open.
import { call } from "./api.js";
import { toast } from "./ui.js";

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
