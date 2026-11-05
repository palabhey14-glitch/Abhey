# Form emails

When you press **Send** in Forms, each client now also gets an email from
`coaching@abheyrewired.com` with a button that opens the form in their app.
The form still appears on their Home screen as before. Emails go out through
your Google Workspace account, so they also show in its **Sent** folder, and
replies come straight back to that inbox.

- Only forms you send with the **Send** button are emailed. Forms picked in
  **Add Client** are not emailed (the client gets your invite message instead).
- One email per sent copy. Pressing Send for someone who already has the form
  open doesn't email them again.
- If an email fails, the dashboard shows a red notice saying why. The form is
  still in their app.
- Google Workspace allows about 2,000 emails a day from one account.
- Code: `netlify/functions/send-form-email.js` and `netlify/lib/smtp.js`,
  called from `sendModal` in `site/app/js/forms-ui.js`.
  Test: `node netlify/test/send-form-email.test.js`.

## One-off setup (about 10 minutes)

### 1. Turn on 2-Step Verification for coaching@abheyrewired.com
Google only gives app passwords to accounts with 2-Step Verification.
1. Sign in as coaching@abheyrewired.com and open
   [myaccount.google.com/security](https://myaccount.google.com/security).
2. Turn on **2-Step Verification** if it isn't on already.

If Google says this isn't allowed, sign in to
[admin.google.com](https://admin.google.com) as the Workspace admin →
**Security** → **Authentication** → **2-step verification** → tick
**Allow users to turn on 2-Step Verification** → Save, then try again.

### 2. Create an app password
1. Still signed in as coaching@abheyrewired.com, open
   [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords).
2. Name it `Rewired dashboard` and press **Create**.
3. Copy the 16-letter password Google shows. You only see it once.
   Spaces in it don't matter.

### 3. Add it to Netlify
1. Netlify → your site → **Site configuration** → **Environment variables** → **Add a variable**.
2. Key: `SMTP_PASSWORD`, value: the app password from step 2.
3. Redeploy: **Deploys** → **Trigger deploy** → **Deploy site**.

Optional variables (you don't need these):
- `SMTP_USER`: the Google account to send from, default `coaching@abheyrewired.com`.
- `FORM_EMAIL_FROM`: sender shown to clients, default `Rewired Coaching <coaching@abheyrewired.com>`.
- `COACH_NAME`: name used in the email, default `Abhey`.
- `APP_URL`: site address for the link, default Netlify's own site URL.

### 4. Also use it for sign-in codes (recommended)
Clients sign in with an emailed code, which Supabase sends. Supabase's built-in
sender only manages a few emails an hour, so codes can arrive late or not at
all. Send them through the same Google account instead:
1. Supabase → **Project Settings** → **Authentication** → **SMTP Settings** → turn on **Custom SMTP**.
2. Host `smtp.gmail.com`, port `465`, username `coaching@abheyrewired.com`,
   password = the same app password, sender email `coaching@abheyrewired.com`,
   sender name `Rewired Coaching`. Save.

### 5. Test it
Send a form to a test client that uses an email address you can check. The
email should arrive within a minute. If you see a red notice instead, it says
why, for example that Google refused the sign-in (wrong or missing app
password).
