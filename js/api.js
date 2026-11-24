import { API_URL } from "./config.js";
import { getToken, clearSession, clearSaved, SAVED_PREFIX, getSession } from "./auth.js";
import { realPage } from "./pretty-url.js";
import { begin, end } from "./progress.js";

export class ApiError extends Error {}

// How long the most recent request took: total (what the person waited) and server (what the server itself spent, reported by the server).
// The speed check on the account page reads this.
export const timing = { last: null };

// An action that only reads leaves the saved answers (see loadFast) alone. Anything else may have changed them, so a successful one
// clears them all. Unknown actions count as changes: the worst that can happen is a slower page, never an out-of-date one.
const READ_ACTION = /\.(get|list|mine|count|summary|overview|calendar|report|day|today|options|preview|queue|compliance|balances|people|config)$|(Get|List)$/;

// Apps Script web apps answer cross-origin requests only for "simple" requests,
// so we POST JSON as text/plain (no preflight) and parse it on the server.
// opts.quiet: no loading bar and no timing entry (used by the notification bell's background checks).
export async function call(action, data = {}, opts = {}) {
  if (!API_URL) {
    throw new ApiError("ERROR: Contact Administrator.");
  }
  let res;
  let body;
  const started = performance.now();
  if (!opts.quiet) begin(); // shows the loading signs (progress.js) until the answer is back
  try {
    try {
      res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ action, token: getToken(), data }),
      });
    } catch (e) {
      throw new ApiError("Could not reach the server. Check your internet connection.");
    }
    try {
      body = await res.json();
    } catch (e) {
      throw new ApiError("ERROR: Contact Administrator.");
    }
  } finally {
    if (!opts.quiet) end();
  }
  if (!opts.quiet) timing.last = { action, total: Math.round(performance.now() - started), server: typeof body.ms === "number" ? body.ms : null };
  if (!body.ok) {
    if (body.code === "AUTH") {
      clearSession();
      if (realPage() !== "index.html") {
        location.href = "index.html";
      }
    }
    if (body.code === "MUST_CHANGE" && realPage() !== "account.html") {
      location.href = "account.html?forced=1";
    }
    throw new ApiError(body.error || "ERROR: Contact Administrator.");
  }
  if (!READ_ACTION.test(action)) clearSaved(); // something may have changed: never show an older answer for it
  return body.data;
}

// ---- show the last answer at once, then the fresh one ----
// Every page needs its data from the server, and the server takes about two seconds to answer, whatever the network. So the answers
// a page was last given are kept for this browser tab (sessionStorage, cleared at sign-out) and shown immediately; the fresh answer
// is fetched quietly behind them and replaces them if anything changed, unless the person has already started using the page.
// specs: [[action, data], ...] (read actions only). render(values) is called with the answers, in the order of specs.
let touched = false, touchWired = false;
function wireTouch() {
  if (touchWired) return;
  touchWired = true;
  ["pointerdown", "keydown", "input", "change"].forEach((ev) => document.addEventListener(ev, () => { touched = true; }, true));
}

function savedKey(action, data) {
  const s = getSession();
  return SAVED_PREFIX + (s && s.user ? s.user.id : "") + ":" + action + ":" + JSON.stringify(data || {});
}

function readSaved(action, data) {
  try {
    const e = JSON.parse(sessionStorage.getItem(savedKey(action, data)));
    return e && Date.now() - e.t < 6 * 3600 * 1000 ? e : null;
  } catch (e) { return null; }
}

function writeSaved(action, data, value) {
  try {
    const raw = JSON.stringify({ t: Date.now(), v: value });
    if (raw.length <= 600000) sessionStorage.setItem(savedKey(action, data), raw);
  } catch (e) { /* storage full or blocked: pages just load the normal way */ }
}

export async function loadFast(specs, render) {
  wireTouch();
  const saved = specs.map(([a, d]) => readSaved(a, d));
  const fetchAll = (quiet) => Promise.all(specs.map(([a, d]) => call(a, d, { quiet })));
  if (saved.every(Boolean)) {
    touched = false;
    await render(saved.map((e) => e.v));
    fetchAll(true).then(async (values) => {
      specs.forEach(([a, d], i) => writeSaved(a, d, values[i]));
      const changed = values.some((v, i) => JSON.stringify(v) !== JSON.stringify(saved[i].v));
      if (changed && !touched) await render(values);
    }).catch(() => { /* the saved answers stay on screen; the next visit tries again */ });
    return;
  }
  const values = await fetchAll(false);
  specs.forEach(([a, d], i) => writeSaved(a, d, values[i]));
  await render(values);
}
