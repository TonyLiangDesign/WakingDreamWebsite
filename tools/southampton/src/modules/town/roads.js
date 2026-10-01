// Hand-placed historic roads of 1912 Southampton, [lat, lon] control points (Catmull-Rom smoothed).
// rank 0 = main road (trams where they ran in 1912), 1 = secondary / medieval lane.
// hw = carriageway half width, pave = pavement width, setts = granite setts (else macadam).

export const ROADS = [
  // ---- Old Town (within the walls)
  { name: 'High Street', rank: 0, hw: 5.0, pave: 2.4, setts: true, tram: true, oldTown: true,
    pts: [[50.90268, -1.40417], [50.90160, -1.40405], [50.90040, -1.40392], [50.89930, -1.40400], [50.89780, -1.40425], [50.89640, -1.40465]] },
  { name: 'Bugle Street', rank: 1, hw: 2.6, pave: 1.0, setts: true, oldTown: true,
    pts: [[50.89625, -1.40625], [50.89760, -1.40600], [50.89880, -1.40570], [50.89975, -1.40540], [50.90120, -1.40555], [50.90250, -1.40560]] },
  { name: 'French Street', rank: 1, hw: 2.3, pave: 0.9, setts: true, oldTown: true,
    pts: [[50.89630, -1.40545], [50.89760, -1.40530], [50.89890, -1.40515]] },
  { name: 'Simnel Street', rank: 1, hw: 2.2, pave: 0.9, setts: true, oldTown: true,
    pts: [[50.90085, -1.40640], [50.90080, -1.40520], [50.90075, -1.40410]] },
  { name: 'Blue Anchor Lane', rank: 1, hw: 2.0, pave: 0.8, setts: true, oldTown: true,
    pts: [[50.89960, -1.40655], [50.89950, -1.40560]] },
  { name: 'St Michael St', rank: 1, hw: 2.4, pave: 0.9, setts: true, oldTown: true,
    pts: [[50.89930, -1.40540], [50.89930, -1.40400]] },
  { name: 'Westgate Street', rank: 1, hw: 2.2, pave: 0.9, setts: true, oldTown: true,
    pts: [[50.89805, -1.40655], [50.89815, -1.40560], [50.89800, -1.40420]] },
  { name: 'Castle Lane', rank: 1, hw: 2.2, pave: 0.9, setts: true, oldTown: true,
    pts: [[50.90190, -1.40640], [50.90195, -1.40555], [50.90185, -1.40410]] },
  { name: 'Porters Lane / Winkle St', rank: 1, hw: 2.6, pave: 1.0, setts: true, oldTown: true,
    pts: [[50.89660, -1.40620], [50.89670, -1.40460], [50.89680, -1.40250], [50.89690, -1.40080]] },
  { name: 'Brewhouse Lane', rank: 1, hw: 2.4, pave: 0.9, setts: true, oldTown: true,
    pts: [[50.89690, -1.40300], [50.89820, -1.40310], [50.89960, -1.40300], [50.90090, -1.40280], [50.90220, -1.40300]] },
  { name: 'Broad Lane', rank: 1, hw: 2.2, pave: 0.9, setts: true, oldTown: true,
    pts: [[50.89760, -1.40420], [50.89770, -1.40300], [50.89760, -1.40180]] },
  { name: 'Cuckoo Lane', rank: 1, hw: 2.0, pave: 0.8, setts: true, oldTown: true,
    pts: [[50.89720, -1.40640], [50.89720, -1.40560]] },
  { name: 'Bernard Street', rank: 1, hw: 4.0, pave: 2.0, setts: true, tram: true,
    pts: [[50.89880, -1.40405], [50.89885, -1.40200], [50.89875, -1.39960], [50.89850, -1.39780]] },
  { name: 'East Street', rank: 1, hw: 3.6, pave: 1.8, setts: true,
    pts: [[50.90140, -1.40400], [50.90130, -1.40150], [50.90110, -1.39880], [50.90095, -1.39600]] },
  { name: 'Back of the Walls', rank: 1, hw: 3.0, pave: 1.4, setts: true,
    pts: [[50.90250, -1.40250], [50.90050, -1.40175], [50.89850, -1.40125], [50.89680, -1.40085]] },
  { name: 'Canal Walk', rank: 1, hw: 2.8, pave: 1.2, setts: true,
    pts: [[50.90250, -1.40180], [50.90060, -1.40080], [50.89880, -1.40000]] },
  { name: 'Orchard Lane', rank: 1, hw: 3.0, pave: 1.4, setts: true,
    pts: [[50.90180, -1.40000], [50.89980, -1.39950], [50.89820, -1.39900]] },
  // ---- Above Bar / central
  { name: 'Above Bar Street', rank: 0, hw: 6.0, pave: 3.0, setts: true, tram: true,
    pts: [[50.90268, -1.40417], [50.90450, -1.40445], [50.90700, -1.40470], [50.90950, -1.40490], [50.91200, -1.40500], [50.91450, -1.40480], [50.91800, -1.40420]] },
  { name: 'Western Esplanade', rank: 1, hw: 4.5, pave: 2.0, setts: false,
    pts: [[50.90470, -1.40640], [50.90380, -1.40620]] },
  { name: 'New Road / Northam', rank: 0, hw: 5.0, pave: 2.4, setts: true, tram: true,
    pts: [[50.90700, -1.40470], [50.90690, -1.40150], [50.90660, -1.39850], [50.90760, -1.39600], [50.90950, -1.39300], [50.91150, -1.38900], [50.91300, -1.38650]] },
  { name: 'St Mary Street', rank: 0, hw: 4.5, pave: 2.2, setts: true, tram: true,
    pts: [[50.89880, -1.39960], [50.90095, -1.39920], [50.90300, -1.39880], [50.90550, -1.39850], [50.90660, -1.39850]] },
  { name: 'St Marys Road', rank: 0, hw: 4.5, pave: 2.2, setts: true,
    pts: [[50.90660, -1.39850], [50.90900, -1.39900], [50.91150, -1.39950], [50.91400, -1.39900]] },
  { name: 'Terminus Terrace', rank: 1, hw: 4.5, pave: 2.2, setts: true,
    pts: [[50.89760, -1.39720], [50.89880, -1.39780], [50.90040, -1.39800]] },
  { name: 'Canute Road', rank: 0, hw: 5.0, pave: 2.2, setts: true,
    pts: [[50.89740, -1.39640], [50.89830, -1.39420], [50.89910, -1.39150], [50.89960, -1.38900]] },
  { name: 'Chapel Road', rank: 1, hw: 4.0, pave: 2.0, setts: true,
    pts: [[50.90300, -1.39880], [50.90260, -1.39500], [50.90220, -1.39100]] },
  { name: 'Marsh Lane / Albert Road', rank: 1, hw: 4.0, pave: 2.0, setts: true,
    pts: [[50.90095, -1.39600], [50.90050, -1.39300], [50.90000, -1.39000]] },
  { name: 'London Road / The Avenue', rank: 0, hw: 6.0, pave: 3.0, setts: false, tram: true,
    pts: [[50.91800, -1.40420], [50.92200, -1.40300], [50.92700, -1.40180], [50.93000, -1.40130]] },
  // ---- Bevois / Portswood
  { name: 'Portswood Road', rank: 0, hw: 5.0, pave: 2.4, setts: false, tram: true,
    pts: [[50.91400, -1.39900], [50.91700, -1.39750], [50.92100, -1.39580], [50.92500, -1.39450], [50.92950, -1.39350]] },
  { name: 'Bevois Valley Road', rank: 0, hw: 4.5, pave: 2.2, setts: false,
    pts: [[50.91300, -1.40000], [50.91600, -1.39950], [50.92000, -1.39980], [50.92300, -1.40030]] },
  { name: 'Lodge Road', rank: 1, hw: 4.0, pave: 2.0, setts: false,
    pts: [[50.91450, -1.40400], [50.91550, -1.40100], [50.91650, -1.39700]] },
  { name: 'Highfield Lane', rank: 1, hw: 4.0, pave: 2.0, setts: false,
    pts: [[50.92400, -1.40150], [50.92350, -1.39750], [50.92250, -1.39400]] },
  // ---- Freemantle / Shirley
  { name: 'Shirley Road', rank: 0, hw: 5.0, pave: 2.4, setts: false, tram: true,
    pts: [[50.91150, -1.40900], [50.91500, -1.41350], [50.91900, -1.41850], [50.92250, -1.42350], [50.92550, -1.42900], [50.92650, -1.43500]] },
  { name: 'Romsey Road / Hill Lane', rank: 1, hw: 4.5, pave: 2.0, setts: false,
    pts: [[50.91550, -1.41300], [50.92000, -1.41450], [50.92500, -1.41550], [50.92780, -1.41600]] },
  { name: 'Millbrook Road', rank: 0, hw: 5.0, pave: 2.2, setts: false,
    pts: [[50.90900, -1.41600], [50.91000, -1.42300], [50.91150, -1.43000], [50.91300, -1.43700], [50.91500, -1.44500], [50.91700, -1.45300], [50.91850, -1.46000]] },
  { name: 'Waterloo / Paynes Road', rank: 1, hw: 4.0, pave: 2.0, setts: false,
    pts: [[50.91050, -1.42400], [50.91500, -1.42500], [50.92000, -1.42700], [50.92400, -1.42900]] },
  { name: 'Regents Park Road', rank: 1, hw: 4.0, pave: 2.0, setts: false,
    pts: [[50.91250, -1.43600], [50.91700, -1.43500], [50.92200, -1.43700], [50.92550, -1.43900]] },
  // ---- Woolston / Itchen Ferry / Peartree / Bitterne
  { name: 'Portsmouth Road', rank: 0, hw: 4.5, pave: 2.0, setts: false,
    pts: [[50.89860, -1.38260], [50.89700, -1.37900], [50.89500, -1.37500], [50.89300, -1.37050]] },
  { name: 'Victoria Road', rank: 1, hw: 4.0, pave: 1.8, setts: false,
    pts: [[50.89880, -1.38200], [50.90150, -1.37800], [50.90400, -1.37300], [50.90600, -1.36700]] },
  { name: 'Peartree Avenue', rank: 1, hw: 4.0, pave: 1.5, setts: false,
    pts: [[50.90400, -1.37300], [50.90700, -1.36800], [50.91000, -1.36200], [50.91100, -1.35800]] },
  { name: 'Bitterne Road', rank: 0, hw: 4.5, pave: 1.8, setts: false,
    pts: [[50.91200, -1.37700], [50.91250, -1.37100], [50.91300, -1.36400], [50.91400, -1.35700], [50.91500, -1.35000], [50.91600, -1.34600]] },
  { name: 'Bursledon Road', rank: 1, hw: 4.0, pave: 1.2, setts: false,
    pts: [[50.91300, -1.36400], [50.91000, -1.35800], [50.90900, -1.35300]] },
  { name: 'Midanbury Lane', rank: 1, hw: 3.5, pave: 1.2, setts: false,
    pts: [[50.91400, -1.35700], [50.91900, -1.35500], [50.92400, -1.35400]] },
  // ---- villages
  { name: 'Hythe High Street', rank: 0, hw: 3.5, pave: 1.4, setts: false,
    pts: [[50.87350, -1.40020], [50.87050, -1.40060], [50.86750, -1.40300], [50.86500, -1.40500]] },
  { name: 'Netley Victoria Road', rank: 0, hw: 3.5, pave: 1.4, setts: false,
    pts: [[50.87700, -1.35000], [50.87450, -1.34500], [50.87150, -1.34000], [50.86950, -1.33800]] },
  { name: 'Totton Commercial Road', rank: 0, hw: 4.0, pave: 1.6, setts: false,
    pts: [[50.91700, -1.47900], [50.91800, -1.48500], [50.91850, -1.49200], [50.91900, -1.49900]] },
  { name: 'Eling Lane', rank: 1, hw: 3.2, pave: 1.0, setts: false,
    pts: [[50.91800, -1.48500], [50.91450, -1.48600], [50.91300, -1.48400]] },
];

