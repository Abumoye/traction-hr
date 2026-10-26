// Phone alerts (Web Push): the browser side. The server side is backend/WebPush.gs.
//   "on"          this device is set up and will get alerts even when the app is closed
//   "off"         it can be, but is not yet
//   "install"     an iPhone or iPad where the app must first be added to the Home Screen (Apple only allows alerts for installed apps)
//   "blocked"     the person said no (or the browser setting is off); only they can change it, in their browser or phone settings
//   "unsupported" this browser cannot do it
import { call } from "./api.js";

const SYNC_KEY = "tol_push_sync";
const DISMISS_KEY = "tol_push_dismiss";
const DISMISS_DAYS = 14;

export const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
export const isInstalled = () => (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true;
export const pushSupported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

function keyBytes(b64url) {
  const pad = "=".repeat((4 - (b64url.length % 4)) % 4);
  const raw = atob((b64url + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export async function registerWorker() {
  if (!("serviceWorker" in navigator)) return null;
  try { return await navigator.serviceWorker.register("sw.js"); } catch (e) { return null; }
}

async function currentSubscription() {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return reg ? reg.pushManager.getSubscription() : null;
}

export async function pushState() {
  if (!pushSupported()) return isIos() && !isInstalled() ? "install" : "unsupported";
  if (Notification.permission === "denied") return "blocked";
  const sub = await currentSubscription();
  return sub && Notification.permission === "granted" ? "on" : "off";
}

// Must be called from a tap (the browser only asks for permission after one).
export async function enablePush() {
  if (!pushSupported()) throw new Error("This browser cannot show phone alerts.");
  const permission = await Notification.requestPermission();
  if (permission === "denied") throw new Error("Alerts are blocked for this site. Allow notifications in your browser or phone settings, then try again.");
  if (permission !== "granted") throw new Error("Alerts were not allowed.");
  await registerWorker();
  const reg = await navigator.serviceWorker.ready;
  const { public_key: serverKey } = await call("push.config");
  const wanted = keyBytes(serverKey);
  let sub = await reg.pushManager.getSubscription();
  if (sub && sub.options && sub.options.applicationServerKey) {
    const have = new Uint8Array(sub.options.applicationServerKey);
    if (have.length !== wanted.length || have.some((b, i) => b !== wanted[i])) { await sub.unsubscribe(); sub = null; } // made with an older sender key
  }
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: wanted });
  await call("push.subscribe", { endpoint: sub.endpoint, keys: sub.toJSON().keys, userAgent: navigator.userAgent });
  try { localStorage.setItem(SYNC_KEY, String(Date.now())); } catch (e) {}
}

export async function disablePush() {
  const sub = await currentSubscription();
  if (!sub) return;
  try { await call("push.unsubscribe", { endpoint: sub.endpoint }); } catch (e) { /* removed from this phone anyway */ }
  await sub.unsubscribe();
}

export async function sendTest() {
  return call("push.test");
}

// Called at sign-out: this phone stops getting that person's alerts. Never blocks signing out for long.
export async function deviceOff() {
  try {
    const sub = await Promise.race([currentSubscription(), new Promise((r) => setTimeout(() => r(null), 1500))]);
    if (!sub) return;
    await Promise.race([call("push.unsubscribe", { endpoint: sub.endpoint }), new Promise((r) => setTimeout(r, 2500))]);
    await sub.unsubscribe();
  } catch (e) { /* signing out matters more */ }
}

// A phone that is set up tells the server again about once a day, so a lost row is repaired.
export async function syncDevice() {
  try {
    if ((await pushState()) !== "on") return;
    const last = Number(localStorage.getItem(SYNC_KEY) || 0);
    if (Date.now() - last < 24 * 3600 * 1000) return;
    const sub = await currentSubscription();
    await call("push.subscribe", { endpoint: sub.endpoint, keys: sub.toJSON().keys, userAgent: navigator.userAgent }, { quiet: true });
    localStorage.setItem(SYNC_KEY, String(Date.now()));
  } catch (e) { /* try again tomorrow */ }
}

export function dismissedRecently() {
  try { return Date.now() - Number(localStorage.getItem(DISMISS_KEY) || 0) < DISMISS_DAYS * 24 * 3600 * 1000; } catch (e) { return false; }
}

export function dismissPrompt() {
  try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch (e) {}
}
