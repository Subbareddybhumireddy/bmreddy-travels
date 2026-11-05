# Bookings database – one-time setup (about 10 minutes)

Every booking from the website is saved in a Google Sheet. On `admin.html`
you pick a day and see everyone who has a car on that day.

## 1. Make the Google Sheet
1. Go to https://sheets.google.com and create a blank sheet.
   Name it **BMReddy Bookings**.
2. In the sheet, open **Extensions → Apps Script**.
3. Delete everything in the editor and paste all of `Code.gs` from this folder.
4. On line 13, change `change-this-password` to your own password, e.g.
   `const ADMIN_KEY = "Nellore@2026!";`
5. Click **Save** (disk icon).

## 2. Put it online
1. Click **Deploy → New deployment**.
2. Click the gear icon next to "Select type" → **Web app**.
3. Set:
   - **Execute as:** Me
   - **Who has access:** Anyone
4. Click **Deploy**, then **Authorize access** and allow it with your Google
   account. (If Google says "app isn't verified", click **Advanced → Go to … (unsafe)**.
   It's your own script, so this is fine.)
5. Copy the **Web app URL**. It ends in `/exec`.

## 3. Paste the link into the website
- `script.js` → `databaseUrl: "PASTE HERE"`
- `admin.js` → `const DATABASE_URL = "PASTE HERE";`

Upload the website files again (including the new `admin.html` and `admin.js`).

## 4. Use it
- Make a test booking on the website. A **Bookings** tab appears in the sheet
  with the new row.
- Open `yoursite.com/admin.html` and type your password. Only the owner can
  log in. There is no link to this page on the website, and customers never
  need it.
  - **By day:** pick a day to see every booking where the car is out on that
    day. Pickups on that day are marked **Pickup today**.
  - **History:** every booking ever made, newest first. Search by name,
    mobile, email or car. Tap a customer's name to see all their past bookings.
- After 10 wrong passwords in 15 minutes, logins are blocked for 15 minutes.
  This stops people from guessing your password.

## Good to know
- You can also open the Google Sheet any time to see, sort or delete bookings.
- If you change `Code.gs` later (for example a new password), go to
  **Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy**.
  The link stays the same.
- Keep the password private. Anyone with it can see customer names and numbers.
