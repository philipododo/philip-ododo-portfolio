// Headless driver for the static portfolio page.
// Serves the HTML file's folder over http://127.0.0.1, opens it in the
// installed Google Chrome (playwright-core, channel "chrome"), then reads one
// command per line from stdin. Run `help` for the command list.
//
//   node driver.mjs [path/to/page.html] < commands.txt
//
// Default page: the loose HTML file in the unit root.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const UNIT = path.resolve(HERE, '../../..');
const PAGE = path.resolve(process.argv[2] || path.join(UNIT, 'index.html'));
const SHOTS = path.resolve(process.env.SHOTS_DIR || path.join(HERE, 'shots'));
const CHANNEL = process.env.BROWSER_CHANNEL || 'chrome'; // or msedge

if (!fs.existsSync(PAGE)) { console.error(`ERR page not found: ${PAGE}`); process.exit(1); }
fs.mkdirSync(SHOTS, { recursive: true });

// --- static server (so relative assets resolve like a real deploy) ---
const ROOT = path.dirname(PAGE);
const TYPES = { '.html': 'text/html; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.pdf': 'application/pdf', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  // Chrome auto-requests /favicon.ico; the page declares none, so don't let
  // that 404 show up as a page error.
  if (rel === '/favicon.ico') { res.writeHead(204).end(); return; }
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404).end('not found'); return; }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const URL_BASE = `http://127.0.0.1:${server.address().port}/${encodeURIComponent(path.basename(PAGE))}`;

// --- browser ---
const browser = await chromium.launch({ channel: CHANNEL, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: process.env.REDUCED_MOTION ? 'reduce' : 'no-preference' });
const page = await ctx.newPage();
const problems = [];
page.on('console', m => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });
page.on('pageerror', e => problems.push(`pageerror: ${e.message}`));
page.on('requestfailed', r => problems.push(`requestfailed: ${r.url()} ${r.failure()?.errorText}`));
page.on('response', r => { if (r.status() >= 400) problems.push(`http ${r.status()}: ${r.url()}`); });

let shotN = 0;
const shotPath = name => path.join(SHOTS, `${String(++shotN).padStart(2, '0')}-${name || 'shot'}.png`);

// Scroll through the whole page so every IntersectionObserver `.reveal`
// fires; otherwise below-the-fold cards stay opacity:0 in a full-page shot.
// behavior:'instant' is required: the page sets html{scroll-behavior:smooth},
// so a plain scrollTo(0,y) animates and barely moves between steps.
async function revealAll() {
  // Scroll each still-hidden element into view and wait two frames: a blind
  // fixed-step loop misses elements when few frames render (e.g. reduced motion
  // stops the hero canvas, so headless Chrome paints less often).
  await page.evaluate(async () => {
    const frame = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    for (const el of document.querySelectorAll('.reveal:not(.visible)')) {
      if (el.classList.contains('visible')) continue;
      el.scrollIntoView({ block: 'center', behavior: 'instant' }); await frame(); await new Promise(r => setTimeout(r, 30));
    }
    window.scrollTo({ top: 0, behavior: 'instant' });
  });
  await page.waitForFunction(() => [...document.querySelectorAll('.reveal')].every(e => e.classList.contains('visible')), null, { timeout: 5000 });
  // .reveal is .6s, staggered children add up to ~.4s, stat count-up is 1.1s
  await page.waitForTimeout(1600);
}

const HELP = `commands:
  nav [#hash]            load the page (optionally at an anchor)
  viewport W H           resize, e.g. viewport 390 844 for phone
  ss [name]              viewport screenshot
  full [name]            full-page screenshot (scrolls first to trigger .reveal)
  el <selector> [name]   screenshot one element
  click <selector>       click (Playwright selector, e.g. text=Experience)
  hover <selector> [fx fy]  move mouse over element (fx/fy = 0..1 position, default .5 .5)
  key <Key>              press a key, e.g. key Escape
  scroll <selector>      scroll element into view
  eval <js expression>   evaluate in page, print JSON result
  text <selector>        print innerText
  check                  smoke assertions (sections, nav, reveal, year, no errors)
  errors                 print console/page/network problems so far
  wait <ms>              sleep
  quit                   close browser and exit`;