// Area inside the medieval walls (character "old").
export const WALLED_TOWN = [[50.90390, -1.40670], [50.90300, -1.40140], [50.89640, -1.40040], [50.89600, -1.40660]];

// The surviving walls in 1912 (west wall along Western Esplanade, north remnant, south-east corner).
export const TOWN_WALLS = [
  { pts: [[50.90365, -1.40630], [50.90280, -1.40660], [50.90180, -1.40672], [50.90080, -1.40676], [50.89980, -1.40678], [50.89880, -1.40672], [50.89800, -1.40666], [50.89700, -1.40640]], towers: [0, 2, 5, 7], arcade: [3, 5] },
  { pts: [[50.90365, -1.40630], [50.90345, -1.40540]], towers: [] },
  { pts: [[50.89655, -1.40250], [50.89660, -1.40080], [50.89720, -1.40060], [50.89840, -1.40090]], towers: [1] },
];

// industrial hot spots [lat, lon, radius m, weight]
export const INDUSTRY = [
  [50.91080, -1.38780, 320, 0.9], // Northam: gasworks, Day Summers yard, ironworks
  [50.90250, -1.38950, 260, 0.8], // Chapel wharves, timber & sawmills
  [50.89900, -1.39250, 200, 0.6], // Canute Road warehouses
  [50.89620, -1.38050, 260, 0.7], // Woolston: Thornycroft works
  [50.91350, -1.44700, 240, 0.4], // Millbrook / Redbridge brickworks & wharves
  [50.91700, -1.48200, 220, 0.35], // Totton / Eling tide mill, wharves
];
