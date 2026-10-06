import { call, ApiError } from "../api.js";
import { initPage, loading, errorBox } from "../layout.js";
import { esc, openModal, confirmDialog, toast } from "../ui.js";

const page = initPage({ active: "departments", title: "Departments" });
if (page) run(page);

async function run({ content }) {
  async function load() {
    loading(content);
    try {
      render(await call("departments.list"));
    } catch (err) {
      errorBox(content, err instanceof ApiError ? err.message : "Could not load departments.");
    }
  }

  function render(list) {
    content.innerHTML = `
      <div class="toolbar"><span class="muted">Group employees into departments.</span><button class="btn spacer" id="add" type="button">Add department</button></div>
      ${list.length ? `<div class="table-wrap"><table class="data"><thead><tr><th>Department</th><th>Employees</th><th></th></tr></thead><tbody>
        ${list.map((d) => `<tr><td><strong>${esc(d.name)}</strong></td><td>${d.employees}</td>
          <td style="text-align:right;white-space:nowrap">
            <button class="btn btn-ghost btn-sm" data-edit="${esc(d.id)}" type="button">Rename</button>
            <button class="btn btn-ghost btn-sm" data-del="${esc(d.id)}" type="button">Delete</button></td></tr>`).join("")}
        </tbody></table></div>` : `<div class="card empty">No departments yet. Add your first one.</div>`}`;

    content.querySelector("#add").addEventListener("click", () => edit(null));
    content.querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", () => edit(list.find((d) => d.id === b.dataset.edit))));
    content.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", () => remove(list.find((d) => d.id === b.dataset.del))));
  }

  function edit(dept) {
    const m = openModal({
      title: dept ? "Rename department" : "Add department",
      narrow: true,
      html: `<div id="m-msg" class="alert alert-error" hidden></div>
        <form id="dept-form" novalidate><div class="field"><label for="d-name">Department name</label>
        <input id="d-name" name="name" maxlength="60" value="${esc(dept ? dept.name : "")}" required></div></form>`,
      footer: `<button class="btn btn-ghost" data-close type="button">Cancel</button><button class="btn" type="submit" form="dept-form">Save</button>`,
    });
    m.el.querySelector("#dept-form").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      try {
        await call("departments.save", { id: dept ? dept.id : "", name: ev.target.name.value });
        m.close();
        toast("Saved.");
        load();
      } catch (err) {
        const msg = m.el.querySelector("#m-msg");
        msg.textContent = err.message;
        msg.hidden = false;
      }
    });
  }

  async function remove(dept) {
    if (!(await confirmDialog(`Delete the "${dept.name}" department?`, { okText: "Delete", danger: true }))) return;
    try {
      await call("departments.delete", { id: dept.id });
      toast("Department deleted.");
      load();
    } catch (err) {
      toast(err.message, "error");
    }
  }

  load();
}
