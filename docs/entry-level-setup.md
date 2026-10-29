# Entry Level Guidance: setup

Entry Level Guidance (Monthly Coaching) is AUD $380 per month, an ongoing
subscription. The site is built; these steps connect the payment.

## 1. Create the Stripe subscription (Stripe dashboard)

1. Product catalogue, Add product. Name: `Entry Level Guidance (Monthly Coaching)`.
   Description: `Customised meal or macro plan, meal plan ebook, workout program in
   the Custom Rewired Coaching App, fortnightly check-ins and plan updates,
   coaching by email.`
2. Price: Recurring, AUD 380.00, billing period Monthly.
3. Payment Links, New, pick that price. Turn on collecting the customer's email.
4. After payment: redirect customers to your website,
   `https://rewiredbyabhey.com/entry-welcome.html`
5. Settings, Customer emails: turn on emails for successful payments, so Stripe
   sends the receipt the welcome page mentions.
6. Copy the link (https://buy.stripe.com/...) into `site/booking.js` as
   `REWIRED_ENTRY_JOIN_URL`. Until then the Subscribe button opens an email to Abhey.

Test first in Stripe test mode with card 4242 4242 4242 4242, then repeat in live mode.

## 2. Netlify form notifications

New form `entry-level` (details sent before checkout). In Netlify, Forms, Form
notifications, add an email notification for it.

## 3. Cancellations and the refund

- Cancel: when a client emails after week four, open the subscription in Stripe,
  Cancel, "At the end of the current period".
- Eight-week satisfaction policy: refund the most recent monthly payment
  (AUD $380) from the Payments page.

## 4. App access

Same as now: add the client in Supabase, then they sign in at /app/ with the
emailed code (needs the Resend SMTP setup to work for real clients).

## 5. Premium Coaching price

The site now shows AUD $2,249.99 for three months. Check the Premium Stripe link
(`REWIRED_JOIN_URL`) charges that amount.
