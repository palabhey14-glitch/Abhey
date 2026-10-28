# Rewired Coaching by Abhey: Stubborn Belly Check

Owner: Abhey Pal. Brand: Rewired Coaching with Abhey Pal (rewiredbyabhey.com). Online fitness coaching, run through Instagram.
Keep this brand separate from his mortgage broking business. Do not mix their branding or copy.

## Goal
Lead magnet for one audience: busy men who have lost weight but are not happy with their belly.
Flow: Instagram "comment BELLY" -> quiz -> name and email -> result (3 checks) -> free call CTA.
Name and email are required before the result. Details are emailed to coaching@abheyrewired.com through a Netlify form named `belly-check`.

## How the page works
- One HTML file, `src/quiz.html`. Edit that, then `sh tools/belly-check/build.sh`. Never hand-edit `site/belly-check/index.html`.
- Steps: intro, 12 questions (safety gate first, then 11 scored), name and email step, result.
- `LEAD_MODE`: "preview" sends nothing, "netlify" posts the form. `build.sh` sets "netlify".
- Netlify needs the hidden static `<form name="belly-check" data-netlify="true">` in the page. Do not remove it. Field names must match: name, email, priority, answers, bot-field.
- Optional Kit copy: set `EMAIL_ENDPOINT` to the Kit form subscribe URL (`https://app.kit.com/forms/<ID>/subscriptions`). Create Kit custom fields `last_name` and `belly_priority` first. Kit posts use no-cors, so success cannot be verified.
- Scoring is in the `// BEGIN LOGIC ... // END LOGIC` block: CHECKS, GATE, QUESTIONS, ALL, `score(ans)`, `waistMessage(cm)`, `nextStep`, `validateLead`, `priorityLabel`.

## Result rules (do not change without asking)
- Per-check percent = points / max. Status: below 0.2 "ok", below 0.5 "tighten", else "fix". Top check = highest percent.
- Gate answer "yes" (red-flag symptom): "Book a GP visit" message, no checks, no CTA, and NO name/email gate.
- Very-low-eating answer (`low:true`): "Do not cut calories further." No coaching CTA.
- Top check below 0.2: "Not yet. Your basics look solid."
- Otherwise: "Not yet. Start with <short name>."
- Waist box is optional, adult-men thresholds: below 94 cm, 94 to 101.9, 102 or more.
- This is general education, not medical advice. Keep the fine-print disclaimer.

## Brand tokens (from the live site)
- Colours: paper #fdfbf7, navy ink #0b2545, navy-2 #071a35, navy-3 #12305a, blue #2444f9, sand #f4c77d, sand-ink #9a6a1f, sky #e8f1fd, cloud #f6f8fc, line #dde4ef, ink-2 #4f5d72, hit green #1f9d63
- Fonts: Newsreader (headings, weight about 450, italic sand emphasis word), Source Sans 3 (body), Montserrat (wordmark), Caveat (handwriting accent)
- Buttons: navy, white text, 8px radius, weight 600
- Logo: blue rounded square "R." with "Rewired Coaching" and "WITH ABHEY PAL" beneath
- Tone: direct and personal, aimed at busy men

## Copy rules
- No em dashes. Plain, direct sentences, one idea each.
- Before writing new copy, ask Abhey whether to follow his "vibe-coded tells" style guide (no "not X but Y", no triplets, no rhetorical-question openers, no invented claims).
- Test the page at 390px width and in light and dark mode.

## Open decisions
- Booking link is https://calendly.com/coaching-abheyrewired/30min, taken from a site summary. Confirm it works.
- CTA: "Book a free 30-minute call" vs "Apply Now" (/apply).
- Kit: which form and what the sign-up delivers (optional).
- Whether branding has changed since the site went live.
- Netlify email notification still has to be switched on in the dashboard.

## Status (2026-10-28)
Added to the main site at /belly-check/ (PRIVACY_URL set to /privacy.html). Preview: https://claude.ai/artifact/BWkBVWNuX883eKmDW2TXNQ (private, sends nothing).
