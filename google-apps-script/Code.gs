/**
 * BMReddy Travels – bookings database (Google Sheet)
 *
 * This script turns a Google Sheet into the bookings database:
 *  - The website saves every booking as a new row in the "Bookings" tab.
 *  - The admin page (admin.html) asks for the bookings of one day.
 *
 * Setup steps are in google-apps-script/SETUP.md
 */

// CHANGE THIS to your own secret password. You type it on admin.html.
// Anyone with this password can see customer details, so keep it private.
const ADMIN_KEY = "change-this-password";

const SHEET_NAME = "Bookings";
const HEADERS = [
  "Booking ID", "Booked at", "Car", "Name", "Mobile", "Email",
  "Pickup date", "Days", "Return date", "Driver", "Pickup / Destination",
  "Notes", "Estimated total",
];

function doPost(e) {
  let req;
  try {
    req = JSON.parse(e.postData.contents);
  } catch (err) {
    return reply({ ok: false, error: "Bad request" });
  }

  if (req.action === "add") return reply(addBooking(req.booking || {}));

  // Everything below is owner-only
  if (req.action === "list" || req.action === "history") {
    const denied = checkOwner(req.key);
    if (denied) return reply(denied);
    if (req.action === "list") return reply(listForDay(req.date));
    return reply({ ok: true, bookings: readAll().sort((a, b) => b.bookedAt.localeCompare(a.bookedAt)) });
  }
  return reply({ ok: false, error: "Unknown action" });
}

/* ---------- Owner check ---------- */
// Wrong guesses are slowed down, and after 10 wrong guesses in 15 minutes
// all logins are blocked for 15 minutes, so the password can't be guessed.
function checkOwner(key) {
  const cache = CacheService.getScriptCache();
  const fails = Number(cache.get("failed-logins") || 0);
  if (fails >= 10) return { ok: false, error: "Too many wrong passwords. Try again in 15 minutes." };

  const ok = ADMIN_KEY && ADMIN_KEY !== "change-this-password" &&
    typeof key === "string" && key.length === ADMIN_KEY.length && key === ADMIN_KEY;
  if (ok) return null;

  cache.put("failed-logins", String(fails + 1), 15 * 60);
  Utilities.sleep(1500);
  return { ok: false, error: "Wrong password" };
}

// Opening the web app link in a browser just shows that it's running.
function doGet() {
  return reply({ ok: true, message: "BMReddy Travels bookings database is running." });
}

/* ---------- Save a booking ---------- */
function addBooking(b) {
  const clean = (v, max) => String(v == null ? "" : v).trim().slice(0, max || 300);

  const date = clean(b.date, 10);
  const days = parseInt(b.days, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !(days >= 1 && days <= 60) || !clean(b.name)) {
    return { ok: false, error: "Missing booking details" };
  }
  if (clean(b._honey)) return { ok: true }; // spam bot, ignore quietly

  const id = "BMR-" + Utilities.formatDate(new Date(), tz(), "yyMMdd") + "-" +
    Math.random().toString(36).slice(2, 6).toUpperCase();

  const row = [
    id,
    Utilities.formatDate(new Date(), tz(), "yyyy-MM-dd HH:mm"),
    clean(b.car, 60),
    clean(b.name, 100),
    clean(b.mobile, 15),
    clean(b.email, 120),
    date,
    String(days),
    addDays(date, days),
    clean(b.driver, 30),
    clean(b.location, 300),
    clean(b.notes, 1000),
    clean(b.total, 30),
  ];

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = getSheet();
    const r = sheet.getLastRow() + 1;
    const range = sheet.getRange(r, 1, 1, row.length);
    range.setNumberFormat("@"); // keep dates and phone numbers as plain text
    range.setValues([row]);
  } finally {
    lock.releaseLock();
  }
  return { ok: true, id: id };
}

/* ---------- Bookings for one day ---------- */
// Returns every booking where the car is out on that day
// (pickup date <= day < return date), newest pickups first.
function listForDay(day) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(day))) return { ok: false, error: "Bad date" };

  const bookings = readAll()
    .filter((b) => b.date && b.date <= day && day < (b.returnDate || addDays(b.date, b.days)))
    .sort((a, b) => (a.date === b.date ? a.bookedAt.localeCompare(b.bookedAt) : b.date.localeCompare(a.date)));

  return { ok: true, date: day, bookings: bookings };
}

/* ---------- Read every booking ---------- */
function readAll() {
  const sheet = getSheet();
  const n = sheet.getLastRow() - 1;
  if (n < 1) return [];

  return sheet.getRange(2, 1, n, HEADERS.length).getValues()
    .filter((r) => r[0] !== "")
    .map((r) => ({
      id: text(r[0]),
      bookedAt: text(r[1], "yyyy-MM-dd HH:mm"),
      car: text(r[2]),
      name: text(r[3]),
      mobile: text(r[4]),
      email: text(r[5]),
      date: text(r[6]),
      days: Number(r[7]) || 1,
      returnDate: text(r[8]),
      driver: text(r[9]),
      location: text(r[10]),
      notes: text(r[11]),
      total: text(r[12]),
    }));
}

/* ---------- Helpers ---------- */
function getSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(HEADERS);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight("bold");
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function tz() {
  return Session.getScriptTimeZone() || "Asia/Kolkata";
}

// Cell value → text. Handles cells that Sheets turned into real dates.
function text(v, fmt) {
  if (v instanceof Date) return Utilities.formatDate(v, tz(), fmt || "yyyy-MM-dd");
  return String(v == null ? "" : v).trim();
}

// "2026-10-28" + 3 → "2026-10-31"
function addDays(iso, n) {
  const p = iso.split("-").map(Number);
  const d = new Date(Date.UTC(p[0], p[1] - 1, p[2] + Number(n)));
  return d.toISOString().slice(0, 10);
}

function reply(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
