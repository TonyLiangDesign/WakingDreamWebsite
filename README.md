# WakingDreamWebsite

Single-page coming soon site for `wakingdream.co.nz`.

## Local Preview

Open `index.html` directly in your browser.

## Deploy with GitHub Pages

1. Create a new GitHub repo named `WakingDreamWebsite`.
2. Push this folder to GitHub (commands below).
3. In GitHub repo settings, open **Pages**:
   - Source: **Deploy from a branch**
   - Branch: `main` and folder `/ (root)`
4. Add custom domain in Pages: `wakingdream.co.nz`.
5. In your DNS provider, add:
   - `A` records for apex `wakingdream.co.nz`:
     - `185.199.108.153`
     - `185.199.109.153`
     - `185.199.110.153`
     - `185.199.111.153`
   - `CNAME` for `www` -> `<your-github-username>.github.io`
6. Wait for DNS and HTTPS to become active.

## First Push Commands

```bash
git init
git add .
git commit -m "Initial coming soon site"
git branch -M main
git remote add origin git@github.com:<your-github-username>/WakingDreamWebsite.git
git push -u origin main
```
