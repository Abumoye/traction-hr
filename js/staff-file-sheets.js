// Turns a staff file (the answer of staffhistory.get) into the sheets of the Excel download: one tab per section, every row listed.
import { formatDate, cap } from "./ui.js";

export const KIND_LABELS = { manager: "Reports to", title: "Job title", department: "Department", type: "Employment type", arrangement: "Work arrangement", status: "Status" };
export const REASON_LABELS = { resignation: "Resignation", dismissal: "Dismissal", "end-of-contract": "End of contract", retirement: "Retirement", redundancy: "Redundancy", "mutual-agreement": "Mutual agreement", death: "Death", other: "Other" };
export const RECORD_LABELS = { warning: "Warning", query: "Query", suspension: "Suspension", commendation: "Commendation", note: "Note" };
export const DOC_STATE = { approved: "Approved", pending: "Waiting for HR", rejected: "Rejected", missing: "Not submitted" };
export const LOCATION_LABELS = { ok: "At a work site", outside: "Away from site", weak: "Location not precise enough", none: "No location", exempt: "Not location-checked", nosite: "No sites set up", remote: "Remote" };
export const TRAINING_STATE = { valid: "Up to date", expiring: "Expires soon", expired: "Expired", overdue: "Overdue", assigned: "Assigned" };

const d = (iso) => (iso ? formatDate(iso) : "");
const label = (kind, v) => (kind === "status" || kind === "type" || kind === "arrangement" ? cap(String(v || "").replace(/-/g, " ")) : v);
export const days = (n) => `${n} day${n === 1 ? "" : "s"}`;

export function fileBaseName(f) {
  const name = String(f.profile.name || "staff").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "staff";
  return `Staff-file-${name}-${f.today}`;
}

