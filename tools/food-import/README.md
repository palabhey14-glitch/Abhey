# Food database importer

Loads foods into `public.foods`, normalised per 100 g (or per 100 mL for
drinks), with the source, licence and data quality kept on every row. Runs on
your computer with Node 18 or newer. No packages to install.

```sh
export SUPABASE_URL=https://<project>.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=<service_role key>   # never commit this
node tools/food-import/import.js <source> [options]
```

Run `supabase/migrations/2026-10-25-nutrition.sql` first.

## What each source is, and the commands

| Source | What you download | Licence | Command |
|---|---|---|---|
| AFCD Release 3 (Australia) | "Release 3 – Nutrient profiles" xlsx from the [AFCD data files page](https://www.foodstandards.gov.au/science-data/food-nutrient-databases/afcd/data-files) | FSANZ Data User Licence (based on CC BY-SA 3.0 AU) | `node tools/food-import/import.js afcd --file AFCD-Release-3-Nutrient-profile.xlsx` |
| USDA FoodData Central | Foundation Foods and SR Legacy "JSON" downloads from [fdc.nal.usda.gov/download-datasets](https://fdc.nal.usda.gov/download-datasets) | CC0 (public domain) | `node tools/food-import/import.js usda --dataset foundation --file FoodData_Central_foundation_food_json_<date>.zip` then the same with `--dataset sr_legacy` |
| CoFID 2021 (UK) | "CoFID 2021" xlsx from [GOV.UK](https://www.gov.uk/government/publications/composition-of-foods-integrated-dataset-cofid) | Open Government Licence v3.0, except third-party material | `node tools/food-import/import.js cofid --file "McCance_Widdowsons_Composition_of_Foods_Integrated_Dataset_2021.xlsx"` |
| Open Food Facts (packaged foods) | The CSV export `en.openfoodfacts.org.products.csv.gz` (about 10 GB unzipped) or the JSONL export, from [world.openfoodfacts.org/data](https://world.openfoodfacts.org/data) | ODbL 1.0 (database), DbCL (contents) | `node tools/food-import/import.js off --file en.openfoodfacts.org.products.csv.gz --countries AU,NZ,GB,IN --version 2026-10-20` |

Without a file, AFCD and USDA can also be read from their online APIs:
`afcd --api`, and `usda --api --dataset foundation` with `FDC_API_KEY` set
(free key from api.data.gov). The files are faster and are the recommended way.

Open Food Facts must come from the bulk export. Its search API allows about 10
requests a minute and must not be used for search-as-you-type. The app only
calls Open Food Facts for one barcode at a time, when a barcode is not already
in your database, and then keeps the product.

## Long runs, failures and refreshes

- Every run is recorded in `import_runs`, and progress is saved in
  `tools/food-import/.state/` after each batch. If a run stops, run the same
  command again with `--resume`.
- To refresh, run the same command with the new file. Rows are matched on
  (source, source id) and updated in place, so meal plans and logs keep working.
  Plans and logs store their own copy of the numbers, so a refresh never
  changes history.
- Add `--retire-missing` to a complete run to hide foods that are no longer in
  the source. They stay in the database for old plans and logs.
- Try a run first with `--limit 200`, or write SQL instead of sending it:
  `--sink sql --out foods.sql` (then run the file in psql).
- Open Food Facts also publishes daily delta files (JSONL). Load one with
  `off --delta --file <delta file>.json.gz`; deltas never retire foods.

## Size

The Supabase free plan has a 500 MB database. AFCD (about 1,600 foods), USDA
Foundation and SR Legacy (about 8,000) and CoFID (about 2,900) together are
small. The full Open Food Facts export has over 3 million products; always use
`--countries` (AU, NZ, GB and IN is a few hundred thousand) and check the
database size after the first run.

## Licences: what you must keep doing

- **AFCD**: anywhere the data is shown, include the licence link, the
  Limitation of Data Statement and the statement that the data is Australian
  and may not suit other countries. The app shows all three under "Where the
  food data comes from". The licence is share-alike: if you publish a database
  derived from AFCD, it must carry the same licence.
- **Open Food Facts**: attribute ODbL wherever the data is shown (done in the
  app). ODbL is also share-alike. AFCD's licence and ODbL are different
  share-alike licences, so the importer keeps each source in separate,
  labelled rows and never merges their values. Do not publish or sell a
  combined database export without legal advice.
- **CoFID**: OGL v3.0 attribution (in the app). The CoFID user guide notes
  some values come from third parties (for example manufacturers); check it
  before redistributing the raw data.
- **USDA**: public domain; attribution is shown as a courtesy.

## Tests

`node tools/food-import/test/import.test.js` runs every reader against small
fixture files in `test/fixtures`.
