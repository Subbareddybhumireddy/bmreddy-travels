/* Opened from the "reset password" email. Lets the admin choose a new password. */
(async function () {
  "use strict";
  const { sb, $, showMsg } = window.BMR;
  const msg = $("#msg");

  function fail(text) {
    $("#checking").hidden = true;
    showMsg(msg, text);
    $("#back").hidden = false;
  }

  if (!sb) return fail("The database isn't connected yet. Fill supabaseUrl and supabaseAnonKey in config.js.");

  // The link in the email signs you in for a short time. supabase-js reads it
  // from the address bar while starting up; getSession() waits for that.
  const { data: { session } } = await sb.auth.getSession();
  if (!session) {
    return fail("This reset link has expired or was already used. Ask for a new one from the sign-in page.");
  }

  $("#checking").hidden = true;
  $("#reset").hidden = false;
  $("#pw1").focus();

  $("#reset").addEventListener("submit", async (e) => {
    e.preventDefault();
    const pw1 = $("#pw1").value;
    const pw2 = $("#pw2").value;
    if (pw1.length < 8) return showMsg(msg, "Use at least 8 characters.");
    if (pw1 !== pw2) return showMsg(msg, "The two passwords don't match.");

    const btn = $("#reset-btn");
    btn.disabled = true;
    btn.textContent = "Saving…";
    const { error } = await sb.auth.updateUser({ password: pw1 });
    if (error) {
      showMsg(msg, error.message || "Couldn't save the new password. Please try again.");
      btn.disabled = false;
      btn.textContent = "Save new password";
      return;
    }
    $("#reset").hidden = true;
    showMsg(msg, "Password saved. Opening your dashboard…", true);
    setTimeout(() => location.replace("./"), 1200);
  });
})();
