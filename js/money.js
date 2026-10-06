// Naira formatting, amounts in words, and CSV export.

const NAIRA = "₦";

export function naira(n, decimals = 2) {
  const v = Number(n) || 0;
  const s = Math.abs(v).toLocaleString("en-GB", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return (v < 0 ? "-" : "") + NAIRA + s;
}

const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen",
  "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
const SCALES = [[1e12, "Trillion"], [1e9, "Billion"], [1e6, "Million"], [1e3, "Thousand"]];

function below1000(n) {
  const parts = [];
  if (n >= 100) { parts.push(ONES[Math.floor(n / 100)] + " Hundred"); n %= 100; if (n) parts.push("and"); }
  if (n >= 20) { parts.push(TENS[Math.floor(n / 10)] + (n % 10 ? "-" + ONES[n % 10] : "")); }
  else if (n > 0) parts.push(ONES[n]);
  return parts.join(" ");
}

function wholeInWords(n) {
  if (n === 0) return "Zero";
  const parts = [];
  for (const [size, name] of SCALES) {
    if (n >= size) { parts.push(below1000(Math.floor(n / size)) + " " + name); n %= size; }
  }
  if (n > 0) {
    // "and" joins the final group when there is a larger part before it (e.g. "One Thousand and Fifty")
    parts.push((parts.length && n < 100 ? "and " : "") + below1000(n));
  }
  return parts.join(" ");
}

// 270000.5 -> "Two Hundred and Seventy Thousand Naira, Fifty Kobo Only"
export function nairaInWords(amount) {
  const v = Math.round((Number(amount) || 0) * 100) / 100;
  const neg = v < 0;
  const abs = Math.abs(v);
  const whole = Math.floor(abs + 1e-9);
  const kobo = Math.round((abs - whole) * 100);
  let out = wholeInWords(whole) + " Naira";
  if (kobo) out += ", " + wholeInWords(kobo) + " Kobo";
  return (neg ? "Minus " : "") + out + " Only";
}

// Spreadsheet programs run text that starts with = + - or @ as a formula, so defuse it.
function csvCell(v) {
  let s = String(v === undefined || v === null ? "" : v);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export function downloadCsv(filename, header, rows) {
  const text = [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
  const blob = new Blob(["﻿" + text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
