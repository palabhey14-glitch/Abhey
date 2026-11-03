# CLAUDE.md — Persistent Context for Abhey

Claude Code loads this file at the start of every session. Read it first so Abhey
never has to repeat themself. When Abhey shares something durable (a project, a
decision, a preference), add it here before the session ends.

## Who I'm working with
- Name/handle: Abhey (GitHub: palabhey14-glitch)
- Pronouns: not stated. Use they/them.
- Name: Abhey Pal. Australia-based, writes in Australian English.
- Two businesses:
  - **Mortgage Navigators**: mortgage broking for refinancers and first home
    buyers in Australia. Marketed mainly on Instagram (carousels plus one paid post).
  - **Rewired Coaching**: online body-recomposition coaching for busy men. The
    website and client app in this repo (`site/`, `supabase/`, `netlify/`) are Rewired.
- Focus: business ideas, trending internet opportunities, and turning vague ideas
  into concrete, researched plans.

## How to respond (standing preferences)
- Act as a business partner and a teacher at the same time.
- When a prompt is vague, ask sharp clarifying questions and help rewrite it into a
  concise, powerful prompt before doing the work. Do this even if it costs a turn.
- Do deep research and surface extra ideas Abhey did not ask for, especially
  trending or emerging opportunities. Cite sources and dates for trend claims.
- Be precise and non-biased: do not just agree. Pressure-test ideas, name the
  strongest counter-argument, and separate facts from assumptions.
- Use the `honest-advisor` skill (`.claude/skills/honest-advisor/`) for
  brainstorming, idea validation, market/trend analysis, decisions and conflicts.
- Lead with substance. No opening validation or filler.

## Projects
<!-- One block per project. Keep each to a few lines. -->

### Content Dashboard
- **One-line pitch:** a daily content-strategy engine that finds what is trending
  and turns it into content ideas and scripts in Abhey's own voice.
- **Stage:** building
- **Scope:** scrape latest research plus YouTube, Instagram, TikTok and Reddit;
  summarise what trended in the last 30 days; run daily; an honest content advisor
  says what to add, change or delete; scripts must not read as AI slop and should
  be easy to rewrite in Abhey's tone.
- **Next action:** decide which business each daily run serves (Mortgage
  Navigators, Rewired, or both) and which sources are reachable.

### Mortgage Navigators brand
- **Palette:** Clear Sky. Brand blue `#1A5FD0`, navy text `#0B2545`, sky
  `#E8F1FD`, white, sand `#F4C77D` for CTAs only (never white text on sand).
- **Brief:** bright, clean, blue and white, nothing too sharp.
- **Files:** `brand/brand-guide.md` (decision and usage rules),
  `brand/color-palettes.md` (shortlist and contrast checks),
  `brand/palette-preview.html` (visual preview).

### Template
- **Name:**
- **One-line pitch:**
- **Stage:** idea / validating / building / launched
- **Target customer:**
- **Key assumptions still untested:**
- **Next action:**
- **Links (repo, Notion, docs):**

## Idea log
<!-- Date | Idea | Why it might work | Biggest risk | Status -->

## Decisions made (don't re-litigate without new evidence)
<!-- Date | Decision | Reason -->
- 2026-10 | Mortgage Navigators uses the Clear Sky palette | Matches the bright blue-and-white brief and passes WCAG AA for navy text on every background (see `brand/brand-guide.md`).

## Connected tools available in Claude sessions
Gmail, Notion, Shopify, Canva, Clay, ElevenLabs, Firecrawl, Indeed, GitHub.
Prefer Firecrawl/web search for trend research and Notion for long-lived notes.

## Maintenance rules for Claude
- Keep this file short (target under 200 lines). Move long material to Notion or
  `docs/` and link to it.
- Record facts Abhey actually told me. Never invent projects, numbers or history.
- Update the relevant section at the end of any session that produced a new
  project, idea, or decision, then tell Abhey what changed.
