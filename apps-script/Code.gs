/**
 * ADA Solution Finder – lead and event logging.
 * Google Apps Script web app bound to the project Google Sheet (Extensions > Apps Script).
 * The page POSTs one JSON object per event; this script appends it to "Events",
 * upserts the visitor's row in "Responses" and e-mails BD for consultant requests.
 * Setup and redeploy steps: apps-script/README.md
 */

/* BD shared inbox for consultant-request alerts. Empty = no e-mail is sent. */
const BD_EMAIL = "";

/* Column order of the Events and Responses tabs (Tech Implementation, section D,
   plus category_other, duration, one_off_m and consent_time). */
const COLUMNS = [
  "server_time", "session_id", "event", "lang", "client_time",
  "category", "category_other", "channels", "current_gmv", "target_gmv", "skus",
  "services", "livestream", "videos", "media_budget", "duration", "budget", "start",
  "top_package", "top_score", "all_scores", "price_from_m", "price_to_m", "one_off_m",
  "within_budget", "qualified", "consultant", "email", "consent", "consent_time"
];
const EVENTS = ["page_view", "start", "brand_done", "needs_done", "results_shown", "finish", "lead"];
const MAX_LEN = 500;
const RATE_LIMIT = 40;          // requests per session ...
const RATE_WINDOW_S = 600;      // ... per 10 minutes
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function doPost(e) {
  try {
    const d = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    if (d.website) return reply_(true);                       // honeypot filled: bot, drop silently
    if (EVENTS.indexOf(d.event) < 0) return reply_(false, "unknown event");
    const sid = String(d.session_id || "");
    if (!/^[\w-]{8,64}$/.test(sid)) return reply_(false, "bad session id");
    if (d.event === "lead") {
      if (!EMAIL_RE.test(String(d.email || "")) || String(d.email).length > 254) return reply_(false, "bad email");
      if (d.consent !== "yes") return reply_(false, "no consent");
    } else {
      delete d.email;                                          // e-mail is kept only for consented consultant requests
    }

    const cache = CacheService.getScriptCache();
    const key = "rl_" + sid, n = Number(cache.get(key) || 0);
    if (n >= RATE_LIMIT) return reply_(false, "rate limited");
    cache.put(key, String(n + 1), RATE_WINDOW_S);

    const row = COLUMNS.map(function (c) { return c === "server_time" ? new Date() : clean_(d[c]); });
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      tab_(ss, "Events").appendRow(row);
      upsert_(tab_(ss, "Responses"), sid, row);
    } finally {
      lock.releaseLock();
    }
    if (d.event === "lead") alertBd_(d);
    return reply_(true);
  } catch (err) {
    console.error(err);
    return reply_(false, "server error");
  }
}

/* Opening the /exec URL in a browser is a quick health check. */
function doGet() {
  return reply_(true, "Solution Finder logging is running");
}

/* One row per session in Responses: later events overwrite earlier answers,
   but an empty value never wipes one that was already recorded. */
function upsert_(sh, sid, row) {
  const last = sh.getLastRow();
  const hit = last > 1 && sh.getRange(2, 2, last - 1, 1).createTextFinder(sid).matchEntireCell(true).findNext();
  if (!hit) { sh.appendRow(row); return; }
  const range = sh.getRange(hit.getRow(), 1, 1, COLUMNS.length);
  const old = range.getValues()[0];
  range.setValues([row.map(function (v, i) { return v === "" ? old[i] : v; })]);
}

function tab_(ss, name) {
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, COLUMNS.length).setValues([COLUMNS]).setFontWeight("bold");
    sh.setFrozenRows(1);
  }
  return sh;
}

