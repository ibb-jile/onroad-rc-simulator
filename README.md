# Onroad RC Simulator

Free RC touring car simulator for Mac (Apple silicon): an electric 1/10 touring car on a carpet track.
Website: https://onroadrc.cz/ · Downloads: [Releases](../../releases)

Bezplatný simulátor RC cestovního auta 1/10 na koberci pro Mac s čipem Apple.

The page source is `src/page.html`; `python3 build.py` writes `index.html` for GitHub Pages.

## Track request form

The "More tracks on request" form posts a `multipart/form-data` request to the Vercel function `api/track-request.js`.
The function stores the photos on a branch of a private GitHub repository and opens an issue there. Configuration is
by environment variables on Vercel (values are not in this repository): `GITHUB_REQUESTS_TOKEN`, `REQUESTS_REPO`,
`REQUESTS_BRANCH`, `REQUESTS_LABEL` (optional). Limits: 1 to 8 JPEG photos, 1.5 MB each and 4 MB in total
(the browser downsizes the photos before sending).
