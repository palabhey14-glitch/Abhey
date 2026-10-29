# Entry Level Guidance: setup

Entry Level Guidance is AUD $80 per week, billed weekly, an ongoing
subscription. The site uses the Stripe link https://buy.stripe.com/28E14hg0N4iba5HdjL0Ny02
(`REWIRED_ENTRY_JOIN_URL` in `site/booking.js`).

## 1. Finish the Stripe link (Stripe dashboard)

1. Rename the product behind the link from "Premium 1 on 1 Coaching" to
   `Entry Level Guidance`, and replace its description (it currently reads as
   Premium) with: `Customised meal or macro plan, meal plan ebook, workout
   program in the Custom Rewired Coaching App, fortnightly check-ins and plan
   updates, coaching by email.` Clients see this at checkout and on receipts.
2. Payment Links, this link, After payment: redirect customers to
   `https://rewiredbyabhey.com/entry-welcome.html`
3. Settings, Customer emails: turn on emails for successful payments, so Stripe
   sends the receipt the welcome page mentions.

Test in Stripe test mode with card 4242 4242 4242 4242 if you want a dry run.

## 2. Netlify form notifications

New form `entry-level` (details sent before checkout). In Netlify, Forms, Form
notifications, add an email notification for it.

## 3. Cancellations and the refund

- Cancel: when a client emails after week four, open the subscription in Stripe,
  Cancel, "At the end of the current period".
- Stripe can't block an early cancellation itself, so cancel only once the
  fourth weekly payment has been taken.
- Eight-week satisfaction policy: refund the last four weekly payments
  (AUD $320) from the Payments page.

## 4. App access

Same as now: add the client in Supabase, then they sign in at /app/ with the
emailed code (needs the Resend SMTP setup to work for real clients).

## 5. Premium Coaching price

The site now shows AUD $2,249.99 for three months. Check the Premium Stripe link
(`REWIRED_JOIN_URL`) charges that amount.
