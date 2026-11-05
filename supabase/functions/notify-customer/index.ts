// =========================================================
// Message the customer about their booking (email from the owner's Gmail).
// Called from the admin dashboard. Only the admin can use it.
// WhatsApp is sent from the admin's own phone (the dashboard opens it).
// Setup: SETUP.md, step 7.
//
// Secrets (Edge Functions → Secrets):
//   GMAIL_USER          – the owner's Gmail address
//   GMAIL_APP_PASSWORD  – a 16-letter Gmail "app password" (not the normal password)
// SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.
// =========================================================
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import nodemailer from "npm:nodemailer@6.9.16";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reply = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return reply({ error: "Method not allowed" }, 405);

  // ---------- Only the admin ----------
  const auth = req.headers.get("Authorization") || "";
  const url = Deno.env.get("SUPABASE_URL")!;
  const asUser = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
  });
  const { data: isAdmin } = await asUser.rpc("is_admin");
  if (isAdmin !== true) return reply({ error: "Not allowed" }, 403);

  // ---------- Input ----------
  const body = await req.json().catch(() => null);
  const bookingId = Number(body?.booking_id);
  const message = String(body?.message ?? "").trim();
  const subject = String(body?.subject ?? "").trim().slice(0, 150);
  const sendEmail = body?.send_email === true;
  const whatsapp = body?.whatsapp === true;
  if (!Number.isInteger(bookingId) || bookingId < 1) return reply({ error: "Bad booking" }, 400);
  if (message.length < 2 || message.length > 2000) return reply({ error: "Message must be 2–2000 characters" }, 400);
  if (!sendEmail && !whatsapp) return reply({ error: "Nothing to send" }, 400);

  const { data: b, error: bErr } = await asUser.from("bookings").select("*").eq("id", bookingId).single();
  if (bErr || !b) return reply({ error: "Booking not found" }, 404);

  // ---------- Email ----------
  let emailed = false;
  if (sendEmail) {
    if (!b.email) return reply({ error: "This customer did not give an email" }, 400);
    const user = Deno.env.get("GMAIL_USER");
    const pass = (Deno.env.get("GMAIL_APP_PASSWORD") || "").replace(/\s+/g, "");
    if (!user || !pass) return reply({ error: "Email is not set up yet (Gmail secrets missing)" }, 500);

    const html = `
      <div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.55;color:#1B2340;max-width:560px">
        <h2 style="color:#0B1F5C;margin:0 0 12px">BMReddy Travels</h2>
        <p style="margin:0 0 16px">${esc(message).replace(/\r?\n/g, "<br>")}</p>
        <p style="color:#525B78;font-size:13px;margin:24px 0 0">Booking #${esc(b.id)} · Just reply to this email if you have any questions.</p>
      </div>`;

    try {
      const transport = nodemailer.createTransport({
        host: "smtp.gmail.com",
        port: 465, // Supabase blocks 25 and 587
        secure: true,
        auth: { user, pass },
      });
      await transport.sendMail({
        from: `"BMReddy Travels" <${user}>`,
        to: b.email,
        replyTo: user,
        subject: subject || `Your BMReddy Travels booking #${b.id}`,
        text: message,
        html,
      });
      emailed = true;
    } catch (err) {
      console.error("Email failed", err);
      return reply({ error: "Email could not be sent. Check the Gmail app password." }, 502);
    }
  }

  // ---------- Activity log ----------
  const channel = [emailed && "Email", whatsapp && "WhatsApp"].filter(Boolean).join(" + ");
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { error: logErr } = await admin.from("booking_events").insert({
    booking_id: b.id,
    event: "customer_notified",
    new_status: b.status,
    channel,
    message,
  });
  if (logErr) console.error("Log failed", logErr);

  return reply({ ok: true, emailed, channel });
});
