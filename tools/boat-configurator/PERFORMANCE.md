# Boat configurator loading performance — 28 October 2026

Measured build: Harbour 620 Hardtop, navy/white, 250 hp, white cowling, bow rail,
rocket launcher and trailer, studio scene. Source and the compiled
`/boat-configurator/` output have been updated. This report records local verification
before publication; the timings below are not post-deployment measurements.

## Results

Three alternating before/after runs in the Codex browser, 1280 × 720 CSS pixels,
DPR 2, on this Mac. Local static responses used `Cache-Control: no-store`.
Every run used a distinct shader-source define to avoid identical shader source
cache keys. This does **not** reset the browser process or guarantee that a GPU
driver has discarded all cached compilation work. No CPU/network throttling was
applied. These are local implementation comparisons, not field Core Web Vitals
or a measured improvement on the deployed website.

| Metric | Before, median | After, median | Change |
| --- | ---: | ---: | ---: |
| First boat frames submitted | 719 ms | 552 ms | 23% faster |
| First fully lit frame submitted | 827 ms | 733 ms | 11% faster |
| Loading cover completely faded out | 1,645 ms | 827 ms | 50% faster |
| Geometry buffers: boat + trailer + cradle | 17,180,928 bytes | 7,156,944 bytes | 58% smaller |
| Geometry vertices | 536,904 | 190,098 | 65% fewer duplicated vertices |
| Triangles | 178,968 | 178,968 | unchanged |
| Meshes | 103 | 103 | unchanged |

Raw first-frame samples: before 770 / 719 / 696 ms; after 575 / 528 / 552 ms.
Raw fully-lit-frame samples: before 841 / 827 / 779 ms; after 752 / 704 / 733 ms.
Raw cover-hidden samples: before 1691 / 1645 / 1629 ms; after 827 / 811 / 831 ms.

The public page was also reloaded in Safari after Develop → Empty Caches. That
single run reported first frames at 857 ms and materials ready at 876 ms;
application JS took 9 ms to fetch and the Three.js bundle took 16 ms. Those are
this connection's results, not slow-network estimates. Safari's materials-ready
mark precedes the next rendered frame and is not interchangeable with the
fully-lit-frame measurements above.

## Changes

- Self-hosted variable WOFF2 fonts, with only the used Latin subsets and normal
  Latin Extended for Māori place names. No Google Fonts stylesheet on the render
  path. Normal and italic Montserrat are preloaded; font licenses accompany the
  published files.
- Boat construction starts without `document.fonts.ready`. Canvas lettering is
  repainted after its font loads, and overlay framing updates separately.
- Static geometry goes directly into preallocated indexed buffers. No expansion
  to duplicate triangle vertices, per-part geometry clones, or intermediate
  merged buffers. Material and both shadow flags remain separate.
- Camera support searches use packed coordinates. The full 144-heading rotation
  table is only computed when rotation begins; the initial view uses a direct
  fit. This changes the initial camera distance slightly while keeping the rig
  inside the existing safe area.
- Studio environment generation, baked contact shadows and ambient occlusion
  wait until after the clay preview. Final lighting quality, antialiasing,
  triangle count and effects are retained.
- The loading cover fades in 180 ms instead of 900 ms. This is a substantial
  part of the visible improvement and is reported separately from CPU/GPU work.
- Added `lit-frame` and `boat-visible` performance marks, distinguishing material
  readiness, frame submission and the loading-cover transition.

Initial compressed JavaScript is still about 250 kB; the Three.js bundle is
about 157 kB gzip. Self-hosted fonts add about 104 kB of initial font resources
(the 68 kB Latin Extended subset loads only when needed). This change removes
external latency and startup dependencies; it is not a claim that total font
transfer bytes decreased. Procedural boat/material construction remains the
largest CPU cost. A representative final run spent 375 ms in rebuild/framing.

## Verification and reproduction

`npm run build` and `node --test test/geometry.test.js` pass. Geometry tests compare
all expanded triangle positions, normals and UVs against transformed originals,
check shadow buckets, missing UVs and the 16/32-bit index boundary.

Browser checks covered the requested build, 680 hull, twin outboards, bare alloy,
centre console, water/crew rendering, direct water entry, returning to studio,
and the 390 × 844 low-power path. No JavaScript or WebGL errors were observed.
The small viewport is a desktop-browser rendering check, not a physical-phone
performance measurement.

For a repeatable local comparison, save each compiled site in a separate root and
run `python3 test/perf-server.py /path/to/site-root 8194`. Open
`/boat-configurator/?qaView=hero&qaCompile&cold=UNIQUE_INTEGER` with the build hash.
After `boat-visible-observed`, read `document.body.dataset.perf`. The harness is
local-only and is not included in the production page. It reports geometry and
marks without changing final rendering settings.

Raw records and screenshots from this session are in the ignored local folder
`_drafts/boat-speed-2026-10-28/`. Preserve these separately if sharing this report.
