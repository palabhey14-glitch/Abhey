#!/bin/sh
# Starts PostgREST (path in $POSTGREST, default "postgrest") and the local
# stand-in for Netlify and Supabase on http://localhost:8830.
E=$(cd "$(dirname "$0")" && pwd)
pkill -x postgrest 2>/dev/null; fuser -k 8830/tcp 2>/dev/null; sleep 0.5
nohup "${POSTGREST:-postgrest}" "$E/pgrst.conf" > "$E/pgrst.log" 2>&1 &
nohup node "$E/server.js" > "$E/server.log" 2>&1 &
sleep 1.5
curl -s -o /dev/null -w "postgrest %{http_code}\n" http://127.0.0.1:3009/
curl -s -o /dev/null -w "site %{http_code}\n" http://localhost:8830/app/
