// Ship presets. Local frame: +X bow, waterline y = 0, amidships x = 0.
// Heights of decks/houses (`off`) are metres above the base sheer S(x) = D - T + sheer.
// Deck plans are approximate but follow the general arrangement of each ship.

const PAIRS = (xs, z, o = {}) => xs.map((x) => ({ x, z, ...o }));

// ------------------------------------------------------------------ Titanic (Olympic class)
// British Inquiry: departure draught 33 ft 8 in forward / 34 ft 4 in aft.
// C deck depth 64 ft 9 in; B/C and A/B spacing 9 ft, Boat/A spacing 9 ft 6 in.
// Sources and confidence limits: docs/realism-audit.json.
const titanic = {
  name: 'Titanic (proxy)', heroDetails: true, NU: 240, NV: 38, L: 269.1, B: 28.2,
  T: 10.3632, D: 19.7358, draftForward: 10.2616, draftAft: 10.4648,
  sheerF: 3.5052, sheerA: 1.2192, rake: 0.25, overhang: 12, forefoot: 1.6, forefootH: 0.18,
  hullName: 'TITANIC', registry: 'LIVERPOOL', nameH: 0.8, nameAft: 9,
  dress: { bluePeter: true, royalMail: true, house: 'whiteStar', ensign: 'blueEnsign', ensignSize: 0.7 },
  line: 0xa8822e, lineAt: 2.25, seed: 3, whiteShellAbove: 2.45,
  white: 0xc8c7bf, deckColor: 0x968875, funnelColor: 0xaf8453,
  shell: [[-135, -103, 2.7432, 'raised'], [-103, -88, 1.3, 'well'], [-88, 80, 5.4864, 'raised'], [80, 95.5, 1.3, 'well'], [95.5, 135, 2.7432, 'raised']],
  portRows: [2.3, 4.9, 7.5], portFrom: 0.06, portTo: 0.08,
  shellWin: [
    { off: 1.4, pitch: 2.6, w: 0.42, h: 0.42, x0: -126, x1: 126, round: true },
    { off: 4.3, pitch: 2.3, w: 0.75, h: 0.95, x0: -86, x1: 78, pair: true },
  ],
  tiers: [
    {
      x0: -75.7616, x1: 76.6384, off: 5.4864, h: 2.8956, inset: 0.25, overhang: 0.35, name: 'A deck',
      win: [{ x0: 13.9784, x1: 72.5, pitch: 1.6, w: 1.1, h: 1.35, y: 1.0 }, { x0: -74, x1: 13.9784, pitch: 3.2, w: 2.6, h: 1.9, y: 0.55, dark: true }],
      winF: { pitch: 1.9, w: 1.0, h: 1.2, y: 1.1 }, winA: { pitch: 2.4, w: 1.4, h: 1.8, y: 0.6, dark: true },
    },
  ],
  funnelOff: 8.382,
  bridge: { x: 76.6384, off: 8.382, w: 9, d: 5.6, wing: 0.75, h: 2.7 },
  houses: [
    { x0: 46.5, x1: 68.2, off: 8.382, h: 2.6, w: 14.5, name: 'officers', win: { pitch: 2.3, w: 0.7, h: 0.8, y: 1.3 } },
    { x0: 36.5, x1: 45.5, off: 8.382, h: 2.5, w: 10, name: 'fwd entrance', win: { pitch: 2.2, w: 1.0, h: 1.1, y: 1.0 } },
    { x0: 25.5, x1: 36.5, off: 8.382, h: 2.2, w: 8, name: 'casing2' },
    { x0: 26, x1: 36, off: 8.382, h: 2.7, w: 4.2, zc: 7.6, name: 'gymnasium', win: { pitch: 1.5, w: 1.0, h: 1.4, y: 0.8, side: 1 } },
    { x0: 10, x1: 22, off: 8.382, h: 2.0, w: 6.5, name: 'trunks' },
    { x0: -1.5, x1: 9.5, off: 8.382, h: 2.2, w: 8, name: 'casing3' },
    { x0: -15, x1: -3, off: 8.382, h: 1.7, w: 12, roofColor: 0xa29e94, name: 'lounge roof', win: { pitch: 1.2, w: 0.8, h: 0.8, y: 0.5 } },
    { x0: -28.5, x1: -17.5, off: 8.382, h: 2.2, w: 8, name: 'casing4' },
    { x0: -40, x1: -31, off: 8.382, h: 2.3, w: 9, name: 'aft entrance', win: { pitch: 2.2, w: 1.0, h: 1.0, y: 1.0 } },
    { x0: -59, x1: -47, off: 8.382, h: 2.6, w: 10, name: '2nd class entrance', win: { pitch: 2.4, w: 0.9, h: 1.0, y: 1.2 } },
    { x0: -72, x1: -62, off: 8.382, h: 1.5, w: 13, roofColor: 0xa29e94, name: 'smoke room roof' },
    // poop deckhouse (3rd class) and forecastle-front house
    { x0: -121, x1: -113, off: 2.7432, h: 2.4, w: 9, name: 'poop house', win: { pitch: 2.0, w: 0.6, h: 0.7, y: 1.3 } },
  ],
  funnels: [
    { x: 58, rx: 3.65, rz: 2.75, h: 24.5 }, { x: 31, rx: 3.65, rz: 2.75, h: 24.5 },
    { x: 4, rx: 3.65, rz: 2.75, h: 24.5 }, { x: -23, rx: 3.65, rz: 2.75, h: 24.5 },
  ],
  funnelRake: 3, funnelPipes: 2,
  masts: [
    { x: 100, top: 58.5, rake: 3, nest: 25.7, r: 0.5, derricks: [[108, 0], [88, 0]] },
    { x: -106, top: 56, rake: 3, r: 0.48, derricks: [[-96, 0], [-111, 0]] },
  ],
  aerial: true, aerialLead: 52,
  boats: {
    off: 8.382, zEdge: 13.55, welin: true, l: 9.144, w: 2.7686, h: 1.2192,
    list: [{ x: 66.5, side: 1, l: 7.6708, w: 2.1844, h: 0.9144, out: true },
      { x: 66.5, side: -1, l: 7.6708, w: 2.159, h: 0.9144, out: true },
      ...[57, 47.5, 38].map((x) => ({ x })), ...[-21, -31, -41, -51].map((x) => ({ x }))],
  },
  collapsibles: [{ x: 66, z: 8.9 }, { x: 66, z: -8.9 }, { x: 60.5, z: 5.2 }, { x: 60.5, z: -5.2 }],
  domes: [{ x: 41, r: 3.1 }, { x: -35.5, r: 2.7 }],
  skylights: [{ x0: -13.5, x1: -4.5, w: 3.2 }, { x0: 12, x1: 20, w: 2.8, h: 0.4 }, { x0: -57, x1: -49, w: 3, h: 0.4 }],
  vents: [
    // boat deck: big cowls between the boats and around the casings
    ...PAIRS([61.8, 52.2, 42.8], 9.2, { r: 0.6, h: 3.0, dir: 0 }),
    ...PAIRS([-26, -36, -46], 9.2, { r: 0.6, h: 3.0, dir: Math.PI }),
    { x: 23.5, z: 2.6, r: 0.68, h: 3.1, dir: 0 }, { x: 23.5, z: -2.6, r: 0.68, h: 3.1, dir: 0 },
    { x: 13, z: 5.3, r: 0.65, h: 2.8, dir: 0 }, { x: 18, z: 5.3, r: 0.65, h: 2.8, dir: Math.PI },
    { x: -16.3, z: 3.4, r: 0.68, h: 3.1, dir: Math.PI }, { x: -30, z: 3.2, r: 0.7, h: 3.0, dir: 0 },
    { x: 10.5, z: 7.6, r: 0.6, h: 2.6, dir: 0 }, { x: -43, z: 6.6, r: 0.6, h: 2.6, dir: Math.PI },
    { x: -61, z: 6.6, r: 0.6, h: 2.6, dir: Math.PI }, { x: 20, z: 8.3, r: 0.55, h: 2.3, dir: -Math.PI / 2 },
    // island ends, wells, forecastle and poop
    { x: 77, z: 9.5, r: 0.55, h: 2.2, dir: 0 }, { x: -80, z: 9.5, r: 0.6, h: 2.4, dir: Math.PI }, { x: -84, z: 4.5, kind: 'mush', r: 0.4, h: 0.9 },
    { x: 104, z: 5.2, kind: 'mush', r: 0.45, h: 0.9 }, { x: 115.5, z: 1.8, kind: 'mush', r: 0.35, h: 0.8 },
    { x: -116.8, z: 6.8, r: 0.6, h: 2.4, dir: Math.PI }, { x: -125, z: 6, kind: 'mush', r: 0.4, h: 0.8 }, { x: -109, z: 7.2, r: 0.5, h: 2.1, dir: 0 },
  ],
  hatches: [{ x: 108.5, l: 5, w: 5 }, { x: 88, l: 6, w: 6.5 }, { x: -96, l: 5.5, w: 6 }, { x: -110.5, l: 3.6, w: 4.2 }],
  cranes: [
    { x: 93.2, z: 6.4 }, { x: 93.2, z: -6.4 },
    { x: 82.8, z: 6.4 }, { x: 82.8, z: -6.4 },
    { x: -90.5, z: 6.4 }, { x: -90.5, z: -6.4 },
    { x: -101, z: 6.4 }, { x: -101, z: -6.4 },
  ],
  capstans: [{ x: 116, z: 3.8, r: 0.5 }, { x: 116, z: -3.8, r: 0.5 }, { x: -129, z: 2.6, r: 0.55 }, { x: -129, z: -2.6, r: 0.55 }, { x: -107, z: 9.5, r: 0.45 }, { x: -107, z: -9.5, r: 0.45 }],
  winches: [{ x: 91, z: 0, ry: 0 }, { x: -92.5, z: 0 }],
  stairs: [{ x0: 99, x1: 95.6, z: 10.2 }, { x0: 82.6, x1: 80.1, z: 11.2 }, { x0: -85, x1: -88.1, z: 11.2 }, { x0: -106.5, x1: -103.1, z: 10.8 }],
  dockingBridge: { x: -124, h: 2.8, wing: 0.6 },
  anchorCrane: 6.5, anchorX: 11, capstanZ: 2.4, capstanR: 0.68, hawseX: 8.5, anchorY: -2.6, anchorSize: 1.35,
  bittPitch: 12,
  expansionJoints: [18.5, -44],
};

