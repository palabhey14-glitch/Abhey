#!/bin/sh
# Builds site/belly-check/index.html (served at /belly-check/) from src/quiz.html.
# src/quiz.html is the single source of truth. Edit it, then run: sh build.sh
set -e
cd "$(dirname "$0")"
mkdir -p ../../site/belly-check
{
cat <<'HEAD'
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#0b2545">
<meta name="robots" content="noindex, nofollow">
<meta name="description" content="A 5-minute check for busy men who have lost weight but are not happy with their belly. Find the 3 things to check before cutting more calories.">
<title>Stubborn Belly Check | Rewired Coaching</title>
<style>*,*::before,*::after{box-sizing:border-box}html{-webkit-text-size-adjust:100%}body{margin:0}[hidden]{display:none!important}</style>
</head>
<body>
HEAD
tail -n +2 src/quiz.html | sed 's/const LEAD_MODE = "preview";/const LEAD_MODE = "netlify";/'
echo '</body></html>'
} > ../../site/belly-check/index.html
echo "Built site/belly-check/index.html"
