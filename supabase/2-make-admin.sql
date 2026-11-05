-- =========================================================
-- Make the owner's account an admin.
-- Run this AFTER creating the user in Authentication → Users (SETUP.md, step 3).
-- Change the email below if the admin account uses a different one.
-- =========================================================
insert into public.admins (user_id)
select id from auth.users
where lower(email) = lower('subbareddybhumireddy7@gmail.com')
on conflict do nothing;

-- Check: this should show exactly one row with the owner's email.
select u.email, a.created_at as admin_since
from public.admins a
join auth.users u on u.id = a.user_id;
