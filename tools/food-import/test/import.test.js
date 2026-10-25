// Run with: node tools/food-import/test/import.test.js
// Checks each source's mapping against small fixture files shaped like the
// real downloads, plus resume and refresh behaviour of the runner.
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const afcd = require('../sources/afcd');
const cofid = require('../sources/cofid');
const usda = require('../sources/usda');
const off = require('../sources/off');
const { runImport } = require('../lib/run');
const { SqlSink } = require('../lib/sink');

const F = (n) => path.join(__dirname, 'fixtures', n);
const collect = async (gen) => {
  const out = [];
  for await (const x of gen) if (x.row) out.push(x.row);
  return out;
};

(async () => {
  // AFCD workbook
  let rows = await collect(afcd.fromXlsx(F('afcd-sample.xlsx')));
  assert.equal(rows.length, 3, 'title rows and footnotes skipped');
  const oats = rows.find((r) => r.source_id === 'F002247');
  assert.equal(oats.kcal, 380.02, 'kJ / 4.184');
  assert.equal(oats.carbs_g, 57.5);
  assert.equal(oats.fibre_g, 9.6);
  assert.equal(oats.sodium_mg, 3);
  assert.deepEqual(oats.countries, ['AU']);
  assert.equal(oats.quality, 'reference');
  assert.equal(oats.category, 'Cereal grains');
  assert.equal(rows.find((r) => r.source_id === 'F009999').fibre_g, null, 'blank fibre stays unknown');
  // AFCD per-nutrient JSON
  const api = {
    'ENERGY%20-%20AHS': [{ pfk: 'F000002', name: 'Abalone', value_per_100: 332 }],
    PROT: [{ pfk: 'F000002', name: 'Abalone', value_per_100: 16.2 }],
    FAT: [{ pfk: 'F000002', name: 'Abalone', value_per_100: 0.8 }],
    AVAILCHO: [{ pfk: 'F000002', name: 'Abalone', value_per_100: 1.6 }],
    AOACDFTOTW: [],
  };
  rows = await collect(afcd.fromApi(async (url) => ({ foods: api[url.split('/').pop()] })));
  assert.equal(rows[0].kcal, 79.35);
  assert.equal(rows[0].fibre_g, null, 'not listed for fibre = unknown');

  // CoFID workbook: Tr = trace (0), N = not measured (unknown)
  rows = await collect(cofid.fromXlsx(F('cofid-sample.xlsx')));
  assert.equal(rows.length, 3, 'code row and units row skipped');
  const flour = rows.find((r) => r.source_id === '11-001');
  assert.equal(flour.kcal, 333);
  assert.equal(flour.fibre_g, 10.3, 'AOAC fibre preferred');
  assert.equal(flour.sodium_mg, 6, 'sodium joined from Inorganics');
  assert.deepEqual(flour.countries, ['GB']);
  const oil = rows.find((r) => r.source_id === '17-104');
  assert.equal(oil.protein_g, 0);
  assert.deepEqual(oil.notes.trace.sort(), ['protein_g', 'sodium_mg']);
  assert.equal(oil.fibre_g, 0, 'AOAC "N" falls back to NSP, which is 0');
  assert.equal(oil.notes.fibre, 'NSP (Englyst); AOAC not reported');
  const dal = rows.find((r) => r.source_id === '13-523');
  assert.equal(dal.fat_g, null, '"N" is unknown, not zero');
  assert.equal(dal.kcal, null);

  // USDA bulk JSON
  rows = await collect(usda.fromFile(F('usda-sample.json'), 'sr_legacy'));
  const rice = rows[0];
  assert.equal(rice.kcal, 130);
  assert.equal(rice.carbs_g, 27.77, 'available = 28.17 - 0.4 fibre');
  assert.deepEqual(rice.portions, [{ label: '1 cup', amount: 158 }], 'ounce portions dropped');
  assert.equal(rice.source_version, 'sr_legacy:2019-04-01');
  assert.equal(rows[1].kcal, 352);
  assert.equal(rows[1].notes.energy, 'Atwater general factors');
  assert.equal(rows[1].notes.carbs, 'total by difference (fibre not reported)');
  assert.equal(rows[1].fibre_g, null);
  // USDA API pages resume from the saved page
  const calls = [];
  const fake = async (url) => {
    calls.push(Number(url.match(/pageNumber=(\d+)/)[1]));
    const page = calls[calls.length - 1];
    if (page > 3) return [];
    return [{ fdcId: page * 10, description: `Food ${page}`, foodNutrients: [{ number: '208', amount: 100 }] }];
  };
  rows = await collect(usda.fromApi(fake, { apiKey: 'k', dataset: 'foundation', pageSize: 1, cursor: { page: 1 } }));
  assert.deepEqual(rows.map((r) => r.source_id), ['20', '30']);
  assert.equal(calls[0], 2, 'resume starts at the next page');

  // Open Food Facts CSV export, filtered to AU and GB
  rows = await collect(off.fromCsv(F('off-sample.csv.gz'), { countries: ['AU', 'GB'], version: '2026-10-20' }));
  assert.deepEqual(rows.map((r) => r.name), ['Wholemeal wraps', 'Digestive biscuits', 'Iced coffee', 'Bad label'], 'France-only and no-energy rows left out');
  const wraps = rows[0];
  assert.equal(wraps.barcode, '9300633123456');
  assert.equal(wraps.quality, 'label');
  assert.equal(wraps.sodium_mg, 450, 'sodium g -> mg');
  assert.deepEqual(wraps.portions, [{ label: '1 serving (1 wrap (40 g))', amount: 40 }]);
  assert.equal(rows[2].basis, 'mL', 'drinks sold by volume are per 100 mL');
  assert.equal(rows[3].needs_review, true, 'label whose Calories do not match macros flagged');
  assert.equal(rows[1].fibre_g, 3.6);
  assert.deepEqual(rows[1].countries.sort(), ['GB', 'IE']);
  rows = await collect(off.fromJsonl(F('off-delta.jsonl.gz'), { countries: ['AU'], version: 'delta' }));
  assert.equal(rows[0].name, 'Wholemeal wraps (new recipe)');
  const nut = off.mapProduct({ code: '1', product_name: 'x', nutriments: { 'energy-kcal_100g': 100, proteins_100g: 150 } });
  assert.equal(nut.protein_g, null, 'impossible values become unknown');
  assert.equal(nut.needs_review, true);

  // Runner: resume after a failure, no duplicates, then refresh retires
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'food-import-'));
  const stateFile = path.join(dir, 'state.json');
  const seen = new Map();
  let failAfter = 2;
  const runs = [];
  const sink = {
    async upsert(batch) {
      if (failAfter-- <= 0) throw new Error('network down');
      for (const r of batch) seen.set(r.source_id, r);
    },
    async startRun(r) {
      runs.push(r);
    },
    async updateRun() {},
    async retire(args) {
      this.retired = args;
      return 7;
    },
    close() {},
  };
  const open = (cursor) => off.fromCsv(F('off-sample.csv.gz'), { countries: ['AU', 'GB'], version: 'v1', cursor });
  await assert.rejects(runImport({ source: 'off', dataset: 'AU-GB', versionPrefix: 'off:', countries: ['AU', 'GB'], open, sink, stateFile, batchSize: 1, log: () => {} }), /--resume/);
  assert.equal(seen.size, 2);
  failAfter = 99;
  const res = await runImport({ source: 'off', dataset: 'AU-GB', versionPrefix: 'off:', countries: ['AU', 'GB'], open, sink, stateFile, resume: true, retireMissing: true, batchSize: 1, log: () => {} });
  assert.equal(seen.size, 4, 'resume finished the remaining rows');
  assert.equal(res.upserted, 4, 'no row counted twice');
  assert.equal(runs.length, 1, 'resume continued the same run');
  assert.equal(sink.retired.source, 'off');
  assert.deepEqual(sink.retired.countries, ['AU', 'GB'], 'refresh only retires products in the imported countries');
  assert.equal(res.retired, 7);
  assert.equal(JSON.parse(fs.readFileSync(stateFile)).done, true);

  // SQL sink output loads into Postgres (checked in the database test run)
  const out = path.join(dir, 'out.sql');
  const sql = new SqlSink({ out });
  await runImport({ source: 'cofid', dataset: '2021', versionPrefix: 'cofid:', open: (c) => cofid.fromXlsx(F('cofid-sample.xlsx'), c), sink: sql, stateFile: path.join(dir, 's2.json'), retireMissing: true, log: () => {} });
  const text = fs.readFileSync(out, 'utf8');
  assert.match(text, /on conflict \(source, source_id\) do update/);
  assert.match(text, /update public\.foods set retired_at = now\(\) where source = 'cofid'/);

  console.log('importer tests passed');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
