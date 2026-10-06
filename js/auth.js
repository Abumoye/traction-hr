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

export function clearSession() {
  try { sessionStorage.removeItem(SESSION_KEY); } catch (e) {}
}
