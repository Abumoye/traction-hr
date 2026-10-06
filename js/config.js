// Paste your deployed Google Apps Script Web App URL here (ends with /exec).
const PRODUCTION_API_URL = "https://script.google.com/macros/s/AKfycbzpK9T86sxk1UxCvaZNNU891wLRSPr_Nj4mssTXLZTG7aItDr79-T3W8t3kK-cey19HNQ/exec";

// When the page is opened through the local dev server (node dev/mock-server.js,
// port 8787, or 8788 for the demo company) it talks to that server instead. Never active on a real website.
const isLocalMock =
  (location.hostname === "localhost" || location.hostname === "127.0.0.1") && (location.port === "8787" || location.port === "8788");

export const API_URL = isLocalMock ? "/api" : PRODUCTION_API_URL;

// People are signed out after this long without touching the page. (?idle=5 shortens it to 5 seconds on the local test server only.)
const idleOverride = isLocalMock ? Number(new URLSearchParams(location.search).get("idle")) : 0;
export const IDLE_TIMEOUT_MS = idleOverride > 0 ? idleOverride * 1000 : 30 * 60 * 1000;

export const APP_NAME = "Traction Outsourcing HR";
export const SESSION_KEY = "tol_hr_session";
