/* =========================================================
   BMReddy Travels – settings
   Everything you may want to change is in this one file.
   It is used by the website (index.html) and the admin pages (/admin).
   ========================================================= */
window.BMR_CONFIG = {
  ownerName: "Maheshreddy",
  phone: "9030533561",          // shown on the site and used for "Call"
  whatsapp: "919030533561",     // country code + number, no "+" or spaces

  // Where the map pin goes (map on the page + "Get directions" button).
  // Use the address, or for an exact pin use the GPS numbers from Google Maps,
  // e.g. "14.5341, 79.8763" (long-press your spot in Google Maps to see them).
  mapLocation: "Salamanpuram, Buchireddypalem, Nellore 524305, Andhra Pradesh",

  // Cars. "price" is the price per day in rupees, e.g. price: 2500
  // Leave price as null to show "Ask for price".
  // "shortName" is what is saved in the bookings database (Ertiga / Swift / Amaze).
  cars: [
    { id: "ertiga", name: "Maruti Ertiga", shortName: "Ertiga", seats: 7, fuel: "Petrol / CNG", price: null, image: "images/ertiga.jpg" },
    { id: "swift",  name: "Maruti Swift",  shortName: "Swift",  seats: 5, fuel: "Petrol",       price: null, image: "images/swift.jpg" },
    { id: "amaze",  name: "Honda Amaze",   shortName: "Amaze",  seats: 5, fuel: "Petrol",       price: null, image: "images/amaze.jpg" },
  ],

  // Bookings database (Supabase). See SETUP.md, step 1.
  // Supabase → Project Settings → API:
  //   supabaseUrl     = "Project URL"
  //   supabaseAnonKey = the "anon public" key (or the "publishable" key)
  // These two are safe to be public: the database rules only let visitors
  // ADD a booking. NEVER paste the "service_role" / "secret" key here.
  supabaseUrl: "https://cxplhbikqbcfkjypaido.supabase.co",
  supabaseAnonKey: "sb_publishable_fXjaQUBg4sC8EvkxxbsXZg_4SbvlEy2",
};
