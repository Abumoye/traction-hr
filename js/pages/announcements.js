import { call, ApiError } from "../api.js";
import { initPage, loading, errorBox } from "../layout.js";
import { esc, openModal, toast, formatDateTime } from "../ui.js";

const page = initPage({ active: "announcements", title: "Announcements" });
if (page) run(page);

async function run({ content }) {
  const highlight = new URLSearchParams(location.search).get("id");

  async function show() {
    loading(content);
    try {
      const data = await call("announcements.list");
      content.innerHTML = `<div class="toolbar"><span class="muted">${data.can_send ? "Everything HR has sent. Staff see only the announcements addressed to them." : "Announcements sent to you."}</span>
          ${data.can_send ? `<button class="btn spacer" id="new" type="button">New announcement</button>` : ""}</div>
        ${data.items.length ? data.items.map((a) => `<article class="card ann${a.id === highlight ? " ann-hl" : ""}" id="a-${esc(a.id)}">
            <h2>${esc(a.title)}</h2>
            <p class="ann-body">${esc(a.body)}</p>
            <div class="muted ann-meta">${esc(a.created_by)} &middot; ${esc(formatDateTime(a.created_at))}${data.can_send ? ` &middot; To: ${esc(a.audience_label)} (${a.recipient_count} ${a.recipient_count === 1 ? "person" : "people"})` : ""}</div>
          </article>`).join("") : `<div class="card empty">${data.can_send ? "No announcements yet. Send the first one." : "No announcements yet."}</div>`}`;
      const add = content.querySelector("#new");
      if (add) add.addEventListener("click", compose);
      const hl = highlight && content.querySelector(".ann-hl");
      if (hl) hl.scrollIntoView({ block: "center" });
    } catch (err) { errorBox(content, err instanceof ApiError ? err.message : "Could not load announcements."); }
  }

  async function compose() {
    let opt;
    try { opt = await call("announcements.options"); } catch (err) { toast(err.message, "error"); return; }
    const m = openModal({
      title: "New announcement",
      html: `<div id="m-msg" class="alert alert-error" hidden></div>
        <form id="ann-form" novalidate>
          <div class="field"><label for="a-title">Title</label><input id="a-title" name="title" maxlength="100" required></div>
          <div class="field"><label for="a-body">Message</label><textarea id="a-body" name="body" rows="6" maxlength="2000" required></textarea></div>
          <fieldset class="field"><legend>Who should get it?</legend>
            <label class="check"><input type="radio" name="audience" value="all" checked> Everyone, including the owner</label>
            <label class="check"><input type="radio" name="audience" value="team"> A team (the manager and their team)</label>
            <label class="check"><input type="radio" name="audience" value="department"> A department</label>
            <label class="check"><input type="radio" name="audience" value="people"> Specific people</label>
          </fieldset>
          <div class="field" id="g-team" hidden><label for="a-team">Team</label><select id="a-team" name="team">
            ${opt.teams.length ? opt.teams.map((t) => `<option value="${esc(t.manager_id)}">${esc(t.name)}'s team (${t.size})</option>`).join("") : `<option value="">No teams yet</option>`}</select></div>
          <div class="field" id="g-dept" hidden><label for="a-dept">Department</label><select id="a-dept" name="department">
            ${opt.departments.length ? opt.departments.map((d) => `<option value="${esc(d.id)}">${esc(d.name)} (${d.members})</option>`).join("") : `<option value="">No departments yet</option>`}</select></div>
          <div class="field" id="g-people" hidden><label for="a-find">Choose people</label>
            <input id="a-find" type="search" placeholder="Type a name to filter">
            <div class="people-pick" id="a-people">${opt.people.map((p) => `<label class="check" data-name="${esc(p.name.toLowerCase())}"><input type="checkbox" name="person" value="${esc(p.user_id)}"> ${esc(p.name)} <span class="muted">${esc(p.role.replace("_", " "))}</span></label>`).join("")}</div>
            <div class="hint" id="a-count">0 chosen</div></div>
          <p class="hint">People get a bell notification and can read the full message on this page. Nothing is emailed.${opt.staff_without_login ? ` ${opt.staff_without_login} staff member${opt.staff_without_login === 1 ? " has" : "s have"} no login yet and cannot be told.` : ""}</p>
        </form>`,
      footer: `<button class="btn btn-ghost" data-close type="button">Cancel</button><button class="btn" id="a-send" type="submit" form="ann-form">Send</button>`,
    });
    const form = m.el.querySelector("#ann-form");
    const msg = m.el.querySelector("#m-msg");
    const showGroup = () => {
      const v = form.audience.value;
      m.el.querySelector("#g-team").hidden = v !== "team";
      m.el.querySelector("#g-dept").hidden = v !== "department";
      m.el.querySelector("#g-people").hidden = v !== "people";
    };
    form.querySelectorAll("input[name=audience]").forEach((r) => r.addEventListener("change", showGroup));
    const countPeople = () => { m.el.querySelector("#a-count").textContent = `${form.querySelectorAll("input[name=person]:checked").length} chosen`; };
    form.querySelectorAll("input[name=person]").forEach((c) => c.addEventListener("change", countPeople));
    m.el.querySelector("#a-find").addEventListener("input", (ev) => {
      const q = ev.target.value.trim().toLowerCase();
      m.el.querySelectorAll("#a-people label").forEach((l) => { l.hidden = !!q && !l.dataset.name.includes(q); });
    });
    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      msg.hidden = true;
      const audience = form.audience.value;
      const payload = { title: form.title.value, body: form.body.value, audience };
      if (audience === "team") payload.ref = form.team.value;
      if (audience === "department") payload.ref = form.department.value;
      if (audience === "people") payload.userIds = [...form.querySelectorAll("input[name=person]:checked")].map((c) => c.value);
      const btn = m.el.querySelector("#a-send");
      btn.disabled = true;
      try {
        const r = await call("announcements.create", payload);
        m.close();
        toast(r.notified ? `Sent. ${r.notified} ${r.notified === 1 ? "person was" : "people were"} notified.` : "Saved. Announcement notifications are switched off, so people will only see it on this page.");
        show();
      } catch (err) { msg.textContent = err.message; msg.hidden = false; btn.disabled = false; }
    });
  }

  show();
}
