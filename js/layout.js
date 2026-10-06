import { getSession, clearSession } from "./auth.js";
import { call } from "./api.js";
import { esc, ROLE_LABELS } from "./ui.js";
import { IDLE_TIMEOUT_MS } from "./config.js";
import { applyCompanyAddress } from "./pretty-url.js";

const ICONS = {
  dashboard: '<path d="M3 12l9-8 9 8M5 10v10h5v-6h4v6h5V10"/>',
  employees: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/><path d="M16 4.5a3.5 3.5 0 010 7M18 14.5c2.2.6 3.5 2.6 3.5 5.5"/>',
  profile: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/>',
  departments: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  users: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 018 0v3"/>',
  account: '<circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 00-.1-1.2l2-1.5-2-3.4-2.3 1a7 7 0 00-2-1.2L14.2 3h-4l-.4 2.7a7 7 0 00-2 1.2l-2.3-1-2 3.4 2 1.5a7 7 0 000 2.4l-2 1.5 2 3.4 2.3-1a7 7 0 002 1.2l.4 2.7h4l.4-2.7a7 7 0 002-1.2l2.3 1 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z"/>',
  soon: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  payroll: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.6"/><path d="M6 9.5v.01M18 14.5v.01"/>',
  payslips: '<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 13h7M9 17h5"/>',
  audit: '<path d="M12 3l8 3v6c0 4.5-3.3 8-8 9-4.7-1-8-4.5-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
  performance: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  advances: '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M15 15h3"/>',
  reports: '<path d="M4 4v16h16"/><path d="M8 16v-5M12 16V8M16 16v-3"/>',
  expenses: '<path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
  training: '<path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11v5c0 1.500 3 3 6 3s6-1.500 6-3v-5"/>',
  recruitment: '<circle cx="10" cy="8" r="3.5"/><path d="M3 20c0-3.6 3-6 7-6 1.4 0 2.700.3 3.800.9M18 14v6M15 17h6"/>',
  onboarding: '<rect x="4" y="4" width="16" height="17" rx="2"/><path d="M9 3v3M15 3v3M8 12l2 2 4-4M8 17h8"/>',
  leave: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  attendance: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  leaveSettings: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
};

const ALL = ["owner", "hr_admin", "manager", "employee"];
const NAV = [
  { id: "dashboard", label: "Dashboard", href: "dashboard.html", roles: ALL },
  { id: "employees", label: "Employees", href: "employees.html", roles: ["owner", "hr_admin", "manager"] },
  { id: "profile", label: "My profile", href: "employee.html?me=1", roles: ["employee"] },
  { id: "departments", label: "Departments", href: "departments.html", roles: ["owner", "hr_admin"] },
  { id: "leave", label: "Leave", href: "leave.html", roles: ALL },
  { id: "attendance", label: "Attendance", href: "attendance.html", roles: ALL },
  { id: "payslips", label: "My payslips", href: "payslips.html", roles: ALL },
  { id: "performance", label: "Performance", href: "performance.html", roles: ALL },
  { id: "expenses", label: "Expenses", href: "expenses.html", roles: ALL },
  { id: "advances", label: "Salary advance", href: "advances.html", roles: ALL },
  { id: "training", label: "Training", href: "training.html", roles: ALL },
  { section: "Administration", roles: ["owner", "hr_admin"] },
  { id: "reports", label: "Reports", href: "reports.html", roles: ["owner", "hr_admin"] },
  { id: "recruitment", label: "Recruitment", href: "recruitment.html", roles: ["owner", "hr_admin"] },
  { id: "onboarding", label: "Onboarding", href: "onboarding.html", roles: ["owner", "hr_admin"] },
  { id: "payroll", label: "Payroll", href: "payroll.html", roles: ["owner", "hr_admin"] },
  { id: "leaveSettings", label: "Leave settings", href: "leave-settings.html", roles: ["owner", "hr_admin"] },
  { id: "users", label: "User access", href: "users.html", roles: ["owner", "hr_admin"] },
  { id: "audit", label: "Audit and backups", href: "audit.html", roles: ["owner"] },
  { section: "Account" },
  { id: "account", label: "My account", href: "account.html", roles: ALL },
];

export const canManageStaff = (role) => role === "owner" || role === "hr_admin";

