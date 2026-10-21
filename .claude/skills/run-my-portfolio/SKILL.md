---
name: run-my-portfolio
description: Run, open, preview, screenshot, smoke-test, or check Philip Ododo's static portfolio page (one HTML file plus image/PDF assets beside it). Use when asked to view or screenshot the portfolio, check it on mobile/desktop, test its animations or interactions (nav, menu, lightbox, hover effects), or confirm an edit to the HTML renders correctly.
---

The portfolio is one static HTML page with inline CSS/JS (no build, no dependencies) and a few assets in the same folder. Drive it with `.claude/skills/run-my-portfolio/driver.mjs`. The driver serves the page's folder on a random `127.0.0.1` port, opens it in the **installed Google Chrome** (headless, via `playwright-core`) and runs one command per stdin line.

All paths are relative to the unit root (`my portfolio/`). Verified on Windows 10 with Git Bash, Node 24 and Chrome/Edge 155.

## What's here

- `index.html` is the page and the source of truth. The driver uses it by default. It's live via GitHub Pages at https://philipododo.github.io/philip-ododo-portfolio/ from repo `philipododo/philip-ododo-portfolio`, branch `main`, root. Pushing to `main` redeploys.
- Assets the page loads from its own folder: `philip-ododo-headshot.jpg`, `innovest-illustrative-dashboard.jpg`, `telstra-illustrative-dashboard.jpg` and `Philip_Ugbede_Ododo_Resume.pdf`. **Deploy the page together with these files.**
- `philip_ododo_portfolio_updated_package_no_emdashes.zip` (git-ignored, local only) is the *original* package: an older `index.html` and the source PNG dashboards (~1.5 MB each). The page now uses JPEG re-encodes (~220 KB each).

## Setup (once)

Node is required. Chrome or Edge must be installed; no Playwright browser download is needed.

```bash
cd .claude/skills/run-my-portfolio && npm install && cd -
```

## Run (agent path)

```bash
node .claude/skills/run-my-portfolio/driver.mjs <<'EOF'
nav
full desktop-full
check
viewport 390 844
nav
full phone-full
check
errors
quit
EOF
```

Expect `CHECK PASS` twice and `errors` → `none`. Screenshots go to `.claude/skills/run-my-portfolio/shots/NN-<name>.png`. Numbering restarts at `01` on every run, so a shot with the same name and position replaces the old one. Set `SHOTS_DIR=...` to write them somewhere else. **Open the PNGs and look at them.**

The interactive parts, exercised one after another:

```bash
node .claude/skills/run-my-portfolio/driver.mjs <<'EOF'
nav
wait 1500
hover .hero-card .8 .25
ss hero-tilt
click .links >> text=Selected impact
eval document.querySelector('.links a.active')?.textContent
hover .case-grid .case .3 .3
ss impact-spotlight
click .visual a
ss lightbox
key Escape
eval document.querySelector('.lightbox').classList.contains('open')
viewport 390 844
nav
click .menu-btn
ss phone-menu
click .links >> text=Education
quit
EOF
```

To check the reduced-motion path (everything visible, no animation), prefix the command with `REDUCED_MOTION=1`.

| command | what it does |
|---|---|
| `nav [#hash]` | load the page, optionally at an anchor (`#home #about #experience #work #skills #education #contact`) |
| `viewport W H` | resize the viewport. The layout collapses at ≤800px (hamburger menu); use `390 844` for phone |
| `ss [name]` | screenshot the viewport |
| `full [name]` | full-page screenshot. It scrolls every `.reveal` into view and waits 1.6s so entrances and stat counters settle |
| `el <selector> [name]` | screenshot one element, e.g. `el .contact contact` |
| `click <selector>` | Playwright selector, e.g. `.links >> text=Education`. Prints the resulting `scrollY` and URL |
| `hover <selector> [fx fy]` | move the mouse over an element at a fractional position (0..1). Triggers the tilt, spotlight and magnetic effects |
| `key <Key>` | press a key, e.g. `key Escape` |
| `scroll <selector>` | scroll the element into view |
| `eval <js>` | evaluate in the page and print the result as JSON. Promises are awaited |
| `text <selector>` | print `innerText` |
| `check` | smoke assertions: all 7 section ids exist, no broken `#` anchors, `#year` is current, no horizontal overflow, revealed stats show their final values, no console/page/network errors |
| `errors` | console errors, page errors, failed requests and HTTP 4xx/5xx responses so far |
| `wait <ms>` / `help` / `quit` | |

## Run (human path)

Double-click the HTML file. It opens in the default browser and all features work from `file://`.

## Preview link (claude.ai Artifact)