// ------------------------------------------------------------------ Oceanic (1899)
const oceanic = {
  name: 'Oceanic', L: 214.6, B: 20.8, T: 9.0, D: 15.5, sheerF: 1.8, sheerA: 1.0, rake: 1.0, overhang: 9, seed: 4,
  line: 0xa8822e, lineAt: 1.9,
  hullName: 'OCEANIC', registry: 'LIVERPOOL', dress: { house: 'whiteStar', ensign: 'redEnsign' },
  shell: [[-108, 70, 2.6, 'raised'], [70, 84, 1.2, 'well'], [84, 108, 2.6, 'raised']],
  portRows: [2.0, 4.3], shellWin: [{ off: 1.25, pitch: 2.4, w: 0.42, h: 0.42, x0: -102, x1: 102, round: true }],
  tiers: [{ x0: -60, x1: 58, off: 2.6, h: 2.5, inset: 1.7, overhang: 1.3, roundF: 4, roundA: 3, name: 'promenade', win: { pitch: 1.9, w: 1.0, h: 1.1, y: 0.9 }, winF: { pitch: 1.8, w: 0.9, h: 1.0, y: 1.0 } }],
  funnelOff: 5.1,
  bridge: { x: 58.6, off: 5.1, w: 8, d: 4.5, wing: 0.5, h: 2.5 },
  houses: [
    { x0: 36, x1: 52, off: 5.1, h: 2.4, w: 8, win: { pitch: 2.2, w: 0.8, h: 0.9, y: 1.1 } },
    { x0: -5, x1: 5, off: 5.1, h: 1.6, w: 7 },
    { x0: -46, x1: -27, off: 5.1, h: 2.4, w: 8, win: { pitch: 2.2, w: 0.8, h: 0.9, y: 1.1 } },
    { x0: -96, x1: -88, off: 2.6, h: 2.2, w: 6 },
  ],
  funnels: [{ x: 19, rx: 3.0, rz: 2.4, h: 22 }, { x: -12, rx: 3.0, rz: 2.4, h: 22 }], funnelRake: 3,
  masts: [
    { x: 73, top: 47, rake: 2.5, nest: 27, derricks: [[79, 0], [66, 0]] },
    { x: -52, top: 45, rake: 2.5, derricks: [[-63, 0]] },
    { x: -83, top: 41, rake: 2.5, derricks: [[-76, 0], [-93, 0]] },
  ],
  aerial: true, aerialLead: 44,
  boats: { off: 5.1, zEdge: 9.15, l: 8.5, w: 2.5, h: 1.1, list: [48, 40.5, 33, -22, -29.5, -37, -44.5].map((x) => ({ x })).concat([{ x: 55.5, l: 7, w: 2.1, h: 0.9 }]) },
  skylights: [{ x0: -3.5, x1: 3.5, w: 3.2 }, { x0: 26, x1: 32, w: 2.4, h: 0.4 }],
  vents: [
    ...PAIRS([27.5], 3.0, { r: 0.75, h: 3.2 }), ...PAIRS([11], 3.3, { r: 0.7, h: 3.0, dir: Math.PI }),
    ...PAIRS([-20.5], 3.0, { r: 0.75, h: 3.2 }), ...PAIRS([-5], 5.4, { r: 0.6, h: 2.6, dir: Math.PI }),
    ...PAIRS([64, -66], 5.6, { r: 0.6, h: 2.6 }), ...PAIRS([-99], 4.2, { r: 0.5, h: 2.2, dir: Math.PI }),
    ...PAIRS([90], 4, { kind: 'mush', r: 0.4, h: 0.9 }),
  ],
  hatches: [{ x: 94, l: 4.5, w: 4.5 }, { x: 78.5, l: 5, w: 5 }, { x: 64, l: 3.5, w: 4 }, { x: -67, l: 5, w: 5 }, { x: -77, l: 4.5, w: 5 }, { x: -91.5, l: 3.5, w: 3.5 }],
  winches: [{ x: 75.2, z: 2.6 }, { x: 75.2, z: -2.6 }, { x: -55, z: 2.6 }, { x: -80.5, z: 2.6 }, { x: -80.5, z: -2.6 }],
  stairs: [{ x0: 87.5, x1: 84.1, z: 8.0 }, { x0: 72.5, x1: 70.1, z: 8.4 }],
  capstans: [{ x: -101, z: 2.4 }, { x: -101, z: -2.4 }],
  dockingBridge: { x: -94.5, h: 2.6, wing: 0.4 },
  anchorX: 9,
};

