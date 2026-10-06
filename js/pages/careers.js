// Public careers page: no sign-in. Lists the company's open public jobs and takes applications.
import { call, ApiError } from "../api.js";
import { esc, formatDate, showMessage, hideMessage, setBusy } from "../ui.js";

const root = document.getElementById("careers");
const code = (new URLSearchParams(location.search).get("company") || "").trim().toLowerCase();
const TYPE = { "full-time": "Full-time", "part-time": "Part-time", contract: "Contract", intern: "Internship" };
const MAX_CV = 4 * 1024 * 1024;

async function start() {
  if (!code) {
    root.innerHTML = `<div class="careers-wrap"><div class="alert alert-error">This careers link is incomplete. Please use the link the company gave you.</div></div>`;
    return;
  }
  root.innerHTML = `<div class="careers-wrap"><p class="muted" style="text-align:center">Loading jobs...</p></div>`;
  try {
    const r = await call("careers.jobs", { companyCode: code });
    document.title = `Careers at ${r.company.name}`;
    render(r);
  } catch (err) {
    root.innerHTML = `<div class="careers-wrap"><div class="alert alert-error">${esc(err instanceof ApiError ? err.message : "Could not load this page.")}</div></div>`;
  }
}

function render({ company, jobs }) {
  root.innerHTML = `<div class="careers-wrap">
    <div class="careers-head"><h1>Careers at ${esc(company.name)}</h1>
      <p>${jobs.length ? `${jobs.length} open position${jobs.length === 1 ? "" : "s"}` : "We have no open positions right now. Please check back soon."}</p></div>
    ${jobs.map((j) => `<section class="job-card" id="job-${esc(j.id)}">
      <h2>${esc(j.title)}</h2>
      <div class="meta">${[j.department, j.location, TYPE[j.employment_type] || j.employment_type, "Posted " + (j.posted ? formatDate(j.posted) : "")].filter((x) => x && x !== "Posted ").map(esc).join(" &middot; ")}</div>
      <div class="more" hidden>${esc(j.description)}${j.requirements ? `<h3>Requirements</h3>${esc(j.requirements)}` : ""}</div>
      <button class="btn btn-ghost btn-sm" data-more type="button" aria-expanded="false">View details</button>
      <button class="btn btn-sm" data-apply="${esc(j.id)}" type="button">Apply now</button>
      <div class="apply-slot"></div></section>`).join("")}
    <p class="careers-foot">Powered by Traction Outsourcing HR</p></div>`;

  root.querySelectorAll(".job-card").forEach((card) => {
    const more = card.querySelector(".more"), toggle = card.querySelector("[data-more]");
    toggle.addEventListener("click", () => {
      more.hidden = !more.hidden;
      toggle.textContent = more.hidden ? "View details" : "Hide details";
      toggle.setAttribute("aria-expanded", String(!more.hidden));
    });
    card.querySelector("[data-apply]").addEventListener("click", (e) => openForm(card, e.currentTarget.dataset.apply));
  });
}

function openForm(card, jobId) {
  const slot = card.querySelector(".apply-slot");
  if (slot.firstChild) { slot.innerHTML = ""; return; }
  slot.innerHTML = `<form class="apply-form" novalidate style="margin-top:16px;border-top:1px solid var(--line);padding-top:16px">
      <div id="msg" hidden></div>
      <div class="form-grid">
        <div class="field"><label class="required" for="f-${jobId}">First name</label><input id="f-${jobId}" name="first_name" maxlength="60" autocomplete="given-name" required></div>
        <div class="field"><label class="required" for="l-${jobId}">Last name</label><input id="l-${jobId}" name="last_name" maxlength="60" autocomplete="family-name" required></div>
        <div class="field"><label class="required" for="e-${jobId}">Email</label><input id="e-${jobId}" name="email" type="email" maxlength="120" autocomplete="email" required></div>
        <div class="field"><label for="p-${jobId}">Phone</label><input id="p-${jobId}" name="phone" maxlength="30" autocomplete="tel"></div>
        <div class="field full"><label for="n-${jobId}">Message (optional)</label><textarea id="n-${jobId}" name="note" rows="3" maxlength="1000" placeholder="Tell us briefly why you are a good fit"></textarea></div>
        <div class="field full"><label for="c-${jobId}">CV (PDF, DOC or DOCX, up to 4 MB)</label><input id="c-${jobId}" name="cv" type="file" accept=".pdf,.doc,.docx"></div>
      </div>
      <div class="hp" aria-hidden="true"><label>Website<input name="website" tabindex="-1" autocomplete="off"></label></div>
      <p class="hint">We use your details only to consider your application.</p>
      <button class="btn" type="submit">Submit application</button> <button class="btn btn-ghost" data-cancel type="button">Cancel</button></form>`;
  const form = slot.querySelector("form");
  const msg = slot.querySelector("#msg");
  const btn = form.querySelector("button[type=submit]");
  slot.querySelector("[data-cancel]").addEventListener("click", () => { slot.innerHTML = ""; });
  form.querySelector("input[name=first_name]").focus();

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    hideMessage(msg);
    const file = form.cv.files[0];
    if (file && file.size > MAX_CV) return showMessage(msg, "Your CV is larger than 4 MB.");
    if (file && !/\.(pdf|docx?)$/i.test(file.name)) return showMessage(msg, "Please upload a PDF, DOC or DOCX file.");
    setBusy(btn, true, "Sending...");
    try {
      let cv = null;
      if (file) {
        const data = await new Promise((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(String(r.result).split(",")[1] || "");
          r.onerror = () => reject(new Error("Could not read your CV."));
          r.readAsDataURL(file);
        });
        cv = { fileName: file.name, data };
      }
      await call("careers.apply", {
        companyCode: code, jobId, first_name: form.first_name.value, last_name: form.last_name.value, email: form.email.value,
        phone: form.phone.value, note: form.note.value, website: form.website.value, cv,
      });
      slot.innerHTML = `<div class="alert alert-ok" style="margin-top:16px" role="status">Thank you. We have received your application and will be in touch if you are shortlisted.</div>`;
      card.querySelector("[data-apply]").hidden = true;
    } catch (err) {
      showMessage(msg, err instanceof ApiError || err instanceof Error ? err.message : "Something went wrong.");
      setBusy(btn, false);
    }
  });
}

start();