A private preview is published at https://claude.ai/artifact/9iDsNtNSkFxUPwy9dYM8R1 (shared from that page's Share menu). To update it, copy `index.html` and the four assets into a staging folder, and publish with the Artifact tool, passing `url` set to that link. Include the assets in `files` and declare `capabilities: {downloads: true}`. Publishing without `url` creates a new link.

- **The viewer blocks plain `<a download>` links.** The page's script detects `window.claude`, then fetches the PDF and offers it through `claude.use('downloads').save(...)`. On any other host `window.claude` is absent and the plain link is used, so the locally served page behaves the same as before.

## Test

There is no test suite. The `check` command in the driver is the test.

## What the page's script does

All of it lives in the one inline `<script>` at the end of the page.

- An animated node network on a `<canvas class="hero-canvas">` that reacts to the cursor. It pauses when the hero is off-screen or the tab is hidden.
- The headline is split into one masked line per `<br>`. Animation CSS is gated on the `html.js` class, which is set in `<head>`.
- Stats count up from `data-final`. Pillars and stats get a `.stagger` entrance; experience rows draw a gold rule.
- Active-nav highlighting, a scroll progress bar, a mobile menu (`.menu-btn`), and a dashboard lightbox (Esc or a backdrop click closes it).
- Mouse-only effects (`(hover:hover) and (pointer:fine)`): hero-card tilt with glare, card spotlights, magnetic buttons (using the `translate` property so they don't fight the `:hover` transform).
- `prefers-reduced-motion: reduce` turns all of this off and draws one still frame of the network.

## Gotchas

- **Cards below the fold are invisible in naive screenshots.** All 13 `.reveal` elements start at `opacity:0` until an IntersectionObserver sees them. Use `full`, not a raw `fullPage` screenshot.
- **`window.scrollTo(0, y)` barely moves the page.** It sets `html{scroll-behavior:smooth}`, so use `scrollTo({top:y, behavior:'instant'})`.
- **A fixed-step scroll loop misses elements under reduced motion.** With the canvas stopped, headless Chrome renders fewer frames and the observer skips elements passed in 60 ms. The driver scrolls each hidden `.reveal` into view and waits two `requestAnimationFrame`s instead.
- **Shots taken right after `nav` catch the intro mid-animation.** The headline, lede and card fade in over about 1.5s. Run `wait 1500` before `ss` of the hero. The same applies to `el` on a lower section: run `full` first (it settles every reveal), or the shot shows half-faded cards under the sticky nav.
- **Revealed state sticks until reload.** Run `nav` again before measuring first-paint state.
- **Hover effects need a fine pointer.** Playwright's default desktop context reports one, so `hover` works. Under a touch/mobile emulation the effects are intentionally inert.
- **Captions use a block `<strong>` title.** Copying `figcaption.textContent` mashes the title into the body ("…AfrikaIllustrative…"). The lightbox copies `innerHTML`.
- **Dates use an en dash (`May 2025 – Aug 2025`) and labels use `·`.** The file was deliberately scrubbed of em dashes, so don't reintroduce `—`.
- **Don't run `chrome.exe --version` on Windows.** It opens a tab in the user's running Chrome. List `C:/Program Files/Google/Chrome/Application/` instead.

## Troubleshooting

- **`browserType.launch: Target page, context or browser has been closed` with `--headless=old` in the log** (this happened with `BROWSER_CHANNEL=msedge`): playwright-core older than about 1.49 asks for the old headless mode, which current Edge no longer supports. The skill pins `playwright-core` at `1.59.1`; run `npm install` in the skill dir.
- **`errors` shows `Failed to load resource: ... 404`** with no URL: this was Chrome auto-requesting `/favicon.ico`. The driver's server answers it with 204. If you see it again, an asset is missing from the page's folder.
- **`errors` shows `requestfailed: ...pdf net::ERR_ABORTED`**: a `fetch()` from `eval` was still in flight when `nav` reloaded the page. This is a test artifact; await the fetch before navigating.
- **`full` → `ERR page.waitForFunction: Timeout 5000ms exceeded`**: some `.reveal` never got `.visible`. Check the inline script for a JS error with `errors`.
- **`tar: This does not look like a tar archive`** when extracting the zip in Git Bash: Git Bash's `tar` is GNU tar, which can't read zip files. Use `unzip`.
- **`ERR_UNSUPPORTED_ESM_URL_SCHEME ... Received protocol 'c:'`** when importing `playwright-core` from a one-off script by absolute path: use a `file:///C:/...` URL with spaces encoded as `%20`.
- **Chrome not installed:** run with `BROWSER_CHANNEL=msedge`.
