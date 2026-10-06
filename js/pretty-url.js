// Company addresses. Everyone signs in at https://hr.tolnigeria.com. Once signed in, the address bar shows the company:
//   hr.tolnigeria.com/gtext             the dashboard
//   hr.tolnigeria.com/gtext/employees   any other page
//   hr.tolnigeria.com/gtext/careers     the public careers page
// The web host only has real files (dashboard.html, employees.html ...), so it answers "not found" for these addresses and
// 404.html uses prettyTarget() to open the real page. Signed-in pages call applyCompanyAddress() to show the nice address.

export const PRETTY_HOST = "hr.tolnigeria.com";

const CODE_RE = /^[a-z0-9][a-z0-9-]{2,19}$/;

// The pages that run inside a company (everything except sign in, sign up and the public careers page).
export const APP_PAGES = ["dashboard", "employees", "employee", "departments", "users", "account", "leave", "leave-settings",
  "attendance", "payroll", "payroll-run", "payslips", "payslip", "recruitment", "applicant", "offer", "onboarding",
  "performance", "review", "expenses", "training", "audit", "advances", "reports"];

// True on the real domain and on the local test servers (ports 8787 and 8788), so the behaviour can be tried on a laptop.
export function isPrettyHost(hostname = location.hostname, port = location.port) {
  return hostname === PRETTY_HOST || ((hostname === "localhost" || hostname === "127.0.0.1") && (port === "8787" || port === "8788"));
}

function segments(pathname, basePath) {
  let p = String(pathname || "");
  if (basePath !== "/" && p.toLowerCase().startsWith(basePath.toLowerCase())) p = "/" + p.slice(basePath.length);
  return p.split("/").filter(Boolean).map((s) => s.toLowerCase());
}

function validCode(seg) {
  return !!seg && CODE_RE.test(seg);
}

// Returns the real page to open for a company address, or null when the address is not one of ours.
export function prettyTarget(pathname, basePath = "/", search = "") {
  const segs = segments(pathname, basePath);
  if (!validCode(segs[0])) return null;
  if (segs.length === 1) return basePath + "index.html?company=" + encodeURIComponent(segs[0]);
  if (segs.length === 2 && segs[1] === "careers") return basePath + "careers.html?company=" + encodeURIComponent(segs[0]);
  if (segs.length === 2 && APP_PAGES.includes(segs[1])) return basePath + segs[1] + ".html" + safeSearch(search);
  return null;
}

// Only plain "?name=value&..." text is carried over, so nothing odd in an address can change where the visitor ends up.
function safeSearch(search) {
  const s = String(search || "");
  return /^\?[A-Za-z0-9_\-=&%.]*$/.test(s) ? s : "";
}

// The company code written in a company address (used to pre-fill the sign-in page), or null.
export function prettyCompany(pathname, basePath = "/") {
  const segs = segments(pathname, basePath);
  return prettyTarget(pathname, basePath) ? segs[0] : null;
}

// The address to show for a real page, e.g. ("gtext", "employees.html") -> "/gtext/employees". null for pages that are not company pages.
export function addressFor(code, pageFile) {
  const page = String(pageFile || "").replace(/\.html$/, "");
  if (!validCode(code) || !APP_PAGES.includes(page)) return null;
  return page === "dashboard" ? "/" + code : "/" + code + "/" + page;
}

// The shareable links for a company, or null where company addresses are not in use (the plain github.io address).
export function companyLinks(code, hostname = location.hostname, origin = location.origin, port = location.port) {
  if (!isPrettyHost(hostname, port)) return null;
  const base = (hostname === PRETTY_HOST ? "https://" + PRETTY_HOST : origin) + "/" + encodeURIComponent(code);
  return { signIn: base, careers: base + "/careers" };
}

// The file name of the page that is really loaded, even after the address bar has been changed to a company address.
export function realPage() {
  return window.__tolPage || location.pathname.split("/").pop() || "index.html";
}

// Called by every signed-in page. Shows hr.tolnigeria.com/<company>/<page> in the address bar.
// A <base> tag keeps every relative link (employees.html, assets/...) pointing at the real files.
export function applyCompanyAddress(code) {
  if (!isPrettyHost() || window.__tolPage) return;
  const file = realPage();
  const pretty = addressFor(code, file);
  if (!pretty) return;
  window.__tolPage = file;
  const base = document.createElement("base");
  base.href = location.origin + location.pathname.replace(/[^/]*$/, "");
  document.head.prepend(base);
  try { history.replaceState(null, "", pretty + location.search + location.hash); } catch (e) {}
}
