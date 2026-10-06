import { API_URL } from "./config.js";
import { getToken, clearSession } from "./auth.js";

export class ApiError extends Error {}

// Apps Script web apps answer cross-origin requests only for "simple" requests,
// so we POST JSON as text/plain (no preflight) and parse it on the server.
export async function call(action, data = {}) {
  if (!API_URL) {
    throw new ApiError("The backend is not connected yet. Set PRODUCTION_API_URL in js/config.js after deploying the Apps Script.");
  }
  let res;
  try {
    res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action, token: getToken(), data }),
    });
  } catch (e) {
    throw new ApiError("Could not reach the server. Check your internet connection.");
  }
  let body;
  try {
    body = await res.json();
  } catch (e) {
    throw new ApiError("The server sent an unexpected response.");
  }
  if (!body.ok) {
    if (body.code === "AUTH") {
      clearSession();
      if (!location.pathname.endsWith("index.html") && location.pathname !== "/") {
        location.href = "index.html";
      }
    }
    if (body.code === "MUST_CHANGE" && !location.pathname.endsWith("account.html")) {
      location.href = "account.html?forced=1";
    }
    throw new ApiError(body.error || "Something went wrong.");
  }
  return body.data;
}
