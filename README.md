# OPIF Carbon Footprint Calculator

A static HTML/JS carbon footprint calculator for One Purpos India Forum (OPIF) by CSRBOX. It needs no build step, framework or backend. Every calculation, report and image is generated in the browser.

## Run locally
```
npm run dev     # python3 static server → http://localhost:8080
npm test        # 20 calculation-engine tests (Node 18+)
```

## Deploy on Vercel
1. Push this folder to a Git repository and import it in Vercel.
2. Use framework preset **Other**, leave the build command empty and set the output directory to `.` (the root).
3. Deploy. `index.html` is served at `/`.

CLI: `npx vercel --prod` from this folder.

Sharing never includes a link to this deployment. The caption has no URL. The card shows only the official `csrbox.org/opif` address.

## Structure
| Path | Purpose |
|---|---|
| `index.html` | Page. Header, navigation and footer are copied from csrbox.org/opif (site links point to the live OPIF pages) |
| `assets/carbon/js/factors.js` | Emission factor registry with source, year, geography, limitations and verification date |
| `assets/carbon/js/engine.js` | Pure, deterministic calculation engine |
| `assets/carbon/js/forms.js` | Two-step questionnaire (home, travel; monthly) and its mapping onto the engine |
| `assets/carbon/js/recommendations.js` | Rule-based suggestions and scenario re-calculation |
| `assets/carbon/js/charts.js` | Dependency-free SVG donut and bar charts |
| `assets/carbon/js/export.js` | CSV and PDF reports (jsPDF 2.5.1, vendored) |
| `assets/carbon/js/share-card.js` | Canvas PNG renderer: 3 templates × 4 sizes |
| `assets/carbon/js/share.js` | Card data, caption, Web Share (image + caption), WhatsApp (caption), clipboard |
| `assets/carbon/js/app.js` | UI controller |
| `*.png` | Official OPIF and CSRBOX logos taken from csrbox.org/opif |

## Emission factors (verified 2026-10-23)
- **Grid electricity:** CEA CO2 Baseline Database v21.0, FY 2024-25 weighted average, 0.710 kg CO₂/kWh. This is CO₂ only and excludes T&D losses.
- **Everything else:** UK DESNZ GHG conversion factors 2025 (flat file). This covers LPG, cars, motorbikes, bus, rail and flights with RF. UK factors are used as disclosed proxies where no Indian factor was available.
- **Not included:** diet, shopping and waste.

## Known limitations
- CEA has listed a v22.0. Its PDF could not be downloaded during verification, so v21.0 is used. Update `grid_india` in `factors.js` when v22.0 is confirmed.
- PDFs use the standard Helvetica font, which writes "CO2e" without a subscript. The page and the cards show CO₂e.
- WhatsApp cannot attach the image automatically. Users download the PNG and attach it themselves. Native file sharing works only where `navigator.canShare({files})` is supported (mostly mobile browsers).
- Answers are kept in `sessionStorage` for the current tab only. Nothing is sent to a server.
- This is not a verified audit and makes no GHG Protocol or ISO 14064 compliance claim.