function navHtml(role, active) {
  return NAV.map((n) => {
    if (n.section) return !n.roles || n.roles.includes(role) ? `<div class="nav-label">${esc(n.section)}</div>` : "";
    if (n.soon) return `<div class="nav-soon" aria-disabled="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS.soon}</svg>${esc(n.label)}<span class="soon-tag">Soon</span></div>`;
    if (!n.roles.includes(role)) return "";
    return `<a href="${n.href}" class="${n.id === active ? "active" : ""}"${n.id === active ? ' aria-current="page"' : ""}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[n.id]}</svg>${esc(n.label)}</a>`;
  }).join("");
}

// Builds the sidebar/top bar around the page and returns the empty content area.
export function initPage({ active, title }) {
  const session = getSession();
  if (!session) {
    location.href = "index.html";
    return null;
  }
  if (session.mustChange && active !== "account") {
    location.href = "account.html?forced=1";
    return null;
  }
  applyCompanyAddress(session.company.code);
  const role = session.user.role;
  const app = document.getElementById("app");
  app.innerHTML = `
    <div class="shell" id="shell">
      <aside class="sidebar" aria-label="Main navigation">
        <div class="sidebar-brand"><div class="logo-card"><img src="assets/img/traction-logo.png" alt="Traction Outsourcing"></div></div>
        <nav class="nav">${session.mustChange ? "" : navHtml(role, active)}</nav>
        <div class="sidebar-user">
          <strong>${esc(session.user.name)}</strong>
          <div class="role">${esc(ROLE_LABELS[role] || role)}</div>
          <button type="button" id="signout">Sign out</button>
        </div>
      </aside>
      <div class="scrim" id="scrim"></div>
      <div class="main">
        <header class="topbar">
          <button type="button" class="menu-btn" id="menu-btn" aria-label="Open menu">Menu</button>
          <h1>${esc(title)}</h1>
          <span class="company">${esc(session.company.name)}</span>
        </header>
        <main class="content" id="content"></main>
      </div>
    </div>`;
  document.title = title + " | Traction Outsourcing HR";

  const shell = document.getElementById("shell");
  document.getElementById("menu-btn").addEventListener("click", () => shell.classList.toggle("nav-open"));
  document.getElementById("scrim").addEventListener("click", () => shell.classList.remove("nav-open"));
  watchIdle();
  stackWideTables();
  document.getElementById("signout").addEventListener("click", async () => {
    try { await call("logout"); } catch (e) {}
    clearSession();
    location.href = "index.html";
  });

  return { session, role, content: document.getElementById("content") };
}

// On a phone, a table that is wider than the screen is shown as a list of cards (each cell labelled with its column name).
function stackWideTables() {
  const narrow = window.matchMedia("(max-width: 720px)");
  const run = () => {
    if (!narrow.matches) return;
    document.querySelectorAll("table.data").forEach((table) => {
      const wrap = table.parentElement;
      if (!table.classList.contains("stack")) {
        if (!wrap || wrap.scrollWidth <= wrap.clientWidth + 2) return;
        table.classList.add("stack");
      }
      const heads = [...table.querySelectorAll("thead th")].map((th) => {
        const copy = th.cloneNode(true);
        copy.querySelectorAll(".muted, small").forEach((x) => x.remove());
        return copy.textContent.trim();
      });
      table.querySelectorAll("tbody tr").forEach((tr) => {
        [...tr.children].forEach((td, i) => { if (td.tagName === "TD" && !td.hasAttribute("data-label")) td.setAttribute("data-label", heads[i] || ""); });
      });
    });
  };
  let queued = false;
  new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; run(); });
  }).observe(document.body, { childList: true, subtree: true });
  run();
}

// Signs the person out after a period of inactivity, so a forgotten screen does not stay open.
function watchIdle() {
  let timer = null;
  const reset = () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      try { await call("logout"); } catch (e) {}
      clearSession();
      location.href = "index.html?timeout=1";
    }, IDLE_TIMEOUT_MS);
  };
  ["click", "keydown", "mousemove", "scroll", "touchstart"].forEach((ev) => document.addEventListener(ev, reset, { passive: true }));
  reset();
}

export function loading(el, text = "Loading...") {
  el.innerHTML = `<div class="loading"><span class="spinner"></span>${esc(text)}</div>`;
}

export function errorBox(el, text) {
  el.innerHTML = `<div class="alert alert-error">${esc(text)}</div>`;
}
