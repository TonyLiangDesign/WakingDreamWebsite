// Countryside data: villages & hamlets that existed in 1912, the LSWR railways, fixed industrial sites.
// [lat, lon]; radius in metres; size ~ relative number of houses.

export const VILLAGES = [
  { name: 'Marchwood', at: [50.8930, -1.4555], r: 230, church: true },
  { name: 'Dibden', at: [50.8745, -1.4175], r: 150, church: true },
  { name: 'Dibden Purlieu', at: [50.8625, -1.4185], r: 170 },
  { name: 'Holbury', at: [50.8335, -1.3790], r: 160 },
  { name: 'Hardley', at: [50.8410, -1.3905], r: 110 },
  { name: 'Fawley', at: [50.8265, -1.3530], r: 260, church: true },
  { name: 'Blackfield', at: [50.8205, -1.3700], r: 150 },
  { name: 'Hamble', at: [50.8600, -1.3230], r: 250, church: true },
  { name: 'Hound', at: [50.8715, -1.3335], r: 120, church: true },
  { name: 'Butlocks Heath', at: [50.8655, -1.3380], r: 130 },
  { name: 'Netley Abbey village', at: [50.8775, -1.3560], r: 210 },
  { name: 'Weston', at: [50.8870, -1.3700], r: 180 },
  { name: 'Sholing', at: [50.8985, -1.3530], r: 300, church: true },
  { name: 'Old Bursledon', at: [50.8830, -1.3080], r: 220, church: true },
  { name: 'Bursledon', at: [50.8920, -1.3200], r: 180 },
  { name: 'Warsash', at: [50.8550, -1.3040], r: 200 },
  { name: 'West End', at: [50.9275, -1.3350], r: 260, church: true },
  { name: 'Swaythling', at: [50.9400, -1.3800], r: 250 },
  { name: 'Highfield', at: [50.9330, -1.3985], r: 200, church: true },
  { name: 'Bassett', at: [50.9465, -1.4050], r: 220 },
  { name: 'Chilworth', at: [50.9625, -1.4220], r: 160, church: true },
  { name: 'Nursling', at: [50.9440, -1.4720], r: 190, church: true },
  { name: 'Rownhams', at: [50.9530, -1.4520], r: 140, church: true },
  { name: 'Redbridge', at: [50.9200, -1.4690], r: 150 },
  { name: 'Eling', at: [50.9102, -1.4800], r: 160, church: true },
  { name: 'Testwood', at: [50.9270, -1.4950], r: 150 },
  { name: 'Ashurst', at: [50.8880, -1.5270], r: 200 },
  { name: 'Colbury', at: [50.9030, -1.5100], r: 120, church: true },
];

// LSWR lines in 1912 (double track unless single). tunnel: not drawn.
export const RAILWAYS = [
  { name: 'Main line Terminus–St Denys–Swaythling', hw: 4.2, pts: [[50.89880, -1.39635], [50.90150, -1.39610], [50.90420, -1.39600], [50.90700, -1.39480], [50.91000, -1.39330], [50.91300, -1.39180], [50.91600, -1.39060], [50.92000, -1.39050], [50.92500, -1.39060], [50.93000, -1.39030], [50.93600, -1.38950], [50.94300, -1.38800], [50.95200, -1.38500]] },
  { name: 'Tunnel curve (east portal)', hw: 4.2, pts: [[50.90640, -1.39520], [50.90560, -1.39720], [50.90500, -1.39880]] },
  { name: 'Southampton West – Millbrook – Redbridge – Totton', hw: 4.2, pts: [[50.90600, -1.40820], [50.90720, -1.41250], [50.90880, -1.41900], [50.91040, -1.42600], [50.91200, -1.43300], [50.91290, -1.44200], [50.91330, -1.45000], [50.91600, -1.45900], [50.91900, -1.46700], [50.92010, -1.47400], [50.91900, -1.48300], [50.91750, -1.49200], [50.91500, -1.50500]] },
  { name: 'Netley line', hw: 2.8, pts: [[50.92000, -1.38700], [50.91500, -1.38000], [50.91000, -1.37600], [50.90400, -1.37450], [50.89950, -1.37000], [50.89500, -1.36300], [50.88900, -1.35500], [50.88300, -1.34700], [50.87800, -1.34100], [50.87300, -1.33500]] },
  { name: 'Main line north toward Eastleigh', hw: 4.2, pts: [[50.95200, -1.38500], [50.96200, -1.37800]] },
];

// fixed special sites
export const GASWORKS = { at: [50.9098, -1.3878], bearing: 25 };
export const TIMBER_YARDS = [[50.9030, -1.3902, 25], [50.9118, -1.3880, 20], [50.8965, -1.3810, 40], [50.9150, -1.4480, 15]];
export const BRICKFIELDS = [[50.9245, -1.4380, 10], [50.9170, -1.3560, 0], [50.9360, -1.3900, 20], [50.8960, -1.3640, 35]];
