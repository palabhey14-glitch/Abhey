// Streams a text file (optionally .gz) line by line, and splits CSV/TSV rows.
'use strict';
const fs = require('node:fs');
const zlib = require('node:zlib');
const readline = require('node:readline');

function lines(file) {
  let stream = fs.createReadStream(file);
  if (/\.gz$/i.test(file)) stream = stream.pipe(zlib.createGunzip());
  return readline.createInterface({ input: stream, crlfDelay: Infinity });
}

// RFC 4180 CSV split for one physical line (fields with embedded newlines
// are not supported; the datasets used here do not have them).
function splitCsv(line, sep) {
  const d = sep || ',';
  const out = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else q = false;
      } else cur += ch;
    } else if (ch === '"' && cur === '') q = true;
    else if (ch === d) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

module.exports = { lines, splitCsv };
