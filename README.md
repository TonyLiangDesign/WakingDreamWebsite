# Waking Dream Technology — wakingdream.co.nz

Static studio site with three product pages. No build step; plain HTML + one stylesheet.

```
/                 studio home
/onechair/        OneChair — film studio in one chair (private beta form)
/tessera/         Tessera — describe a scene, rendered on device (notify-me form)
/titanic/         Back to Titanic — full-ship reconstruction + timeline + build log
/about/           studio
/aquarium/        saltwater reef tank (Three.js, procedural, CDN)
/thank-you.html   form landing; `?p=onechair|tessera|titanic` picks the copy
/assets/          images
/_drafts/         local-only scratch (git-ignored)
```

Links and asset paths are root-relative (`/assets/...`), so the site must be served from a
domain root, which GitHub Pages with a custom domain does.

## Local preview

```bash
python3 -m http.server 8080
```

Then open http://localhost:8080/ (opening `index.html` directly will not resolve `/styles.css`).

## Forms

All three forms post to formsubmit.co for `tony@wakingdream.co.nz`. The **first** submission
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
