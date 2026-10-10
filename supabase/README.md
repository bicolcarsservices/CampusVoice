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

## Subscription payments with Maya QR

Subscription requests use a manual Maya QR payment; no PayMongo live account or
business verification is needed for this flow. Put the Maya QR image for the
account that will receive payments at `public/maya-qr.jpg`. Users scan the QR,
pay the exact plan amount, and submit their payment reference or sender name.
An administrator must verify the payment in Maya and activate the request under
**Admin → Subscriptions**. Do not activate a request before confirming that the
payment arrived. This is a one-time payment per selected plan period, not an
automatic recurring charge.

The previous PayMongo GCash checkout and webhook support remains available for
existing pending payments, but new subscription requests use the manual Maya
QR flow. An administrator can cancel an abandoned pending GCash request before
the user submits a new request.

## Game wallet and manual Maya top-ups

1. Run `supabase/wallet.sql` after `supabase/schema.sql` in the SQL Editor.
   This creates the protected wallet ledger, manual top-up and withdrawal
   requests, admin review functions, and game wallet account. Re-run it to add
   the top-up deduction fields and Dias purchase functions.
2. Run `supabase/game-rewards.sql` after the schema and wallet scripts to add
   private Campus Coin Rush claim records and admin review functions.
3. Run `supabase/galactic-striker.sql` after the schema and wallet scripts to
   add Galactic Striker's server-stored Dias inventory, conversion requests,
   separate earnings balance, and manually reviewed GCash/Maya payouts. Do not
   use the CampusVoice top-up wallet or Dias balance for game earnings.
4. Galactic Striker is at `/games/galactic-striker` and requires an active Basic
   or Premium subscription. Basic conversions are 25,000 crystals = ₱25 or
   60,000 = ₱50; Premium conversions are 25,000 = ₱25 or 60,000 = ₱60.
   Conversion requests must be approved under **Admin → Galactic Striker**
   before funds are credited. Payout requests reserve the requested gross
   earnings, deduct 10% VAT from the payout, and must be approved and manually
   sent by an admin. Rejecting a payout restores the gross amount.
   Crystals earned by the current browser-based game are still client-reported
   and can be manipulated; the pending admin conversion review prevents an
   automatic payout but is not server-side gameplay verification. A new
   subscription period clears the local crystal count when the game is next
   opened (and expires an open game); server-stored Dias and owned Galactic
   Striker inventory are not cleared. Dias purchases use the CampusVoice
   wallet packages and are recorded in the shared game Dias balance. A fully
   cheat-resistant reward balance requires moving gameplay/reward calculation
   to a trusted server.
5. Put the Maya QR image at `public/maya-qr.jpg` to show it on `/wallet` and
   subscription plans. Users submit the amount they sent and payment reference;
   an admin verifies the Maya transfer, enters the amount actually received
   and any fee/deduction, and checks the net wallet credit before approving.
   A note is required when a deduction is applied. The net amount is credited,
   not the requested or gross transfer amount.
6. Campus Coin Rush is available to signed-in users at `/games/campus-coin-rush`.
   Dias packages cost ₱49/₱99/₱199/₱399 and credit 50/120/300/700 Dias,
   respectively, from the CampusVoice wallet. There is no extra game VAT or
   fee. Dias balances and character purchases are stored server-side.
7. Load rewards are not cash withdrawals. A player can submit a claim for
   ₱10 mobile load (25,000 Coins) or ₱59 GoSURF load (60,000 Coins), entering
   the recipient name, email, and cellphone number. Claims are pending until
   an admin manually sends the load and marks it fulfilled, normally during
   the 9 PM review. Coins and play progress remain browser-local and can be
   edited, so claims are self-reported and require manual review; no load is
   sent automatically.
   Campus Coin Rush retains its original 60-second coin-collecting gameplay.
   Players can unlock up to 350 levels for 1,000 Coins each and replay any
   unlocked level; unlocking does not change the original run objective. There
   are 10 play attempts per local day, and restarting uses another attempt.
   Level unlocks and Coin balances are browser-local and are not server-verified.
8. Wallet withdrawals reserve the requested balance immediately. Admins approve the
   request, send the payout manually to the submitted account, then mark it
   paid. Rejecting a request or a user's cancellation returns the reserved
   balance. Payout details are visible only to the requester and admins.
9. Configure each future game's price and period under **Admin → Wallet**.
   The default example can be set to ₱1.00 per 30 minutes. Rates start
   inactive. Game backends should call
   `public.charge_game_period(user_id, game_key, session_id, period_number)`
   once per validated billing period; repeated calls for the same session
   period are idempotent. Call this from a trusted game server after checking
   the player's session, not before access is authorized. The function
   deducts one configured period at a time and fails if the balance is too
   low.

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
requests, PayMongo GCash subscription checkout, manual Maya game-wallet
top-ups and withdrawals, and admin pages for moderation, users, plans,
settings, wallet management, schools, categories, and announcements.

Manual requests do not process or confirm payments. Some items in the
original product brief remain future work, including username-based login, profile
editing controls for subscription-only avatars, destructive account deletion,
advanced analytics/charts, and complete CMS editing for every legal page.
