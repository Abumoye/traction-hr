import { call, ApiError } from "../api.js";
import { initPage, loading, errorBox } from "../layout.js";
import { esc, formatDate, monthLabel } from "../ui.js";
import { naira } from "../money.js";

const page = initPage({ active: "reports", title: "Reports" });
if (page) run(page);

// ---------- small helpers for the charts ----------
const compact = (n) => {
  const v = Number(n) || 0;
  if (v >= 1e9) return "₦" + (v / 1e9).toFixed(2).replace(/\.?0+$/, "") + "B";
  if (v >= 1e6) return "₦" + (v / 1e6).toFixed(2).replace(/\.?0+$/, "") + "M";
  if (v >= 1e3) return "₦" + (v / 1e3).toFixed(1).replace(/\.0$/, "") + "K";
  return "₦" + Math.round(v);
};
const pctText = (v) => (v === null || v === undefined ? "No data yet" : v + "%");
const shortMonth = (m) => monthLabel(m).slice(0, 3);

function bars(items, { value = (x) => x.count, text = (x) => String(x.count), empty = "Nothing to show yet." } = {}) {
  if (!items.length) return `<p class="muted">${esc(empty)}</p>`;
  const max = Math.max(1, ...items.map(value));
  return items.map((x) => `<div class="bar-row"><span title="${esc(x.label)}">${esc(x.label)}</span><div class="bar"><span style="width:${Math.round((value(x) / max) * 100)}%"></span></div><strong>${esc(text(x))}</strong></div>`).join("");
}

function columns(items, { value, label, text, accent = false, quiet = false, every = 1 }) {
  const max = Math.max(1, ...items.map(value));
  return `<div class="cols${accent ? " accent" : ""}" role="img" aria-label="Chart">${items.map((x, i) => {
    const v = value(x);
    return `<div class="col" title="${esc(label(x))}: ${esc(text(x))}"><em>${v && !quiet ? esc(text(x)) : ""}</em><div class="track"><span class="colbar" style="height:${Math.max(v ? 4 : 1, Math.round((v / max) * 100))}%"></span></div><small>${i % every === 0 ? esc(label(x)) : ""}</small></div>`;
  }).join("")}</div>`;
}

function stacked(parts) {
  const total = parts.reduce((a, p) => a + p.count, 0);
  if (!total) return `<p class="muted">Nothing to show yet.</p>`;
  return `<div class="stack-bar" role="img" aria-label="Breakdown">${parts.filter((p) => p.count).map((p) => `<span class="seg ${p.cls}" style="width:${(p.count / total) * 100}%" title="${esc(p.label)}: ${p.count}"></span>`).join("")}</div>
    <div class="legend">${parts.map((p) => `<span><i class="dot ${p.cls}"></i>${esc(p.label)} <strong>${p.count}</strong></span>`).join("")}</div>`;
}

const card = (title, body, note = "") => `<div class="card report"><h2>${esc(title)}</h2>${note ? `<p class="muted note">${esc(note)}</p>` : ""}${body}</div>`;

async function run({ content }) {
  loading(content);
  try {
    const r = await call("reports.get");
    content.innerHTML = view(r);
  } catch (err) {
    errorBox(content, err instanceof ApiError ? err.message : "Could not load the reports.");
  }
}

