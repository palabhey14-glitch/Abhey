# Prospects and lead forms

Prospects appears between Clients and Check-ins in the existing coach navigation.
The feature uses the current Rewired styles, colours and logo.

Coaches can add/edit contact details, deal values, sales stages, close percentages,
tags and private notes. The list supports search, stage/tag filters, configurable
columns, pagination, bulk stage changes and recoverable prospect archiving.
Days in stage reset when a prospect's stage changes.

Converting a new prospect opens the existing Add Client workflow with their details
prefilled. A matching existing client instead gets a link-only confirmation: only
the prospect record changes. It does not overwrite that client's plans or logs.

Lead Forms supports contact fields plus short/long answers, numeric answers and
single/multiple choice questions. Questions can be reordered and made required.
Saving a draft leaves the published form unchanged. Publishing updates the same
shareable link. Responses create prospects and preserve the submitted questions
and answers, even after the form changes. Forms can be paused or archived.

## Activation

This feature was deployed on 30 October 2026 after approval. The live app assets,
public lead-form endpoint and new database tables were verified. Armin's existing
client records matched before and after deployment.

Migration `20261029232718_prospects_and_lead_forms.sql` was applied before the app
assets and `netlify/functions/lead-forms.js` were deployed. It only adds prospect
and form tables, policies and functions; it does not update existing client,
training or log rows.

The public endpoint uses the existing server Supabase configuration. It returns
only published form fields, validates submissions and stores a hash of the
connection IP for an atomic five-per-hour limit. Anonymous/client roles cannot
read prospect records or invoke the submission database function directly.
Submission request IDs prevent duplicate prospect records on retry.

## Local verification

- `node --test site/app/js/*.test.js netlify/test/lead-forms.test.js` — 36 passing checks.
- Local PGlite migration checks cover coach/client/anonymous access, service-only
  submissions, rate limits, retries, paused forms and published schema versions.
- The full application preview checks cover navigation, pagination, search,
  add/edit, new/existing client conversion, draft/publish, public submission and
  viewing responses. Existing client data is compared before/after conversion.
- Desktop browser checks cover the prospect table, add/edit dialog and form builder.

The standalone previews use fictional sample data and a local request adapter.
They do not create clients or prospects in production.

## Lead forms from Content > Forms (2026-11-05)

New Lead Form has a "Start from" picker listing the coach's own forms (their
published version, else the draft) and the built-in Forms templates. The copy
is a new lead form draft; the original form is never changed. Sections become
page breaks, "Other" becomes an option, and show-if rules (lead forms have none)
leave those questions optional with a note saying when to answer. The builder
lists anything that changed. Lead forms now hold up to 40 items.

Each completed lead form is also posted to the Netlify form
`lead-form-submitted` (declared in `site/app/index.html`) with the contact
details and every answer as readable text. Netlify's form notification emails
it to the coach. One-off setup in Netlify: Forms, Form notifications, Add
notification, Email, form `lead-form-submitted`, coaching@abheyrewired.com.

The Prospects menu item shows how many prospects are at "New lead".

Fixed at the same time: the public lead page called `fetch` unbound, which
browsers refuse ("Illegal invocation"), and the scale question's hidden radio
inputs stretched the page wider than a phone.

Prospects has a third tab, Completed forms (#prospects/completed): every lead
form response, newest first, as "<form> · Completed by <name> · <email>", with
a filter by form. Each opens at #prospects/completed/<id> in the same layout the
prospect filled in (all pages shown, read-only, files as download buttons),
with Print, Open prospect and Convert to client. The email notice links here.

Browser test: `tests/e2e/lead-from-forms.js` (16 checks).
