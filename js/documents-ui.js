// Employee documents: the checklist, upload, review and download pieces shared by the Documents page and the employee profile.
// Employees can only upload. HR reviews (approve, or reject with a reason so the employee uploads again). Only the owner can delete.
import { call } from "./api.js";
import { esc, openModal, confirmDialog, toast, formatDate, formatDateTime, fileToBase64, saveBase64 } from "./ui.js";

const MAX_BYTES = 4 * 1024 * 1024;
export const STATE_LABEL = { missing: "Not uploaded", pending: "Waiting for review", approved: "Approved", rejected: "Rejected: upload again" };
const EXPIRY_LABEL = { soon: "Expires soon", expired: "Expired" };

export const docBadge = (state) => `<span class="badge doc-${esc(state)}">${esc(STATE_LABEL[state] || state)}</span>`;
const expiryBadge = (e) => (e ? ` <span class="badge doc-${e === "expired" ? "rejected" : "pending"}">${esc(EXPIRY_LABEL[e])}</span>` : "");

export async function downloadDoc(id) {
  try {
    const f = await call("docs.download", { id });
    saveBase64(f.name, f.mimeType, f.data);
  } catch (err) { toast(err.message, "error"); }
}

// Upload a document. forSelf: the signed-in person is uploading their own (it will wait for review).
export function openUploadDialog({ employeeId, employeeName, types, typeId = "", forSelf, onDone }) {
  const m = openModal({
    title: forSelf ? "Upload a document" : `Upload a document for ${employeeName}`, narrow: true,
    html: `<div id="m-msg" class="alert alert-error" hidden></div>
      <form id="doc-form" novalidate>
        <div class="field"><label for="d-type">Kind of document</label><select id="d-type" name="docType">
          ${types.map((t) => `<option value="${esc(t.id)}"${t.id === typeId ? " selected" : ""}>${esc(t.label)}</option>`).join("")}</select></div>
        <div class="field" id="d-title-wrap" hidden><label for="d-title">Title</label><input id="d-title" name="label" maxlength="80" placeholder="For example: Driving licence"></div>
        <div class="field"><label for="d-file">File</label><input id="d-file" name="file" type="file" accept=".pdf,.png,.jpg,.jpeg" required>
          <div class="hint">PDF, PNG or JPG, up to 4 MB. A phone photo of the page works.</div></div>
        <div class="field"><label for="d-exp">Expiry date (if it has one)</label><input id="d-exp" name="expiresOn" type="date"></div>
        <div class="field"><label for="d-note">Note (optional)</label><input id="d-note" name="note" maxlength="200"></div>
        <p class="hint">${forSelf ? "HR will review it. If something is wrong you will be asked to upload it again." : "Uploaded by HR, so it is approved straight away."}
          Once uploaded, a document can only be removed by the owner.</p>
      </form>`,
    footer: `<button class="btn btn-ghost" data-close type="button">Cancel</button><button class="btn" id="d-save" type="submit" form="doc-form">Upload</button>`,
  });
  const form = m.el.querySelector("#doc-form");
  const msg = m.el.querySelector("#m-msg");
  const showTitle = () => { m.el.querySelector("#d-title-wrap").hidden = form.docType.value !== "other"; };
  form.docType.addEventListener("change", showTitle);
  showTitle();
  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    msg.hidden = true;
    const file = form.file.files[0];
    if (!file) { msg.textContent = "Choose the file to upload."; msg.hidden = false; return; }
    if (file.size > MAX_BYTES) { msg.textContent = "That file is larger than 4 MB. Take a smaller photo or compress the PDF."; msg.hidden = false; return; }
    if (!/\.(pdf|png|jpe?g)$/i.test(file.name)) { msg.textContent = "Choose a PDF, PNG or JPG file."; msg.hidden = false; return; }
    const btn = m.el.querySelector("#d-save");
    btn.disabled = true;
    btn.textContent = "Uploading...";
    try {
      const data = await fileToBase64(file);
      await call("docs.upload", {
        employeeId, docType: form.docType.value, label: form.label.value, fileName: file.name, data, expiresOn: form.expiresOn.value, note: form.note.value,
      });
      m.close();
      toast(forSelf ? "Uploaded. HR will review it." : "Document uploaded.");
      if (onDone) onDone();
    } catch (err) {
      msg.textContent = err.message;
      msg.hidden = false;
      btn.disabled = false;
      btn.textContent = "Upload";
    }
  });
}

export function openReviewDialog(doc, decision, onDone) {
  const approve = decision === "approved";
  const m = openModal({
    title: approve ? "Approve document" : "Reject document", narrow: true,
    html: `<div id="m-msg" class="alert alert-error" hidden></div>
      <p><strong>${esc(doc.employee_name)}</strong>: ${esc(doc.label)}<br><span class="muted">${esc(doc.file_name)} &middot; uploaded ${esc(formatDateTime(doc.uploaded_at))}</span></p>
      <form id="rv-form" novalidate><div class="field"><label for="rv-note">${approve ? "Note (optional)" : "Why is it rejected? The employee will see this and upload it again"}</label>
        <input id="rv-note" name="note" maxlength="300" placeholder="${approve ? "" : "For example: the scan is blurred, please upload a clearer copy"}"></div></form>`,
    footer: `<button class="btn btn-ghost" data-close type="button">Cancel</button><button class="btn${approve ? "" : " btn-danger"}" type="submit" form="rv-form">${approve ? "Approve" : "Reject"}</button>`,
  });
  m.el.querySelector("#rv-form").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    try {
      await call("docs.review", { id: doc.id, decision, note: ev.target.note.value });
      m.close();
      toast(approve ? "Document approved." : "Document rejected. The employee will be asked to upload it again.");
      if (onDone) onDone();
    } catch (err) { const e = m.el.querySelector("#m-msg"); e.textContent = err.message; e.hidden = false; }
  });
}