/* Trim, cap length, and stop text being read as a formula (=, +, -, @). */
function clean_(v) {
  if (v === undefined || v === null) return "";
  if (typeof v === "number") return isFinite(v) ? v : "";
  const s = String(v).slice(0, MAX_LEN).trim();
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function alertBd_(d) {
  if (!BD_EMAIL) return;
  const price = d.price_to_m ? "VND " + d.price_from_m + "M – " + d.price_to_m + "M / month" : "price on scoping";
  const lines = [
    "New consultant request from ADA Solution Finder.", "",
    "E-mail: " + d.email,
    "Recommended: " + (d.top_package || "custom scope") + " (" + (d.top_score || "–") + "% match)",
    "Estimated fee: " + price + (d.one_off_m ? " + VND " + d.one_off_m + "M one-off set-up" : ""),
    "Within budget: " + (d.within_budget || "–") + " · Qualified: " + (d.qualified || "–"), "",
    "Category: " + d.category + (d.category_other ? " – " + d.category_other : ""),
    "Channels: " + d.channels,
    "Current / target monthly sales: " + d.current_gmv + " → " + d.target_gmv,
    "SKUs: " + d.skus,
    "Services: " + d.services,
    "Livestream: " + (d.livestream || "–") + " · Videos: " + (d.videos || "–") + " · Media spend: " + (d.media_budget || "–"),
    "Duration: " + d.duration + " · Budget: " + d.budget + " · Start: " + d.start, "",
    "Consent given at " + (d.consent_time || d.client_time) + ". Session " + d.session_id + "."
  ];
  MailApp.sendEmail({
    to: BD_EMAIL,
    replyTo: d.email,
    subject: "[Solution Finder] " + (d.top_package || "Custom scope") + " · " + price,
    body: lines.join("\n")
  });
}

function reply_(ok, msg) {
  return ContentService.createTextOutput(JSON.stringify({ ok: ok, message: msg || "" }))
    .setMimeType(ContentService.MimeType.JSON);
}

/* Run once from the editor: builds the KPI tab (section D / E) from Events and Responses. */
function setupKpiSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  tab_(ss, "Events"); tab_(ss, "Responses");
  const sh = ss.getSheetByName("KPI") || ss.insertSheet("KPI");
  sh.clear();
  const col = function (name) {           // column letter in Responses for a field
    let n = COLUMNS.indexOf(name) + 1, s = "";
    while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
    return s;
  };
  const ev = function (name) { return 'COUNTIF(Events!C:C,"' + name + '")'; };
  const r = function (name) { return "Responses!" + col(name) + ":" + col(name); };
  const rows = [
    ["Metric", "Value"],
    ["Visits", "=" + ev("page_view")],
    ["Starts", "=" + ev("start")],
    ["Completed (results shown)", "=" + ev("results_shown")],
    ["Completion rate", "=IFERROR(B4/B3,0)"],
    ["Consultant requests", "=" + ev("lead")],
    ["Qualified leads", '=COUNTIFS(' + r("consultant") + ',"yes",' + r("qualified") + ',"yes")'],
    ["Qualified rate", "=IFERROR(B7/B6,0)"],
    ["Average match %", "=IFERROR(AVERAGE(" + r("top_score") + "),0)"]
  ];
  sh.getRange(1, 1, rows.length, 2).setValues(rows);
  sh.getRange("B5").setNumberFormat("0%");
  sh.getRange("B8").setNumberFormat("0%");
  sh.getRange("B9").setNumberFormat("0.0");
  sh.getRange("D1").setValue("Recommended solution mix");
  sh.getRange("D2").setFormula(
    '=IFERROR(QUERY(Responses!A:' + col("consent_time") + ',"select ' + col("top_package") +
    ', count(' + col("session_id") + ') where ' + col("top_package") + ' <> \'\' group by ' + col("top_package") +
    ' order by count(' + col("session_id") + ') desc label count(' + col("session_id") + ') \'sessions\'",1),"No data yet")');
  sh.getRange("A1:B1").setFontWeight("bold");
  sh.getRange("D1").setFontWeight("bold");
  sh.setColumnWidth(1, 220);
}
