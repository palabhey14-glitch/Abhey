#!/usr/bin/env sh
# Flags banned phrases and machine-made tells in a script draft.
# Usage: sh .claude/skills/script-writer/check-script.sh path/to/draft.md
# Exit code 0 = clean, 1 = something to fix.
set -eu
draft="$1"
dir=$(dirname "$0")
status=0

grep -v '^#' "$dir/banned-phrases.txt" | grep -v '^[[:space:]]*$' > "${TMPDIR:-/tmp}/sw-banned.$$"
if grep -n -i -F -f "${TMPDIR:-/tmp}/sw-banned.$$" "$draft"; then
  echo "^ banned phrase(s) found"; status=1
fi
rm -f "${TMPDIR:-/tmp}/sw-banned.$$"

# Em and en dashes read as AI-written in spoken scripts.
if grep -n '—\|–' "$draft"; then
  echo "^ em/en dash found: rewrite as two sentences or use a comma"; status=1
fi

# "It's not X, it's Y" once is fine. More than once is a tic.
n=$(grep -o -i "it's not [^.]*, it's\|isn't about [^.]*, it's" "$draft" | wc -l | tr -d ' ')
if [ "$n" -gt 1 ]; then
  echo "\"it's not X, it's Y\" used $n times: keep one at most"; status=1
fi

[ "$status" -eq 0 ] && echo "clean: no banned phrases or tells found"
exit "$status"