function view(r) {
  const h = r.headcount, a = r.attendance, l = r.leave, p = r.payroll, rc = r.recruitment, t = r.training, pf = r.performance, ex = r.expenses, ad = r.advances;
  const latest = p.runs.length ? p.runs[p.runs.length - 1] : null;
  const tiles = [
    [h.total, "People working here", "accent"],
    [pctText(a.rate), "Attendance, last 30 days", ""],
    [l.days_taken, `Leave days taken in ${l.year}`, ""],
    [latest ? compact(latest.gross) : "None yet", latest ? `Gross pay, ${monthLabel(latest.period)}` : "Payroll not run yet", ""],
    [rc.open_jobs, "Open jobs", ""],
    [pctText(t.rate), "Mandatory training up to date", ""],
  ];
  const stats = `<div class="stats compact">${tiles.map(([n, lbl, cls]) => `<div class="stat ${cls}"><div class="num">${esc(n)}</div><div class="lbl">${esc(lbl)}</div></div>`).join("")}</div>`;

  const people = card("People", `
      <h3>By department</h3>${bars(h.by_department)}
      <h3>How long people have been here</h3>${bars(h.tenure)}
      <p class="muted">Average ${h.average_tenure_years === null ? "-" : h.average_tenure_years + " years"} with the company.</p>`,
    `${h.total} current employees. ${h.left_total} have left.`);

  const mix = card("Who we are", `
      <h3>Employment type</h3>${bars(h.by_type)}
      <h3>Gender</h3>${bars(h.by_gender)}`);

  const hires = card("New joiners, last 12 months", `${columns(h.hires_by_month, { value: (x) => x.count, label: (x) => shortMonth(x.month), text: (x) => String(x.count) })}
      <p class="muted">${h.hires_this_year} people have joined so far this year.</p>`);

  const attendance = card("Attendance", `
      <div class="big-row"><div><div class="big">${esc(pctText(a.rate))}</div><div class="muted">of working days attended</div></div>
        <div><div class="big">${esc(pctText(a.punctuality))}</div><div class="muted">on time</div></div></div>
      <h3>Last 14 working days</h3>${columns(a.daily, { value: (x) => x.rate || 0, label: (x) => formatDate(x.date).slice(0, 6), text: (x) => (x.rate === null ? "" : Math.round(x.rate) + "%"), accent: true, quiet: true, every: 2 })}
      <h3>By department</h3>${bars(a.by_department, { value: (x) => x.rate, text: (x) => x.rate + "%", empty: "No attendance recorded yet." })}`,
    `${formatDate(a.window.from)} to ${formatDate(a.window.to)}. Weekends, public holidays and approved leave are not counted against anyone.`);

  const leave = card("Leave", `
      <h3>Days taken by type</h3>${bars(l.by_type, { empty: "No leave taken yet this year." })}
      <h3>Days taken by month</h3>${columns(l.by_month, { value: (x) => x.days, label: (x) => shortMonth(x.month), text: (x) => String(x.days) })}
      <p class="muted">${l.pending} request${l.pending === 1 ? "" : "s"} waiting. ${l.away_today ? `Away today: ${esc(l.away_names.join(", "))}${l.away_today > l.away_names.length ? ` and ${l.away_today - l.away_names.length} more` : ""}.` : "Nobody is away today."}</p>`);

  const payroll = latest ? card("Payroll", `
      <h3>Gross pay by month</h3>${columns(p.runs, { value: (x) => x.gross, label: (x) => shortMonth(x.period), text: (x) => compact(x.gross) })}
      <div class="table-wrap"><table class="data"><thead><tr><th>Month</th><th class="num">Gross</th><th class="num">Net</th><th class="num">PAYE</th><th class="num">Pension</th></tr></thead><tbody>
        ${p.runs.slice().reverse().map((x) => `<tr><td>${esc(monthLabel(x.period))}</td><td class="num">${naira(x.gross, 0)}</td><td class="num">${naira(x.net, 0)}</td><td class="num">${naira(x.paye, 0)}</td><td class="num">${naira(x.pension, 0)}</td></tr>`).join("")}</tbody></table></div>
      <p class="muted">Average gross pay per person in ${esc(monthLabel(p.latest.period))}: ${naira(p.latest.average_gross, 0)}${p.latest.change_pct === null ? "" : ` (${p.latest.change_pct >= 0 ? "up" : "down"} ${Math.abs(p.latest.change_pct)}% on the month before)`}.</p>`,
    "Approved and paid payroll runs only.")
    : card("Payroll", `<p class="muted">No payroll run has been approved yet.</p>`);

  const cost = latest ? card(`Pay by department, ${monthLabel(p.latest.period)}`, bars(p.latest.by_department, { value: (x) => x.amount, text: (x) => compact(x.amount) }), "Department totals only; individual pay is never shown here.") : "";

  const hiring = card("Hiring", `
      <h3>People in the pipeline</h3>${bars(rc.pipeline)}
      <div class="big-row"><div><div class="big">${rc.hired_this_year}</div><div class="muted">hired this year</div></div>
        <div><div class="big">${rc.average_days_to_hire === null ? "-" : rc.average_days_to_hire}</div><div class="muted">days from applying to hired</div></div></div>
      <h3>Where applicants come from</h3>${bars(rc.sources, { empty: "No applicants yet." })}
      <p class="muted">${rc.new_last_30_days} new applicant${rc.new_last_30_days === 1 ? "" : "s"} in the last 30 days.</p>`);

  const training = card("Mandatory training", `
      <div class="big">${esc(pctText(t.rate))}</div><p class="muted">of required courses are up to date across ${t.mandatory_courses} mandatory course${t.mandatory_courses === 1 ? "" : "s"}.</p>
      ${stacked([{ label: "Valid", count: t.valid, cls: "ok" }, { label: "Expiring soon", count: t.expiring, cls: "warn" }, { label: "Expired", count: t.expired, cls: "bad" }, { label: "Not done", count: t.missing, cls: "none" }])}`);

  const perf = card("Performance reviews", pf ? `
      <p><strong>${esc(pf.cycle)}</strong> &middot; ${esc(pf.status)}: ${pf.completed} of ${pf.total} completed (${esc(pctText(pf.completion_pct))})</p>
      <h3>Final ratings, ${esc(pf.ratings_cycle)}</h3>${bars(pf.distribution.map((x) => ({ label: x.label + " star" + (x.label === "1" ? "" : "s"), count: x.count })))}
      <p class="muted">${pf.average === null ? "No reviews completed yet." : `Average rating ${pf.average} out of 5.`}</p>` : `<p class="muted">No review cycle has been started yet.</p>`);

  const expenses = card("Expenses", `
      <h3>Approved and paid, by month</h3>${columns(ex.by_month, { value: (x) => x.amount, label: (x) => shortMonth(x.month), text: (x) => compact(x.amount) })}
      <h3>By category, this year</h3>${bars(ex.by_category, { value: (x) => x.amount, text: (x) => compact(x.amount), empty: "No approved claims this year." })}
      <p class="muted">${ex.pending_count} claim${ex.pending_count === 1 ? "" : "s"} (${naira(ex.pending_amount, 0)}) waiting for approval.</p>`);

  const advances = card("Salary advances", `
      <div class="big-row"><div><div class="big">${compact(ad.outstanding)}</div><div class="muted">still to be repaid (${ad.repaying} person${ad.repaying === 1 ? "" : "s"})</div></div>
        <div><div class="big">${ad.awaiting_decision}</div><div class="muted">waiting for a decision</div></div></div>
      <p class="muted">${naira(ad.requested_this_year, 0)} requested and ${naira(ad.repaid_this_year, 0)} repaid so far this year.</p>`);

  return `<p class="muted" style="margin-top:0">Figures as of ${esc(formatDate(r.today))}. Everything here is a company total or average. No individual's pay or personal details appear.</p>
    ${stats}
    <div class="report-grid">${people}${mix}${hires}${attendance}${leave}${payroll}${cost}${hiring}${training}${perf}${expenses}${advances}</div>`;
}
