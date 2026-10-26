import { call, ApiError } from "../api.js";
import { initPage, loading, errorBox } from "../layout.js";
import { esc, toast, formatDateTime, tabBar, bindTabs } from "../ui.js";
import { setBellCount } from "../bell.js";
import { pushState, enablePush, disablePush, sendTest, registerWorker } from "../push.js";

const page = initPage({ active: "notifications", title: "Notifications" });
if (page) run(page);

// "5 min ago", "2 h ago", "Yesterday", or the date.
function ago(iso) {
  const t = new Date(iso).getTime();
  if (isNaN(t)) return "";
  const mins = Math.round((Date.now() - t) / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)} h ago`;
  if (mins < 60 * 48) return "Yesterday";
  return formatDateTime(iso);
}

// "Phone alerts" card: turn alerts on or off for THIS device, and send a test.
async function phoneAlerts(host) {
  await registerWorker();
  const state = await pushState();
  const copy = {
    on: ["Phone alerts are on for this device.", "You get a pop-up, vibration and sound here even when the app is closed. The sound and vibration follow this phone's own notification settings."],
    off: ["Get alerts on this device", "Turn them on to get a pop-up, vibration and sound when something needs you, even when the app is closed. You can turn them off here at any time."],
    install: ["Get alerts on your iPhone", "Apple only allows alerts for apps on the Home Screen. In Safari tap the Share button, choose Add to Home Screen, then open the app from your Home Screen, sign in and come back to this page to turn alerts on. (iOS 16.4 or newer.)"],
    blocked: ["Alerts are blocked on this device", "Allow notifications for this site in your browser or phone settings, then reload this page."],
    unsupported: ["This browser cannot show phone alerts", "Try Chrome on an Android phone, or Safari on an iPhone after adding the app to the Home Screen."],
  }[state];
  host.innerHTML = `<div class="card phone-card"><h2>${esc(copy[0])}</h2><p class="muted">${esc(copy[1])}</p>
    <div class="action-row">${state === "off" ? `<button class="btn" id="pa-on" type="button">Turn on phone alerts</button>` : ""}
      ${state === "on" ? `<button class="btn btn-ghost" id="pa-test" type="button">Send me a test</button><button class="btn btn-ghost" id="pa-off" type="button">Turn off on this device</button>` : ""}</div></div>`;
  const again = () => phoneAlerts(host);
  const on = host.querySelector("#pa-on");
  if (on) on.addEventListener("click", async () => {
    on.disabled = true;
    try { await enablePush(); toast("Phone alerts are on for this device."); } catch (err) { toast(err.message, "error"); }
    again();
  });
  const off = host.querySelector("#pa-off");
  if (off) off.addEventListener("click", async () => {
    off.disabled = true;
    try { await disablePush(); toast("Phone alerts are off for this device."); } catch (err) { toast(err.message, "error"); }
    again();
  });
  const test = host.querySelector("#pa-test");
  if (test) test.addEventListener("click", async () => {
    test.disabled = true;
    try {
      const r = await sendTest();
      if (r.sent > 0) toast("Test sent. It should appear on your phone in a few seconds.");
      else toast("The test could not be delivered. Please try again in a minute.", "error");
    } catch (err) { toast(err.message, "error"); }
    test.disabled = false;
  });
}

async function run({ role, content }) {
  const isOwner = role === "owner";
  const tabs = [{ id: "inbox", label: "Inbox" }];
  if (isOwner) tabs.push({ id: "switches", label: "Company switches" });
  const wanted = new URLSearchParams(location.search).get("tab");
  let active = tabs.some((t) => t.id === wanted) ? wanted : "inbox";
  let onlyUnread = false;

  content.innerHTML = `${tabs.length > 1 ? `<div id="tabs">${tabBar(tabs, active)}</div>` : ""}<div id="panel"></div>`;
  const panel = content.querySelector("#panel");
  const tabsEl = content.querySelector("#tabs");
  if (tabsEl) bindTabs(tabsEl, (id) => { active = id; show(); });
  const fail = (err, text) => errorBox(panel, err instanceof ApiError ? err.message : text);
  function show() { return active === "switches" ? switchesTab() : inboxTab(); }

  // ------------------------------------------------------------ the inbox
  async function inboxTab() {
    loading(panel);
    try {
      const data = await call("notifications.list", { unread: onlyUnread });
      setBellCount(data.unread);
      panel.innerHTML = `<div id="phone-alerts"></div><div class="toolbar">
          <label class="check"><input type="checkbox" id="only"${onlyUnread ? " checked" : ""}> Unread only</label>
          <span class="muted">${data.unread ? `${data.unread} unread` : "You are all caught up."}</span>
          ${data.unread ? `<button class="btn btn-ghost btn-sm spacer" id="all" type="button">Mark all as read</button>` : ""}
        </div>
        ${data.items.length ? `<ul class="ntf-list">${data.items.map((n) => `<li class="ntf${n.read ? "" : " unread"}">
            <a href="${esc(n.link || "#")}" data-id="${esc(n.id)}" data-read="${n.read ? "1" : ""}">
              <span class="ntf-dot" aria-hidden="true"></span>
              <span class="ntf-main"><strong>${esc(n.title)}</strong>${n.body ? `<span class="ntf-body">${esc(n.body)}</span>` : ""}
                <span class="ntf-meta">${esc(n.set_label)} &middot; ${esc(ago(n.created_at))}</span></span>
            </a></li>`).join("")}</ul>
          <p class="hint">Notifications appear on this page only. Nothing is sent by email. Old ones are cleared automatically after a few weeks.</p>`
          : `<div class="card empty">${onlyUnread ? "No unread notifications." : "Nothing here yet. Requests, approvals, reminders and announcements will show up as they happen."}</div>`}`;
      phoneAlerts(panel.querySelector("#phone-alerts"));
      panel.querySelector("#only").addEventListener("change", (ev) => { onlyUnread = ev.target.checked; inboxTab(); });
      const all = panel.querySelector("#all");
      if (all) all.addEventListener("click", async () => {
        try { const r = await call("notifications.markRead", { all: true }); setBellCount(r.unread); inboxTab(); }
        catch (err) { toast(err.message, "error"); }
      });
      panel.querySelectorAll(".ntf a").forEach((a) => a.addEventListener("click", async (ev) => {
        ev.preventDefault();
        const dest = a.getAttribute("href");
        try { if (!a.dataset.read) await call("notifications.markRead", { ids: [a.dataset.id] }); } catch (err) { /* opening the page matters more */ }
        if (dest && dest !== "#") location.href = dest; else inboxTab();
      }));
    } catch (err) { fail(err, "Could not load your notifications."); }
  }

  // ------------------------------------------------------------ owner: switch a set off for the whole company
  async function switchesTab() {
    loading(panel);
    try {
      const data = await call("notifications.settingsGet");
      panel.innerHTML = `<div class="card" style="max-width:680px"><h2>Company switches</h2>
        <p class="muted">Switch a set off to stop those notifications for <strong>everybody</strong> in the company. Individual people cannot mute them. Nothing is ever sent by email.</p>
        <div id="sw-msg" class="alert alert-error" hidden></div>
        <form id="sw-form" novalidate>${data.sets.map((s) => `<div class="switch-row">
            <label class="switch"><input type="checkbox" name="set" value="${esc(s.id)}"${s.on ? " checked" : ""}${s.locked ? " disabled" : ""}><span class="switch-track" aria-hidden="true"></span>
              <span class="switch-text"><strong>${esc(s.label)}</strong><span class="muted">${esc(s.about)}</span></span></label>
            ${s.locked ? `<span class="badge">Always on</span>` : ""}</div>`).join("")}
          <button class="btn" type="submit">Save</button></form></div>`;
      panel.querySelector("#sw-form").addEventListener("submit", async (ev) => {
        ev.preventDefault();
        const off = [...ev.target.querySelectorAll("input[name=set]:not(:checked):not(:disabled)")].map((c) => c.value);
        try { await call("notifications.settingsSave", { off }); toast(off.length ? `Saved. ${off.length} set${off.length === 1 ? " is" : "s are"} switched off.` : "Saved. Everything is on."); }
        catch (err) { const m = panel.querySelector("#sw-msg"); m.textContent = err.message; m.hidden = false; }
      });
    } catch (err) { fail(err, "Could not load the settings."); }
  }

  show();
}