// ------------------------------------------------------------------ Majestic (1890)
const majestic = {
  name: 'Majestic', L: 177.6, B: 17.7, T: 7.6, D: 12.8, sheerF: 1.5, sheerA: 0.8, rake: 1.0, overhang: 7, seed: 6,
  line: 0xa8822e, lineAt: 1.7,
  hullName: 'MAJESTIC', registry: 'LIVERPOOL', dress: { house: 'whiteStar', ensign: 'redEnsign' }, raft: 'berth46',
  shell: [[-89, -72, 2.4, 'raised'], [-72, -60, 1.1, 'well'], [-60, 56, 2.4, 'raised'], [56, 70, 1.1, 'well'], [70, 89, 2.4, 'raised']],
  portRows: [1.8, 3.9], shellWin: [{ off: 1.2, pitch: 2.4, w: 0.4, h: 0.4, x0: -86, x1: 86, round: true }],
  tiers: [{ x0: -45, x1: 50, off: 2.4, h: 2.4, inset: 1.5, overhang: 1.0, roundF: 3, roundA: 2.5, name: 'promenade', win: { pitch: 1.9, w: 0.9, h: 1.0, y: 0.9 }, winF: { pitch: 1.8, w: 0.9, h: 1.0, y: 1.0 } }],
  funnelOff: 4.8,
  bridge: { x: 50.4, off: 4.8, w: 7, d: 4.2, wing: 0.5, h: 2.4 },
  houses: [
    { x0: 29, x1: 45, off: 4.8, h: 2.3, w: 7, win: { pitch: 2.2, w: 0.8, h: 0.9, y: 1.0 } },
    { x0: -2.5, x1: 3.5, off: 4.8, h: 1.3, w: 5.5 },
    { x0: -41, x1: -26, off: 4.8, h: 2.3, w: 7, win: { pitch: 2.2, w: 0.8, h: 0.9, y: 1.0 } },
    { x0: -83, x1: -77, off: 2.4, h: 2.1, w: 5 },
  ],
  funnels: [{ x: 11, rx: 2.5, rz: 2.05, h: 18.5 }, { x: -15, rx: 2.5, rz: 2.05, h: 18.5 }], funnelRake: 3.5,
  masts: [
    { x: 63.5, top: 40, rake: 3.5, nest: 22, derricks: [[59, 0], [76, 0]] },
    { x: -31, top: 38, rake: 3.5 },
    { x: -66, top: 35, rake: 3.5, derricks: [[-62, 0], [-80, 0]] },
  ],
  boats: { off: 4.8, zEdge: 7.55, l: 7.6, w: 2.3, h: 1.0, list: [41.5, 34.5, 27.5, -21, -35.5, -42].map((x) => ({ x })).concat([{ x: 20, l: 7, w: 2.1, h: 0.9 }]) },
  skylights: [{ x0: -1.5, x1: 2.5, w: 2.6 }],
  vents: [
    ...PAIRS([20.5], 2.6, { r: 0.65, h: 2.8 }), ...PAIRS([3], 4.2, { r: 0.55, h: 2.4, dir: Math.PI }),
    ...PAIRS([-6], 2.6, { r: 0.65, h: 2.8 }), ...PAIRS([-23], 3.2, { r: 0.55, h: 2.4, dir: Math.PI }),
    ...PAIRS([53, -52], 4.8, { r: 0.5, h: 2.3 }), ...PAIRS([76], 3, { kind: 'mush', r: 0.35, h: 0.8 }),
  ],
  hatches: [{ x: 78, l: 3.8, w: 4 }, { x: 59, l: 3.8, w: 4.4 }, { x: -63, l: 3.8, w: 4.4 }, { x: -86.5 + 7, l: 3, w: 3 }],
  winches: [{ x: 66.4, z: 2.2 }, { x: 66.4, z: -2.2 }, { x: -69, z: 2.2 }],
  stairs: [{ x0: 73.2, x1: 70.1, z: 6.5 }, { x0: 58.7, x1: 56.1, z: 7.0 }, { x0: -62.7, x1: -60.1, z: 7.0 }, { x0: -69, x1: -71.9, z: 6.6 }],
  capstans: [{ x: -84.5, z: 1.8 }, { x: -84.5, z: -1.8 }],
  anchorX: 8, capstanZ: 1.9, capstanR: 0.5,
};

