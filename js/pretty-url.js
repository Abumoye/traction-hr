// Company links. On the custom domain, https://hr.tolnigeria.com/<company-code> opens that company's sign-in page and
// https://hr.tolnigeria.com/<company-code>/careers opens its careers page. The web host has no such files, so it answers
// "not found" and 404.html uses prettyTarget() to send the visitor to the real page.

export const PRETTY_HOST = "hr.tolnigeria.com";

const CODE_RE = /^[a-z0-9][a-z0-9-]{2,19}$/;

// Returns the real page to open for a pretty path, or null when the path is not a company link.
export function prettyTarget(pathname, basePath = "/") {
  let p = String(pathname || "");
  if (basePath !== "/" && p.toLowerCase().startsWith(basePath.toLowerCase())) p = "/" + p.slice(basePath.length);
  const segs = p.split("/").filter(Boolean).map((s) => s.toLowerCase());
  if (!segs.length || !CODE_RE.test(segs[0]) || /\.[a-z0-9]+$/.test(segs[0])) return null;
  const q = "?company=" + encodeURIComponent(segs[0]);
  if (segs.length === 1) return basePath + "index.html" + q;
  if (segs.length === 2 && segs[1] === "careers") return basePath + "careers.html" + q;
  return null;
}

// The shareable links for a company, or null off the custom domain (local testing, the plain github.io address).
export function companyLinks(code, hostname = location.hostname) {
  if (hostname !== PRETTY_HOST) return null;
  const base = "https://" + PRETTY_HOST + "/" + encodeURIComponent(code);
  return { signIn: base, careers: base + "/careers" };
}
