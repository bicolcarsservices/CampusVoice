# Supabase setup

## Apply the schema

Open `supabase/schema.sql` from the project folder and run that file in the
Supabase SQL Editor. It should start with SQL comments (`-- CAMPUSVOICE ...`);
do not paste the product brief or another text file into the SQL Editor.
The schema is intended to be
re-runnable; it scopes policy and permission changes to CampusVoice objects.
The preflight check stops if the old `public_posts` table contains records,
rather than dropping that data.

Re-run the current file after project updates so the database has the latest
public profile view, privacy grants, and profile fields. School is optional;
users can leave it blank or type a school name. The typed name is stored on
the profile, and names matching an existing school are also linked to that
school for feed filters and counts. Review the SQL output for errors before
using updated features.

## Authentication URLs

For local development, set the Supabase Auth Site URL to
`http://localhost:3000` and add `http://localhost:3000/auth/callback` and
`http://localhost:3001/auth/callback` to the allowed Redirect URLs. Set
`NEXT_PUBLIC_SITE_URL=http://localhost:3000` in `.env.local`. For deployment,
use the HTTPS production origin instead.

## PayMongo GCash payments

1. Apply `supabase/schema.sql`, then run `supabase/paymongo.sql` in the
   Supabase SQL Editor. The second file adds the private payment-attempt table
   and the database function that activates subscriptions only after a
   confirmed, amount-matched payment.
2. Add `PAYMONGO_SECRET_KEY`, `PAYMONGO_WEBHOOK_SECRET`,
   `SUPABASE_SERVICE_ROLE_KEY`, and `NEXT_PUBLIC_SITE_URL` to `.env.local`.
   Use PayMongo test credentials (`sk_test_...` and the matching webhook
   signing secret) during development. Never expose these values to the
   browser or commit them. Since PayMongo needs to reach the webhook and
   GCash must return to your app, local testing needs a public HTTPS tunnel;
   `localhost` alone is not reachable by PayMongo.
3. Configure a PayMongo webhook to reach
   `https://<your-site>/api/webhooks/paymongo` and subscribe to
   `payment.paid` and `payment.failed`. Set `NEXT_PUBLIC_SITE_URL` to the
   public HTTPS origin in production so GCash returns to the subscription
   page.
4. Verify a payment using PayMongo's test environment before switching to live
   credentials. The app does not simulate successful payments; a subscription
   becomes active only after a valid signed webhook confirms its amount and
   currency.

## Email signup limits

Supabase's built-in email sender has strict limits and is intended for
development. If signups show `email rate limit exceeded` and email verification
is not required, open **Authentication → Sign In / Providers → Email** and
turn off **Confirm email**. New signups will then create a session without
sending a confirmation email. Existing unconfirmed accounts still need to be
confirmed in **Authentication → Users**. If verification is required, wait for
the email limit to reset or configure a trusted custom SMTP provider in the
Supabase Auth SMTP settings.

## Create the first administrator

1. Register and log in to CampusVoice at least once so the account exists in
   this Supabase project's **Authentication → Users**.
2. Open `supabase/first-admin.sql` in this project and run its contents in the
   Supabase SQL Editor. The file is set to `ljerikodeguzman@gmail.com`; change
   that email in both places in the file if the registered account uses a
   different address.
3. Verify the query returns your email with the `admin` role. Then log out and
   back in; admins are sent to `/admin` and see an Admin link in the navbar.

Never place an admin password or a Supabase service-role key in application
code or a browser environment variable. The browser should use only the
project URL and anon/publishable key.

## Current feature scope

The app includes signup/login/email verification and password reset, public
profiles, posting with server-side database quota enforcement, comments,
reactions, reports, schools/categories, notifications, manual subscription
requests, PayMongo GCash subscription checkout, and admin pages for
moderation, users, plans, settings, schools, categories, and announcements.

Manual requests do not process or confirm payments. Some items in the
original product brief remain future work, including username-based login, profile
editing controls for subscription-only avatars, destructive account deletion,
advanced analytics/charts, and complete CMS editing for every legal page.
