# Form emails

When you press **Send** in Forms, each client now also gets an email from
`coaching@abheyrewired.com` with a button that opens the form in their app.
The form still appears on their Home screen as before.

- Only forms you send with the **Send** button are emailed. Forms picked in
  **Add Client** are not emailed (the client gets your invite message instead).
- One email per sent copy. Pressing Send for someone who already has the form
  open doesn't email them again.
- If an email fails, the dashboard shows a red notice. The form is still in
  their app.
- Code: `netlify/functions/send-form-email.js`, called from `sendModal` in
  `site/app/js/forms-ui.js`. Test: `node netlify/test/send-form-email.test.js`.

## One-off setup (about 15 minutes)

### 1. Create a Resend account and verify the domain
1. Sign up at [resend.com](https://resend.com). The free plan covers 3,000 emails a month.
2. Open **Domains** → **Add Domain** → enter `abheyrewired.com`.
3. Resend shows a few DNS records (MX, TXT for SPF, TXT for DKIM). Add them
   where `abheyrewired.com` is managed (the company you bought the domain
   from, or Cloudflare if you moved it there).
4. Back in Resend, press **Verify**. It can take from a few minutes to a few
   hours. Emails won't send until it says **Verified**.

### 2. Create an API key
1. Resend → **API Keys** → **Create API Key**.
2. Permission: **Sending access**, domain: `abheyrewired.com`.
3. Copy the key (starts with `re_`). You only see it once.

### 3. Add it to Netlify
1. Netlify → your site → **Site configuration** → **Environment variables** → **Add a variable**.
2. Key: `RESEND_API_KEY`, value: the key from step 2.
3. Redeploy: **Deploys** → **Trigger deploy** → **Deploy site**.

Optional variables (you don't need these):
- `FORM_EMAIL_FROM`: sender, default `Rewired Coaching <coaching@abheyrewired.com>`.
- `COACH_NAME`: name used in the email, default `Abhey`.
- `APP_URL`: site address for the link, default Netlify's own site URL.

### 4. Also use Resend for sign-in codes (recommended)
Clients sign in with an emailed code, which Supabase sends. Supabase's built-in
sender only manages a few emails an hour. Use the same Resend account: see
step 5 of `docs/client-app-setup.md` (host `smtp.resend.com`, port `465`,
user `resend`, password = your Resend API key, sender `coaching@abheyrewired.com`).

### 5. Test it
Send a form to yourself (a test client using your own email). You should get
the email within a minute. If you see a red notice instead, it says why, for
example that the domain isn't verified yet.
