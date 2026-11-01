# Website copy audit and rewrite (2026-11-01)

Branch `claude/project-thread-d2ff4n`, built on the live Studio Light site (PR #31). Website only. The client app (`/app/`), coach dashboard, Terms and Privacy were not touched. No prices added anywhere.

## 1. Main weaknesses in the original copy

- **Hero could belong to any coach.** "Your next chapter, rewired." says nothing about who it's for or what changes. The specific stuff (skinny fat, cultural food, travel) sat lower down.
- **The best recognition content was buried and written as fake quotes.** The "You might recognise some of this" section came after the app, process and check-in sections, and put words in the reader's mouth ("I start every Monday...").
- **No reframe.** The page never explained *why* past attempts failed (dieting a muscle problem, plans built for perfect weeks, nobody adjusting) before presenting the method. The best version of that idea was hidden in the letter.
- **Features listed, consequences missing.** "Train anywhere", "Eat your food", "What's included" were mostly lists of parts.
- **Repetition.** "Every log reaches me, I adjust weekly" (stream section), "Check-ins that change your plan" (dark section) and the letter all made the same point three times.
- **Process was vague.** No clear step from apply → call → kickoff → weekly rhythm → week 8, and nothing about what the client has to do.
- **No fit filter on the site.** Your offer PDF had a strong "This is not for you if" list. The site had none.
- **Small trust leaks.** "Most replies within 12 hours" contradicted "replies within 12 hours". The nav said "Pricing" on a page with no prices. The FAQ said "My personal WhatsApp" mid-sentence. "Eat with your family" slipped back in on the pricing page. The thanks page said "Strategy Session" when everything else says "Strategy Call". The Resources page headline was "Under construction."
- **Centred headings sat off-centre** on desktop (a CSS specificity bug). Fixed.

## 2. Positioning

> For busy men who look fine in a shirt but soft without it, and who keep starting over because work, travel and the food they grew up on never fit the plan, Rewired Premium Coaching is one-to-one body recomposition with Abhey. Training and meals are built around the client's real week and real food, with gym, home and hotel versions ready, and Abhey personally adjusts the plan every week from what was logged. Unlike cut-focused diets, templates and apps that stay the same until you quit, it builds muscle while losing fat and changes as your life does.

## 3. Ideal client

A man, roughly 25 to 40, working long hours, often travelling. Slim in clothes, soft without them ("skinny fat"). Has tried diets, apps and programs, and they worked until the first busy week. Won't give up the food he grew up on (any cuisine, vegetarian, vegan, halal or pescatarian). Wants someone experienced to make the decisions so he can just do them.

## 4. Value proposition

**Lose the softness. Keep the food you grew up on.** One-to-one coaching that builds muscle and takes off fat at the same time, around your job, your travel and the way you already eat, adjusted every week by Abhey personally.

## 5. Message pillars

1. **Muscle first, so the shape changes.** Skinny fat is usually a muscle gap, so eating less on its own leaves the same shape.
2. **Your food stays.** Plans start from what you already eat, with protein swaps.
3. **A plan B for every week.** Gym, home and hotel versions are ready in advance, so a disrupted week is shorter, not lost.
4. **Adjusted weekly, by Abhey.** Not an assistant, not a chatbot, not a template.
5. **Honest about the work.** Three or four sessions, honest logging, one check-in a week.

## 6. Differentiators (that competitors can't easily copy-paste)

- The specific person: skinny fat, busy, travelling, attached to his food.
- The diagnosis: the plans failed, not the man (built for an empty calendar and a different kitchen, never adjusted).
- Pre-built gym/home/hotel versions of every session.
- Nutrition starts from cultural food, every dietary form, with protein swaps.
- Abhey personally reviews every check-in, plus a weekly voice note, a fortnightly video check-in and personal WhatsApp with 12-hour replies, 7 days a week.
- 15 years of coaching and living body recomposition.
- Week 8 Progress Promise (extra coaching, not a refund).
- Clear "not a fit" list.

Claims avoided because every coach makes them: "personalised plans", "sustainable results", "holistic", "evidence-based", "no quick fixes", "best version of yourself".

## 7. Page-by-page changes

### Home (`site/index.html`)
New order: Hero → hook (your pick, unchanged) → **Sound familiar?** → **Why it hasn't stuck** → How I coach → App → **How it works** → Check-in example → What's included → **Is this for you?** → A note from me → Week 8 Promise → Final CTA.

- **Hero.** Headline stays "Your next chapter, rewired." (Abhey chose to keep it on 2026-11-01). The lead says who it's for, the outcome, the approach and 15 years. The CTA is "Book a free Strategy Call", with Apply Now kept. A new line under the buttons reads "A 30-minute call with me, not a sales team. Nothing is paid on the call."
- **Hook.** "Skinny fat at 30 isn't a life sentence..." stays exactly as you chose it.
- **Sound familiar? (new).** Uses the same pattern as the reference screenshot: a tag, a headline ("You've started over more times than you'd like to count."), a short paragraph, then 6 white cards with highlighted titles. The cards are Slim in a shirt / Strong on Monday, gone by Thursday / The diet had no room for your food / Travel breaks the routine / You know plenty, it hasn't added up / Nobody changed the plan. These replace the old fake-quote section.
- **Why it hasn't stuck (new).** Headline is "It probably wasn't your discipline. The plan was written for a quieter week and a different kitchen." It has three reasons: eating less made you smaller, not leaner; the plan assumed nothing would go wrong; nobody adjusted it.
- **How I coach.** Now four tiles, each stating what the feature does for you: muscle first, food stays, plan B, adjusted every week by me. The fix reads "Reply time on my personal WhatsApp" instead of "Most replies".
- **App.** "One place for the plan and the proof." Adds that only you and Abhey can see the photos.
- **How it works (new).** Five steps: apply or book, free Strategy Call, kickoff and setup, weekly rhythm, then week 8 and after. Each step ends with "Your part." The old "Every log reaches me" stream section is removed because it repeated the check-in section.
- **What's included.** The labels now describe outcomes: training that fits your week, food you actually eat, feedback every week, help when you need it, decisions made from evidence, a plan for afterwards.
- **Is this for you? (new).** A good fit / not the right fit list, mostly taken from your offer PDF.
- **A note from me.** Your letter is kept word for word. Added an eyebrow ("Who's coaching you") and an honest proof line pointing to Instagram, because the site has no client photos.
- **Week 8 Promise.** Unchanged, with "Results vary from person to person" added to the small print.
- **Final CTA.** Says what happens on the call, that it's a fit check both ways, and that nothing is paid on the call. It links to the FAQ.
- **Meta.** New title and description.

### Coaching page (`site/pricing.html`, nav label now "Coaching")
- The H1 is "Exactly what you get." The lead says what it is, who it's built around, and why the price is shared on the call.
- Card copy now says "Nothing is paid on the call and there's no obligation".
- The included list explains what each part is for. The "family" wording is removed. A new **Your part** row covers what you'll be asked to do.
- The Rewired Coaching intro now says who the weekly option suits instead of calling it "more accessible".
- The application intro adds "applying doesn't commit you to anything".
- New title and meta description.

### FAQ (`site/faq.html`)
- 6 new questions at the top: What happens after I apply? Is the price shown before the call? How much time does it take each week? How long is the commitment? I travel or my hours change every week. What happens when I have a bad week?
- Your 11 answers are kept, with colons removed, "My personal" fixed, and "Pricing page" changed to "Coaching page".
- New lead and meta.

### Apply (`site/apply.html`)
- The H1 is "Tell me where you're starting from." The lead says it takes about four minutes, is read by you, is free and carries no commitment.
- The three steps now say what is asked, that health details are optional, that you reply on WhatsApp, that the investment is shared on the call and that nothing is paid there.
- The form fields and form names are unchanged.

### Other
- `thanks.html` is now consistent ("Strategy Call", no commitment, first-person).
- `resources.html` H1 is "Free tools, coming soon." with a new meta.
- `entry-level.html` has a clearer title.
- The nav label "Pricing" changed to "Coaching" on every page.

## 8. Claims needing your check

1. "I've been coaching body recomposition for 15 years." This comes from your FAQ and hook, so please confirm the wording.
2. Not-a-fit list: cheapest plan, unwilling to log food or check in weekly, and contest prep come from your offer PDF. "Crash diet", "needs medical treatment" and "under 18" are my additions.
3. Step 2 says "what I'd change first". The final CTA says "If it isn't [a fit], I'll tell you, and you'll still leave knowing what I'd change first." Please confirm that's how you run the call.
4. "A 30-minute call with me, not a sales team."
5. Payment: the FAQ and Terms say "instalments". Earlier you said "one-off or 3 payments". Which is right?
6. "Fortnightly video check-in" and "weekly voice note" match the old site and your PDF (Loom). Please confirm they're still offered.

## 9. Missing proof that would help most

- 2 or 3 client stories with permission (starting point, constraint, what changed, result, timeframe). Dean is the first candidate after his 8 weeks.
- Your own recomposition story with dates (you said 15 years of living it). A short timeline would be the strongest trust signal on the page.
- Any qualifications or certifications (none are on the site).
- A short video of you explaining the method. It would give visitors your face and voice in the same place.

## 10. Questions for you

1. Do you hold any coaching or nutrition qualifications you want named?
2. Can I show your own before and after, or a short version of your story?
3. How fast do you reply to applications? (The site doesn't promise a response time yet.)
4. Should the hero say the age range (for example "men in their late 20s and 30s"), or keep it to "busy men"?
5. Should Resources stay in the top menu while it's empty, or move to the footer until it has content?
6. Payment wording: instalments only, or "one payment or instalments"?

## 11. Files changed

- `site/index.html`
- `site/pricing.html`
- `site/faq.html`
- `site/apply.html`
- `site/thanks.html`
- `site/resources.html`
- `site/entry-level.html`
- `site/entry-welcome.html`, `site/privacy.html`, `site/terms.html` (nav label only)
- `site/rw/copy.css` (new)

## 12. Checks

- Rendered at 1280px and 390px in Chromium: no horizontal overflow on Home, Coaching, FAQ or Apply, and no JavaScript errors.
- Heading order is still one H1 per page with H2 and H3 below. The new cards use `article`/`h3`, the lists are real lists, and the highlight uses `mark`.
- Forms, Netlify form names, Calendly `data-book` links, the Stripe flow and the legal pages are unchanged.
- Rule checks: no prices, no "12 week", no colons or em dashes in the new copy, no testimonials, no "orange", and the FAQ stays off the home page.

## 13. Before and after

| Section | Before | After |
|---|---|---|
| Hero H1 | Your next chapter, rewired. | Unchanged (Abhey's choice) |
| Hero lead | I coach busy men who are tired of starting over... | One-to-one training and nutrition coaching for busy men who look fine in a shirt and soft without it... I've been coaching body recomposition for 15 years. |
| Under CTA | (nothing) | A 30-minute call with me, not a sales team. Nothing is paid on the call. |
| Recognition | "You might recognise some of this", 4 fake quotes, near the bottom | "Sound familiar?", 6 situation cards, straight after the hook |
| Reframe | (none) | It probably wasn't your discipline. The plan was written for a quieter week and a different kitchen. |
| Process | Visual log stream, no steps | 5 steps, each ending with "Your part." |
| Fit | (none) | A good fit if / Not the right fit if |
| Final CTA | Start with a free 30-minute call. | Same headline, plus what happens on the call, an honest fit check, and nothing paid on the call |
| Pricing H1 | Invest in your next chapter. | Exactly what you get. |
| Apply H1 | Apply now. | Tell me where you're starting from. |
