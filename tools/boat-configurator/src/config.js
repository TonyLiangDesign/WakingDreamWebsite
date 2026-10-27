// Options, demo pricing and the shareable build hash.
// The Harbour series is a fictional plate-alloy trailer boat used to demonstrate the configurator.

export const MODELS = [
  { id: '550', name: 'Harbour 550', length: 5.5, beam: 2.2, price: 58900, maxHp: 175, twin: false },
  { id: '620', name: 'Harbour 620', length: 6.2, beam: 2.4, price: 74900, maxHp: 250, twin: false },
  { id: '680', name: 'Harbour 680', length: 6.8, beam: 2.5, price: 92900, maxHp: 400, twin: true },
];

export const LAYOUTS = [
  { id: 'cc', name: 'Centre console', note: 'Open fishing deck, walk-around', price: 0 },
  { id: 'ht', name: 'Hardtop', note: 'Enclosed helm, cabin berths', price: 14500 },
];

// Topside paint. The bottom stays bare marine-grade alloy.
export const HULL_COLOURS = [
  { id: 'alloy', name: 'Bare alloy', hex: '#b9bec2', price: 0, metal: true },
  { id: 'white', name: 'Gloss white', hex: '#eeeee9', price: 4900 },
  { id: 'sand', name: 'Sand', hex: '#c8b996', price: 4900 },
  { id: 'grey', name: 'Harbour grey', hex: '#7f878c', price: 4900 },
  { id: 'navy', name: 'Navy', hex: '#1d2a44', price: 4900 },
  { id: 'charcoal', name: 'Charcoal', hex: '#2c2f33', price: 4900 },
  { id: 'red', name: 'Pōhutukawa red', hex: '#8c2620', price: 4900 },
];

export const TRIM_COLOURS = [
  { id: 'white', name: 'White', hex: '#f1f1ee', price: 0 },
  { id: 'charcoal', name: 'Charcoal', hex: '#2c2f33', price: 0 },
  { id: 'match', name: 'Match hull', hex: null, price: 1200 },
];

export const ENGINES = [
  { id: '150', name: '150 hp', hp: 150, count: 1, price: 26900 },
  { id: '200', name: '200 hp', hp: 200, count: 1, price: 32900 },
  { id: '250', name: '250 hp', hp: 250, count: 1, price: 38900 },
  { id: '300', name: '300 hp', hp: 300, count: 1, price: 45900 },
  { id: '2x200', name: 'Twin 200 hp', hp: 200, count: 2, price: 66900 },
];

export const COWLINGS = [
  { id: 'white', name: 'Pearl white', hex: '#e9e9e6' },
  { id: 'black', name: 'Phantom black', hex: '#121315' },
];

export const OPTIONS = [
  { id: 'bowrail', name: 'Bow rail', note: 'Stainless, welded stanchions', price: 1450 },
  { id: 'rocket', name: 'Rocket launcher', note: 'Six rod holders', price: 1850 },
  { id: 'ttop', name: 'T-top', note: 'Centre console only', price: 4200, layouts: ['cc'] },
  { id: 'bait', name: 'Bait station', note: 'Cutting board, four holders', price: 1650 },
  { id: 'lights', name: 'Underwater lights', note: 'Twin blue LEDs, shown on the water', price: 1100 },
  { id: 'trailer', name: 'Braked trailer', note: 'Galvanised, tandem rollers, shown in the studio', price: 9800 },
];

export const DEFAULT_BUILD = {
  model: '620', layout: 'ht', hull: 'navy', trim: 'white', engine: '250', cowling: 'white',
  options: ['bowrail', 'rocket', 'trailer'], scene: 'studio', kiosk: false,
};

const byId = (list, id) => list.find((item) => item.id === id);

export function engineAllowed(model, engine) {
  return engine.hp * engine.count <= model.maxHp && (engine.count === 1 || model.twin);
}

export function optionAllowed(build, option) {
  return !option.layouts || option.layouts.includes(build.layout);
}

// Keeps a build valid after any change: engine within rating, options matching the layout.
export function normalise(build) {
  const b = { ...DEFAULT_BUILD, ...build, options: [...(build.options || [])] };
  if (!byId(MODELS, b.model)) b.model = DEFAULT_BUILD.model;
  if (!byId(LAYOUTS, b.layout)) b.layout = DEFAULT_BUILD.layout;
  if (!byId(HULL_COLOURS, b.hull)) b.hull = DEFAULT_BUILD.hull;
  if (!byId(TRIM_COLOURS, b.trim)) b.trim = DEFAULT_BUILD.trim;
  if (!byId(COWLINGS, b.cowling)) b.cowling = DEFAULT_BUILD.cowling;
  if (b.scene !== 'water') b.scene = 'studio';
  b.kiosk = Boolean(b.kiosk);
  delete b.dealer;
  delete b.price;
  const model = byId(MODELS, b.model);
  const engine = byId(ENGINES, b.engine);
  if (!engine || !engineAllowed(model, engine)) {
    const allowed = ENGINES.filter((e) => e.count === 1 && engineAllowed(model, e));
    b.engine = allowed[allowed.length - 1].id;
  }
  b.options = OPTIONS.filter((o) => b.options.includes(o.id) && optionAllowed(b, o)).map((o) => o.id);
  return b;
}

export function resolve(build) {
  return {
    model: byId(MODELS, build.model),
    layout: byId(LAYOUTS, build.layout),
    hull: byId(HULL_COLOURS, build.hull),
    trim: byId(TRIM_COLOURS, build.trim),
    engine: byId(ENGINES, build.engine),
    cowling: byId(COWLINGS, build.cowling),
    options: OPTIONS.filter((o) => build.options.includes(o.id)),
  };
}

export function lineItems(build) {
  const r = resolve(build);
  const items = [
    { label: `${r.model.name} hull`, price: r.model.price },
    { label: r.layout.name, price: r.layout.price },
    { label: `${r.hull.name} topsides`, price: r.hull.price },
    { label: `${r.trim.name} ${build.layout === 'ht' ? 'cabin' : 'console'}`, price: r.trim.price },
    { label: `${r.engine.name} outboard, ${r.cowling.name.toLowerCase()}`, price: r.engine.price },
    ...r.options.map((o) => ({ label: o.name, price: o.price })),
  ];
  return { items, total: items.reduce((sum, item) => sum + item.price, 0) };
}

export const nzd = (value) => new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD', maximumFractionDigits: 0 }).format(value);

export function toHash(build) {
  const p = new URLSearchParams({
    m: build.model, l: build.layout, h: build.hull, t: build.trim, e: build.engine, c: build.cowling,
    o: build.options.join('.'), s: build.scene,
  });
  if (build.kiosk) p.set('kiosk', '1');
  return `#${p.toString()}`;
}

export function fromHash(hash) {
  if (!hash || hash.length < 2) return normalise(DEFAULT_BUILD);
  const p = new URLSearchParams(hash.slice(1));
  return normalise({
    model: p.get('m'), layout: p.get('l'), hull: p.get('h'), trim: p.get('t'), engine: p.get('e'), cowling: p.get('c'),
    options: (p.get('o') || '').split('.').filter(Boolean), scene: p.get('s'),
    kiosk: p.get('kiosk') === '1',
  });
}