// ------------------------------------------------------------------ St Louis (1895, American Line)
const stlouis = {
  name: 'St Louis', L: 170.6, B: 19.2, T: 8.0, D: 13.6, sheerF: 1.4, sheerA: 0.8, rake: 0.8, overhang: 7, seed: 8,
  hullName: 'ST. LOUIS', dress: { house: 'americanLine', ensign: 'usFlag' }, raft: 'berth46',
  shell: [[-86, -64, 2.5, 'raised'], [-64, 58, 2.5, 'raised'], [58, 86, 2.5, 'raised']],
  portRows: [1.8, 4.0], shellWin: [{ off: 1.25, pitch: 2.4, w: 0.42, h: 0.42, x0: -82, x1: 82, round: true }],
  tiers: [
    { x0: -50, x1: 53, off: 2.5, h: 2.5, inset: 1.3, overhang: 0.9, roundF: 3, roundA: 3, name: 'promenade', win: { pitch: 1.8, w: 0.9, h: 1.0, y: 0.9 }, winF: { pitch: 1.8, w: 0.9, h: 1.0, y: 1.0 } },
  ],
  funnelOff: 5.0,
  bridge: { x: 53.3, off: 5.0, w: 7, d: 4.2, wing: 0.5, h: 2.5 },
  houses: [
    { x0: 30, x1: 47, off: 5.0, h: 2.4, w: 8, win: { pitch: 2.2, w: 0.8, h: 0.9, y: 1.1 } },
    { x0: -4, x1: 3, off: 5.0, h: 1.5, w: 6 },
    { x0: -45, x1: -27, off: 5.0, h: 2.4, w: 8, win: { pitch: 2.2, w: 0.8, h: 0.9, y: 1.1 } },
    { x0: 64, x1: 72, off: 2.5, h: 2.3, w: 7, win: { pitch: 2, w: 0.7, h: 0.8, y: 1.1 } },
    { x0: -78, x1: -70, off: 2.5, h: 2.3, w: 7 },
  ],
  funnels: [{ x: 12, rx: 2.7, rz: 2.3, h: 21 }, { x: -12, rx: 2.7, rz: 2.3, h: 21 }],
  funnelColor: 0x151515, funnelTop: 0x151515, funnelBand: 0xdedad0, funnelBandAt: 0.66, funnelRake: 0.5,
  masts: [
    { x: 61, top: 40, rake: 0.5, nest: 23, derricks: [[77, 0], [57, 0]] },
    { x: -60, top: 38, rake: 0.5, derricks: [[-54, 0], [-66, 0]] },
  ],
  aerial: true, aerialLead: 40,
  boats: { off: 5.0, zEdge: 8.55, l: 7.6, w: 2.3, h: 1.0, list: [44, 36.5, 29, 21.5, -22, -29.5, -37, -44.5].map((x) => ({ x })) },
  skylights: [{ x0: -2.5, x1: 1.5, w: 3 }, { x0: 22, x1: 26, w: 2, h: 0.4 }],
  vents: [
    ...PAIRS([21.5], 3.2, { r: 0.7, h: 3.0 }), ...PAIRS([-2.5], 4.6, { r: 0.6, h: 2.6, dir: Math.PI }),
    ...PAIRS([-21.5], 3.2, { r: 0.7, h: 3.0 }), ...PAIRS([52.5, -53], 6.5, { r: 0.55, h: 2.4 }),
    ...PAIRS([75], 4, { kind: 'mush', r: 0.4, h: 0.8 }),
  ],
  hatches: [{ x: 78, l: 4, w: 4.5 }, { x: 56.5, l: 4.2, w: 4.8 }, { x: -54.5, l: 4.2, w: 4.8 }, { x: -66.5, l: 4, w: 4.5 }],
  winches: [{ x: 58.5, z: 2.4 }, { x: 58.5, z: -2.4 }, { x: -63.5, z: 2.4 }, { x: -63.5, z: -2.4 }],
  capstans: [{ x: -81, z: 2 }, { x: -81, z: -2 }],
  dockingBridge: { x: -67.5 - 12, h: 2.5, wing: 0.4 },
  anchorX: 8, capstanZ: 2.0, capstanR: 0.55,
};

