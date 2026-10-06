import { prettyTarget } from "../pretty-url.js";

// On the plain github.io project address the site lives under /traction-hr/; on the custom domain it is at the root.
const base = location.hostname.endsWith("github.io") ? "/traction-hr/" : "/";
const target = prettyTarget(location.pathname, base);

if (target) {
  location.replace(target);
} else {
  document.getElementById("checking").hidden = true;
  document.getElementById("missing").hidden = false;
  document.getElementById("home").href = base + "index.html";
}
