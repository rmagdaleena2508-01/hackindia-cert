# HackIndia Certificate Studio

Animated, signed hackathon certificates that people actually want to post.

**Live:** https://hackindia-cert.vercel.app (studio) · https://hackindia-cert.vercel.app/verify.html (check page)

**Code:** https://github.com/rmagdaleena2508-01/hackindia-cert

## Run it

```bash
python3 -m http.server 8890 --directory hackindia-cert
```

Then open http://localhost:8890. On your own computer the studio signs with `issuer-key.js`, so no passcode is needed.

## Deploys

The GitHub repo is connected to Vercel. Every push to `main` updates the live site by itself. Pushes to other branches get their own preview link.

## How signing works on the live site

- The private key is **not** on the website. It is stored in the Vercel secret `ISSUER_PRIVATE_JWK`.
- The studio sends certificates to `api/sign`. That only works with the issuer passcode (Vercel secret `ISSUER_PASSCODE`). Your copy is in `.issuer-passcode`, which is never uploaded.
- Anyone can open the studio and preview a certificate, but nobody can sign one without the passcode.
- To change the passcode: `npx vercel env rm ISSUER_PASSCODE production`, then `npx vercel env add ISSUER_PASSCODE production`, then push any commit to `main` (or run `npx vercel deploy --prod`).

## What it does

- **Moving certificate.** The border draws itself, a light sweeps left to right, the name writes on, then the rank badge pops and the QR code prints. Colors keep flowing, and the badge glows and twinkles.
- **Every certificate looks different.** The certificate ID picks the ribbons, color fields, dot wave, banknote-style spiral pattern and badge petals. The same ID always gives the same look.
- **Two themes.** Paper (light) and Night (dark), both in HackIndia orange and green.
- **Badge per tier.** Winner, 1st/2nd Runner-up, Finalist, Special Mention and Participant each get their own shape and color.
- **Real check.** The QR code and link hold the details plus an ECDSA P-256 signature. `verify.html` checks it. If anyone changes the name or rank, the page says "not valid" and greys out the certificate.
- **Video under 3 MB.** A 9-second MP4 at 1280×904 that loops with no jump (about 2.4 MB). Every frame is encoded one by one with WebCodecs, which takes about 2 seconds. The first frame shows the finished certificate, so LinkedIn's thumbnail looks right.
- **Sharing.** "Add to LinkedIn profile" fills in LinkedIn's certification form for you. There is also "Share post", PNG download, and "Share video…" on phones.
- **Bulk.** Paste a list, issue them all, and download a CSV with every verify link and LinkedIn link.

## Files

| File | Job |
|---|---|
| `cert.js` | Draws the certificate and runs the whole animation timeline |
| `sign.js` | Signs and checks links |
| `export.js` | Makes the MP4 and PNG, and the LinkedIn links |
| `index.html` + `app.js` | Studio for organisers |
| `api/sign.js` | Vercel function that signs (needs the passcode) |
| `verify.html` | Public check page |
| `issuer-key.js` | Private key for signing on your own computer. Never uploaded |
| `public-key.js` | Public key used by the check page |

## Still to do

1. Replace the drawn mark in `cert.js` (look for "brand mark") with the official HackIndia logo, and check the exact brand hex codes.
2. Optional: point a custom domain (like `certificates.hackindia.xyz`) at the Vercel project.
3. Optional: add a short-link service (`/v/HI26-XXXX`). The QR code gets much simpler, and you can cancel a certificate later.
