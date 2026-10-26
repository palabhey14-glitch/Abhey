// Exercise library and the muscle diagram used by the training plan.
// The library below is the starter set; supabase/migrations/2026-10-26-exercises.sql
// loads the same list into the exercises table (regenerate it with
// `node tools/exercises/build-sql.js`), where the coach can add their own.
// Pure functions, no network, so they can be tested with
// `node site/app/js/exercises.test.js`.
(function (root) {
  'use strict';

  // Muscle groups, in the order they are listed in the picker.
  const MUSCLES = {
    chest: 'Chest',
    front_delts: 'Front delts',
    side_delts: 'Side delts',
    rear_delts: 'Rear delts',
    traps: 'Traps',
    lats: 'Lats',
    upper_back: 'Upper back',
    lower_back: 'Lower back',
    biceps: 'Biceps',
    triceps: 'Triceps',
    forearms: 'Forearms',
    abs: 'Abs',
    obliques: 'Obliques',
    glutes: 'Glutes',
    quads: 'Quads',
    hamstrings: 'Hamstrings',
    adductors: 'Adductors',
    calves: 'Calves',
  };

  const EQUIPMENT = ['Barbell', 'Dumbbell', 'Cable', 'Machine', 'Smith machine', 'Kettlebell', 'Band', 'Bodyweight', 'EZ bar', 'Trap bar'];

  // [name, primary muscles, secondary muscles, equipment]
  const RAW = [
    // Chest
    ['Barbell bench press', ['chest'], ['front_delts', 'triceps'], 'Barbell'],
    ['Incline barbell bench press', ['chest', 'front_delts'], ['triceps'], 'Barbell'],
    ['Decline barbell bench press', ['chest'], ['triceps'], 'Barbell'],
    ['Dumbbell bench press', ['chest'], ['front_delts', 'triceps'], 'Dumbbell'],
    ['Incline dumbbell press', ['chest', 'front_delts'], ['triceps'], 'Dumbbell'],
    ['Smith machine incline press', ['chest', 'front_delts'], ['triceps'], 'Smith machine'],
    ['Machine chest press', ['chest'], ['front_delts', 'triceps'], 'Machine'],
    ['Incline machine chest press', ['chest', 'front_delts'], ['triceps'], 'Machine'],
    ['Dumbbell fly', ['chest'], ['front_delts'], 'Dumbbell'],
    ['Incline dumbbell fly', ['chest'], ['front_delts'], 'Dumbbell'],
    ['Cable fly (high to low)', ['chest'], ['front_delts'], 'Cable'],
    ['Cable fly (low to high)', ['chest'], ['front_delts'], 'Cable'],
    ['Pec deck', ['chest'], ['front_delts'], 'Machine'],
    ['Push-up', ['chest'], ['front_delts', 'triceps', 'abs'], 'Bodyweight'],
    ['Deficit push-up', ['chest'], ['front_delts', 'triceps'], 'Bodyweight'],
    ['Incline push-up', ['chest'], ['front_delts', 'triceps'], 'Bodyweight'],
    ['Chest dip', ['chest', 'triceps'], ['front_delts'], 'Bodyweight'],
    ['Band chest press', ['chest'], ['front_delts', 'triceps'], 'Band'],
    // Shoulders
    ['Barbell overhead press', ['front_delts'], ['side_delts', 'triceps', 'traps'], 'Barbell'],
    ['Seated dumbbell shoulder press', ['front_delts'], ['side_delts', 'triceps'], 'Dumbbell'],
    ['Arnold press', ['front_delts', 'side_delts'], ['triceps'], 'Dumbbell'],
    ['Machine shoulder press', ['front_delts'], ['side_delts', 'triceps'], 'Machine'],
    ['Landmine press', ['front_delts', 'chest'], ['triceps'], 'Barbell'],
    ['Pike push-up', ['front_delts'], ['triceps', 'chest'], 'Bodyweight'],
    ['Dumbbell lateral raise', ['side_delts'], ['traps'], 'Dumbbell'],
    ['Cable lateral raise', ['side_delts'], ['traps'], 'Cable'],
    ['Machine lateral raise', ['side_delts'], [], 'Machine'],
    ['Band lateral raise', ['side_delts'], [], 'Band'],
    ['Dumbbell front raise', ['front_delts'], ['side_delts'], 'Dumbbell'],
    ['Cable upright row', ['side_delts', 'traps'], ['biceps'], 'Cable'],
    ['Reverse pec deck', ['rear_delts'], ['upper_back'], 'Machine'],
    ['Rear delt dumbbell fly', ['rear_delts'], ['upper_back'], 'Dumbbell'],
    ['Cable rear delt fly', ['rear_delts'], ['upper_back'], 'Cable'],
    ['Face pull', ['rear_delts', 'upper_back'], ['traps', 'biceps'], 'Cable'],
    ['Band pull-apart', ['rear_delts', 'upper_back'], ['traps'], 'Band'],
    // Back
    ['Pull-up', ['lats'], ['biceps', 'upper_back', 'forearms'], 'Bodyweight'],
    ['Chin-up', ['lats', 'biceps'], ['upper_back', 'forearms'], 'Bodyweight'],
    ['Assisted pull-up', ['lats'], ['biceps', 'upper_back'], 'Machine'],
    ['Lat pulldown', ['lats'], ['biceps', 'upper_back'], 'Cable'],
    ['Close-grip lat pulldown', ['lats'], ['biceps', 'upper_back'], 'Cable'],
    ['Single-arm lat pulldown', ['lats'], ['biceps'], 'Cable'],
    ['Straight-arm pulldown', ['lats'], ['triceps', 'abs'], 'Cable'],
    ['Dumbbell pullover', ['lats', 'chest'], ['triceps'], 'Dumbbell'],
    ['Barbell row', ['upper_back', 'lats'], ['biceps', 'rear_delts', 'lower_back'], 'Barbell'],
    ['Pendlay row', ['upper_back', 'lats'], ['biceps', 'rear_delts', 'lower_back'], 'Barbell'],
    ['Single-arm dumbbell row', ['lats', 'upper_back'], ['biceps', 'rear_delts'], 'Dumbbell'],
    ['Chest-supported dumbbell row', ['upper_back', 'lats'], ['rear_delts', 'biceps'], 'Dumbbell'],
    ['Seated cable row', ['upper_back', 'lats'], ['biceps', 'rear_delts'], 'Cable'],
    ['Machine row', ['upper_back', 'lats'], ['biceps', 'rear_delts'], 'Machine'],
    ['T-bar row', ['upper_back', 'lats'], ['biceps', 'rear_delts', 'lower_back'], 'Barbell'],
    ['Inverted row', ['upper_back', 'lats'], ['biceps', 'rear_delts'], 'Bodyweight'],
    ['Band row', ['upper_back', 'lats'], ['biceps', 'rear_delts'], 'Band'],
    ['Barbell shrug', ['traps'], ['forearms'], 'Barbell'],
    ['Dumbbell shrug', ['traps'], ['forearms'], 'Dumbbell'],
    ['Back extension', ['lower_back', 'glutes'], ['hamstrings'], 'Bodyweight'],
    ['Superman hold', ['lower_back'], ['glutes'], 'Bodyweight'],
    // Arms
    ['Barbell curl', ['biceps'], ['forearms'], 'Barbell'],
    ['EZ bar curl', ['biceps'], ['forearms'], 'EZ bar'],
    ['Dumbbell curl', ['biceps'], ['forearms'], 'Dumbbell'],
    ['Incline dumbbell curl', ['biceps'], ['forearms'], 'Dumbbell'],
    ['Hammer curl', ['biceps', 'forearms'], [], 'Dumbbell'],
    ['Preacher curl', ['biceps'], ['forearms'], 'EZ bar'],
    ['Cable curl', ['biceps'], ['forearms'], 'Cable'],
    ['Bayesian cable curl', ['biceps'], ['forearms'], 'Cable'],
    ['Band curl', ['biceps'], ['forearms'], 'Band'],
    ['Close-grip bench press', ['triceps', 'chest'], ['front_delts'], 'Barbell'],
    ['Skull crusher', ['triceps'], [], 'EZ bar'],
    ['Cable triceps pushdown', ['triceps'], [], 'Cable'],
    ['Overhead cable triceps extension', ['triceps'], [], 'Cable'],
    ['Overhead dumbbell triceps extension', ['triceps'], [], 'Dumbbell'],
    ['Dumbbell kickback', ['triceps'], [], 'Dumbbell'],
    ['Bench dip', ['triceps'], ['chest', 'front_delts'], 'Bodyweight'],
    ['Diamond push-up', ['triceps', 'chest'], ['front_delts'], 'Bodyweight'],
    ['Band triceps pushdown', ['triceps'], [], 'Band'],
    ['Wrist curl', ['forearms'], [], 'Dumbbell'],
    ['Reverse curl', ['forearms', 'biceps'], [], 'EZ bar'],
    ["Farmer's carry", ['forearms', 'traps'], ['abs', 'glutes'], 'Dumbbell'],
    // Legs
    ['Back squat', ['quads', 'glutes'], ['adductors', 'lower_back'], 'Barbell'],
    ['Front squat', ['quads'], ['glutes', 'abs', 'upper_back'], 'Barbell'],
    ['Smith machine squat', ['quads', 'glutes'], ['adductors'], 'Smith machine'],
    ['Hack squat', ['quads'], ['glutes', 'adductors'], 'Machine'],
    ['Leg press', ['quads', 'glutes'], ['adductors', 'hamstrings'], 'Machine'],
    ['Goblet squat', ['quads', 'glutes'], ['abs', 'adductors'], 'Dumbbell'],
    ['Bodyweight squat', ['quads', 'glutes'], ['adductors'], 'Bodyweight'],
    ['Bulgarian split squat', ['quads', 'glutes'], ['adductors', 'hamstrings'], 'Dumbbell'],
    ['Walking lunge', ['quads', 'glutes'], ['hamstrings', 'adductors'], 'Dumbbell'],
    ['Reverse lunge', ['glutes', 'quads'], ['hamstrings', 'adductors'], 'Dumbbell'],
    ['Step-up', ['quads', 'glutes'], ['hamstrings'], 'Dumbbell'],
    ['Leg extension', ['quads'], [], 'Machine'],
    ['Sissy squat', ['quads'], [], 'Bodyweight'],
    ['Conventional deadlift', ['hamstrings', 'glutes', 'lower_back'], ['quads', 'traps', 'forearms', 'lats'], 'Barbell'],
    ['Trap bar deadlift', ['quads', 'glutes'], ['hamstrings', 'lower_back', 'traps', 'forearms'], 'Trap bar'],
    ['Romanian deadlift', ['hamstrings', 'glutes'], ['lower_back', 'forearms'], 'Barbell'],
    ['Dumbbell Romanian deadlift', ['hamstrings', 'glutes'], ['lower_back', 'forearms'], 'Dumbbell'],
    ['Single-leg Romanian deadlift', ['hamstrings', 'glutes'], ['lower_back'], 'Dumbbell'],
    ['Good morning', ['hamstrings', 'lower_back'], ['glutes'], 'Barbell'],
    ['Seated leg curl', ['hamstrings'], ['calves'], 'Machine'],
    ['Lying leg curl', ['hamstrings'], ['calves'], 'Machine'],
    ['Nordic curl', ['hamstrings'], [], 'Bodyweight'],
    ['Stability ball leg curl', ['hamstrings'], ['glutes'], 'Bodyweight'],
    ['Barbell hip thrust', ['glutes'], ['hamstrings', 'quads'], 'Barbell'],
    ['Machine hip thrust', ['glutes'], ['hamstrings'], 'Machine'],
    ['Glute bridge', ['glutes'], ['hamstrings'], 'Bodyweight'],
    ['Single-leg glute bridge', ['glutes'], ['hamstrings'], 'Bodyweight'],
    ['Cable glute kickback', ['glutes'], ['hamstrings'], 'Cable'],
    ['Hip abduction machine', ['glutes'], [], 'Machine'],
    ['Band lateral walk', ['glutes'], [], 'Band'],
    ['Hip adduction machine', ['adductors'], [], 'Machine'],
    ['Copenhagen plank', ['adductors'], ['obliques'], 'Bodyweight'],
    ['Kettlebell swing', ['glutes', 'hamstrings'], ['lower_back', 'forearms'], 'Kettlebell'],
    ['Standing calf raise', ['calves'], [], 'Machine'],
    ['Seated calf raise', ['calves'], [], 'Machine'],
    ['Leg press calf raise', ['calves'], [], 'Machine'],
    ['Single-leg calf raise', ['calves'], [], 'Bodyweight'],
    // Core
    ['Plank', ['abs'], ['obliques', 'front_delts'], 'Bodyweight'],
    ['Side plank', ['obliques'], ['abs', 'glutes'], 'Bodyweight'],
    ['Dead bug', ['abs'], ['obliques'], 'Bodyweight'],
    ['Hanging leg raise', ['abs'], ['obliques', 'forearms'], 'Bodyweight'],
    ['Hanging knee raise', ['abs'], ['obliques', 'forearms'], 'Bodyweight'],
    ['Cable crunch', ['abs'], ['obliques'], 'Cable'],
    ['Crunch', ['abs'], [], 'Bodyweight'],
    ['Reverse crunch', ['abs'], ['obliques'], 'Bodyweight'],
    ['Ab wheel rollout', ['abs'], ['lats', 'obliques'], 'Bodyweight'],
    ['Pallof press', ['obliques', 'abs'], [], 'Cable'],
    ['Cable woodchop', ['obliques'], ['abs'], 'Cable'],
    ['Russian twist', ['obliques'], ['abs'], 'Bodyweight'],
    ['Suitcase carry', ['obliques'], ['forearms', 'traps'], 'Dumbbell'],
    ['Mountain climber', ['abs'], ['front_delts', 'quads'], 'Bodyweight'],
  ];

  const LIBRARY = RAW.map(([name, primary, secondary, equipment]) => ({ name, primary, secondary, equipment }));

  // The group an exercise is listed under in the picker: its first primary muscle.
  function groupOf(ex) {
    const first = (ex.primary || [])[0];
    return MUSCLES[first] ? first : 'other';
  }

  function normalise(text) {
    return String(text || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, ' ').trim();
  }

  // Gym shorthand a coach is likely to type.
  const SHORTHAND = {
    db: 'dumbbell', bb: 'barbell', kb: 'kettlebell', rdl: 'romanian deadlift', ohp: 'overhead press',
    sldl: 'single leg romanian deadlift', bss: 'bulgarian split squat', ez: 'ez bar',
    tri: 'triceps', tris: 'triceps', bi: 'biceps', bis: 'biceps', delt: 'delts', delts: 'delts', hammy: 'hamstrings', hams: 'hamstrings', quad: 'quads', glute: 'glutes',
  };

  // Every word typed must appear in the name, the equipment or a muscle name.
  function search(list, query, muscle) {
    const words = normalise(query).split(' ').filter(Boolean).flatMap((w) => (SHORTHAND[w] || w).split(' '));
    return list.filter((ex) => {
      if (muscle && !(ex.primary || []).includes(muscle) && !(ex.secondary || []).includes(muscle)) return false;
      if (!words.length) return true;
      const hay = normalise([ex.name, ex.equipment, ...(ex.primary || []).map((m) => MUSCLES[m]), ...(ex.secondary || []).map((m) => MUSCLES[m])].join(' '));
      return words.every((w) => hay.includes(w));
    }).sort((a, b) => {
      // Name matches first, then primary-muscle matches, then alphabetical.
      const q = words.join(' ');
      const score = (ex) => (q && normalise(ex.name) === q ? -1 : q && normalise(ex.name).startsWith(q) ? 0 : q && normalise(ex.name).includes(q) ? 1 : 2)
        + (muscle && !(ex.primary || []).includes(muscle) ? 3 : 0);
      return score(a) - score(b) || a.name.localeCompare(b.name);
    });
  }

  // Muscles hit by several exercises: primary wins over secondary.
  function musclesOf(exercises) {
    const primary = new Set();
    const secondary = new Set();
    for (const ex of exercises || []) {
      for (const m of ex.primary || []) primary.add(m);
      for (const m of ex.secondary || []) secondary.add(m);
    }
    for (const m of primary) secondary.delete(m);
    const order = Object.keys(MUSCLES);
    const sort = (set) => [...set].filter((m) => MUSCLES[m]).sort((a, b) => order.indexOf(a) - order.indexOf(b));
    return { primary: sort(primary), secondary: sort(secondary) };
  }

  // ------------------------------------------------------------ body diagram
  // A front and a back figure side by side. Each muscle is drawn once for the
  // figure's right-hand side of the page and mirrored. Shapes are in a 100 x 220
  // box per figure.
  const FRONT = {
    traps: ['M44.5 29 C41 31 37.5 33 35 35 L44 35 Z'],
    front_delts: ['M36.5 35.5 C31.5 35.5 29.5 39.5 30 45 C32.5 44 35 42.5 37 40.5 Z'],
    side_delts: ['M30.2 37.5 C27.8 39.5 27 43.5 27.6 47.5 C28.6 46.8 29.6 45.8 30 45 C29.6 42 29.8 39.5 30.2 37.5 Z'],
    chest: ['M49.4 37.5 C44 35.6 39.5 36 37.6 40.6 C36.8 44.6 37.8 49.4 41.4 51.6 C44.6 53.2 47.8 52.6 49.4 51.2 Z'],
    biceps: ['M30.2 48 C27.2 50 26.2 55 26.8 60.5 C27.4 62.6 29.6 63 31 61.4 C32.4 57 32.4 51.6 31.4 48.4 Z'],
    forearms: ['M26.4 64.5 C24 67.5 22.6 73 22.6 79 C22.8 82 24.6 83 25.8 81.2 C27.6 76.5 29.6 70 29.8 65.4 C28.8 64 27.4 63.8 26.4 64.5 Z'],
    abs: ['M49.4 54 L44.6 54.4 C43.8 60 43.8 74 44.6 84 C46 88.5 48 90.2 49.4 90.6 Z'],
    obliques: ['M43.4 55 C40.4 56.6 39 60 39.2 66 C39.4 74 40.4 81 42.6 86 L44 85 C43 75 42.8 63 43.4 55 Z'],
    quads: ['M40.2 95.5 C36.6 101 35.6 111 36.2 122 C36.8 131 38.6 138.4 41 141.6 C43.6 142.4 46 141.6 47.2 139.6 C47.8 130 47.6 112 46.4 101.5 C44.8 98.6 42.6 96.6 40.2 95.5 Z'],
    adductors: ['M47 99.5 C48.6 104 49.4 112 49.3 121 C48.6 121.6 48 121 47.6 119.4 C47.6 112 47.4 105 47 99.5 Z'],
    calves: ['M38.6 152 C36.6 157 36.4 166 37.6 174 C38.4 177 40 177.4 40.6 175 C41 168 40.6 158 39.8 153 Z'],
  };
  const BACK = {
    traps: ['M50 27.5 C47 29.5 41 32.6 36 35.4 C40.5 37 45 41 47.6 47 L50 52.5 Z'],
    rear_delts: ['M36 35.8 C31.4 36 29.6 39.8 29.8 44.8 C32.6 44 35.6 42 37.6 39.6 Z'],
    side_delts: ['M30.2 37.5 C27.8 39.5 27 43.5 27.6 47.5 C28.6 46.8 29.6 45.8 29.8 44.8 C29.6 42 29.8 39.5 30.2 37.5 Z'],
    upper_back: ['M37.8 40.4 C41.6 42 45 45.4 47.2 49.6 L46.8 55 C43.6 53.2 40.2 50.6 38.4 47.4 C37.6 45 37.4 42.4 37.8 40.4 Z'],
    lats: ['M38 48.6 C40.6 52.4 44 55.4 47 57 L46.8 66 C45.4 71 43.4 75 41.6 77.6 C39.8 73 38.6 66 38 59.6 C37.6 55.6 37.6 51.6 38 48.6 Z'],
    lower_back: ['M49.4 60.5 L47.8 60.5 C47.2 67 45.8 74 43.4 80.6 C45 84.4 47.4 86.6 49.4 87.2 Z'],
    triceps: ['M30 47.6 C27.4 49.6 26.4 54.4 26.8 59.6 C27.4 62 29.6 62.6 31 61 C32.2 56.6 32 51.4 31.2 48 Z'],
    forearms: ['M26.4 64.5 C24 67.5 22.6 73 22.6 79 C22.8 82 24.6 83 25.8 81.2 C27.6 76.5 29.6 70 29.8 65.4 C28.8 64 27.4 63.8 26.4 64.5 Z'],
    glutes: ['M49.4 87.6 C45 86.8 40.6 88.6 39.2 93.4 C38.4 98.6 40.6 103.4 44.6 104.6 C47 105.2 48.6 104.6 49.4 103.6 Z'],
    hamstrings: ['M39.6 107 C37 113 36.4 122 37.2 131 C37.8 136.4 39.6 140 41.8 141 C44.6 141.2 46.6 139.6 47.2 136.6 C47.8 128 47.6 117 46.6 108.4 C44.6 106.6 42 106.2 39.6 107 Z'],
    adductors: ['M47.4 106.6 C48.8 110 49.4 115 49.3 120 C48.6 120.4 48 119.6 47.8 118.4 Z'],
    calves: ['M38.4 150 C35.6 155 35.4 163 36.8 170 C37.8 173.6 40.2 174 41.6 172 C43.4 166 43.6 157 42.2 151.6 C41.2 150 39.8 149.6 38.4 150 Z', 'M42.6 152.4 C44.4 156 45 162 44.4 168.6 C43.8 170.6 43 170.4 42.8 168.6 C43.4 163 43.4 157 42.6 152.4 Z'],
  };
  // The silhouette both figures sit on.
  const BODY = [
    'M50 4 C55.6 4 58.8 8.4 58.8 14.4 C58.8 20.6 55.6 25.6 50 25.6 C44.4 25.6 41.2 20.6 41.2 14.4 C41.2 8.4 44.4 4 50 4 Z',
    'M45 24.5 L55 24.5 L56 29.5 C61 32 65.6 33.6 69.6 35.2 C73.6 37 75 41.4 74.6 47.6 C74.4 55 75 62 77.2 68 C79 73.4 79.6 79 79 84.4 L77.6 92 C76.8 94 74.6 94 74 92 L72.6 84 C71.6 80 70 75 68.6 70.6 C67.2 66 66.4 61 65.8 57 L64.4 66 C64 74 64.8 82 66.4 88 C68 95 67.6 101 66 106 C65.2 118 64.2 130 62.2 141.2 C62.6 149 63.2 158 62.2 167 C61.4 175 60.8 184 60.4 192 C60.2 196 62 200 63.8 203 C64.4 205 62.8 206.4 60.4 206.2 L55.4 205.6 C54 205 53.6 203 54 200 C54.6 192 54.4 182 53.6 172 C52.6 162 52.4 152 53.2 145 C52.6 135 51.4 120 50.6 110 L50 104 L49.4 110 C48.6 120 47.4 135 46.8 145 C47.6 152 47.4 162 46.4 172 C45.6 182 45.4 192 46 200 C46.4 203 46 205 44.6 205.6 L39.6 206.2 C37.2 206.4 35.6 205 36.2 203 C38 200 39.8 196 39.6 192 C39.2 184 38.6 175 37.8 167 C36.8 158 37.4 149 37.8 141.2 C35.8 130 34.8 118 34 106 C32.4 101 32 95 33.6 88 C35.2 82 36 74 35.6 66 L34.2 57 C33.6 61 32.8 66 31.4 70.6 C30 75 28.4 80 27.4 84 L26 92 C25.4 94 23.2 94 22.4 92 L21 84.4 C20.4 79 21 73.4 22.8 68 C25 62 25.6 55 25.4 47.6 C25 41.4 26.4 37 30.4 35.2 C34.4 33.6 39 32 44 29.5 Z',
  ];

  function figure(shapes, x, primary, secondary, label) {
    const fill = (m) => (primary.includes(m) ? 'var(--mx-primary, #2444f9)' : secondary.includes(m) ? 'var(--mx-secondary, #9fb0ff)' : 'var(--mx-idle, #dfe5ef)');
    const parts = Object.entries(shapes).map(([muscle, paths]) => paths.map((d) => {
      const title = `<title>${MUSCLES[muscle]}</title>`;
      const cls = primary.includes(muscle) ? 'mx-p' : secondary.includes(muscle) ? 'mx-s' : 'mx-i';
      return `<path class="${cls}" d="${d}" fill="${fill(muscle)}">${title}</path><path class="${cls}" d="${d}" fill="${fill(muscle)}" transform="matrix(-1 0 0 1 100 0)">${title}</path>`;
    }).join('')).join('');
    return `<g transform="translate(${x} 0)"><path d="${BODY[0]}" fill="var(--mx-body, #f1f4f9)"/><path d="${BODY[1]}" fill="var(--mx-body, #f1f4f9)"/>${parts}<text x="50" y="217" text-anchor="middle">${label}</text></g>`;
  }

  // primary and secondary are lists of muscle keys. Returns an <svg> string.
  function bodyDiagram(primary, secondary, opts) {
    const p = (primary || []).filter((m) => MUSCLES[m]);
    const s = (secondary || []).filter((m) => MUSCLES[m] && !p.includes(m));
    const o = opts || {};
    const names = [...p, ...s].map((m) => MUSCLES[m]);
    const label = o.label || (names.length ? `Targets: ${names.join(', ')}` : 'No muscles chosen yet');
    return `<svg class="mx${o.className ? ` ${o.className}` : ''}" viewBox="0 0 200 222" role="img" aria-label="${label.replace(/"/g, '&quot;')}">`
      + figure(FRONT, 0, p, s, o.small ? '' : 'Front') + figure(BACK, 100, p, s, o.small ? '' : 'Back') + '</svg>';
  }

  const api = { MUSCLES, EQUIPMENT, LIBRARY, groupOf, search, musclesOf, bodyDiagram, normalise };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RewiredExercises = api;
})(typeof window !== 'undefined' ? window : globalThis);
