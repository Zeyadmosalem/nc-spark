// Drives the real app in a real browser and captures the screens named on
// the command line. Uses the Edge already installed on this machine rather
// than downloading a Playwright browser.
import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';

const BASE = process.env.BASE ?? 'http://localhost:5199';
const OUT = process.env.OUT ?? 'shots';
const THEME = process.env.THEME ?? 'light';
const EMAIL = process.env.EMAIL ?? 'trainee@ncspark-review.local';

// Passed in rather than written down: the review password is a real
// credential and this file is in a scratch directory.
const PASSWORD = process.env.REVIEW_PASSWORD;
if (!PASSWORD) {
  console.error('Set REVIEW_PASSWORD');
  process.exit(1);
}
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

const targets = process.argv.slice(2);
if (targets.length === 0) {
  console.error('usage: node shoot.mjs <path>[:<name>] ...');
  process.exit(1);
}

const browser = await chromium.launch({ channel: 'msedge' });
const context = await browser.newContext({
  viewport: { width: 1440, height: 960 },
  deviceScaleFactor: 2,
  colorScheme: THEME === 'dark' ? 'dark' : 'light',
});
const page = await context.newPage();

page.on('console', (m) => {
  if (m.type() === 'error') console.log('  [console error]', m.text().slice(0, 200));
});
page.on('pageerror', (e) => console.log('  [page error]', String(e).slice(0, 200)));

// Sign in once; the session carries across every capture. SKIP_LOGIN
// captures the signed-out screens, which are the ones a visitor meets first.
await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
if (process.env.SKIP_LOGIN) {
  for (const target of targets) {
    const [path, name] = target.split('::');
    await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(900);
    const slug = name || 'root';
    await page.screenshot({ path: `${OUT}/${slug}-${THEME}.png` });
    console.log('shot', slug);
  }
  await browser.close();
  process.exit(0);
}
await page.getByLabel(/email/i).first().fill(EMAIL);
await page.getByLabel(/password/i).first().fill(PASSWORD);
await page.getByRole('button', { name: /sign in|log in/i }).first().click();
await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 20000 });
console.log('signed in ->', new URL(page.url()).pathname);

// The theme toggle writes to the same key ThemeProvider reads.
if (THEME === 'dark') {
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
}

for (const target of targets) {
  const [path, name] = target.split('::');
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
  // Let entrance animations settle so the shot is the resting state.
  await page.waitForTimeout(1200);
  const slug = name || path.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'root';
  const file = `${OUT}/${slug}-${THEME}.png`;
  await page.screenshot({ path: file, fullPage: false });
  console.log('shot', file, '->', new URL(page.url()).pathname);
}

await browser.close();