// ------------------------------------------------------------------ Philadelphia (ex City of Paris, 1889)
const philadelphia = {
  name: 'Philadelphia', L: 170.0, B: 19.3, T: 7.9, D: 13.4, sheerF: 1.9, sheerA: 0.8, rake: 0.5, clipper: 5.5, forefoot: 1.5, overhang: 8, seed: 9,
  hullName: 'PHILADELPHIA', dress: { house: 'americanLine', ensign: 'usFlag' }, raft: 'berth46',
  bowFull: 1.6,
  shell: [[-85, 85, 2.4, 'raised']],
  portRows: [1.8, 4.0], shellWin: [{ off: 1.2, pitch: 2.4, w: 0.42, h: 0.42, x0: -80, x1: 78, round: true }],
  tiers: [
    { x0: -40, x1: 49, off: 2.4, h: 2.4, inset: 1.4, overhang: 0.9, roundF: 3, roundA: 3, name: 'promenade', win: { pitch: 1.8, w: 0.9, h: 1.0, y: 0.9 }, winF: { pitch: 1.8, w: 0.9, h: 1.0, y: 1.0 } },
  ],
  funnelOff: 4.8,
  bridge: { x: 49.3, off: 4.8, w: 7, d: 4, wing: 0.5, h: 2.4 },
  houses: [
    { x0: 33, x1: 44.5, off: 4.8, h: 2.3, w: 7, win: { pitch: 2.2, w: 0.8, h: 0.9, y: 1.0 } },
    { x0: -36, x1: -26, off: 4.8, h: 2.3, w: 7, win: { pitch: 2.2, w: 0.8, h: 0.9, y: 1.0 } },
    { x0: 62, x1: 70, off: 2.4, h: 2.2, w: 6.5 },
    { x0: -76, x1: -68, off: 2.4, h: 2.2, w: 6.5, win: { pitch: 2, w: 0.7, h: 0.8, y: 1.0 } },
  ],
  funnels: [{ x: 15, rx: 2.8, rz: 2.3, h: 20.5 }, { x: -9, rx: 2.8, rz: 2.3, h: 20.5 }], // two funnels after the 1899–1901 Harland & Wolff rebuild
  funnelColor: 0x151515, funnelTop: 0x151515, funnelBand: 0xdedad0, funnelBandAt: 0.66, funnelRake: 5,
  masts: [
    { x: 58, top: 38, rake: 5, nest: 21, yard: 9, derricks: [[73, 0], [54, 0]] },
    { x: -46, top: 36, rake: 5, yard: 7, derricks: [[-52, 0]] },
    { x: -63, top: 33, rake: 5, derricks: [[-58, 0], [-75, 0]] },
  ],
  aerial: true, aerialLead: 40,
  boats: { off: 4.8, zEdge: 8.35, l: 7.6, w: 2.3, h: 1.0, list: [40.5, 32.5, 24.5, -18.5, -26, -33.5].map((x) => ({ x })) },
  skylights: [{ x0: 1, x1: 5, w: 3 }, { x0: 24, x1: 28, w: 2.4, h: 0.4 }],
  vents: [
    ...PAIRS([22.5, -2], 3.2, { r: 0.62, h: 2.8 }), ...PAIRS([-16.5], 3.2, { r: 0.6, h: 2.6, dir: Math.PI }),
    ...PAIRS([51.5, -43], 6.4, { r: 0.55, h: 2.4 }), ...PAIRS([75], 4, { kind: 'mush', r: 0.4, h: 0.8 }),
  ],
  hatches: [{ x: 74, l: 4, w: 4.5 }, { x: 53.5, l: 4, w: 4.6 }, { x: -52, l: 4, w: 4.6 }, { x: -79.5, l: 3.2, w: 3.5 }],
  winches: [{ x: 55.8, z: 2.4 }, { x: 55.8, z: -2.4 }, { x: -60.5, z: 2.4 }],
  capstans: [{ x: -80.5, z: 2.6 }, { x: -80.5, z: -2.6 }],
  anchorX: 10, capstanZ: 2.0, capstanR: 0.55, hawseX: 7,
  bowsprit: 13,
};