const cmds = {
  async nav(a) { await page.goto(URL_BASE + (a || ''), { waitUntil: 'load' }); return page.url(); },
  async viewport(a) { const [w, h] = a.split(/\s+/).map(Number); await page.setViewportSize({ width: w, height: h }); return `${w}x${h}`; },
  async ss(a) { const p = shotPath(a); await page.screenshot({ path: p }); return p; },
  async full(a) { await revealAll(); const p = shotPath(a || 'full'); await page.screenshot({ path: p, fullPage: true }); return p; },
  async el(a) { const [sel, name] = splitLast(a); const p = shotPath(name || 'element'); await page.locator(sel).first().screenshot({ path: p }); return p; },
  async click(a) { await page.locator(a).first().click(); await page.waitForTimeout(800); return `scrollY=${await page.evaluate(() => Math.round(scrollY))} url=${page.url()}`; },
  async hover(a) {
    const m = a.match(/^(.*?)(?:\s+([\d.]+)\s+([\d.]+))?$/);
    const el = page.locator(m[1]).first(); await el.scrollIntoViewIfNeeded();
    const b = await el.boundingBox(); const fx = m[2] ? +m[2] : .5, fy = m[3] ? +m[3] : .5;
    await page.mouse.move(b.x + b.width * fx, b.y + b.height * fy, { steps: 8 }); await page.waitForTimeout(400); return 'ok';
  },
  async key(a) { await page.keyboard.press(a); await page.waitForTimeout(400); return 'ok'; },
  async scroll(a) { await page.locator(a).first().scrollIntoViewIfNeeded(); await page.waitForTimeout(700); return 'ok'; },
  async eval(a) { return JSON.stringify(await page.evaluate(a)); },
  async text(a) { return await page.locator(a).first().innerText(); },
  async errors() { return problems.length ? problems.join('\n') : 'none'; },
  async wait(a) { await page.waitForTimeout(Number(a) || 500); return 'ok'; },
  async check() {
    const r = await page.evaluate(() => {
      const ids = ['home', 'about', 'experience', 'work', 'skills', 'education', 'contact'];
      return {
        missingSections: ids.filter(id => !document.getElementById(id)),
        brokenAnchors: [...document.querySelectorAll('a[href^="#"]')].map(a => a.getAttribute('href')).filter(h => h.length > 1 && !document.querySelector(h)),
        year: document.getElementById('year')?.textContent,
        reveal: document.querySelectorAll('.reveal').length,
        revealVisible: document.querySelectorAll('.reveal.visible').length,
        h1: document.querySelector('h1')?.innerText.replace(/\s+/g, ' '),
        hOverflow: document.documentElement.scrollWidth > innerWidth,
        // count-up stats: once revealed and settled they must show their original text
        statsWrong: [...document.querySelectorAll('.stats.visible .stat strong[data-final]')].filter(s => s.textContent !== s.dataset.final).map(s => `${s.textContent}!=${s.dataset.final}`),
      };
    });
    const fail = [];
    if (r.missingSections.length) fail.push(`missing sections ${r.missingSections}`);
    if (r.brokenAnchors.length) fail.push(`broken anchors ${r.brokenAnchors}`);
    if (r.year !== String(new Date().getFullYear())) fail.push(`year=${r.year}`);
    if (r.hOverflow) fail.push('horizontal overflow');
    if (r.statsWrong.length) fail.push(`stats not settled ${r.statsWrong}`);
    if (problems.length) fail.push(`${problems.length} problem(s), run errors`);
    return JSON.stringify(r) + (fail.length ? `\nCHECK FAIL: ${fail.join('; ')}` : '\nCHECK PASS');
  },
};
const splitLast = s => { const m = s.match(/^(.*\S)\s+([\w-]+)$/); return m && !/[\s"'=]/.test(m[2]) && m[1].match(/[.#\]=:]/) ? [m[1], m[2]] : [s, '']; };

console.log(`READY ${URL_BASE}  (shots -> ${SHOTS})`);
const rl = readline.createInterface({ input: process.stdin, terminal: false });
for await (const line of rl) {
  const t = line.trim(); if (!t || t.startsWith('#')) continue;
  const [c, ...rest] = t.split(' '); const a = rest.join(' ');
  console.log(`> ${t}`);
  if (c === 'quit') break;
  if (c === 'help') { console.log(HELP); continue; }
  if (!cmds[c]) { console.log(`ERR unknown command: ${c} (try help)`); continue; }
  try { console.log(await cmds[c](a)); } catch (e) { console.log(`ERR ${e.message.split('\n')[0]}`); }
}
await browser.close(); server.close();
console.log('BYE');
