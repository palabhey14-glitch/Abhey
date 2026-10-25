// Reads worksheets from an .xlsx file into arrays of rows (no dependencies).
// Handles shared strings, inline strings and numbers; ignores styling.
'use strict';
const { openZip } = require('./zip');

function decode(s) {
  return s
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&');
}

function textOf(xml) {
  // Concatenate every <t> run (rich text splits one cell into several).
  let out = '';
  const re = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g;
  let m;
  while ((m = re.exec(xml))) out += m[1];
  return decode(out);
}

function colIndex(ref) {
  const letters = ref.match(/^[A-Z]+/)[0];
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function openWorkbook(file) {
  const zip = openZip(file);
  const shared = [];
  const sst = zip.read('xl/sharedStrings.xml');
  if (sst) {
    const re = /<si>([\s\S]*?)<\/si>/g;
    let m;
    const xml = sst.toString('utf8');
    while ((m = re.exec(xml))) shared.push(textOf(m[1]));
  }
  const wb = zip.read('xl/workbook.xml').toString('utf8');
  const rels = zip.read('xl/_rels/workbook.xml.rels').toString('utf8');
  const target = {};
  for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = m[0].match(/Id="([^"]+)"/);
    const t = m[0].match(/Target="([^"]+)"/);
    if (id && t) target[id[1]] = t[1].replace(/^\/?(xl\/)?/, 'xl/');
  }
  const sheets = [];
  for (const m of wb.matchAll(/<sheet\b[^>]*>/g)) {
    const name = decode(m[0].match(/name="([^"]+)"/)[1]);
    const rid = m[0].match(/r:id="([^"]+)"/)[1];
    sheets.push({ name, path: target[rid] });
  }

  function rows(sheetName) {
    const sh = sheets.find((s) => s.name === sheetName);
    if (!sh) throw new Error(`Sheet "${sheetName}" not found. Sheets: ${sheets.map((s) => s.name).join(', ')}`);
    const xml = zip.read(sh.path).toString('utf8');
    const out = [];
    for (const rm of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
      const row = [];
      for (const cm of rm[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const attrs = cm[1];
        const inner = cm[2] || '';
        const ref = (attrs.match(/r="([A-Z]+\d+)"/) || [])[1];
        const type = (attrs.match(/t="([^"]+)"/) || [])[1];
        let v = null;
        if (type === 'inlineStr') v = textOf(inner);
        else {
          const vm = inner.match(/<v>([\s\S]*?)<\/v>/);
          if (vm) v = type === 's' ? shared[Number(vm[1])] : type === 'str' || type === 'b' || type === 'e' ? decode(vm[1]) : Number(vm[1]);
        }
        row[ref ? colIndex(ref) : row.length] = v;
      }
      out.push(row);
    }
    return out;
  }

  return { sheetNames: () => sheets.map((s) => s.name), rows };
}

module.exports = { openWorkbook };
