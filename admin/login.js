/* Admin login + "forgot password". There is no sign-up. */
(async function () {
  "use strict";
  const { sb, $, showMsg, checkAdmin } = window.BMR;
  const msg = $("#msg");
  const loginForm = $("#login");
  const forgotForm = $("#forgot");
  const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);

  function showForm(name) {
    loginForm.hidden = name !== "login";
    forgotForm.hidden = name !== "forgot";
    msg.hidden = true;
    if (name === "forgot") {
      $("#forgot-email").value = $("#email").value.trim();
      $("#forgot-email").focus();
    } else {
      $("#email").focus();
    }
  }
  $("#show-forgot").addEventListener("click", () => showForm("forgot"));
  $("#show-login").addEventListener("click", () => showForm("login"));

  if (!sb) {
    showMsg(msg, "The database isn't connected yet. Fill supabaseUrl and supabaseAnonKey in config.js (see SETUP.md).");
    loginForm.querySelectorAll("input, button").forEach((el) => (el.disabled = true));
    return;
  }

  const params = new URLSearchParams(location.search);
  if (params.get("e") === "notadmin") showMsg(msg, "This account is not allowed to use the admin page.");
  if (params.get("e") === "expired") showMsg(msg, "Please sign in again.");
  if (location.hash === "#forgot") showForm("forgot");

  // Already signed in as admin → straight to the dashboard
  const { data: { session } } = await sb.auth.getSession();
  if (session) {
    if (await checkAdmin()) return location.replace("./");
    await sb.auth.signOut();
  }

  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = $("#email").value.trim();
    const password = $("#password").value;
    if (!validEmail(email) || !password) {
      showMsg(msg, "Enter your email and password.");
      return;
    }
    const btn = $("#login-btn");
    btn.disabled = true;
    btn.textContent = "Signing in…";
    msg.hidden = true;

    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) {
      showMsg(msg, error.status === 429
        ? "Too many attempts. Please wait a few minutes and try again."
        : "Wrong email or password.");
    } else if (await checkAdmin()) {
      location.replace("./");
      return;
    } else {
      await sb.auth.signOut();
      showMsg(msg, "This account is not allowed to use the admin page.");
    }
    $("#password").value = "";
    btn.disabled = false;
    btn.textContent = "Sign in";
  });

  forgotForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = $("#forgot-email").value.trim();
    if (!validEmail(email)) {
      showMsg(msg, "Enter a valid email.");
      return;
    }
    const btn = $("#forgot-btn");
    btn.disabled = true;
    btn.textContent = "Sending…";
    const { error } = await sb.auth.resetPasswordForEmail(email, {
      redirectTo: new URL("reset.html", location.href).href,
    });
    if (error && error.status === 429) {
      showMsg(msg, "Please wait a minute before asking for another link.");
    } else {
      // Same answer either way, so nobody can find out which emails exist.
      showMsg(msg, "If this is the admin email, a reset link is on its way. Check your inbox (and spam folder).", true);
    }
    btn.disabled = false;
    btn.textContent = "Send reset link";
  });
})();
