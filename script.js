/* =========================================================
   Settings (phone, cars, prices, database) are in config.js.
   You don't need to edit anything in this file.
   ========================================================= */
const CONFIG = window.BMR_CONFIG;

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const rupees = (n) => "₹" + Number(n).toLocaleString("en-IN");
const priceText = (car) => (car.price ? rupees(car.price) : "Ask for price");
const getCar = (id) => CONFIG.cars.find((c) => c.id === id) || CONFIG.cars[0];

/* ---------- Contact links from CONFIG ---------- */
const prettyPhone = "+91 " + CONFIG.phone.slice(0, 5) + " " + CONFIG.phone.slice(5);
$$("[data-call]").forEach((a) => (a.href = "tel:+91" + CONFIG.phone));
$$("[data-phone-text]").forEach((el) => (el.textContent = prettyPhone));
$$("[data-whatsapp]").forEach((a) => (a.href = "https://wa.me/" + CONFIG.whatsapp));
$$("[data-owner]").forEach((el) => (el.textContent = CONFIG.ownerName));
$("#year").textContent = new Date().getFullYear();

// Map pin + "Get directions" from CONFIG.mapLocation
if (CONFIG.mapLocation) {
  const q = encodeURIComponent(CONFIG.mapLocation);
  $$("[data-directions]").forEach((a) => (a.href = `https://www.google.com/maps/dir/?api=1&destination=${q}`));
  const frame = $("#map-frame");
  if (frame) frame.src = `https://maps.google.com/maps?q=${q}&z=15&output=embed`;
}

/* ---------- Car cards + form tiles ---------- */
const imgFallback = `onerror="this.onerror=null;this.src='images/car-placeholder.svg'"`;

$("#car-track").innerHTML = CONFIG.cars
  .map(
    (car) => `
  <article class="car-card" data-car="${car.id}">
    <div class="car-photo">
      <span class="car-tag${car.seats >= 7 ? " hot" : ""}">${car.seats >= 7 ? "Family favourite" : "Easy city drive"}</span>
      <img src="${car.image}" alt="${car.name}, ${car.seats}-seater car" loading="lazy" width="900" height="563" ${imgFallback} />
    </div>
    <div class="car-body">
      <h3>${car.name}</h3>
      <ul class="specs">
        <li><svg class="icon" aria-hidden="true"><use href="#i-user"/></svg>${car.seats} seats</li>
        <li><svg class="icon" aria-hidden="true"><use href="#i-fuel"/></svg>${car.fuel}</li>
      </ul>
      <div class="car-foot">
        <p class="car-price"><strong>${priceText(car)}</strong>${car.price ? "<span>/day</span>" : ""}</p>
        <button type="button" class="btn btn-red select-btn" data-select="${car.id}" aria-label="Select ${car.name}">Select</button>
      </div>
    </div>
  </article>`
  )
  .join("");

$("#car-tiles").innerHTML = CONFIG.cars
  .map(
    (car, i) => `
  <label class="car-tile">
    <input type="radio" name="car" value="${car.id}" ${i === 0 ? "checked" : ""} />
    <span class="car-tile-box">
      <img src="${car.image}" alt="" loading="lazy" ${imgFallback} />
      <strong>${car.shortName}</strong>
      <small>${car.seats} seats</small>
    </span>
  </label>`
  )
  .join("");

/* ---------- Form state ---------- */
const form = $("#booking-form");
const daysInput = $("#f-days");
const dateInput = $("#f-date");

// Earliest pickup date = today (local time)
function todayISO() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}
dateInput.min = todayISO();

function getDays() {
  const n = parseInt(daysInput.value, 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function currentState() {
  const car = getCar(form.car.value);
  const days = getDays();
  const driver = form.driver.value;
  const total = car.price ? car.price * days : null;
  return { car, days, driver, total };
}

// Update the summary card and the estimate
function updateSummary() {
  const { car, days, driver, total } = currentState();
  $("#sum-img").src = car.image;
  $("#sum-img").alt = car.name;
  $("#sum-name").textContent = car.name;
  $("#sum-specs").textContent = `${car.seats} seats · ${car.fuel}`;
  $("#sum-price").textContent = priceText(car);
  $("#sum-days").textContent = days + (days === 1 ? " day" : " days");
  $("#sum-driver").textContent = driver;

  const totalText = total ? rupees(total) : "Owner will confirm";
  $("#sum-total").textContent = totalText;
  $("#est-total").textContent = totalText;
  $("#est-calc").textContent = car.price
    ? `${rupees(car.price)} × ${days} ${days === 1 ? "day" : "days"}`
    : `${car.name} · ${days} ${days === 1 ? "day" : "days"}`;

  const needDriver = driver === "Need Driver";
  $("#sum-note").hidden = !needDriver;
  $("#est-note").hidden = !needDriver;

  // Highlight the selected car card
  $$(".car-card").forEach((card) => {
    const on = card.dataset.car === car.id;
    card.classList.toggle("is-selected", on);
    const btn = $(".select-btn", card);
    btn.textContent = on ? "Selected ✓" : "Select";
  });
}

form.addEventListener("change", updateSummary);
form.addEventListener("input", updateSummary);

// "Select" on a car card → pick it in the form and scroll there
$("#car-track").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-select]");
  if (!btn) return;
  const radio = $(`input[name="car"][value="${btn.dataset.select}"]`);
  radio.checked = true;
  updateSummary();
  $("#booking").scrollIntoView({ behavior: "smooth" });
});