export function staffFileSheets(f) {
  const p = f.profile, s = f.service;
  const sheets = [];

  sheets.push({ name: "Summary", rows: [
    ["Field", "Value"],
    ["Company", f.company], ["Staff file generated", `${f.today} by ${f.generated_by}`], ["Confidential", "For the owner and HR only"],
    ["Name", p.name], ["Employee number", p.employee_no], ["Status", cap(p.status)], ["Gender", cap(p.gender)], ["Date of birth", p.dob], ["Work email", p.email], ["Phone", p.phone], ["Home address", p.address],
    ["Department now", p.department], ["Job title now", p.job_title], ["Reports to now", p.manager], ["Employment type now", cap(p.employment_type)], ["Work arrangement now", cap(p.work_arrangement)],
    ["Date joined", p.date_joined], ["Last working day", s.ended ? (s.end ? s.end + (s.end_estimated ? " (estimated)" : "") : "") : ""],
    ["Reason for leaving", REASON_LABELS[p.exit_reason] || ""], ["Exit notes", p.exit_notes],
    ["Time with the company", s.text], ["Days with the company", s.days || ""],
    ["Changes of manager", f.moves.reporting_changes], ["Changes of job title", f.moves.title_changes], ["Changes of department", f.moves.department_changes],
    ["Bank", p.bank_name], ["Account number", p.account_no], ["Tax ID (TIN)", p.tin], ["Pension PIN", p.pension_pin],
    ["Hired through", f.hiring ? `${f.hiring.job || "a job advert"} (${f.hiring.source || "source not recorded"}), applied ${d(f.hiring.applied_at && f.hiring.applied_at.slice(0, 10))}` : ""],
    ["Onboarding tasks done", f.onboarding.total ? `${f.onboarding.done} of ${f.onboarding.total}` : ""],
    ...f.login.map((u) => ["Sign-in", `${u.email}, ${u.role}, ${u.status}, last signed in ${u.last_login ? u.last_login.slice(0, 10) : "never"}`]),
  ] });

  sheets.push({ name: "What stands out", rows: [["Level", "Note"], ...(f.anomalies.length ? f.anomalies.map((a) => [a.level === "watch" ? "Look at this" : "For information", a.text.replace(/\b\d{4}-\d{2}-\d{2}\b/g, (m) => d(m))]) : [["", "Nothing unusual found in the records."]])] });

  const hist = [["What", "Value", "From", "To", "Length", "Recorded as", "Note"]];
  for (const kind of Object.keys(KIND_LABELS)) {
    for (const x of f.timeline[kind] || []) {
      if (x.gap) hist.push([KIND_LABELS[kind], "Not recorded", x.start, x.end, x.text, "", ""]);
      else hist.push([KIND_LABELS[kind], label(kind, x.label), x.start, x.end || (s.ended ? "" : "Now"), x.text, x.source === "current" ? "Current record" : cap(x.source), x.note]);
    }
  }
  sheets.push({ name: "Employment history", rows: hist });

  sheets.push({ name: "Who reported to them", rows: [["Relationship", "Name", "Employee number", "Job title", "Status", "From", "To", "Days"],
    ...f.team.current.map((x) => ["Reports to them now", x.name, x.employee_no, x.job_title, cap(x.status), x.start, "", x.days]),
    ...f.team.past.map((x) => ["Reported to them in the past", x.name, x.employee_no, x.job_title, cap(x.status), x.start, x.end, x.days])] });

  const a = f.attendance;
  sheets.push({ name: "Attendance summary", rows: [["Measure", "Value"],
    ["First clock-in on record", a.first_record], ["Last clock-in on record", a.last_record], ["Days with a record", a.records], ["Days at work", a.attended],
    ["On time", a.present], ["Late", a.late], ["Late as % of days at work", a.late_pct === null ? "" : a.late_pct], ["Remote", a.remote], ["Half days", a.half_day], ["Marked absent", a.absent],
    ["Working days with no clock-in and no approved leave", a.no_record_total], ["Counted from", a.no_record_from], ["Days with a clock-in but no clock-out", a.no_clock_out],
    ["Clock-ins at a work site", a.at_site], ["Clock-ins away from a site or without a usable location", a.away_total], ["Days not location-checked", a.location_exempt + a.location_unchecked],
    ["Working start time", a.work_start], ["Grace period (minutes)", a.grace_minutes], [],
    ["Year", "On time", "Late", "Remote", "Half days", "Absent"], ...a.by_year.map((y) => [y.year, y.present, y.late, y.remote, y.half_day, y.absent]),
    [], ["Work site", "Days at the site"], ...a.by_site.map((x) => [x.site, x.days])] });
  sheets.push({ name: "Late days", rows: [["Date", "Clock-in", "Minutes late"], ...a.late_days.map((x) => [x.date, x.check_in, x.minutes_late])] });
  sheets.push({ name: "No clock-in or leave", rows: [["Working day with no clock-in and no approved leave"], ...a.no_record_days.map((x) => [x])] });
  const offsite = [...a.remote_days.map((x) => [x.date, "Remote", x.note, ""]), ...a.away_days.map((x) => [x.date, LOCATION_LABELS[x.result] || x.result, x.site, x.distance_m])]
    .sort((r1, r2) => r1[0].localeCompare(r2[0]));
  sheets.push({ name: "Remote and away days", rows: [["Date", "Kind", "Site or note", "Metres from site"], ...offsite] });
  sheets.push({ name: "Every attendance record", rows: [["Date", "Status", "Clock-in", "Clock-out", "Location check", "Site", "Metres from site", "Note"],
    ...a.rows.map((x) => [x.date, cap(x.status), x.check_in, x.check_out, LOCATION_LABELS[x.location] || x.location, x.site, x.distance_m, x.note])] });

  const l = f.leave;
  const types = l.by_type.map((t) => t.name);
  sheets.push({ name: "Leave summary", rows: [["Leave type", "Days taken", "Booked ahead", "Requests", "Approved", "Rejected", "Cancelled", "Pending"],
    ...l.by_type.map((t) => [t.name, t.days_taken, t.booked_days, t.requests, t.approved, t.rejected, t.cancelled, t.pending]), ["All types", l.days_taken], [],
    ["Year", "Total days", ...types], ...l.by_year.map((y) => [y.year, y.total, ...types.map((n) => y.by_type[n] || 0)]), [],
    ...(l.balances.length ? [[`Balances for ${l.balance_year}`, "Entitlement", "Carried over", "Used", "Pending", "Remaining"], ...l.balances.map((b) => [b.name, b.unlimited ? "No limit" : b.entitlement, b.carried, b.used, b.pending, b.remaining === null ? "" : b.remaining])] : [])] });
  sheets.push({ name: "Leave requests", rows: [["Leave type", "From", "To", "Working days", "Status", "Decided by", "Decided on", "Reason", "Decision note", "Requested on"],
    ...l.requests.map((r) => [r.leave_type, r.start_date, r.end_date, r.days, cap(r.status), r.approver, (r.decided_at || "").slice(0, 10), r.reason, r.decision_note, (r.requested_at || "").slice(0, 10)])] });

  sheets.push({ name: "Documents", rows: [["Required document", "Status", "File", "Submitted on", "Submitted by", "Reviewed by", "Reviewed on", "HR note", "Expires on"],
    ...f.documents.required.map((x) => [x.label, DOC_STATE[x.state] || x.state, x.file_name, (x.uploaded_at || "").slice(0, 10), x.uploaded_by, x.reviewed_by, (x.reviewed_at || "").slice(0, 10), x.review_note, x.expires_on]), [],
    ["Every upload (newest first)", "Status", "File", "Uploaded on", "Uploaded by", "Reviewed by", "Reviewed on", "HR note", "Expires on"],
    ...f.documents.uploads.map((x) => [x.label, DOC_STATE[x.status] || x.status, x.file_name, (x.uploaded_at || "").slice(0, 10), x.uploaded_by, x.reviewed_by, (x.reviewed_at || "").slice(0, 10), x.review_note, x.expires_on])] });

  sheets.push({ name: "Training", rows: [["Course", "Required", "Status", "Due", "Completed on", "Expires on", "Certificate", "Note"],
    ...f.training.map((x) => [x.course, x.mandatory ? "Yes" : "", TRAINING_STATE[x.state] || x.state, x.due_date, x.completed_on, x.expires_on, x.certificate, x.note])] });
  sheets.push({ name: "Performance", rows: [["Review", "Period from", "Period to", "Status", "Reviewer", "Self rating", "Manager rating", "Final rating", "Completed on"],
    ...f.performance.reviews.map((x) => [x.cycle, x.period_start, x.period_end, cap(x.status), x.reviewer, x.self_rating, x.manager_rating, x.final_rating, (x.completed_at || "").slice(0, 10)]), [],
    ["Goal", "Due", "Progress %", "Status", "Last note"], ...f.performance.goals.map((g) => [g.title, g.due_date, g.progress, cap(g.status), g.last_note])] });

  const pay = f.pay;
  sheets.push({ name: "Pay", rows: [["Salary from", "Monthly gross (NGN)", "Annual rent (NGN)", "Set by"], ...pay.salary.map((x) => [x.effective_from, x.monthly_gross, x.annual_rent, x.set_by]), [],
    ["Year", "Months paid", "Gross (NGN)", "Net (NGN)", "PAYE (NGN)", "Lost to lateness and no clock-in (NGN)"], ...pay.payslips.by_year.map((y) => [y.year, y.months, y.gross, y.net, y.paye, y.attendance]),
    ["All years", pay.payslips.count, pay.payslips.gross, pay.payslips.net, pay.payslips.paye, pay.payslips.attendance], [],
    ["Salary advance requested", "Amount (NGN)", "Repay over (months)", "Status", "Paid out on", "Repaid so far (NGN)", "Balance (NGN)", "Reason"],
    ...pay.advances.map((x) => [(x.requested_at || "").slice(0, 10), x.amount, x.repay_months, cap(x.status), x.disbursed_on, x.repaid_total, x.balance, x.reason]), [],
    ["Expense claims", "Count", "Claimed (NGN)", "Paid (NGN)", "Waiting (NGN)", "Rejected (NGN)"], ["All claims", pay.expenses.count, pay.expenses.claimed, pay.expenses.paid, pay.expenses.pending, pay.expenses.rejected]] });
  sheets.push({ name: "Payslips", rows: [["Month", "Gross (NGN)", "Net (NGN)", "PAYE (NGN)", "Employee pension (NGN)", "Total deductions (NGN)", "Lateness and no clock-in (NGN)", "Why", "Days worked", "Run status"],
    ...pay.payslips.list.map((x) => [x.period, x.gross, x.net, x.paye, x.pension_employee, x.deductions, x.attendance, x.attendance_note, x.days_worked, cap(x.run_status)])] });

  const em = f.emergency || { sent: [], received: [] };
  const emRows = [];
  for (const m of em.sent) for (const p of m.recipients) emRows.push(["Sent by this person", (m.created_at || "").replace("T", " ").slice(0, 16), p.name + " (" + p.kind + ")", m.message, m.location, (p.seen_at || "").replace("T", " ").slice(0, 16), cap(p.response) || "Still waiting", (p.responded_at || "").replace("T", " ").slice(0, 16)]);
  for (const x of em.received) emRows.push(["Sent to this person", (x.sent_at || "").replace("T", " ").slice(0, 16), x.from, x.message, x.location, (x.seen_at || "").replace("T", " ").slice(0, 16), cap(x.response) || "Still waiting", (x.responded_at || "").replace("T", " ").slice(0, 16)]);
  sheets.push({ name: "Medical emergency", rows: [["Direction", "Sent", "Person told / sent by", "Message", "Where", "Received (first on screen)", "Chose", "Chose at"], ...emRows] });
  sheets.push({ name: "HR records", rows: [["Date", "Type", "Title", "Details", "Recorded by", "Voided", "Reason voided"],
    ...f.hr_records.map((x) => [x.date, RECORD_LABELS[x.kind] || x.kind, x.title, x.details, x.recorded_by, x.voided ? "Yes" : "", x.void_reason])] });
  return sheets;
}
