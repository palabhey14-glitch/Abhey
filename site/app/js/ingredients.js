// Reads recipe ingredient lines ("1 ½ cups (375 mL) milk", "200g chicken
// breast, diced") into an amount, unit, food name and preparation. Used by
// the recipe URL import on the server and the recipe screen in the app.
// Pure functions: `node site/app/js/ingredients.test.js`.
//
// Weights (g, kg, and oz/lb from overseas recipes) convert to grams exactly.
// Volumes and counts only convert with an assumption, so they are marked
// uncertain and the person confirms the grams before saving.
(function (root) {
  'use strict';

  const FRACTIONS = { '¼': 0.25, '½': 0.5, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875, '⅕': 0.2 };

  // unit -> [canonical, kind, factor to g or mL]
  const UNITS = [
    [/^(?:kg|kgs|kilo(?:gram)?s?)$/i, 'kg', 'mass', 1000],
    [/^(?:g|gm|gms|grams?|gr)$/i, 'g', 'mass', 1],
    [/^(?:mg|milligrams?)$/i, 'mg', 'mass', 0.001],
    [/^(?:oz|ounces?)$/i, 'oz', 'mass', 28.3495],
    [/^(?:lb|lbs|pounds?)$/i, 'lb', 'mass', 453.592],
    [/^(?:l|litres?|liters?|ltrs?)$/i, 'L', 'volume', 1000],
    [/^(?:ml|millilitres?|milliliters?|mls)$/i, 'mL', 'volume', 1],
    [/^(?:cl)$/i, 'cL', 'volume', 10],
    [/^(?:tsp|tsps|teaspoons?|t)$/, 'tsp', 'volume', 5],
    [/^(?:tbsp|tbsps|tbs|tbl|tablespoons?|T)$/, 'tbsp', 'volume', 15],
    [/^(?:cups?|c)$/i, 'cup', 'volume', 250],
    [/^(?:fl\.? ?oz|fluid ounces?)$/i, 'fl oz', 'volume', 29.57],
    [/^(?:pinch(?:es)?|dash(?:es)?)$/i, 'pinch', 'volume', 0.3],
  ];
  const COUNT_WORDS = /^(?:pieces?|pcs?|cloves?|slices?|cans?|tins?|packets?|pkts?|bunch(?:es)?|sprigs?|stalks?|sticks?|heads?|handfuls?|large|medium|small|whole)$/i;

  const PREP_WORDS = [
    'finely chopped', 'roughly chopped', 'chopped', 'diced', 'sliced', 'thinly sliced', 'minced', 'grated', 'crushed',
    'peeled', 'deseeded', 'seeded', 'drained', 'rinsed', 'drained and rinsed', 'cooked', 'uncooked', 'raw', 'boiled',
    'roasted', 'toasted', 'softened', 'melted', 'beaten', 'lightly beaten', 'sifted', 'shredded', 'halved', 'quartered',
    'trimmed', 'cubed', 'mashed', 'soaked', 'ground', 'freshly ground', 'at room temperature', 'to taste', 'to serve',
    'for frying', 'optional', 'skinless', 'boneless', 'frozen', 'thawed', 'fresh', 'dried',
  ].sort((a, b) => b.length - a.length);

  function parseNumber(text) {
    const t = text.trim();
    if (!t) return null;
    let total = 0;
    let matched = false;
    // "1 ½", "1½", "1 1/2", "1/2", "1.5", "1,5"
    const re = /(\d+(?:[.,]\d+)?)(?:\s*\/\s*(\d+))?|([¼½¾⅓⅔⅛⅜⅝⅞⅕])/g;
    let m;
    let last = 0;
    while ((m = re.exec(t))) {
      if (t.slice(last, m.index).trim()) break;
      matched = true;
      last = re.lastIndex;
      if (m[3]) total += FRACTIONS[m[3]];
      else if (m[2]) total += Number(m[1]) / Number(m[2]);
      else total += Number(m[1].replace(',', '.'));
    }
    return matched ? total : null;
  }

  // Leading quantity: "1 ½", "2-3", "1 to 2", "½".
  const QTY = '(?:\\d+(?:[.,]\\d+)?(?:\\s*\\/\\s*\\d+)?(?:\\s*[¼½¾⅓⅔⅛⅜⅝⅞⅕])?(?:\\s+\\d+\\s*\\/\\s*\\d+)?|[¼½¾⅓⅔⅛⅜⅝⅞⅕])';
  const LEAD = new RegExp(`^(${QTY})(?:\\s*(?:-|–|to)\\s*(${QTY}))?\\s*(?:x\\s*)?`, 'i');

  function unitOf(word) {
    for (const [re, canonical, kind, factor] of UNITS) if (re.test(word)) return { canonical, kind, factor };
    return null;
  }

  function takePrep(name) {
    const preps = [];
    let rest = name;
    // after a comma: "chicken breast, diced"
    const comma = rest.split(/\s*,\s*/);
    if (comma.length > 1) {
      rest = comma[0];
      preps.push(comma.slice(1).join(', '));
    }
    // leading or trailing prep words: "finely chopped onion"
    let changed = true;
    while (changed) {
      changed = false;
      for (const w of PREP_WORDS) {
        const lead = new RegExp(`^${w}\\s+`, 'i');
        const trail = new RegExp(`\\s+${w}$`, 'i');
        if (lead.test(rest)) {
          preps.unshift(w);
          rest = rest.replace(lead, '');
          changed = true;
        } else if (trail.test(rest)) {
          preps.push(w);
          rest = rest.replace(trail, '');
          changed = true;
        }
      }
    }
    return { name: rest.trim(), prep: preps.length ? preps.join(', ') : null };
  }

  function parseLine(line) {
    const original = String(line || '').replace(/\s+/g, ' ').trim();
    const out = { original, quantity: null, quantityMax: null, unit: null, name: original, prep: null, grams: null, mL: null, uncertain: true, reason: null };
    if (!original) return { ...out, reason: 'Empty line' };
    let text = original.replace(/^[-•*]\s*/, '');

    // A metric amount in brackets wins: "2 cups (250 g) flour".
    const bracket = text.match(/\((?:about |approx\.? )?(\d+(?:[.,]\d+)?)\s*(kg|g|ml|mL|l|L)\)/i);

    const lead = text.match(LEAD);
    if (lead) {
      out.quantity = parseNumber(lead[1]);
      out.quantityMax = lead[2] ? parseNumber(lead[2]) : null;
      text = text.slice(lead[0].length);
    }
    // unit, possibly glued to the number ("200g") or written "x 400 g can"
    const unitMatch = text.match(/^([A-Za-z]+\.?(?: ?oz)?)\b\.?\s*(?:of\s+)?/);
    let unit = null;
    if (unitMatch) {
      unit = unitOf(unitMatch[1].replace(/\.$/, ''));
      if (unit) text = text.slice(unitMatch[0].length);
    }
    // "1 x 400 g can chickpeas": the inner amount is the weight
    const inner = text.match(/^(\d+(?:[.,]\d+)?)\s*(kg|g|ml|l)\b\s*/i);
    let multiplier = out.quantity || 1;
    if (!unit && inner) {
      unit = unitOf(inner[2]);
      out.quantity = parseNumber(inner[1]) * multiplier;
      multiplier = 1;
      text = text.slice(inner[0].length);
    }
    text = text.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
    text = text.replace(new RegExp(`^(?:${COUNT_WORDS.source.slice(1, -1)})\\s+(?:of\\s+)?`, 'i'), (w) => {
      out.countWord = w.trim();
      return '';
    });

    const { name, prep } = takePrep(text);
    out.name = name || original;
    out.prep = prep;
    out.unit = unit ? unit.canonical : out.countWord ? out.countWord.replace(/s$/, '') : out.quantity !== null ? 'each' : null;

    const qty = out.quantityMax !== null && out.quantity !== null ? (out.quantity + out.quantityMax) / 2 : out.quantity;
    if (bracket) {
      const b = unitOf(bracket[2]);
      const v = Number(bracket[1].replace(',', '.')) * b.factor;
      if (b.kind === 'mass') {
        out.grams = Math.round(v * 10) / 10;
        out.uncertain = false;
      } else {
        out.mL = Math.round(v * 10) / 10;
        out.reason = 'Volume: confirm the weight';
      }
    } else if (unit && qty !== null) {
      const v = Math.round(qty * unit.factor * 10) / 10;
      if (unit.kind === 'mass') {
        out.grams = v;
        out.uncertain = out.quantityMax !== null;
        if (out.quantityMax !== null) out.reason = 'A range: used the middle';
      } else {
        out.mL = v;
        out.reason = unit.canonical === 'tbsp' ? 'Tablespoons vary (Australian 20 mL, UK 15 mL): confirm the weight' : 'Volume: confirm the weight';
      }
    } else if (qty !== null) {
      out.reason = 'Counted item: choose a portion or weigh it';
    } else {
      out.reason = /to taste|to serve|optional|pinch/i.test(original) ? 'No amount (to taste)' : 'No amount given';
    }
    return out;
  }

  const api = { parseLine, parseNumber };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RewiredIngredients = api;
})(typeof window !== 'undefined' ? window : globalThis);
