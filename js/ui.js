// Small shared UI helpers.

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

// Always escape user-provided text before putting it into HTML.
export function esc(value) {
  return String(value === undefined || value === null ? "" : value).replace(/[&<>"']/g, (c) => ESC[c]);
}

export function showMessage(el, text, type = "error") {
  el.className = "alert alert-" + type;
  el.textContent = text;
  el.hidden = false;
}

export function hideMessage(el) {
  el.hidden = true;
  el.textContent = "";
}

export function setBusy(button, busy, busyText = "Please wait...") {
  if (busy) {
    button.dataset.label = button.textContent;
    button.textContent = busyText;
  } else if (button.dataset.label) {
    button.textContent = button.dataset.label;
  }
  button.disabled = busy;
}

export function toast(text, type = "ok") {
  let box = document.querySelector(".toasts");
  if (!box) {
    box = document.createElement("div");
    box.className = "toasts";
    box.setAttribute("role", "status");
    document.body.appendChild(box);
  }
  const el = document.createElement("div");
  el.className = "toast" + (type === "error" ? " error" : "");
  el.textContent = text;
  box.appendChild(el);
  setTimeout(() => el.remove(), 4500);
}

// Opens a modal. Returns { el, body, close }. Closes with the X, Cancel buttons you add, or Escape.
export function openModal({ title, html, narrow = false, footer = "", onClose = null }) {
  const back = document.createElement("div");
  back.className = "modal-back";
  back.innerHTML = `
    <div class="modal${narrow ? " narrow" : ""}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="modal-head"><h2>${esc(title)}</h2><button type="button" aria-label="Close" data-close>&times;</button></div>
      <div class="modal-body">${html}</div>
      ${footer ? `<div class="modal-foot">${footer}</div>` : ""}
    </div>`;
  const previous = document.activeElement;
  const close = () => {
    document.removeEventListener("keydown", onKey);
    back.remove();
    if (previous && previous.focus) previous.focus();
    if (onClose) onClose();
  };
  const onKey = (e) => { if (e.key === "Escape") close(); };
  document.addEventListener("keydown", onKey);
  back.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", close));
  document.body.appendChild(back);
  const first = back.querySelector("input, select, textarea, button.btn");
  if (first) first.focus({ preventScroll: true }); // focusing a button at the bottom of a tall pop-up must not scroll its top out of view
  back.scrollTop = 0;
  return { el: back, body: back.querySelector(".modal-body"), close };
}

export function confirmDialog(message, { okText = "Confirm", danger = false } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    const m = openModal({
      title: "Please confirm",
      narrow: true,
      html: `<p>${esc(message)}</p>`,
      footer: `<button class="btn btn-ghost" data-close type="button">Cancel</button>
               <button class="btn${danger ? " btn-danger" : ""}" id="confirm-ok" type="button">${esc(okText)}</button>`,
      onClose: () => finish(false),
    });
    m.el.querySelector("#confirm-ok").addEventListener("click", () => { finish(true); m.close(); });
  });
}

// Makes <tr data-href="..."> rows clickable (keyboard friendly) without inline handlers.
export function rowLinks(root) {
  root.querySelectorAll("tr[data-href]").forEach((tr) => {
    tr.tabIndex = 0;
    tr.addEventListener("click", () => { location.href = tr.dataset.href; });
    tr.addEventListener("keydown", (e) => { if (e.key === "Enter") location.href = tr.dataset.href; });
  });
}

export function formatDate(iso) {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${+m[3]} ${months[+m[2] - 1]} ${m[1]}`;
}

export function formatDateTime(iso) {
  if (!iso) return "Never";
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function cap(s) {
  s = String(s || "");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function initials(name) {
  return String(name || "?").trim().split(/\s+/).slice(0, 2).map((p) => p[0] || "").join("").toUpperCase() || "?";
}

export const ROLE_LABELS = { owner: "Owner", hr_admin: "HR Admin", manager: "Manager", employee: "Employee" };
export const STATUS_LABELS = {
  active: "Active", "on-leave": "On leave", suspended: "Suspended", terminated: "Terminated", inactive: "Inactive",
  pending: "Pending", approved: "Approved", rejected: "Rejected", cancelled: "Cancelled", draft: "Draft", paid: "Paid",
  present: "Present", late: "Late", remote: "Remote", "half-day": "Half day", absent: "Absent", "no-record": "No record",
};

// ---- dates (company time zone is Lagos) ----

export function todayLagos() {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lagos", year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(new Date()).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

export function thisMonth() { return todayLagos().slice(0, 7); }

export function shiftMonth(month, delta) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

export function monthLabel(month) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}

// Working days between two ISO dates, skipping weekends and the given holiday dates (a Set).
export function countWorkingDays(start, end, holidays) {
  if (!start || !end || end < start) return 0;
  let n = 0;
  const d = new Date(start + "T00:00:00Z");
  const stop = new Date(end + "T00:00:00Z");
  for (let i = 0; d <= stop && i < 800; i++, d.setUTCDate(d.getUTCDate() + 1)) {
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6 && !holidays.has(d.toISOString().slice(0, 10))) n++;
  }
  return n;
}

// Simple tab bar. Returns html; wire clicks with bindTabs.
export function tabBar(tabs, active) {
  return `<div class="tabs" role="tablist">${tabs.map((t) =>
    `<button type="button" role="tab" class="tab${t.id === active ? " active" : ""}" aria-selected="${t.id === active}" data-tab="${esc(t.id)}">${esc(t.label)}${t.badge ? `<span class="tab-badge">${esc(t.badge)}</span>` : ""}</button>`).join("")}</div>`;
}

export function bindTabs(root, onSelect) {
  root.querySelectorAll("[data-tab]").forEach((b) => b.addEventListener("click", () => {
    root.querySelectorAll("[data-tab]").forEach((x) => { x.classList.toggle("active", x === b); x.setAttribute("aria-selected", x === b); });
    onSelect(b.dataset.tab);
  }));
}

export function randomPassword(length = 12) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => chars[b % chars.length]).join("") + "!";
}

// ---- files ----

export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] || "");
    r.onerror = () => reject(new Error("Could not read the file."));
    r.readAsDataURL(file);
  });
}

// Saves a file the server sent as base64 (receipts, certificates).
export function saveBase64(name, mimeType, data) {
  const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: mimeType }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export const stars = (n) => (n ? "\u2605".repeat(n) + "\u2606".repeat(5 - n) : "");
export const RATING_LABELS = { 1: "Needs improvement", 2: "Below expectations", 3: "Meets expectations", 4: "Exceeds expectations", 5: "Outstanding" };