// Days stepper
$$(".step-btn").forEach((btn) =>
  btn.addEventListener("click", () => {
    const next = Math.min(60, Math.max(1, getDays() + Number(btn.dataset.step)));
    daysInput.value = next;
    clearError("days");
    updateSummary();
  })
);

/* ---------- Quick booking card in the hero (desktop) ---------- */
// Copies car, date and days into the main form, then jumps to it
const quick = $("#quick");
if (quick) {
  const qbDate = $("#qb-date");
  $("#qb-car").innerHTML = CONFIG.cars
    .map((car) => `<option value="${car.id}">${car.name} · ${car.seats} seats</option>`)
    .join("");
  qbDate.min = todayISO();

  quick.addEventListener("submit", (e) => {
    e.preventDefault();
    const radio = $(`input[name="car"][value="${$("#qb-car").value}"]`);
    if (radio) radio.checked = true;
    if (qbDate.value && qbDate.value >= todayISO()) {
      dateInput.value = qbDate.value;
      clearError("date");
    }
    const d = parseInt($("#qb-days").value, 10);
    if (Number.isInteger(d)) daysInput.value = Math.min(60, Math.max(1, d));
    updateSummary();
    $("#booking").scrollIntoView({ behavior: "smooth" });
    $("#f-name").focus({ preventScroll: true });
  });
}

/* ---------- Top bar: white once you scroll ---------- */
const topbar = $(".topbar");
const onScroll = () => topbar.classList.toggle("scrolled", window.scrollY > 40);
window.addEventListener("scroll", onScroll, { passive: true });
onScroll();

// Mobile: digits only
$("#f-mobile").addEventListener("input", (e) => {
  e.target.value = e.target.value.replace(/\D/g, "").slice(0, 10);
});

/* ---------- Validation ---------- */
function setError(field, msg) {
  const wrap = $(`[data-field="${field}"]`);
  const input = $("input", wrap);
  wrap.classList.add("has-error");
  input.setAttribute("aria-invalid", "true");
  $(`#err-${field}`).innerHTML = `<svg class="icon" aria-hidden="true"><use href="#i-alert"/></svg>${msg}`;
}
function clearError(field) {
  const wrap = $(`[data-field="${field}"]`);
  wrap.classList.remove("has-error");
  $("input", wrap).removeAttribute("aria-invalid");
  $(`#err-${field}`).textContent = "";
}
["name", "mobile", "email", "date", "days"].forEach((f) =>
  $(`[data-field="${f}"] input`).addEventListener("input", () => clearError(f))
);

function validate() {
  const errors = {};
  const name = $("#f-name").value.trim();
  const mobile = $("#f-mobile").value.trim();
  const email = $("#f-email").value.trim();
  const date = dateInput.value;
  const days = parseInt(daysInput.value, 10);

  if (name.length < 2) errors.name = "Please enter your full name.";
  else if (name.length > 80) errors.name = "Name is too long (max 80 letters).";
  if (!/^[6-9]\d{9}$/.test(mobile)) errors.mobile = "Enter a valid 10-digit mobile number.";
  if (email && (email.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email))) errors.email = "Enter a valid email, e.g. name@gmail.com.";
  if (!date) errors.date = "Please choose a pickup date.";
  else if (date < todayISO()) errors.date = "Pickup date can't be in the past.";
  if (!Number.isInteger(days) || days < 1) errors.days = "Minimum 1 day.";
  else if (days > 60) errors.days = "For more than 60 days, please call us.";

  ["name", "mobile", "email", "date", "days"].forEach((f) => (errors[f] ? setError(f, errors[f]) : clearError(f)));
  return Object.keys(errors);
}

/* ---------- Submit ---------- */
function formatDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function databaseReady() {
  return (
    /^https:\/\/\S+$/.test(CONFIG.supabaseUrl || "") &&
    !/YOUR-PROJECT/.test(CONFIG.supabaseUrl) &&
    (CONFIG.supabaseAnonKey || "").length > 20 &&
    !/PASTE/.test(CONFIG.supabaseAnonKey)
  );
}

