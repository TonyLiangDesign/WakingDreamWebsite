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

## Second pass — 28 October 2026

Compared against committed first-pass build `b9eb1d8`, not the original live site.
The build in this working tree contains these additional changes:

- Reuse unit cylinder/box geometry during construction; each mesh retains its own
  dimensions and transform. Final meshes still have the same visible triangles.
- Construct only the selected trailer or cradle. Stand materials and their textures
  are lazy, so a cradle does not generate tyre, lamp or carpet textures.
- Before the 400 camera support searches, use Three.js QuickHull to discard interior
  samples. Keep the original directional searches; use the original full input for
  degenerate point clouds. Avoid temporary arrays/vector clones in the extrema scan
  and square roots in triangle classification.
- Share a faster periodic-height-to-normal conversion with row offsets and bounded
  square-root normalization. Texture dimensions and strength remain unchanged.
- Cache the studio directional shadow map until the boat or scene changes. The water
  scene still updates shadows every frame for boat motion.

### Repeated no-HTTP-cache results

Three alternating before/after runs per configuration, local no-store server, same
browser and actual measured viewport **984 × 554 CSS pixels, DPR 1.3**, desktop AO
pipeline. A distinct shader-source macro was used for each load; this does **not**
guarantee that driver-level shader compilation caches are completely cold. These are
local browser results, not production network timings. No network/CPU throttling.
The initial warm-up/profile loads are excluded from both samples.

| Configuration / metric | Before median | After median | Change |
| --- | ---: | ---: | ---: |
| Default 620 hardtop + trailer: build and camera | 347 ms | 313 ms | −10% |
| Default: first frames | 521 ms | 474 ms | −9% |
| Default: first lit frame | 621 ms | 578 ms | −7% |
| Default: loading cover fully gone | 771 ms | 729 ms | −5% |
| Same boat without trailer: build and camera | 332 ms | 256 ms | −23% |
| Without trailer: first frames | 489 ms | 410 ms | −16% |
| Without trailer: first lit frame | 596 ms | 507 ms | −15% |
| Without trailer: loading cover fully gone | 730 ms | 659 ms | −10% |

Raw first-frames / lit-frame / boat-visible values in milliseconds:

- Default before: `557/682/790`, `521/621/771`, `521/618/770`.
- Default after: `475/591/740`, `474/572/717`, `466/578/729`.
- Cradle before: `484/596/730`, `489/589/710`, `506/606/738`.
- Cradle after: `418/529/679`, `393/507/643`, `410/507/659`.

Stored geometry buffers (including hidden support groups) fell from 7,156,944 bytes
and 103 meshes to **6,654,136 bytes / 99 meshes** with the trailer (−7% bytes), or
**5,843,628 bytes / 86 meshes** without it (−18% bytes). This removes unused support
geometry; it does not decimate the visible boat. QuickHull adds about 3 KB gzip to the
startup JavaScript, a small download tradeoff for less main-thread camera work.

### Verification

- `node --test test/*.test.js`: nine tests pass. Covers merged triangles/normals/UVs,
  repeated shared primitive builds, byte-identical normal pixels against the old
  formula (including a 2048 × 256 texture), and support projections against exhaustive
  searches for volumetric, planar, collinear and coincident point clouds.
- `npm run build`: passes. Existing vendor chunk size advisory remains.
- Browser checks: 620 hardtop with/without trailer, 550 hardtop at an actual
  300 × 649 CSS viewport (forward renderer), and 680 centre-console / T-top /
  bare alloy / twin 200 / underwater lights on water, then back to studio.
  No captured browser errors/warnings in those checks. Small viewport testing is
  not a physical-phone performance measurement.
- Shadow instrumentation: the new studio map updated once after reveal, remained
  unchanged over thousands of renderer-pass calls, then updated once when the
  trailer was removed. A water run continued updating (330 updates observed).
  Renderer-pass calls include AO passes and are not display frame counts.
- Before/after desktop screenshots show consistent framing and visible boat detail.
  Raw measurements and screenshots are in the ignored local directory
  `_drafts/boat-speed-round2-2026-10-28/`.

### Remaining larger opportunities

The default configuration still spends roughly 0.3 seconds building geometry and
fitting the camera on this machine. The remaining large tasks are architectural:
pre-generate frequently used immutable parts and textures (balancing download size
against CPU time), and stop rebuilding the entire boat for changes that only affect
appearance. A worker could keep the UI responsive during construction but would not
by itself reduce total model-generation time; it also requires canvas/texture/font
transfer handling. These are not included in this pass. Measure cold mobile hardware
and production transfer times before choosing a larger asset-based implementation.
