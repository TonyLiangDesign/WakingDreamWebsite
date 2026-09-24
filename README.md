# Waking Dream Technology — wakingdream.co.nz

Static studio site with two listed project pages, a selected-work page and an unlisted OneChair page. No build step; plain HTML + one stylesheet.

```
/                 studio home
/onechair/        OneChair — temporarily unlisted; retained for restoration (noindex)
/tessera/         Tessera — 3D creation app for iOS, iPadOS and macOS; in development (notify-me form)
/titanic/         Back to Titanic — immersive project in development; experience + prototype views
/about/           studio
/unreal-visualisation/  automotive, Reebok IMPACT, Metahuman, Digital Medal and VintageUI case studies
/thank-you.html   form landing; `?p=onechair|tessera|titanic` picks the copy
/assets/          images
/assets/unreal/   optimised WebP images, posters, WebM and MP4 videos
/_drafts/         local-only scratch (git-ignored)
```

Links and asset paths are root-relative (`/assets/...`), so the site must be served from a
domain root, which GitHub Pages with a custom domain does.

OneChair is temporarily removed from navigation, homepage cards and public studio copy.
Its page files remain available by direct URL; this is an unlisted page, not access control.
Unreal Visualisation is the first navigation item on every page.

## Local preview

```bash
python3 -m http.server 8080
```

Then open http://localhost:8080/ (opening `index.html` directly will not resolve `/styles.css`).

## Unreal Visualisation media

Reebok IMPACT credits Reebok and Futureverse. Its four supplied square renders
appear in a square carousel with four selection dots, matching the automotive controls.
Both carousels rotate independently every five seconds while visible and respect
the shared motion toggle and reduced-motion preference. WebP copies at 540 px and
1080 px use responsive image selection and lazy loading; the original PNGs remain
in iCloud at `Dropbox 备份/WorksOld/ReebokImpact/PNG`. The images follow the supplied
order: `Showcase_04Image`, `Showcase02_Image`, `Showcase03_Image`, `Showcase04_Image`.

The page uses web copies of the selected portfolio originals. Originals remain outside
this repository. All three videos preserve their full duration and audio. Browsers
receive a VP9/Opus WebM first, with H.264 MP4 as the compatibility fallback. MP4s
use `yuv420p`, AAC audio at 80 kb/s, and `+faststart` for progressive playback.
Scenes use the standard centred content width (maximum 1120 px) with silent,
looping background video and no player controls. Landscape media retains its
original aspect ratio; the portrait medal is capped at 680 px high.
Posters appear first; `motion.js` attaches sources and starts playback only when a
scene enters the viewport. Off-screen videos and hidden tabs pause. The small
page-level motion toggle and `prefers-reduced-motion` support static viewing.
`playsinline` prevents fullscreen takeover on mobile. Metahuman uses the original
SJ01 footage; its asset filenames remain `sj01` for continuity.

| Asset | Original | MP4 copy | Resolution / encoding |
| --- | --- | --- | --- |
| SJ01 | 71.16 MB | 2.19 MB | 1280 × 720, 29.97 fps, CRF 25 |
| VintageUI | 91.19 MB | 1.73 MB | 1440 × 772, 29.97 fps, CRF 25 |
| Digital Medal (`RenderResult_11May`) | 6.39 MB | 2.28 MB | 720 × 1280, 25 fps, CRF 24 |

MP4 video total: 168.73 MB → 6.20 MB (96.3% smaller). WebM totals 5.60 MB
(SJ01 1.38 MB, VintageUI 1.95 MB, Digital Medal 2.28 MB), 96.7% smaller than
the originals. Browsers load only their selected format, when the scene enters view. WebM uses VP9
CRF 33 and Opus audio at 64 kb/s, derived from the optimised MP4s.

Automotive images have 800 px, 1600 px and 2560 px WebP variants selected via
`srcset`, crossfading in a standard-width scene. The three car views run in the order
3 / 1 / 2: steering wheel, centre console, paddle shifter. Dots below the images
allow direct selection; the active dot stays in sync with the five-second rotation.
Rotation pauses off-screen, in a hidden tab, or when motion is disabled. The third
view is a web export of SteeringWheelCloseUp2.exr with display-gamma conversion.
Video posters are WebP stills. Encodes use ffmpeg's `libx264` slow preset; image
quality is 87 for automotive stills and 85 for posters.

## Forms

The Tessera and Titanic forms post to formsubmit.co for `tony@wakingdream.co.nz`. The **first** submission
to a new address triggers an activation email from formsubmit — click it once or nothing is
delivered. Each form carries a hidden `product` field and redirects to `/thank-you.html?p=…`.

## Domains (plan A: one repo, one design system)

Target state:

| Domain | Role |
|---|---|
| `wakingdream.co.nz` | this site, served by GitHub Pages |
| `www.wakingdream.co.nz` | CNAME to `tonyliangdesign.github.io`, GitHub redirects to apex |
| `onechair.ai` | registrar-level forward (301) to `https://wakingdream.co.nz/onechair/` |

Switch-over, in this order:

1. At the registrar for `wakingdream.co.nz`: delete the URL forward to onechair.ai; add
   `A` records for the apex → `185.199.108.153`, `185.199.109.153`, `185.199.110.153`,
   `185.199.111.153`; add `CNAME www` → `tonyliangdesign.github.io`.
2. Change the `CNAME` file in this repo from `onechair.ai` to `wakingdream.co.nz`, commit, push.
   GitHub Pages → Settings → Pages: confirm the custom domain and tick **Enforce HTTPS**
   once the certificate is issued (can take up to an hour after DNS resolves).
3. At the registrar for `onechair.ai`: set a URL forward (301) to `https://wakingdream.co.nz/onechair/`.

Until step 2 is done the site is served at `onechair.ai` with the new design, and the form
redirects to `wakingdream.co.nz/thank-you.html` will bounce through the old forward. That is
the expected transition state.
