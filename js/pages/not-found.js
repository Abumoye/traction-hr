import { prettyTarget, prettyCompany } from "../pretty-url.js";

// On the plain github.io project address the site lives under /traction-hr/; on the custom domain it is at the root.
const base = location.hostname.endsWith("github.io") ? "/traction-hr/" : "/";
const target = prettyTarget(location.pathname, base, location.search);

if (target) {
  // Remember which company the address named, so the sign-in page can pre-fill it if the person is not signed in.
  const company = prettyCompany(location.pathname, base);
  try { if (company) sessionStorage.setItem("tol_company_hint", company); } catch (e) {}
  location.replace(target);
} else {
  document.getElementById("checking").hidden = true;
  document.getElementById("missing").hidden = false;
  document.getElementById("home").href = base + "index.html";
}
