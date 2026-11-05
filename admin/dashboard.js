/* =========================================================
   Admin dashboard: bookings, status, notes, filters, CSV, activity.
   Only the admin can see data: the database itself (row level security)
   refuses everyone else, even if they open this page.
   ========================================================= */
(async function () {
  "use strict";
  const { C, sb, $, $$, esc, fmtDateTime, fmtDate, dateIST, todayIST, rupees, plural, showMsg, checkAdmin } = window.BMR;

  const goLogin = (reason) => location.replace("login.html" + (reason ? "?e=" + reason : ""));

  /* ---------- Login check ---------- */
  if (!sb) return goLogin();
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return goLogin();
  if (!(await checkAdmin())) {
    await sb.auth.signOut();
    return goLogin("notadmin");
  }
  document.body.classList.remove("is-checking");
  sb.auth.onAuthStateChange((event, s) => {
    if (event === "SIGNED_OUT" || !s) goLogin();
  });

  $("#logout").addEventListener("click", async () => {
    $("#logout").disabled = true;
    try {
      await sb.auth.signOut();
    } finally {
      goLogin();
    }
  });

  /* ---------- State ---------- */
  const STATUSES = ["New", "Confirmed", "Completed", "Cancelled"];
  const PAGE = 40;
  let bookings = [];            // newest first
  let shown = PAGE;
  let openId = null;            // booking shown in the details sheet
  const fresh = new Set();      // arrived live while the page was open
  const filters = { q: "", status: "", car: "", dateBy: "pickup", from: "", to: "" };

  const byId = (id) => bookings.find((b) => b.id === Number(id));
  const telLink = (b) => `tel:+91${b.mobile_number}`;
  const prettyMobile = (m) => `+91 ${m.slice(0, 5)} ${m.slice(5)}`;
  function waLink(b) {
    const text = `Hi ${b.customer_name}, this is ${C.ownerName} from BMReddy Travels about your ${b.car} booking on ${fmtDate(b.pickup_date)}.`;
    return `https://wa.me/91${b.mobile_number}?text=${encodeURIComponent(text)}`;
  }
  const totalText = (b) => (b.estimated_total ? rupees(b.estimated_total) : "To be confirmed");

  /* ---------- Messages to the customer ---------- */
  const TEMPLATES = ["Confirmed", "Cancelled", "Completed", "Custom"];
  const sign = () => `– ${C.ownerName}, BMReddy Travels`;
  const contact = () => `call or WhatsApp ${prettyMobile(C.phone)}`;

  function messageFor(b, template) {
    const hi = `Hi ${b.customer_name},`;
    if (template === "Confirmed") {
      const lines = [
        `Booking #${b.id}`,
        `Car: ${b.car}`,
        `Pickup date: ${fmtDate(b.pickup_date)}`,
        `Days: ${plural(b.number_of_days, "day")}`,
        `Driver: ${b.driver_option}`,
        b.pickup_location && `Pickup / destination: ${b.pickup_location}`,
        b.estimated_total && `Estimated total: ${rupees(b.estimated_total)}`,
      ].filter(Boolean);
      return `${hi}\n\nYour booking with BMReddy Travels is CONFIRMED ✅\n\n${lines.join("\n")}\n\nWe'll contact you before pickup. For any questions, ${contact()}.\n\n${sign()}`;
    }
    if (template === "Cancelled") {
      return `${hi}\n\nSorry, we can't take your booking #${b.id} for the ${b.car} on ${fmtDate(b.pickup_date)}. It has been cancelled.\n\nPlease ${contact()} and we'll try to find you another car or date.\n\n${sign()}`;
    }
    if (template === "Completed") {
      return `${hi}\n\nThank you for travelling with BMReddy Travels! We hope you enjoyed your trip in the ${b.car}.\n\nWe'd be happy to have you again. To book, ${contact()}.\n\n${sign()}`;
    }
    return `${hi}\n\nAbout your BMReddy Travels booking #${b.id} (${b.car}, ${fmtDate(b.pickup_date)}):\n\n\n\n${sign()}`;
  }

  function subjectFor(b, template) {
    if (template === "Confirmed") return `Booking confirmed – #${b.id} (${b.car}, ${fmtDate(b.pickup_date)})`;
    if (template === "Cancelled") return `Booking cancelled – #${b.id}`;
    if (template === "Completed") return `Thank you for travelling with BMReddy Travels`;
    return `About your booking #${b.id}`;
  }

  const defaultTemplate = (b) => (TEMPLATES.includes(b.status) ? b.status : "Custom");
  const waMessageLink = (b, text) => `https://wa.me/91${b.mobile_number}?text=${encodeURIComponent(text)}`;

  /* ---------- Toast ---------- */
  let toastTimer;
  function toast(text, isError) {
    const el = $("#toast");
    el.textContent = text;
    el.classList.toggle("is-error", !!isError);
    el.hidden = false;
    requestAnimationFrame(() => el.classList.add("show"));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.classList.remove("show");
      setTimeout(() => (el.hidden = true), 250);
    }, isError ? 5000 : 2500);
  }

  // Session ran out or access was removed → back to login
  function isAuthError(error) {
    return error && (error.status === 401 || /jwt|token/i.test(error.message || ""));
  }

  /* ---------- Load ---------- */
  async function loadBookings() {
    const all = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await sb
        .from("bookings")
        .select("*")
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, from + 999);
      if (error) throw error;
      all.push(...data);
      if (data.length < 1000) break;
    }
    bookings = all;
  }

  async function refresh() {
    try {
      await loadBookings();
      $("#list-error").hidden = true;
      fillCarFilter();
      renderAll();
    } catch (err) {
      if (isAuthError(err)) return goLogin("expired");
      showMsg($("#list-error"), "Couldn't load bookings. Check your internet and refresh the page.");
      $("#list").innerHTML = "";
    }
  }

  /* ---------- Summary cards ---------- */
  function renderStats() {
    const today = todayIST();
    $("#st-total").textContent = bookings.length;
    $("#st-today").textContent = bookings.filter((b) => dateIST(b.created_at) === today).length;
    $("#st-confirmed").textContent = bookings.filter((b) => b.status === "Confirmed").length;
    $("#st-cancelled").textContent = bookings.filter((b) => b.status === "Cancelled").length;
  }

  $$("[data-stat]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const s = btn.dataset.stat;
      Object.assign(filters, { q: "", status: "", car: "", dateBy: "pickup", from: "", to: "" });
      if (s === "today") Object.assign(filters, { dateBy: "received", from: todayIST(), to: todayIST() });
      else if (s !== "all") filters.status = s;
      syncFilterInputs();
      if (s !== "all") $("#filters").open = true;
      openTab("bookings");
      shown = PAGE;
      renderList();
      $(".list-head").scrollIntoView({ behavior: "smooth", block: "start" });
    })
  );

  /* ---------- Filters ---------- */
  function fillCarFilter() {
    const names = [...new Set([...(C.cars || []).map((c) => c.shortName), ...bookings.map((b) => b.car)])];
    const sel = $("#f-car");
    const current = sel.value;
    sel.innerHTML = `<option value="">All cars</option>` + names.map((n) => `<option>${esc(n)}</option>`).join("");
    sel.value = names.includes(current) ? current : "";
  }

  function syncFilterInputs() {
    $("#q").value = filters.q;
    $("#f-status").value = filters.status;
    $("#f-car").value = filters.car;
    $("#f-dateby").value = filters.dateBy;
    $("#f-from").value = filters.from;
    $("#f-to").value = filters.to;
    $("#f-to").min = filters.from || "";
    const n = ["status", "car", "from", "to"].filter((k) => filters[k]).length;
    $("#filter-count").textContent = n;
    $("#filter-count").hidden = !n;
  }

  function readFilterInputs() {
    filters.q = $("#q").value;
    filters.status = $("#f-status").value;
    filters.car = $("#f-car").value;
    filters.dateBy = $("#f-dateby").value;
    filters.from = $("#f-from").value;
    filters.to = $("#f-to").value;
    syncFilterInputs();
    shown = PAGE;
    renderList();
  }
  ["#q", "#f-status", "#f-car", "#f-dateby", "#f-from", "#f-to"].forEach((s) => {
    $(s).addEventListener("input", readFilterInputs);
    $(s).addEventListener("change", readFilterInputs);
  });
  $("#clear-filters").addEventListener("click", () => {
    Object.assign(filters, { q: "", status: "", car: "", dateBy: "pickup", from: "", to: "" });
    syncFilterInputs();
    shown = PAGE;
    renderList();
  });

  function matches(b) {
    const q = filters.q.trim().toLowerCase();
    if (q) {
      let digits = q.replace(/\D/g, "");
      if (digits.length > 10 && digits.startsWith("91")) digits = digits.slice(2);
      const nameHit = b.customer_name.toLowerCase().includes(q);
      const phoneHit = digits.length >= 3 && b.mobile_number.includes(digits);
      if (!nameHit && !phoneHit) return false;
    }
    if (filters.status && b.status !== filters.status) return false;
    if (filters.car && b.car !== filters.car) return false;
    const d = filters.dateBy === "received" ? dateIST(b.created_at) : b.pickup_date;
    if (filters.from && d < filters.from) return false;
    if (filters.to && d > filters.to) return false;
    return true;
  }
  const anyFilter = () => !!(filters.q.trim() || filters.status || filters.car || filters.from || filters.to);

  /* ---------- Booking cards ---------- */
  // A completed trip is final: show a locked label instead of the dropdown
  function statusSelect(b, extraClass) {
    if (b.status === "Completed") {
      return `
      <span class="status-wrap s-Completed is-locked ${extraClass || ""}" title="Trip completed – status can't be changed">
        <svg class="icon" aria-hidden="true"><use href="#i-check"/></svg>Completed
      </span>`;
    }
    return `
      <label class="status-wrap s-${b.status} ${extraClass || ""}">
        <span class="sr-only">Status for ${esc(b.customer_name)}</span>
        <select data-status="${b.id}">${statusOptions(b)}</select>
      </label>`;
  }

  // Once a booking has moved past "New", it can't go back to "New"
  const allowedStatuses = (b) => (b.status === "New" ? STATUSES : STATUSES.filter((s) => s !== "New"));
  const statusOptions = (b) =>
    allowedStatuses(b).map((s) => `<option${s === b.status ? " selected" : ""}>${s}</option>`).join("");

  function card(b) {
    return `
      <article class="bk st-${b.status}${fresh.has(b.id) ? " is-fresh" : ""}" data-id="${b.id}">
        <button type="button" class="bk-main" data-open="${b.id}">
          <span class="bk-top">
            <span class="bk-name">${esc(b.customer_name)}</span>
            <span class="badge-new"${b.status === "New" ? "" : " hidden"}>New</span>
          </span>
          <span class="bk-phone">${esc(prettyMobile(b.mobile_number))}</span>
          <span class="bk-chips">
            <span class="chip"><svg class="icon" aria-hidden="true"><use href="#i-car"/></svg>${esc(b.car)}</span>
            <span class="chip"><svg class="icon" aria-hidden="true"><use href="#i-calendar"/></svg>${esc(fmtDate(b.pickup_date))}</span>
            <span class="chip">${plural(b.number_of_days, "day")}</span>
            <span class="chip"><svg class="icon" aria-hidden="true"><use href="#i-user"/></svg>${esc(b.driver_option)}</span>
          </span>
          <span class="bk-time"><svg class="icon" aria-hidden="true"><use href="#i-clock"/></svg>Received ${esc(fmtDateTime(b.created_at))}</span>
        </button>
        <div class="bk-actions">
          <a class="btn btn-navy" href="${esc(telLink(b))}"><svg class="icon" aria-hidden="true"><use href="#i-phone"/></svg>Call</a>
          <a class="btn btn-green" href="${esc(waLink(b))}" target="_blank" rel="noopener"><svg class="icon" aria-hidden="true"><use href="#i-whatsapp"/></svg>WhatsApp</a>
          ${statusSelect(b)}
        </div>
      </article>`;
  }

  // Update one card in place (keeps focus on its dropdown)
  function syncCard(b) {
    const el = $(`.bk[data-id="${b.id}"]`);
    if (!el) return;
    el.className = el.className.replace(/\bst-\w+/, "st-" + b.status);
    $(".badge-new", el).hidden = b.status !== "New";
    syncStatusWrap($(".status-wrap", el), b, "");
  }

  // Update a status dropdown in place, or swap it for the locked label
  function syncStatusWrap(wrap, b, extraClass) {
    if (!wrap) return;
    const sel = $("select", wrap);
    if (b.status === "Completed" || !sel) {
      wrap.outerHTML = statusSelect(b, extraClass);
      return;
    }
    wrap.className = wrap.className.replace(/\bs-\w+/, "s-" + b.status);
    sel.innerHTML = statusOptions(b);
    sel.value = b.status;
  }

  function renderList() {
    const rows = bookings.filter(matches);
    const filtered = anyFilter();
    $("#count").textContent = filtered
      ? `${plural(rows.length, "booking")} found`
      : plural(bookings.length, "booking");
    $("#export-label").textContent = filtered ? `Export ${rows.length} (CSV)` : "Export all (CSV)";
    $("#export").disabled = !rows.length;

    $("#list").innerHTML = rows.length
      ? rows.slice(0, shown).map(card).join("")
      : `<p class="empty">${bookings.length ? "No bookings match your search or filters." : "No bookings yet. New bookings from the website will appear here."}</p>`;
    $("#more").hidden = rows.length <= shown;
  }

  function renderAll() {
    renderStats();
    renderList();
    renderHistory();
  }

  $("#more").addEventListener("click", () => {
    shown += PAGE;
    renderList();
  });

  $("#list").addEventListener("click", (e) => {
    const open = e.target.closest("[data-open]");
    if (open) openDetail(Number(open.dataset.open));
  });
  document.addEventListener("change", (e) => {
    const sel = e.target.closest("select[data-status]");
    if (sel) setStatus(Number(sel.dataset.status), sel.value);
  });

  /* ---------- Change status (saves instantly) ---------- */
  async function setStatus(id, status) {
    const b = byId(id);
    if (!b || b.status === status || !STATUSES.includes(status)) return;
    if (b.status === "Completed") return; // completed trips can't be changed
    if (status === "New") return; // can't move a booking back to "New"
    const prev = b.status;
    b.status = status;
    syncCard(b);
    syncDetail(b);
    renderStats();

    const { data, error } = await sb.from("bookings").update({ status }).eq("id", id).select().single();
    if (error || !data) {
      b.status = prev;
      syncCard(b);
      syncDetail(b);
      renderStats();
      if (isAuthError(error)) return goLogin("expired");
      toast("Couldn't save the status. Please try again.", true);
      return;
    }
    Object.assign(b, data);
    renderHistory();
    toast(`${b.customer_name}: ${status}`);
    if (openId === id) loadBookingEvents(id);
    if (!$("#panel-activity").hidden) loadActivity();

    // Offer to tell the customer, with the right message ready to send
    if (status !== "New") {
      if (dlg.open && openId === id) prepareMessage(b, status);
      else openDetail(id, { notify: true });
    }
  }

  /* ---------- Details sheet ---------- */
  const dlg = $("#detail");

  function row(label, value, html) {
    return `<div><dt>${label}</dt><dd>${html ? value : esc(value)}</dd></div>`;
  }

  function messageBox(b) {
    const tpl = defaultTemplate(b);
    const emailOpt = b.email
      ? `<label class="check"><input type="checkbox" id="msg-email" checked /> Email <span class="muted">${esc(b.email)}</span></label>`
      : `<p class="muted msg-noemail">No email given, so WhatsApp only.</p>`;
    return `
      <div class="dt-notes dt-msg" id="msg-box">
        <h3 class="dt-sub">Message the customer</h3>
        <div class="field">
          <label for="msg-template">Message type</label>
          <select id="msg-template">
            ${TEMPLATES.map((t) => `<option value="${t}"${t === tpl ? " selected" : ""}>${t === "Custom" ? "Other / custom" : t}</option>`).join("")}
          </select>
        </div>
        <div class="field">
          <label for="msg-text">Message <span class="optional">(you can edit it)</span></label>
          <textarea id="msg-text" rows="10" maxlength="2000">${esc(messageFor(b, tpl))}</textarea>
        </div>
        <div class="msg-to">
          <label class="check"><input type="checkbox" id="msg-wa" checked /> WhatsApp <span class="muted">${esc(prettyMobile(b.mobile_number))}</span></label>
          ${emailOpt}
        </div>
        <div class="notes-bar">
          <span id="msg-state" aria-live="polite"></span>
          <button type="button" class="btn btn-green" id="send-msg">
            <svg class="icon" aria-hidden="true"><use href="#i-whatsapp"/></svg>Send to customer
          </button>
        </div>
      </div>`;
  }

  // Fill the message box for a status and bring it into view
  function prepareMessage(b, template) {
    const sel = $("#msg-template");
    if (!sel) return;
    sel.value = TEMPLATES.includes(template) ? template : "Custom";
    $("#msg-text").value = messageFor(b, sel.value);
    $("#msg-state").textContent = `Let ${b.customer_name} know?`;
    $("#msg-box").scrollIntoView({ behavior: "smooth", block: "start" });
    $("#send-msg").focus({ preventScroll: true });
  }

  function openDetail(id, opts) {
    const b = byId(id);
    if (!b) return;
    openId = id;
    fresh.delete(id);
    $("#detail-body").innerHTML = `
      <header class="dt-head">
        <div>
          <p class="dt-ref">Booking #${b.id}</p>
          <h2 id="dt-name">${esc(b.customer_name)}</h2>
          <p class="dt-time">Received ${esc(fmtDateTime(b.created_at))}</p>
        </div>
        <button type="button" class="dt-close" data-close aria-label="Close"><svg class="icon" aria-hidden="true"><use href="#i-x"/></svg></button>
      </header>
      <div class="dt-body">
        <div class="dt-actions">
          <a class="btn btn-navy" href="${esc(telLink(b))}"><svg class="icon" aria-hidden="true"><use href="#i-phone"/></svg>Call</a>
          <a class="btn btn-green" href="${esc(waLink(b))}" target="_blank" rel="noopener"><svg class="icon" aria-hidden="true"><use href="#i-whatsapp"/></svg>WhatsApp</a>
          ${statusSelect(b, "dt-status")}
        </div>

        <dl class="dt-list">
          ${row("Mobile", esc(prettyMobile(b.mobile_number)), true)}
          ${row("Email", b.email ? `<a href="mailto:${esc(b.email)}">${esc(b.email)}</a>` : "–", true)}
          ${row("Car", b.car)}
          ${row("Pickup date", fmtDate(b.pickup_date))}
          ${row("Days", plural(b.number_of_days, "day"))}
          ${row("Driver", b.driver_option)}
          ${row("Pickup / destination", b.pickup_location || "–")}
          ${row("Customer notes", b.notes || "–")}
          ${row("Estimated total", totalText(b))}
          ${row("Last updated", fmtDateTime(b.updated_at))}
        </dl>

        ${messageBox(b)}

        <div class="field dt-notes">
          <label for="admin-notes">Admin notes <span class="optional">(only you can see these)</span></label>
          <textarea id="admin-notes" rows="4" maxlength="4000" placeholder="e.g. Advance paid ₹1000. Licence checked.">${esc(b.admin_notes || "")}</textarea>
          <div class="notes-bar">
            <span id="notes-state" aria-live="polite"></span>
            <button type="button" class="btn btn-red btn-sm" id="save-notes">Save notes</button>
          </div>
        </div>

        <h3 class="dt-sub">Activity</h3>
        <ol class="timeline" id="dt-events"><li class="muted">Loading…</li></ol>
      </div>`;

    // Remove the "just arrived" highlight
    const el = $(`.bk[data-id="${id}"]`);
    if (el) el.classList.remove("is-fresh");

    if (!dlg.open) dlg.showModal();
    $(".dt-close", dlg).focus();
    loadBookingEvents(id);
    if (opts && opts.notify) prepareMessage(b, b.status);
  }

  // Keep the open sheet in step with changes (without touching unsaved notes)
  function syncDetail(b) {
    if (openId !== b.id || !dlg.open) return;
    syncStatusWrap($(".dt-status", dlg), b, "dt-status");
  }

  function closeDetail() {
    if (dlg.open) dlg.close();
  }
  dlg.addEventListener("close", () => {
    const id = openId;
    openId = null;
    const cardBtn = id && $(`.bk[data-id="${id}"] .bk-main`);
    if (cardBtn) cardBtn.focus({ preventScroll: true });
  });
  dlg.addEventListener("click", (e) => {
    if (e.target === dlg || e.target.closest("[data-close]")) closeDetail();
  });

  dlg.addEventListener("input", (e) => {
    if (e.target.id === "admin-notes") $("#notes-state").textContent = "Not saved yet";
  });
  dlg.addEventListener("click", async (e) => {
    if (!e.target.closest("#save-notes")) return;
    const id = openId;
    const b = byId(id);
    if (!b) return;
    const btn = $("#save-notes");
    const notes = $("#admin-notes").value.trim();
    btn.disabled = true;
    btn.textContent = "Saving…";
    const { data, error } = await sb
      .from("bookings")
      .update({ admin_notes: notes || null })
      .eq("id", id)
      .select()
      .single();
    btn.disabled = false;
    btn.textContent = "Save notes";
    if (error || !data) {
      if (isAuthError(error)) return goLogin("expired");
      $("#notes-state").textContent = "Couldn't save. Try again.";
      return;
    }
    Object.assign(b, data);
    $("#notes-state").textContent = "Saved ✓";
  });

  /* ---------- Send message to customer ---------- */
  dlg.addEventListener("change", (e) => {
    if (e.target.id !== "msg-template") return;
    const b = byId(openId);
    if (b) $("#msg-text").value = messageFor(b, e.target.value);
  });

  // Turn the server's error into plain words
  async function sendError(error) {
    try {
      const body = await error.context.json();
      if (body && body.error) return body.error;
    } catch (_) { /* not JSON */ }
    return "Couldn't reach the email service. Is the notify-customer function set up?";
  }

  dlg.addEventListener("click", async (e) => {
    if (!e.target.closest("#send-msg")) return;
    const id = openId;
    const b = byId(id);
    if (!b) return;
    const state = $("#msg-state");
    const btn = $("#send-msg");
    const text = $("#msg-text").value.trim();
    const wa = $("#msg-wa").checked;
    const email = !!($("#msg-email") && $("#msg-email").checked);
    if (text.length < 2) return (state.textContent = "Write a message first.");
    if (!wa && !email) return (state.textContent = "Tick WhatsApp or Email.");

    // Open WhatsApp straight away (browsers block it if we wait)
    if (wa) window.open(waMessageLink(b, text), "_blank", "noopener");

    btn.disabled = true;
    state.textContent = email ? "Sending email…" : "Saving…";
    const { data, error } = await sb.functions.invoke("notify-customer", {
      body: {
        booking_id: id,
        message: text,
        subject: subjectFor(b, $("#msg-template").value),
        send_email: email,
        whatsapp: wa,
      },
    });
    btn.disabled = false;

    const waNote = wa ? "WhatsApp opened – press Send there." : "";
    if (error || !data || !data.ok) {
      if (isAuthError(error)) return goLogin("expired");
      if (email) {
        const why = await sendError(error);
        state.textContent = `Email not sent: ${why} ${waNote}`.trim();
        toast(`Email not sent: ${why}`, true);
      } else {
        state.textContent = waNote; // WhatsApp still opened; only the log failed
      }
      return;
    }
    state.textContent = [data.emailed && "Email sent ✓", waNote].filter(Boolean).join(" ");
    toast(data.emailed ? `Email sent to ${b.customer_name}` : `WhatsApp opened for ${b.customer_name}`);
    if (openId === id) loadBookingEvents(id);
    if (!$("#panel-activity").hidden) loadActivity();
  });

  /* ---------- Activity log ---------- */
  function eventText(ev) {
    if (ev.event === "created") return "Booking received";
    if (ev.event === "customer_notified") return `Message sent to customer (${esc(ev.channel || "–")})`;
    return `Status changed: ${esc(ev.old_status || "–")} → ${esc(ev.new_status)}`;
  }
  const evClass = (ev) =>
    ev.event === "created" ? "ev-created" : ev.event === "customer_notified" ? "ev-notified" : "ev-" + ev.new_status;

  async function loadBookingEvents(id) {
    const { data, error } = await sb
      .from("booking_events")
      .select("*")
      .eq("booking_id", id)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true });
    if (openId !== id) return;
    const list = $("#dt-events");
    if (!list) return;
    if (error) {
      list.innerHTML = `<li class="muted">Couldn't load activity.</li>`;
      return;
    }
    list.innerHTML = data.length
      ? data.map((ev) => `
          <li class="${evClass(ev)}">
            <p class="ev-title">${eventText(ev)}</p>
            ${ev.message ? `<details class="ev-msg"><summary>Show message</summary><p>${esc(ev.message)}</p></details>` : ""}
            <p class="ev-time">${esc(fmtDateTime(ev.created_at))}</p>
          </li>`).join("")
      : `<li class="muted">No activity yet.</li>`;
  }

  let activityLoading = false;
  async function loadActivity() {
    if (activityLoading) return;
    activityLoading = true;
    const list = $("#activity");
    if (!list.children.length) list.innerHTML = `<li class="muted">Loading…</li>`;
    const { data, error } = await sb
      .from("booking_events")
      .select("*, bookings(customer_name, car)")
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(200);
    activityLoading = false;
    if (error) {
      if (isAuthError(error)) return goLogin("expired");
      list.innerHTML = "";
      showMsg($("#activity-error"), "Couldn't load the activity log. Please refresh.");
      return;
    }
    $("#activity-error").hidden = true;
    list.innerHTML = data.length
      ? data.map((ev) => {
          const who = ev.bookings ? `${esc(ev.bookings.customer_name)} · ${esc(ev.bookings.car)}` : "";
          return `
            <li class="${evClass(ev)}">
              <button type="button" class="ev-btn" data-open="${ev.booking_id}">
                <span class="ev-title">${eventText(ev)}</span>
                <span class="ev-who">#${ev.booking_id} ${who}</span>
                <span class="ev-time">${esc(fmtDateTime(ev.created_at))}</span>
              </button>
            </li>`;
        }).join("")
      : `<li class="muted">Nothing yet. New bookings and status changes will show here.</li>`;
  }
  $("#activity").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-open]");
    if (btn) openDetail(Number(btn.dataset.open));
  });

  /* ---------- History table (every booking, all details) ---------- */
  const H_PAGE = 100;
  let hShown = H_PAGE;

  function historyMatches(b) {
    const q = $("#hq").value.trim().toLowerCase();
    if (!q) return true;
    let digits = q.replace(/\D/g, "");
    if (digits.length > 10 && digits.startsWith("91")) digits = digits.slice(2);
    return (
      b.customer_name.toLowerCase().includes(q) ||
      (b.email || "").toLowerCase().includes(q) ||
      (digits.length >= 3 && b.mobile_number.includes(digits))
    );
  }

  function renderHistory() {
    if ($("#panel-history").hidden) return;
    const rows = bookings.filter(historyMatches);
    $("#h-count").textContent = $("#hq").value.trim()
      ? `${plural(rows.length, "booking")} found`
      : plural(bookings.length, "booking");
    const td = (v) => `<td>${esc(v == null || v === "" ? "–" : v)}</td>`;
    $("#h-rows").innerHTML = rows.length
      ? rows.slice(0, hShown).map((b) => `
          <tr data-open="${b.id}" tabindex="0">
            ${td(b.id)}
            <td class="nowrap">${esc(fmtDateTime(b.created_at))}</td>
            <td class="h-name">${esc(b.customer_name)}</td>
            <td class="nowrap">${esc(prettyMobile(b.mobile_number))}</td>
            ${td(b.email)}
            ${td(b.car)}
            <td class="nowrap">${esc(fmtDate(b.pickup_date))}</td>
            ${td(b.number_of_days)}
            ${td(b.driver_option)}
            ${td(b.pickup_location)}
            <td class="h-notes">${esc(b.notes || "–")}</td>
            <td class="nowrap">${esc(b.estimated_total ? rupees(b.estimated_total) : "–")}</td>
            <td><span class="h-status s-${esc(b.status)}">${esc(b.status)}</span></td>
          </tr>`).join("")
      : `<tr><td colspan="13" class="muted h-empty">${bookings.length ? "No bookings match your search." : "No bookings yet."}</td></tr>`;
    $("#h-more").hidden = rows.length <= hShown;
  }

  $("#hq").addEventListener("input", () => {
    hShown = H_PAGE;
    renderHistory();
  });
  $("#h-more").addEventListener("click", () => {
    hShown += H_PAGE;
    renderHistory();
  });
  $("#h-rows").addEventListener("click", (e) => {
    const tr = e.target.closest("tr[data-open]");
    if (tr) openDetail(Number(tr.dataset.open));
  });
  $("#h-rows").addEventListener("keydown", (e) => {
    const tr = e.target.closest("tr[data-open]");
    if (tr && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      openDetail(Number(tr.dataset.open));
    }
  });

  /* ---------- Tabs ---------- */
  const TABS = ["bookings", "history", "activity"];
  function openTab(name) {
    TABS.forEach((t) => {
      $(`#tab-${t}`).setAttribute("aria-selected", String(t === name));
      $(`#panel-${t}`).hidden = t !== name;
    });
    if (name === "activity") loadActivity();
    if (name === "history") renderHistory();
  }
  TABS.forEach((t) => $(`#tab-${t}`).addEventListener("click", () => openTab(t)));

  /* ---------- CSV export ---------- */
  function csvCell(v) {
    let s = v == null ? "" : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // stop spreadsheet formulas
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }
  $("#export").addEventListener("click", () => {
    const rows = bookings.filter(matches);
    const head = ["Booking ID", "Received (IST)", "Customer name", "Mobile number", "Email", "Car",
      "Pickup date", "Days", "Driver", "Pickup location", "Customer notes", "Estimated total (Rs)",
      "Status", "Admin notes"];
    const lines = rows.map((b) => [
      b.id, fmtDateTime(b.created_at), b.customer_name, b.mobile_number, b.email, b.car,
      b.pickup_date, b.number_of_days, b.driver_option, b.pickup_location, b.notes,
      b.estimated_total, b.status, b.admin_notes,
    ].map(csvCell).join(","));
    const csv = "﻿" + [head.join(","), ...lines].join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `bmreddy-bookings-${todayIST()}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast(`Exported ${plural(rows.length, "booking")}`);
  });

  /* ---------- Live updates ---------- */
  sb.channel("bookings-live")
    .on("postgres_changes", { event: "*", schema: "public", table: "bookings" }, (payload) => {
      const rec = payload.new;
      if (!rec || !rec.id) return;
      if (payload.eventType === "INSERT") {
        if (byId(rec.id)) return;
        bookings.unshift(rec);
        fresh.add(rec.id);
        fillCarFilter();
        renderAll();
        toast(`New booking: ${rec.customer_name} (${rec.car})`);
      } else if (payload.eventType === "UPDATE") {
        const b = byId(rec.id);
        if (!b) return;
        const notesChanged = b.admin_notes !== rec.admin_notes;
        Object.assign(b, rec);
        syncCard(b);
        syncDetail(b);
        renderStats();
        renderHistory();
        if (openId === b.id && !notesChanged) loadBookingEvents(b.id);
      }
      if (!$("#panel-activity").hidden) loadActivity();
    })
    .subscribe();

  // Coming back to the page after a while → reload, in case live updates were missed
  let hiddenAt = 0;
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      hiddenAt = Date.now();
    } else if (hiddenAt && Date.now() - hiddenAt > 60000) {
      refresh();
      if (!$("#panel-activity").hidden) loadActivity();
    }
  });

  /* ---------- Start ---------- */
  syncFilterInputs();
  await refresh();
})();
