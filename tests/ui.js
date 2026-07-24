/* Headless-Chrome UI tests against :4400. Run: node tests/ui.js */
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const BASE = 'http://localhost:4400';
const CHROME = '/usr/bin/google-chrome';
const FIXTURE = path.join(__dirname, '.tmp-proof.png');
fs.writeFileSync(FIXTURE, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC', 'base64'));

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { (c ? pass++ : fail++); console.log(`${c ? '✓' : '✗ FAIL'} ${n}${x ? ' — ' + x : ''}`); };

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const errors = [];
  const mkCtx = () => (browser.createBrowserContext ? browser.createBrowserContext() : browser.createIncognitoBrowserContext());
  async function newPage(ctx) {
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
    p.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()); });
    return p;
  }

  // ===== A: landing + mode nav + full signup + preload + account =====
  const ctxA = await mkCtx();
  const page = await newPage(ctxA);
  await page.goto(BASE + '/', { waitUntil: 'networkidle0' });
  await page.waitForSelector('#auth-slot button');
  const heroBuyer = await page.$eval('[data-hero-title]', (e) => e.textContent);
  await page.click('.modebtn[data-mode="finder"]');
  const heroFinder = await page.$eval('[data-hero-title]', (e) => e.textContent);
  ok('mode nav swaps hero copy', heroBuyer !== heroFinder && /paid/i.test(heroFinder));
  ok('finds rendered on landing', (await page.$$('.find')).length >= 4, (await page.$$('.find')).length + ' cards');

  // open signup
  await page.click('#auth-slot [data-signup]');
  await page.waitForSelector('#fi-modal [data-panel="signup"]:not([hidden])');
  await page.click('.roleopt[data-role="both"]');
  const email = `test_ui_${Date.now()}@demo.findit4you.app`;
  await page.type('input[name="full_name"]', 'UI Tester');
  await page.type('input[name="phone"]', '615-555-0199');
  await page.type('[data-panel="signup"] input[name="email"]', email);
  await page.type('[data-panel="signup"] input[name="password"]', 'findit4you-demo');
  await page.type('input[name="address_line1"]', '99 Test Ave');
  await page.type('input[name="city"]', 'Nashville');
  await page.select('select[name="state"]', 'TN');
  await page.type('input[name="postal_code"]', '37201');
  await page.click('[data-form="signup"] button[type="submit"]');
  await page.waitForSelector('#fi-modal [data-panel="preload"]:not([hidden])', { timeout: 10000 });
  ok('signup → preload nudge shown', true);
  await page.click('.amtbtn[data-amt="10000"]');
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle0' }),
    page.click('[data-preload-go]'),
  ]);
  ok('preload redirects to account', page.url().includes('/account.html'));
  await page.waitForSelector('#acct-balance');
  const bal = await page.$eval('#acct-balance', (e) => e.textContent);
  ok('account shows preloaded balance', bal.includes('100'), bal);
  const name = await page.$eval('#acct-name', (e) => e.textContent);
  ok('account shows name', /UI Tester/.test(name));
  // tabs
  await page.click('.atab[data-tab="wallet"]');
  ok('wallet tab shows ledger deposit', /Pre-load/.test(await page.$eval('[data-panel="wallet"]', (e) => e.textContent)));
  await page.click('.atab[data-tab="profile"]');
  ok('profile tab prefilled', (await page.$eval('input[name="city"]', (e) => e.value)) === 'Nashville');

  // ===== B: marketplace actions as a finder (jayme): claim → mark found + upload → chat → watchlist =====
  const ctxB = await mkCtx();
  const p2 = await newPage(ctxB);
  await p2.goto(BASE + '/', { waitUntil: 'networkidle0' });
  await p2.waitForSelector('#auth-slot [data-login]');
  await p2.click('#auth-slot [data-login]');
  await p2.waitForSelector('#fi-modal [data-panel="login"]:not([hidden])');
  await p2.type('[data-panel="login"] input[name="email"]', 'jayme@demo.findit4you.app');
  await p2.type('[data-panel="login"] input[name="password"]', 'findit4you-demo');
  await p2.click('[data-form="login"] button[type="submit"]');
  await p2.waitForSelector('.nav-wallet', { timeout: 10000 });
  ok('login shows wallet chip in nav', true);

  // watchlist heart on some card
  await p2.waitForSelector('.find .heart');
  await p2.click('.find .heart');
  await new Promise((r) => setTimeout(r, 400));
  ok('watchlist heart toggles on', (await p2.$$('.heart.on')).length >= 1);

  // claim an open find
  await p2.waitForSelector('[data-act="claim"]');
  const claimId = await p2.$eval('[data-act="claim"]', (b) => b.dataset.id);
  await p2.click(`[data-act="claim"][data-id="${claimId}"]`);
  await p2.waitForFunction((id) => { const c = document.querySelector(`[data-card="${id}"] .chip`); return c && /Claimed/.test(c.textContent); }, {}, claimId);
  ok('finder claim updates card to Claimed', true);

  // mark found + upload photo
  await p2.click(`[data-act="markfound"][data-id="${claimId}"]`);
  await p2.waitForSelector(`input[data-file="${claimId}"]`);
  const input = await p2.$(`input[data-file="${claimId}"]`);
  await input.uploadFile(FIXTURE);
  await p2.type(`textarea[data-note="${claimId}"]`, 'Found at Marshalls, $18.99');
  await p2.click(`[data-act="submitfound"][data-id="${claimId}"]`);
  await p2.waitForFunction((id) => { const c = document.querySelector(`[data-card="${id}"] .chip`); return c && /Found/.test(c.textContent); }, { timeout: 15000 }, claimId);
  const hasPhoto = await p2.$(`[data-card="${claimId}"] .proof-img img`);
  ok('mark-found uploads photo + advances to Found', !!hasPhoto);

  // chat: open + send
  await p2.click(`[data-act="chat"][data-id="${claimId}"]`);
  await p2.waitForSelector(`[data-chatinput="${claimId}"]`);
  await p2.type(`[data-chatinput="${claimId}"]`, 'On my way to drop it off!');
  await p2.click(`[data-chatform="${claimId}"] button`);
  await p2.waitForFunction((id) => /On my way/.test(document.querySelector(`[data-msgs="${id}"]`)?.textContent || ''), { timeout: 8000 }, claimId);
  ok('chat sends & displays message', true);

  ok('NO console/page errors', errors.length === 0, errors.slice(0, 3).join(' | '));

  await browser.close();
  fs.unlinkSync(FIXTURE);
  console.log(`\n${fail === 0 ? '✅ ALL PASS' : '❌ FAILURES'} — ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('UI TEST CRASH:', e.message); process.exit(1); });
