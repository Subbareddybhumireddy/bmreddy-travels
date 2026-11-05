/* =========================================================
   Shared helpers for the admin pages.
   Settings come from ../config.js
   ========================================================= */
(function () {
  "use strict";
  const C = window.BMR_CONFIG || {};

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  // Customer details come from the public form, so always escape them.
  const esc = (s) =>
    String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  /* ---------- Dates (always India time) ---------- */
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const istFormat = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    year: "numeric", month: "numeric", day: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
  });
  function istParts(ts) {
    const p = {};
    istFormat.formatToParts(new Date(ts)).forEach((x) => (p[x.type] = x.value));
    return p;
  }
  // "29 Oct 2026, 9:45 PM"
  function fmtDateTime(ts) {
    const p = istParts(ts);
    return `${Number(p.day)} ${MONTHS[p.month - 1]} ${p.year}, ${p.hour}:${p.minute} ${String(p.dayPeriod).toUpperCase()}`;
  }
  // timestamp → "2026-10-29" (India date)
  function dateIST(ts) {
    const p = istParts(ts);
    return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
  }
  const todayIST = () => dateIST(Date.now());
  // "2026-10-29" → "29 Oct 2026"
  function fmtDate(iso) {
    const [y, m, d] = String(iso).split("-").map(Number);
    return y ? `${d} ${MONTHS[m - 1]} ${y}` : String(iso || "");
  }

  const rupees = (n) => "₹" + Number(n).toLocaleString("en-IN");
  const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

  /* ---------- Messages ---------- */
  function showMsg(el, msg, ok) {
    el.className = ok ? "notice" : "submit-error";
    el.innerHTML = `<svg class="icon" aria-hidden="true"><use href="#${ok ? "i-check" : "i-alert"}"/></svg><span>${esc(msg)}</span>`;
    el.hidden = false;
  }

  /* ---------- Supabase ---------- */
  const configured =
    /^https:\/\/\S+$/.test(C.supabaseUrl || "") &&
    !/YOUR-PROJECT/.test(C.supabaseUrl) &&
    (C.supabaseAnonKey || "").length > 20 &&
    !/PASTE/.test(C.supabaseAnonKey);

  const sb =
    configured && window.supabase
      ? window.supabase.createClient(C.supabaseUrl.replace(/\/+$/, "").replace(/\/rest\/v1$/, ""), C.supabaseAnonKey, {
          auth: {
            // "implicit" lets the password-reset link work even if it's opened
            // on a different phone or browser than the one that asked for it.
            flowType: "implicit",
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true,
          },
        })
      : null;

  async function checkAdmin() {
    const { data, error } = await sb.rpc("is_admin");
    return !error && data === true;
  }

  window.BMR = { C, sb, $, $$, esc, fmtDateTime, fmtDate, dateIST, todayIST, rupees, plural, showMsg, checkAdmin };
})();
