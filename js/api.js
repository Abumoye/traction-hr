import { API_URL } from "./config.js";
import { getToken, clearSession } from "./auth.js";
import { realPage } from "./pretty-url.js";
import { begin, end } from "./progress.js";

export class ApiError extends Error {}

// How long the most recent request took: total (what the person waited) and server (what the server itself spent, reported by the server).
// The speed check on the account page reads this.
export const timing = { last: null };

// Apps Script web apps answer cross-origin requests only for "simple" requests,
// so we POST JSON as text/plain (no preflight) and parse it on the server.
export async function call(action, data = {}) {
  if (!API_URL) {
    throw new ApiError("The backend is not connected yet. Set PRODUCTION_API_URL in js/config.js after deploying the Apps Script.");
  }
  let res;
  let body;
  const started = performance.now();
  begin(); // shows the loading signs (progress.js) until the answer is back
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
      throw new ApiError("The server sent an unexpected response.");
    }
  } finally {
    end();
  }
  timing.last = { action, total: Math.round(performance.now() - started), server: typeof body.ms === "number" ? body.ms : null };
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
    throw new ApiError(body.error || "Something went wrong.");
  }
  return body.data;
}