// Saves the booking in the Supabase database. Throws if it wasn't saved.
// Visitors can only ADD bookings; the database refuses reads, edits and deletes.
async function saveToDatabase(b) {
  const key = CONFIG.supabaseAnonKey;
  const headers = {
    "Content-Type": "application/json",
    apikey: key,
    Prefer: "return=minimal",
  };
  if (key.startsWith("eyJ")) headers.Authorization = "Bearer " + key; // older "anon" keys
  const res = await fetch(CONFIG.supabaseUrl.replace(/\/+$/, "").replace(/\/rest\/v1$/, "") + "/rest/v1/bookings", {
    method: "POST",
    headers,
    body: JSON.stringify({
      customer_name: b.name,
      mobile_number: b.mobile,
      email: b.email || null,
      car: b.car.shortName,
      pickup_date: b.date,              // YYYY-MM-DD
      number_of_days: b.days,
      driver_option: b.driver,          // "Self Drive" or "Need Driver"
      pickup_location: b.location || null,
      notes: b.notes || null,
      estimated_total: b.total || null,
    }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || "Database error " + res.status);
  }
}

// Pre-filled WhatsApp message to the owner with the booking details
function whatsappLink(b) {
  const lines = [
    `Hi ${CONFIG.ownerName}, I just requested a booking on your website.`,
    `Name: ${b.name}`,
    `Mobile: +91 ${b.mobile}`,
    `Car: ${b.car.name}`,
    `Pickup date: ${formatDate(b.date)}`,
    `Days: ${b.days}`,
    `Driver: ${b.driver}`,
  ];
  if (b.location) lines.push(`Pickup / destination: ${b.location}`);
  if (b.notes) lines.push(`Notes: ${b.notes}`);
  lines.push(`Estimated total: ${b.total ? rupees(b.total) : "Owner will confirm"}`);
  return `https://wa.me/${CONFIG.whatsapp}?text=${encodeURIComponent(lines.join("\n"))}`;
}

function showSubmitError(msg) {
  const el = $("#submit-error");
  el.innerHTML = `<svg class="icon" aria-hidden="true"><use href="#i-alert"/></svg><span>${msg}</span>`;
  el.hidden = false;
}

let submitting = false;
const submitBtn = $("#submit-btn");

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (submitting) return;

  const invalid = validate();
  if (invalid.length) {
    $(`[data-field="${invalid[0]}"] input`).focus();
    return;
  }

  submitting = true;
  submitBtn.disabled = true;
  submitBtn.textContent = "Sending…";

  const { car, days, driver, total } = currentState();
  const booking = {
    car, days, driver, total,
    name: $("#f-name").value.trim(),
    mobile: $("#f-mobile").value.trim(),
    email: $("#f-email").value.trim(),
    date: dateInput.value,
    location: $("#f-location").value.trim(),
    notes: $("#f-notes").value.trim(),
  };

  $("#submit-error").hidden = true;

  if (!databaseReady()) {
    console.warn("Bookings database isn't set up. Fill supabaseUrl and supabaseAnonKey in config.js.");
    showSubmitError(`Online booking isn't set up yet. Please call ${prettyPhone} to book.`);
    resetSubmitButton();
    return;
  }

  // Spam trap filled in → it's a bot. Pretend it worked, save nothing.
  if ($("#f-honey").value) {
    showSuccess(booking);
    return;
  }

  try {
    await saveToDatabase(booking);
    showSuccess(booking);
  } catch (err) {
    console.error("Could not save booking", err);
    const msg = String(err.message);
    if (/past/i.test(msg)) {
      setError("date", "Pickup date can't be in the past.");
      dateInput.focus();
    } else if (/too many/i.test(msg)) {
      showSubmitError(`We already have several bookings from this number. Please call ${prettyPhone}.`);
    } else {
      showSubmitError(`Sorry, your booking could not be sent. Please try again, or call ${prettyPhone}.`);
    }
    resetSubmitButton();
  }
});

function resetSubmitButton() {
  submitting = false;
  submitBtn.disabled = false;
  submitBtn.textContent = "Request Booking";
}

function showSuccess(b) {
  $("#success-title").textContent = "Thank you!";
  $("#success-text").textContent = `${CONFIG.ownerName} will call you shortly to confirm.`;

  $("#success-summary").innerHTML = `
    <div><span>Car</span><strong>${b.car.name}</strong></div>
    <div><span>Pickup</span><strong>${formatDate(b.date)}</strong></div>
    <div><span>Days</span><strong>${b.days}</strong></div>
    <div><span>Driver</span><strong>${b.driver}</strong></div>
    <div><span>Estimated total</span><strong>${b.total ? rupees(b.total) : "Owner will confirm"}</strong></div>`;
  $("#success-wa").href = whatsappLink(b);

  form.hidden = true;
  $("#success").hidden = false;
  $(".form-card").scrollIntoView({ behavior: "smooth", block: "start" });
  $("#success-title").focus({ preventScroll: true });
}

$("#new-booking").addEventListener("click", () => {
  form.reset();
  dateInput.min = todayISO();
  resetSubmitButton();
  $("#success").hidden = true;
  form.hidden = false;
  updateSummary();
  $("#f-name").focus();
});

/* ---------- Fade-in on scroll ---------- */
if ("IntersectionObserver" in window) {
  const io = new IntersectionObserver(
    (entries) =>
      entries.forEach((en) => {
        if (en.isIntersecting) {
          en.target.classList.add("in");
          io.unobserve(en.target);
        }
      }),
    { threshold: 0.01 }
  );
  $$(".car-card, .step, .trip, .cta, .form-card, .summary, .contact-card, .map").forEach((el) => {
    el.classList.add("reveal");
    io.observe(el);
  });
}

updateSummary();
