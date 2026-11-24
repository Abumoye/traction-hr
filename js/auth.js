import { SESSION_KEY } from "./config.js";

// Only the session token and display info are kept in the browser. Never passwords.
export function saveSession(session) {
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch (e) {}
}

export function getSession() {
  try { return JSON.parse(sessionStorage.getItem(SESSION_KEY)); } catch (e) { return null; }
}

export function getToken() {
  const s = getSession();
  return s ? s.token : null;
}

// The last answers a page was given (api.js loadFast) live under this prefix in sessionStorage.
export const SAVED_PREFIX = "tol_saved:";

export function clearSaved() {
  try { Object.keys(sessionStorage).filter((k) => k.startsWith(SAVED_PREFIX)).forEach((k) => sessionStorage.removeItem(k)); } catch (e) {}
}

export function clearSession() {
  try { sessionStorage.removeItem(SESSION_KEY); sessionStorage.removeItem("tol_em"); sessionStorage.removeItem("tol_bell"); } catch (e) {}
  clearSaved();
}
