# Rewired Coaching by Abhey: Stubborn Belly Check

A 5-minute lead-magnet quiz for busy men who have lost weight but are not happy with their belly.
Instagram hook: comment BELLY, get the 3 things to check before cutting more calories.

## Where it lives
Live at https://rewiredbyabhey.com/belly-check/ as part of the main site (no separate Netlify site).

## Files
- `src/quiz.html` source of truth (single self-contained page, no framework)
- `build.sh` wraps it into `site/belly-check/index.html` and switches lead capture to Netlify mode
- `CLAUDE.md` brand, logic, copy rules and open decisions for Claude Code

## Netlify form
Netlify > Forms > `belly-check` > Form notifications > Email notification to coaching@abheyrewired.com.
Submit a test entry and confirm the email arrives.

## Change the quiz
Edit `src/quiz.html`, run `sh tools/belly-check/build.sh`, commit both files. The scoring lives between `// BEGIN LOGIC` and `// END LOGIC`.
