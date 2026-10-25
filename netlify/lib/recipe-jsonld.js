// Pulls a Schema.org Recipe out of a web page's JSON-LD. Keeps the name,
// yield, ingredient lines, author and URL for attribution. Method text and
// images are not kept: a parser does not grant the right to republish them.
'use strict';

function decodeEntities(s) {
  return String(s)
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

function clean(s) {
  return decodeEntities(String(s || '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function isRecipe(node) {
  const t = node && node['@type'];
  return Array.isArray(t) ? t.some((x) => /(^|\/)Recipe$/.test(x)) : /(^|\/)Recipe$/.test(String(t || ''));
}

function findRecipe(node, depth = 0) {
  if (!node || typeof node !== 'object' || depth > 6) return null;
  if (Array.isArray(node)) {
    for (const n of node) {
      const r = findRecipe(n, depth + 1);
      if (r) return r;
    }
    return null;
  }
  if (isRecipe(node)) return node;
  for (const key of ['@graph', 'mainEntity', 'mainEntityOfPage', 'itemListElement', 'item']) {
    const r = findRecipe(node[key], depth + 1);
    if (r) return r;
  }
  return null;
}

function nameOf(x) {
  if (!x) return null;
  if (typeof x === 'string') return clean(x);
  if (Array.isArray(x)) return x.map(nameOf).filter(Boolean).join(', ') || null;
  return clean(x.name || '') || null;
}

function servingsOf(y) {
  const list = Array.isArray(y) ? y : [y];
  for (const v of list) {
    if (typeof v === 'number' && v > 0) return v;
    const m = String(v || '').match(/(\d+(?:\.\d+)?)/);
    if (m && Number(m[1]) > 0 && Number(m[1]) <= 200) return Number(m[1]);
  }
  return null;
}

function extractRecipe(html, pageUrl) {
  const blocks = [];
  const re = /<script[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) blocks.push(m[1]);
  for (const raw of blocks) {
    let data;
    try {
      data = JSON.parse(raw.trim().replace(/^<!--|-->$/g, ''));
    } catch (_) {
      continue;
    }
    const r = findRecipe(data);
    if (!r) continue;
    const ingredients = (Array.isArray(r.recipeIngredient) ? r.recipeIngredient : Array.isArray(r.ingredients) ? r.ingredients : [])
      .map(clean)
      .filter(Boolean)
      .slice(0, 60);
    const site = (() => {
      try {
        return new URL(pageUrl).hostname.replace(/^www\./, '');
      } catch (_) {
        return null;
      }
    })();
    return {
      name: clean(r.name).slice(0, 120) || 'Imported recipe',
      servings: servingsOf(r.recipeYield),
      ingredients,
      author: nameOf(r.author),
      publisher: nameOf(r.publisher) || site,
      source_url: typeof r.url === 'string' && /^https?:\/\//.test(r.url) ? r.url : pageUrl,
    };
  }
  return null;
}

module.exports = { extractRecipe, findRecipe };
