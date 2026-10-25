#!/usr/bin/env node
// Food database importer. Loads AFCD, USDA, CoFID and Open Food Facts into
// public.foods, resumably, and refreshes them later. See README.md.
//
//   node tools/food-import/import.js <source> [options]
//
// Sources: afcd | usda | cofid | off | sample
// Options:
//   --file <path>          dataset file (xlsx, zip, json, csv.gz, jsonl.gz)
//   --api                  use the online API instead of a file (afcd, usda)
//   --dataset <name>       usda: foundation | sr_legacy
//   --countries AU,NZ,GB   off: only products sold in these countries
//   --version <label>      off: export date, e.g. 2026-10-20
//   --sink rest|sql|ndjson where rows go (default rest = Supabase)
//   --out <path>           output file for --sink sql / ndjson
//   --resume               continue the last interrupted run of this source
//   --retire-missing       after a complete run, retire foods it did not see
//   --delta                off: the file only holds changed products
//   --limit <n>            stop after n rows (for a trial run)
//   --batch <n>            rows per request (default 500)
//
// Environment: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (rest sink),
// FDC_API_KEY (usda --api). Keys are read from the environment only.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { runImport } = require('./lib/run');
const { RestSink, SqlSink, NdjsonSink } = require('./lib/sink');
const afcd = require('./sources/afcd');
const usda = require('./sources/usda');
const cofid = require('./sources/cofid');
const off = require('./sources/off');
const { lines } = require('./lib/lines');

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) out._.push(a);
    else if (['--api', '--resume', '--retire-missing', '--delta'].includes(a)) out[a.slice(2)] = true;
    else out[a.slice(2)] = argv[++i];
  }
  return out;
}

const USER_AGENT = 'RewiredCoachingFoodImport/1.0 (coaching@abheyrewired.com)';
async function fetchJson(url) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } });
    if (res.ok) return res.json();
    if (attempt < 5 && (res.status === 429 || res.status >= 500)) {
      await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
      continue;
    }
    throw new Error(`GET ${url.replace(/api_key=[^&]+/, 'api_key=***')} failed: ${res.status}`);
  }
}

async function* sampleFiles(dir, cursor) {
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.ndjson')).sort();
  let n = 0;
  for (const f of files) {
    for await (const line of lines(path.join(dir, f))) {
      n++;
      if (cursor && n <= cursor.n) continue;
      if (line.trim()) yield { row: JSON.parse(line), cursor: { n } };
    }
  }
}

function plan(args) {
  const source = args._[0];
  const need = (k) => {
    if (!args[k]) throw new Error(`--${k} is required for ${source}`);
    return args[k];
  };
  switch (source) {
    case 'afcd':
      return { source, dataset: 'release3', versionPrefix: 'afcd:', open: args.api ? (c) => afcd.fromApi(fetchJson, c) : (c) => afcd.fromXlsx(need('file'), c) };
    case 'usda': {
      const dataset = need('dataset');
      return {
        source, dataset, versionPrefix: `${dataset}:`,
        open: args.api ? (c) => usda.fromApi(fetchJson, { apiKey: process.env.FDC_API_KEY, dataset, cursor: c }) : (c) => usda.fromFile(need('file'), dataset, c),
      };
    }
    case 'cofid':
      return { source, dataset: '2021', versionPrefix: 'cofid:', open: (c) => cofid.fromXlsx(need('file'), c) };
    case 'off': {
      const file = need('file');
      const countries = args.countries ? args.countries.split(',').map((s) => s.trim().toUpperCase()) : [];
      const version = args.version || new Date().toISOString().slice(0, 10);
      const reader = /\.jsonl?(\.gz)?$/i.test(file) ? off.fromJsonl : off.fromCsv;
      const delta = Boolean(args.delta) || /delta|_\d{10}_\d{10}/i.test(path.basename(file));
      return {
        source, dataset: countries.join('-') || 'world', versionPrefix: 'off:', countries,
        // A delta file only holds changed products, so it never retires others.
        noRetire: delta,
        open: (c) => reader(file, { countries, version, cursor: c }),
      };
    }
    case 'sample':
      return { source: 'sample', dataset: 'dev', open: (c) => sampleFiles(args.dir || path.join(__dirname, '../../data/food-samples'), c), noRetire: true };
    default:
      throw new Error('Choose a source: afcd, usda, cofid, off or sample. See tools/food-import/README.md');
  }
}

function makeSink(args) {
  const kind = args.sink || 'rest';
  if (kind === 'rest') return new RestSink({ url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY });
  if (!args.out) throw new Error(`--out is required for --sink ${kind}`);
  return kind === 'sql' ? new SqlSink({ out: args.out }) : new NdjsonSink({ out: args.out });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const p = plan(args);
  const sink = makeSink(args);
  if (p.source === 'sample') {
    // Sample rows carry their real source; import runs are logged per source.
    sink.startRun = async () => {};
    sink.updateRun = async () => {};
  }
  const stateFile = path.join(__dirname, '.state', `${p.source}-${p.dataset || 'all'}.json`);
  const result = await runImport({
    ...p,
    sink,
    stateFile,
    resume: Boolean(args.resume),
    retireMissing: Boolean(args['retire-missing']) && !p.noRetire,
    batchSize: Number(args.batch) || 500,
    limit: args.limit ? Number(args.limit) : null,
  });
  console.log(`Done: ${result.upserted} rows from ${p.source}${p.dataset ? ` (${p.dataset})` : ''}, ${result.retired} retired. Run tag ${result.tag}.`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err.message || err);
    process.exit(1);
  });
}

module.exports = { parseArgs, plan };
