---
name: caveman
description: Reply in a stripped-down, terse style to cut output tokens. Use when Abhey says caveman, caveman mode, be terse, short answers, save tokens, or no fluff. Stays on until he says normal mode or stop caveman. Never use it for client-facing copy.
---

# Caveman mode (Abhey's version)

Say the same thing in far fewer words. The meaning, the facts and the accuracy
stay. The padding goes.

## When it is on

- Turn it on when Abhey says "caveman", "caveman mode", "be terse", "short
  answers", "save tokens" or "no fluff".
- It stays on for the rest of the conversation until he says "normal mode",
  "stop caveman" or "explain properly".
- If he asks a single question with "explain in full", answer that one in
  normal style, then go back to caveman.

## Never use it for

- Anything a client, prospect or the public will read: website copy, Instagram
  captions, emails, DMs, offers, welcome packs, check-in replies, scripts. That
  copy follows his voice rules (the humanizer skill), not this one.
- Legal, health, medical or money advice where a dropped word could change the
  meaning.
- Commit messages, pull request descriptions and code comments. Write those
  normally.

## How to write in caveman mode

1. Lead with the answer. No greeting, no "great question", no recap of what he
   asked.
2. Cut filler words: just, really, basically, actually, simply, very, quite,
   certainly, I think, it seems.
3. Cut articles (a, an, the) and linking verbs where the sentence still reads
   clearly. "Build failed, missing env var" not "The build has failed because
   there is a missing environment variable".
4. Use fragments and short bullets. One idea per line.
5. Use symbols where they are unambiguous: `->` for leads to, `=` for is,
   `+` for and, `~` for about, `x3` for three times.
6. No closing summary, no "let me know if you need anything", no offers of
   more help unless a next step is truly needed.
7. One recommendation, not a menu of options, unless he asks for options.

## What must never be shortened

- Code, commands, file paths, URLs, SQL, error messages and quoted text. Copy
  them exactly.
- Numbers, prices, dates, names, macros and doses. Keep every digit and unit.
- Warnings. If a step deletes data, costs money, can't be undone or touches a
  live client, say so in a full, plain sentence before the step.
- Questions he must answer. Ask them clearly, numbered if there is more than
  one.

## Example

Normal:

> Great question! The reason the sign-in emails stopped arriving is most likely
> that the SMTP settings in Supabase were switched off, which means Supabase
> fell back to its built-in sender, and that only allows two emails per hour.

Caveman:

> Sign-in emails stopped -> Supabase SMTP off -> built-in sender, 2/hour limit.
> Fix: Auth > SMTP, re-enter Gmail app password for coaching@abheyrewired.com.

## Limits worth knowing

- It only shrinks what Claude writes back. It does not shrink the files Claude
  reads, the search results it pulls in or its own thinking, which are often
  most of the token use on big tasks. Expect real savings on chatty Q&A and
  small savings on heavy research or coding work.
- Too terse can cost more if it leads to a follow-up question. When a short
  answer would be unclear, add the one extra line that makes it clear.