// ------------------------------------------------------------------ New York (ex City of New York, rebuilt 1903)
const newyork = {
  name: 'New York', L: 170.1, B: 19.2, T: 7.9, D: 13.5, sheerF: 1.9, sheerA: 0.8, rake: 0.5, clipper: 5.5, forefoot: 1.5, overhang: 8, seed: 5,
  hullName: 'NEW YORK', dress: { house: 'americanLine', ensign: 'usFlag' },
  bowFull: 1.6,
  shell: [[-86, 86, 2.4, 'raised']],
  portRows: [1.8, 4.0], shellWin: [{ off: 1.2, pitch: 2.4, w: 0.42, h: 0.42, x0: -80, x1: 78, round: true }],
  tiers: [
    { x0: -44, x1: 50, off: 2.4, h: 2.4, inset: 1.4, overhang: 0.9, roundF: 3, roundA: 3, name: 'promenade', win: { pitch: 1.8, w: 0.9, h: 1.0, y: 0.9 }, winF: { pitch: 1.8, w: 0.9, h: 1.0, y: 1.0 } },
  ],
  funnelOff: 4.8,
  bridge: { x: 50.3, off: 4.8, w: 7, d: 4, wing: 0.5, h: 2.4 },
  houses: [
    { x0: 30, x1: 45.5, off: 4.8, h: 2.3, w: 7.5, win: { pitch: 2.2, w: 0.8, h: 0.9, y: 1.0 } },
    { x0: -3, x1: 3, off: 4.8, h: 1.4, w: 5.5 },
    { x0: -40, x1: -26, off: 4.8, h: 2.3, w: 7.5, win: { pitch: 2.2, w: 0.8, h: 0.9, y: 1.0 } },
    { x0: 63, x1: 71, off: 2.4, h: 2.2, w: 6.5 },
    { x0: -78, x1: -70, off: 2.4, h: 2.2, w: 6.5 },
  ],
  funnels: [{ x: 13, rx: 2.7, rz: 2.3, h: 20 }, { x: -11, rx: 2.7, rz: 2.3, h: 20 }],
  funnelColor: 0x151515, funnelTop: 0x151515, funnelBand: 0xdedad0, funnelBandAt: 0.66, funnelRake: 5,
  masts: [
    { x: 59, top: 38, rake: 5, nest: 21, yard: 9, derricks: [[75, 0], [55, 0]] },
    { x: -60, top: 36, rake: 5, yard: 7, derricks: [[-54, 0], [-66, 0]] },
  ],
  aerial: true, aerialLead: 40,
  boats: { off: 4.8, zEdge: 8.35, l: 7.6, w: 2.3, h: 1.0, list: [41, 33.5, 23, -20.5, -28, -35.5].map((x) => ({ x })) },
  skylights: [{ x0: -2, x1: 2, w: 2.6 }],
  vents: [
    ...PAIRS([22.5], 3.2, { r: 0.65, h: 2.9 }), ...PAIRS([1], 4.4, { r: 0.55, h: 2.4, dir: Math.PI }),
    ...PAIRS([-20], 3.2, { r: 0.65, h: 2.9 }), ...PAIRS([52.5, -47], 6.4, { r: 0.55, h: 2.4 }),
    ...PAIRS([76], 4, { kind: 'mush', r: 0.4, h: 0.8 }),
  ],
  hatches: [{ x: 77, l: 4, w: 4.5 }, { x: 54.5, l: 4, w: 4.6 }, { x: -53.5, l: 4, w: 4.6 }, { x: -66.5, l: 4, w: 4.5 }],
  winches: [{ x: 57, z: 2.4 }, { x: 57, z: -2.4 }, { x: -62.5, z: 2.4 }, { x: -62.5, z: -2.4 }],
  capstans: [{ x: -81.5, z: 2.4 }, { x: -81.5, z: -2.4 }],
  anchorX: 10, capstanZ: 2.0, capstanR: 0.55, hawseX: 7,
  bowsprit: 13,
};

export const SHIPS = { titanic, oceanic, majestic, stlouis, philadelphia, newyork };
