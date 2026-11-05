# BMReddy Travels – bookings database + admin setup

Bookings from the website are saved in a **Supabase** database (free plan is enough).
The owner signs in at **yoursite.com/admin** to see and manage them.

About 15 minutes, one time only.

---

## 1. Create the Supabase project
1. Go to https://supabase.com, sign up, and click **New project**.
   - Name: `bmreddy-travels`
   - Region: **Mumbai (ap-south-1)**
   - Choose a strong database password and save it somewhere safe.
2. When it's ready, open **Project Settings → API** and copy:
   - **Project URL** (looks like `https://abcdxyz.supabase.co`)
   - **anon public** key (or the **publishable** key)
3. Paste both into `config.js`:
   ```js
   supabaseUrl: "https://abcdxyz.supabase.co",
   supabaseAnonKey: "eyJhbGciOi....",
   ```
   ⚠️ Never put the **service_role** / **secret** key in any website file.

## 2. Create the tables and security rules
1. In Supabase open **SQL Editor → New query**.
2. Paste everything from `supabase/1-database.sql` and click **Run**.
   You should see "Success. No rows returned".

This creates:
- `bookings` – every booking (status starts as **New**)
- `booking_events` – the activity log (created / status changed)
- the rules: visitors can only **add** a booking; only the admin can read or update.

## 3. Create the admin account (no public sign-up)
1. **Authentication → Sign In / Providers**: turn **OFF** "Allow new users to sign up".
   (Leave the Email provider on.)
2. **Authentication → Users → Add user → Create new user**
   - Email: `subbareddybhumireddy46@gmail.com`
   - Password: a strong password
   - Tick **Auto Confirm User**
3. **SQL Editor → New query**: paste `supabase/2-make-admin.sql` and **Run**.
   It should show one row with the owner's email.
   (If the admin uses a different email, change it in that file first.)

## 4. Allow the password-reset link
**Authentication → URL Configuration**
- **Site URL**: your website address, e.g. `https://bmreddytravels.in`
- **Redirect URLs** → Add: `https://bmreddytravels.in/admin/reset.html`

## 5. Upload the website
Upload the whole folder as before, including the new `config.js` and the `admin` folder.

Test it:
1. Make a test booking on the website. You should see "Thank you!".
2. Open `yoursite.com/admin`, sign in. The booking is there with a **New** badge.
3. Change its status. Open it and check the **Activity** list.

## 6. (Optional) Email the owner for every new booking
1. Sign up free at https://resend.com with the owner's email, then create an **API key**.
2. Supabase **Edge Functions → Deploy a new function → Via editor**
   - Name: `notify-owner`
   - Paste `supabase/functions/notify-owner/index.ts`, click **Deploy**
   - In the function's **Details**, turn **OFF** "Verify JWT" (it checks its own secret instead)
3. **Edge Functions → Secrets**, add:
   - `RESEND_API_KEY` = your Resend key
   - `OWNER_EMAIL` = `subbareddybhumireddy46@gmail.com`
   - `WEBHOOK_SECRET` = any long random text (e.g. 30 random letters and numbers)
4. **Database → Webhooks → Create a new hook**
   - Table: `bookings`, Events: **Insert**
   - Type: **Supabase Edge Functions** → `notify-owner`
   - HTTP Headers → add `x-webhook-secret` = the same text as `WEBHOOK_SECRET`

(With Resend's free test sender, emails can only go to the email you signed up with,
so sign up with the owner's email.)

## 7. Message customers (email + WhatsApp) when you confirm or cancel
When the admin changes a booking to **Confirmed**, **Cancelled** or **Completed**, the
booking opens with a ready-made message. Edit it if you like and press **Send to customer**:
- **WhatsApp** opens on your phone/computer with the message written to the customer's
  number. Press Send in WhatsApp. (It comes from the owner's own WhatsApp.)
- **Email** is sent straight away from the owner's Gmail (only if the customer gave an email).

One-time setup for the email part:
1. **Update the database**: SQL Editor → New query → paste all of `supabase/1-database.sql`
   again → **Run**. (Safe to run again; it adds the message log.)
2. **Gmail app password** (lets the website send email from the owner's Gmail):
   - Sign in to the owner's Google account → https://myaccount.google.com/security
   - Turn on **2-Step Verification** if it's off.
   - Open https://myaccount.google.com/apppasswords, name it `BMReddy website`, click **Create**.
   - Copy the 16-letter password it shows.
3. Supabase **Edge Functions → Deploy a new function → Via editor**
   - Name: `notify-customer`
   - Paste `supabase/functions/notify-customer/index.ts`, click **Deploy**
   - In the function's **Details**, turn **OFF** "Verify JWT" (it checks the admin login itself)
4. **Edge Functions → Secrets**, add:
   - `GMAIL_USER` = `subbareddybhumireddy46@gmail.com`
   - `GMAIL_APP_PASSWORD` = the 16-letter app password
5. Upload the updated `admin` folder.

Test: make a booking on the website **with your own email**, open it in the admin page,
set it to **Confirmed**, press **Send to customer**. You should get the email, and
WhatsApp should open with the message.

Every message sent shows in the booking's **Activity** list (tap "Show message" to see it).

---

## Using the admin page
- **Summary cards**: tap one to filter the list (e.g. tap *Confirmed*).
- **Bookings**: newest first. Tap a booking for all details, admin notes and its activity.
- **Call / WhatsApp / Status** buttons on every booking. Status saves instantly.
- **Message the customer**: inside each booking. Opens by itself after you confirm/cancel.
- **Search** by name or mobile. **Filters**: status, car, date range (pickup or received).
- **Export**: downloads a CSV (Excel) file of everything shown.
- **Activity log**: every new booking and status change.
- New bookings appear on their own while the page is open (no refresh needed).
- **Forgot password?** on the sign-in page sends a reset link to the admin email.

## Changing things later
- Car names, prices, phone and WhatsApp number: `config.js` only.
- New car? Add it in `config.js`. The database accepts any car name.

## Good to know
- The `google-apps-script` folder and the old Google Sheet are no longer used.
  You can delete them.
- `admin.html` now just forwards to `/admin`.
- Spam protection: a hidden trap field, and max 5 bookings per mobile number per hour.
- The admin pages use Supabase from `*.supabase.co`. If you ever move to a custom
  Supabase domain, update the `Content-Security-Policy` line in the three `admin/*.html` files.