export async function deleteDoc(doc, onDone) {
  if (!(await confirmDialog(`Delete "${doc.label}" (${doc.file_name}) for ${doc.employee_name}? The file goes to the Drive bin and cannot be restored from the app.`, { okText: "Delete", danger: true }))) return;
  try { await call("docs.delete", { id: doc.id }); toast("Document deleted."); if (onDone) onDone(); }
  catch (err) { toast(err.message, "error"); }
}

// Draws one person's checklist and every upload (newest first) into `el`. data comes from docs.list.
// mySelf: the signed-in person is looking at their own documents.
export function renderEmployeeDocuments(el, data, { mySelf, onChange }) {
  const manage = data.can_manage;
  const types = data.types;
  const check = data.checklist.map((c) => {
    const canUpload = mySelf ? (c.state === "missing" || c.state === "rejected") : manage;
    const label = mySelf ? (c.state === "rejected" ? "Upload again" : "Upload") : (c.state === "missing" ? "Upload for them" : "Upload a new one");
    return `<tr><td><strong>${esc(c.label)}</strong>${c.review_note && c.state === "rejected" ? `<div class="doc-reason">Reason: ${esc(c.review_note)}</div>` : ""}</td>
      <td>${docBadge(c.state)}${expiryBadge(c.expiry)}</td>
      <td style="text-align:right">${canUpload ? `<button class="btn ${c.state === "rejected" && mySelf ? "" : "btn-ghost"} btn-sm" data-up="${esc(c.type)}" type="button">${label}</button>` : ""}</td></tr>`;
  }).join("");
  const rows = data.documents.map((d) => `<tr class="${d.current ? "" : "muted-row"}">
      <td><strong>${esc(d.label)}</strong><div class="muted">${esc(d.file_name)}${d.note ? " &middot; " + esc(d.note) : ""}</div></td>
      <td>${docBadge(d.status)}${expiryBadge(d.expiry)}${d.review_note ? `<div class="muted" style="font-size:12px">${esc(d.review_note)}</div>` : ""}${d.expires_on ? `<div class="muted" style="font-size:12px">Expires ${esc(formatDate(d.expires_on))}</div>` : ""}</td>
      <td class="muted">${esc(d.uploaded_by)}<div style="font-size:12px">${esc(formatDateTime(d.uploaded_at))}</div></td>
      <td style="text-align:right;white-space:nowrap"><button class="btn btn-ghost btn-sm" data-dl="${esc(d.id)}" type="button">Download</button>
        ${manage && d.status === "pending" ? `<button class="btn btn-sm" data-ok="${esc(d.id)}" type="button">Approve</button><button class="btn btn-ghost btn-sm" data-no="${esc(d.id)}" type="button">Reject</button>` : ""}
        ${data.can_delete ? `<button class="btn btn-ghost btn-sm" data-del="${esc(d.id)}" type="button">Delete</button>` : ""}</td></tr>`).join("");
  el.innerHTML = `
    ${data.checklist.length ? `<div class="table-wrap"><table class="data"><thead><tr><th>Required document</th><th>Status</th><th></th></tr></thead><tbody>${check}</tbody></table></div>` : `<p class="muted">No documents are required yet.</p>`}
    <div style="margin:14px 0"><button class="btn btn-ghost btn-sm" data-up-other type="button">${mySelf ? "Upload another document" : "Upload another document for them"}</button></div>
    <h3 style="margin:18px 0 8px">All uploads</h3>
    ${data.documents.length ? `<div class="table-wrap"><table class="data"><thead><tr><th>Document</th><th>Status</th><th>Uploaded by</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
      <p class="hint">Older or rejected uploads stay here as a record. ${mySelf ? "Once a document is approved you cannot upload it again, and you can never delete one; ask HR if something needs to change." : ""}</p>`
      : `<p class="muted">Nothing uploaded yet.</p>`}`;

  // An employee can upload a kind of document only while it is missing or was rejected; once it is waiting or approved, only HR can replace it.
  const open = new Set(data.documents.filter((d) => d.current && d.doc_type !== "other" && d.status !== "rejected").map((d) => d.doc_type));
  const offered = mySelf ? types.filter((t) => !open.has(t.id)) : types;
  const upload = (typeId) => openUploadDialog({ employeeId: data.employee.id, employeeName: data.employee.name, types: offered, typeId, forSelf: mySelf, onDone: onChange });
  el.querySelectorAll("[data-up]").forEach((b) => b.addEventListener("click", () => upload(b.dataset.up)));
  const other = el.querySelector("[data-up-other]");
  if (other) other.addEventListener("click", () => upload("other"));
  el.querySelectorAll("[data-dl]").forEach((b) => b.addEventListener("click", () => downloadDoc(b.dataset.dl)));
  const find = (id) => data.documents.find((d) => d.id === id);
  el.querySelectorAll("[data-ok]").forEach((b) => b.addEventListener("click", () => openReviewDialog(find(b.dataset.ok), "approved", onChange)));
  el.querySelectorAll("[data-no]").forEach((b) => b.addEventListener("click", () => openReviewDialog(find(b.dataset.no), "rejected", onChange)));
  el.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", () => deleteDoc(find(b.dataset.del), onChange)));
}
