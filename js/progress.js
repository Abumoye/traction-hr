// "Something is loading" signs for the whole app: a thin moving bar along the top and a small spinner pill in the corner.
// api.js calls begin()/end() around every request to the server, so every page and every button gets it without extra code.
// Short waits (under a fifth of a second) show nothing, so quick actions do not flicker.

const SHOW_AFTER_MS = 200;
const SLOW_AFTER_MS = 6000;
const VERY_SLOW_AFTER_MS = 20000;

let active = 0;
let showTimer = null, slowTimer = null, verySlowTimer = null;
let bar = null, text = null, label = "Loading...";

function build() {
  if (bar) return;
  bar = document.createElement("div");
  bar.className = "net-bar";
  bar.hidden = true;
  bar.innerHTML = `<div class="net-track"><div class="net-fill"></div></div>
    <div class="net-msg" role="status" aria-live="polite"><span class="spinner" aria-hidden="true"></span><span class="net-text"></span></div>`;
  document.body.appendChild(bar);
  text = bar.querySelector(".net-text");
}

function show() {
  build();
  text.textContent = label;
  bar.hidden = false;
}

function hide() {
  if (bar) bar.hidden = true;
}

function startTimers() {
  clearTimeout(showTimer); clearTimeout(slowTimer); clearTimeout(verySlowTimer);
  showTimer = setTimeout(show, SHOW_AFTER_MS);
  slowTimer = setTimeout(() => { label = "Still working... this is taking longer than usual."; if (bar && !bar.hidden) text.textContent = label; }, SLOW_AFTER_MS);
  verySlowTimer = setTimeout(() => { label = "Still waiting for the server. Please keep this page open."; if (bar && !bar.hidden) text.textContent = label; }, VERY_SLOW_AFTER_MS);
}

// A request to the server has started.
export function begin(what = "Loading...") {
  active++;
  if (active === 1) {
    label = what;
    startTimers();
  }
}

// ...and finished (successfully or not). The signs go away when nothing is outstanding.
export function end() {
  active = Math.max(0, active - 1);
  if (active === 0) {
    clearTimeout(showTimer); clearTimeout(slowTimer); clearTimeout(verySlowTimer);
    hide();
  }
}

// Shows the signs straight away and keeps them until the next page replaces this one (used when a link is clicked).
export function pulse(what = "Opening page...") {
  label = what;
  active++;
  clearTimeout(showTimer);
  show();
  clearTimeout(slowTimer); clearTimeout(verySlowTimer);
  slowTimer = setTimeout(() => { if (bar && !bar.hidden) text.textContent = "Still opening... this is taking longer than usual."; }, SLOW_AFTER_MS);
}
