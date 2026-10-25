# Food samples (development data, not complete)

A representative sample for development and first use. It is **not** the full
datasets: load those with `tools/food-import` (see its README).

| File | Rows | What it is |
|---|---|---|
| `afcd-release3.ndjson` | 1,588 | AFCD Release 3: every food, energy and macronutrients only |
| `usda-foundation.ndjson` | 394 | USDA FoodData Central Foundation Foods (all) |
| `usda-sr-legacy-part.ndjson` | 4,600 | About 59% of USDA SR Legacy (the first 4,600 of ~7,800 foods, alphabetical) |
| `off-au-gb-sample.ndjson` | 275 | A small sample of Open Food Facts products sold in Australia and the UK |

Not included: CoFID (the 2021 spreadsheet could not be downloaded here; the
importer is tested against a fixture), and most packaged foods. South Asian
home dishes (paneer dishes, dals, curries) are thin or missing in all four
sources; add them as coach foods or recipes.

Load it: `node tools/food-import/import.js sample` (Supabase) or
`node tools/food-import/import.js sample --sink sql --out sample.sql`.

## Sources and licences

- **AFCD**: Food Standards Australia New Zealand (2025). Australian Food
  Composition Database – Release 3. Used under the FSANZ Data User Licence
  Agreement:
  https://www.foodstandards.gov.au/science-data/monitoringnutrients/afcd/datauserlicenceagreement.
  This work is based on Australian data, and Australian data may not be
  appropriate for use in other countries.
  Limitation of Data Statement: There are limitations associated with food
  composition databases. Food composition data used in the database or
  databases may represent an average of the nutrient content of a particular
  sample of foods and ingredients, determined at a particular time. The
  nutrient composition of foods and ingredients can vary substantially between
  batches and brands because of a number of factors, including changes in
  season, processing practices and ingredient source, and methods of
  calculation.
  Changes made: energy converted from kJ to kcal (÷ 4.184); only energy,
  protein, available carbohydrate, fat, fibre, sugars and sodium kept.
- **USDA FoodData Central**: U.S. Department of Agriculture, Agricultural
  Research Service. Public domain (CC0 1.0). Changes: carbohydrate stored as
  available carbohydrate (by difference minus fibre).
- **Open Food Facts**: contains information from Open Food Facts
  (openfoodfacts.org), made available under the Open Database License
  (https://opendatacommons.org/licenses/odbl/1-0/). Individual contents are
  under the Database Contents License. `off-au-gb-sample.ndjson` is a derived
  database and is itself available under the ODbL.
