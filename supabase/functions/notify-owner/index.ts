// =========================================================
// OPTIONAL: email the owner for every new booking.
// Supabase Edge Function, called by a Database Webhook on new bookings.
// Setup: SETUP.md, step 6.
//
// Secrets (Edge Functions → Secrets):
//   RESEND_API_KEY  – from resend.com (free)
//   OWNER_EMAIL     – where the email goes
//   WEBHOOK_SECRET  – any long random text; the same text goes in the webhook header
// =========================================================

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const niceDate = (iso: string) => {
  const [y, m, d] = String(iso).split("-").map(Number);
  return y ? `${d} ${MONTHS[m - 1]} ${y}` : String(iso);
};

Deno.serve(async (req) => {
  const secret = Deno.env.get("WEBHOOK_SECRET");
  if (!secret || req.headers.get("x-webhook-secret") !== secret) {
    return new Response("Forbidden", { status: 403 });
  }

  const payload = await req.json().catch(() => null);
  if (!payload || payload.type !== "INSERT" || payload.table !== "bookings") {
    return new Response("Ignored", { status: 200 });
  }
  const b = payload.record;

  const rows: [string, string][] = [
    ["Customer", b.customer_name],
    ["Mobile", "+91 " + b.mobile_number],
    ["Email", b.email || "-"],
    ["Car", b.car],
    ["Pickup date", niceDate(b.pickup_date)],
    ["Days", String(b.number_of_days)],
    ["Driver", b.driver_option],
    ["Pickup / destination", b.pickup_location || "-"],
    ["Notes", b.notes || "-"],
    ["Estimated total", b.estimated_total ? "₹" + Number(b.estimated_total).toLocaleString("en-IN") : "To be confirmed"],
  ];

  const html = `
    <h2 style="color:#0B1F5C;font-family:sans-serif">New booking #${esc(b.id)}</h2>
    <table cellpadding="6" style="font-family:sans-serif;border-collapse:collapse">
      ${rows.map(([k, v]) => `<tr><td style="color:#525B78">${esc(k)}</td><td><strong>${esc(v)}</strong></td></tr>`).join("")}
    </table>
    <p style="font-family:sans-serif">
      <a href="tel:+91${esc(b.mobile_number)}">Call</a> ·
      <a href="https://wa.me/91${esc(b.mobile_number)}">WhatsApp</a>
    </p>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "BMReddy Bookings <onboarding@resend.dev>",
      to: [Deno.env.get("OWNER_EMAIL")],
      subject: `New booking: ${b.car} – ${b.customer_name}`,
      html,
      ...(b.email ? { reply_to: b.email } : {}),
    }),
  });

  if (!res.ok) {
    console.error("Email failed", res.status, await res.text());
    return new Response("Email failed", { status: 502 });
  }
  return new Response("Sent", { status: 200 });
});
