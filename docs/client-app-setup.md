# Rewired client app and website: setup guide

Plain-language steps to take this from code to a live website and app.
Allow about 2 hours the first time. You only do this once.

## What you're setting up

| Piece | What it does | Cost |
| --- | --- | --- |
| **Website** (`site/index.html`) | Your offer page with an application form | Free |
| **Client app** (`site/app/`) | Where clients log daily numbers, weekly check-ins, measurements and photos. You see every client from the coach view | Free |
| **Supabase** | The database behind the app: logins, numbers and private photo storage | Free to start; USD $25/month Pro later for daily backups |
| **Netlify** | Puts the website and app on the internet from this GitHub repo | Free |
| **Email sender** (Resend or Brevo) | Sends clients their sign-in codes reliably | Free tier |

The app replaces the Google Sheets client workbook. It follows the same
structure: Start Here → **Profile**, Weekly Tracker → **Today**, Check-In →
**Check-in**, measurements and photos → **Check-in** and **Photos**,
Dashboard → **Progress**. Training and Supplements are available. Meal plans
and food logging need the nutrition update in step 2c.

---

## Part 1: Supabase (the database)

### 1. Create the project
1. Go to [supabase.com](https://supabase.com) and sign up (using GitHub is easiest).
2. Click **New project**.
   - Name: `rewired-coaching`
   - Database password: click **Generate**, then save it in your password manager.
   - Region: **Sydney (ap-southeast-2)**. This keeps client data in Australia.
3. Wait about 2 minutes while it builds.

### 2. Create the tables and security rules
1. In the left menu open **SQL Editor** → **New query**.
2. Open [`supabase/schema.sql`](../supabase/schema.sql) in GitHub, click **Copy raw file**, paste it in, and click **Run**.
3. You should see "Success. No rows returned". This creates every table, the
   rule that clients only ever see their own data, and the private
   `progress-photos` storage folder.

### 2b. Already set up before 25 October 2026? Run the habit tracker update
The habit tracker (water, sleep and clients' own habits) needs two new tables.
If you ran `schema.sql` before this date, open **SQL Editor** → **New query**,
paste [`supabase/migrations/2026-10-25-habits.sql`](../supabase/migrations/2026-10-25-habits.sql)
and click **Run**. It is safe to run twice. Until you do, the app still works;
water, sleep and own habits just stay hidden.

Habit colours (green, orange, red) are set in one place, `HABIT_BANDS` at the
bottom of `site/app/js/stats.js`.

### 2c. Run the nutrition update (food database, meal plans, food logging)
Open **SQL Editor** → **New query**, paste
[`supabase/migrations/2026-10-25-nutrition.sql`](../supabase/migrations/2026-10-25-nutrition.sql)
and click **Run**. It is safe to run twice. Until you do, the coach's Meal plan
and Food log pages show a reminder and clients log totals in the check-in.

Then load the food database. The food table starts empty; see
[`tools/food-import/README.md`](../tools/food-import/README.md). The quickest
start is the bundled sample (about 6,900 foods, not complete coverage):

```sh
SUPABASE_URL=https://<project>.supabase.co SUPABASE_SERVICE_ROLE_KEY=<service key> \
  node tools/food-import/import.js sample
```

The service role key bypasses all security rules. Keep it on your computer and
in Netlify's environment settings only; never put it in `site/` or in git.

How it works:
- **Coach → Foods & plans**: meal plan templates, recipes (typed in or imported
  from one recipe link), the food database, and a queue of foods to check.
- **Coach → a client → Meal plan**: assign a template or daily macro targets
  from a start date. Every assignment is a new version; earlier versions and
  everything logged against them stay in **History**, with a change log.
- **Coach → a client → Food log**: planned vs eaten per meal, extras,
  missing-value and self-reported flags, and the last 7 days.
- **Client → Meal plan tab**: each meal has Ate as planned, Something
  different, Different amount and Skipped, plus Change and Undo. Extras and
  snacks are logged below. Clients on macro targets get a normal food log.
  The day's totals fill the daily check-in automatically.

### 3. Only let people you invite sign in
1. Open **Authentication** → **Sign In / Providers** (may be called "Providers").
2. Under **Email**: keep it **enabled**, and turn **Allow new users to sign up** **off**.
   Now only people you add can log in.

### 4. Make the sign-in email send a code
Clients sign in with a 6-digit code instead of a password. A code works
inside the home-screen app; a link would open Safari instead.

1. Open **Authentication** → **Emails** (or "Email Templates") → **Magic Link**.
2. Subject: `Your Rewired sign-in code`
3. Replace the message with:

   ```html
   <h2>Your Rewired sign-in code</h2>
   <p>Enter this code in the app: <strong style="font-size:24px">{{ .Token }}</strong></p>
   <p>It expires in 1 hour. If you didn't ask for it, ignore this email.</p>
   ```
4. Save.

### 5. Set up a proper email sender (do before launch)
Supabase's built-in email only sends a few emails an hour and is meant for
testing. Before clients rely on it:

1. Sign up at [resend.com](https://resend.com) (free for 3,000 emails a month) and verify your domain.
2. Create an SMTP password / API key in Resend.
3. In Supabase open **Project Settings** → **Authentication** → **SMTP Settings**,
   turn on **Custom SMTP**, and enter Resend's details
   (host `smtp.resend.com`, port `465`, user `resend`, password = your Resend API key,
   sender e.g. `coach@yourdomain.com`, name `Rewired Coaching`).

### 6. Create your coach account
1. Open **Authentication** → **Users** → **Add user** → **Create new user**.
2. Enter your email, tick **Auto confirm user**, and create it.
3. Open **SQL Editor** → **New query**, run this (with your email):

   ```sql
   update public.profiles set role = 'coach' where email = 'you@example.com';
   ```
   You should see "1 row affected". That account now sees the coach view.

### 7. Copy the two connection values
1. Open **Project Settings** → **API** (or **Data API** / **API Keys**).
2. Copy the **Project URL** and the **anon** / **publishable** key.
3. Put them in [`site/app/config.js`](../site/app/config.js), or send both to Claude to add.

> The anon / publishable key is safe in a web page: the security rules decide
> what each person sees. **Never** share or paste the **service_role** /
> **secret** key anywhere, including chat. It bypasses every rule.

### 8. Set the site address (after Part 2)
**Authentication** → **URL Configuration** → **Site URL**: `https://yourdomain.com/app/`

---

## Part 2: Netlify (putting it online)

1. Sign up at [netlify.com](https://www.netlify.com) with GitHub.
2. **Add new site** → **Import an existing project** → **GitHub** → choose
   `palabhey14-glitch/Abhey`. Pick the branch the app was merged into.
3. Netlify reads `netlify.toml` and publishes the `site` folder. There's no build
   command, so leave that blank. Click **Deploy**.
4. You'll get an address like `rewired-coaching.netlify.app`. The website is at
   `/` and the client app at `/app/`.
5. **Your domain:** **Domain management** → **Add a domain** → follow the DNS
   steps from your domain provider. HTTPS turns on automatically.
6. **Application emails:** **Forms** → turn on form detection, then
   **Form notifications** → **Add notification** → **Email** → your email.
   Each application then lands in your inbox. The free plan covers 100 a month.
7. **Server functions (barcode lookup, recipe import):** **Site configuration** →
   **Environment variables** → add `SUPABASE_URL`, `SUPABASE_ANON_KEY` (the same
   two values as `site/app/config.js`) and `SUPABASE_SERVICE_ROLE_KEY`
   (Supabase → **Project Settings** → **API keys** → service_role). Then
   **Deploys** → **Trigger deploy**. Without these, barcode lookup and recipe
   links say they are not switched on; everything else works.

## Part 3: Before you launch

- [x] **Booking link:** the landing page and [`site/thanks.html`](../site/thanks.html)
      point to `https://calendly.com/coaching-abheyrewired/30min`. Before launch,
      rename the event to Rewired Strategy Session, confirm Google Meet as the
      location, and book a test slot to check the invitation.
- [ ] **Legal pages:** review [`site/privacy.html`](../site/privacy.html) and
      [`site/terms.html`](../site/terms.html) against actual business practices.
- [ ] **Test as a client:** add a second email of yours (Gmail lets you use
      `you+test@gmail.com`) as a user. On your phone, open `/app/`, sign in with
      the code, agree to the privacy notice, fill in the profile, log a day, send
      a check-in and upload a photo.
- [ ] **Install it:** iPhone: Safari → Share → **Add to Home Screen**.
      Android: Chrome → ⋮ → **Install app**.
- [ ] **Check the coach view:** sign in with your coach email on another device.
      You should see the test client, their numbers and photo. Set their targets
      and week 1 macros, and reply to the check-in.
- [ ] **Turn on two-factor login** for GitHub, Supabase and Netlify.

## Adding a client (every new client)

1. Supabase → **Authentication** → **Users** → **Add user** → **Create new user** →
   their email, **Auto confirm user** ticked.
2. Send them the app link (`https://yourdomain.com/app/`) and the install steps above.
3. After the kickoff call, open them in the app (coach view) → **Targets**:
   set the start date (a Monday), training days, goals and week 1 macros.

## Removing a client's data (if they ask)

1. Supabase → **Authentication** → **Users** → find them → **Delete user**.
   This deletes their profile, logs, check-ins, measurements and photo records.
2. Supabase → **Storage** → `progress-photos` → delete the folder named with their user ID.

## Privacy and health data: the short version

This is general information, not legal advice.

- **Weight, measurements, injuries and body photos are health information**,
  which the Privacy Act treats as "sensitive". Small businesses under $3M
  turnover are usually exempt from the Act, **but not if they provide a health
  service and hold health information**. Whether fitness coaching counts is a
  grey area, so the safe path is to act as if the Act applies. The app is built
  that way:
  - **Consent:** clients must tick a consent box before they can log anything,
    and the time is saved.
  - **Security:** clients can only see their own data, photos are in private
    storage with links that expire after an hour, and data stays in the Sydney region.
  - **Access and deletion:** steps are above.
- **Get the privacy policy reviewed** by a lawyer or a service like LawPath
  before launch. A fixed-fee review is cheap insurance.
- **Never use a client's photos or results in marketing** without separate
  written permission.
- If data is ever exposed (for example a lost laptop that was signed in as
  coach), the Notifiable Data Breaches scheme may require you to tell the
  client and the OAIC.

## Costs and limits to know

- **Supabase free plan:** 500 MB database and 1 GB of photo storage. Photos are
  shrunk to about 300 KB, so that's roughly 80 clients' worth of 12-week photos.
- **Free projects pause after a week with no activity.** Once clients log daily,
  this won't happen. If it pauses before launch, click **Restore** in the dashboard.
- **Backups:** the free plan has no daily backups. Upgrade to **Pro (USD $25/month)**
  once you have paying clients. Losing a client's 12 weeks of data would hurt
  more than the fee.

## Not included yet (next steps)

- **Training program and session logging** (the Training tab: sets, reps, RIR, weights).
- **Meal plan and supplements** (the Meal Plan and Supplements tabs). For now,
  send these as a PDF or keep them in the workbook.
- **Reminders** (push notifications or a daily email nudge to log).
- **Payments inside the app.** Use a Stripe Payment Link after the call.

## For developers

- Static files, no build step. `site/` is what Netlify publishes.
- `site/app/js/stats.js` holds the workbook formulas (weekly averages,
  adherence, progress to goal). Test with `node site/app/js/stats.test.js`.
- `supabase/tests/` runs the schema and its security rules against a plain
  Postgres with stand-ins for Supabase's `auth` and `storage` schemas:

  ```sh
  createdb rtest
  psql -d rtest -v ON_ERROR_STOP=1 -f supabase/tests/supabase_stub.sql
  psql -d rtest -v ON_ERROR_STOP=1 -f supabase/schema.sql
  psql -d rtest -f supabase/tests/rls_test.sql   # read the "expect" comments
  ```
- `supabase-js` is vendored at `site/app/vendor/supabase-2.117.2.js` so the app
  works offline from the home screen.
