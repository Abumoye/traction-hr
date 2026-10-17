// The "give these sign-in details to the employee" pop-up, shown after HR creates or resets a login.
// The password exists only in this pop-up: the server stores a scrambled copy and never sends it back.
import { esc, openModal, toast } from "./ui.js";
import { getSession } from "./auth.js";
import { companyLinks } from "./pretty-url.js";

function signInAddress(code) {
  const links = companyLinks(code);
  return links ? links.signIn : new URL("index.html?company=" + encodeURIComponent(code), location.href).href;
}

// name: the employee's full name; email and password: what they sign in with.
export function showCredentials({ name, email, password, title = "Sign-in details", onClose = null }) {
  const { company } = getSession();
  const address = signInAddress(company.code);
  const first = String(name || "").trim().split(/\s+/)[0] || "there";
  const message = [
    `Hello ${first},`,
    "",
    `Your sign-in for ${company.name} on Traction Outsourcing HRMS is ready.`,
    "",
    `Sign in: ${address}`,
    `Company code: ${company.code}`,
    `Email: ${email}`,
    `Temporary password: ${password}`,
    "",
    "You will be asked to choose your own password the first time you sign in. Please do not share these details.",
  ].join("\n");

  const m = openModal({
    title,
    narrow: true,
    onClose,
    html: `<p>Give these details to <strong>${esc(name || email)}</strong>. <strong>The password is shown only now</strong>: if it is lost, use Reset password on their profile.</p>
      <dl class="dl" style="grid-template-columns:120px 1fr">
        <dt>Sign in at</dt><dd style="word-break:break-all">${esc(address)}</dd>
        <dt>Company code</dt><dd><code>${esc(company.code)}</code></dd>
        <dt>Email</dt><dd>${esc(email)}</dd>
        <dt>Temporary password</dt><dd><code style="font-size:16px">${esc(password)}</code></dd>
      </dl>
      <p class="hint">They choose their own password the first time they sign in, and their profile will already be set up. Messaging a password is convenient but less private than telling them in person.</p>`,
    footer: `<button class="btn btn-ghost" id="cred-copy" type="button">Copy message</button>
      <a class="btn btn-ghost" id="cred-wa" href="https://wa.me/?text=${encodeURIComponent(message)}" target="_blank" rel="noopener noreferrer">Send on WhatsApp</a>
      <button class="btn" data-close type="button">Done</button>`,
  });

  m.el.querySelector("#cred-copy").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(message);
      toast("Message copied. Paste it into an email or chat.");
    } catch (e) {
      toast("Could not copy automatically. Select the details above and copy them.", "error");
    }
  });
  return m;
}
