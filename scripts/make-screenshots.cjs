// Captures App Store screenshots from the running game with a caption band.
// Usage: npm run dev (in another terminal), then:
//   node scripts/make-screenshots.cjs
// Output: store/screenshots/iphone-6.9 (1320x2868) and ipad-13 (2064x2752).
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const base = process.env.URL || 'http://localhost:5173';
const outRoot = path.join(__dirname, '..', 'store', 'screenshots');

const DEVICES = [
  { dir: 'iphone-6.9', width: 440, height: 956, scale: 3 },
  { dir: 'ipad-13', width: 1032, height: 1376, scale: 2 },
];

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
};

const SAVE = {
  version: 1, coins: 2480, gems: 0, highestArea: 14, bestSurvival: 312,
  heroLevels: { riya: 8, kai: 7, luna: 6, dae: 3, sora: 0 },
  squad: ['riya', 'kai', 'luna'],
  meta: { power: 6, barrier: 5, slice: 3, feeder: 4, coins: 2 },
  sound: false, music: false, haptics: true, tutorialDone: true, lastDaily: today(),
};

async function caption(p, title, sub) {
  await p.evaluate(([t, s]) => window.setCaption(t, s), [title, sub]);
}

async function battleBot(g) {
  await g.evaluate(() => {
    const e = window.__engine;
    window.__bot = setInterval(() => {
      const s = e.top();
      if (s.trySlice && s.mode === 'play') s.trySlice(0, s.beltY, 720, s.beltY);
    }, 700);
  });
}

(async () => {
  const b = await chromium.launch();
  for (const dev of DEVICES) {
    const dir = path.join(outRoot, dev.dir);
    fs.mkdirSync(dir, { recursive: true });
    const p = await b.newPage({ viewport: { width: dev.width, height: dev.height }, deviceScaleFactor: dev.scale });
    p.on('pageerror', (e) => console.log('page error', e.message));
    await p.goto(base);
    await p.evaluate((s) => localStorage.setItem('idolsquad.save.v1', JSON.stringify(s)), SAVE);
    const open = async () => {
      await p.goto(`${base}/tools/shot.html`);
      await p.waitForTimeout(900);
      return p.frames().find((f) => f !== p.mainFrame());
    };
    let g = await open();
    const shot = (n) => p.screenshot({ path: path.join(dir, n + '.png') });

    // 1. Big battle with a crowd and a boss arriving
    await g.evaluate(() => window.__start(12));
    await battleBot(g);
    await p.waitForTimeout(1500);
    await g.evaluate(() => {
      const s = window.__engine.top();
      s.spawnQueue = [];
      const kinds = ['gremlo', 'bonkito', 'sharky', 'ballerina', 'crocopter', 'gremlo', 'gremlo', 'cactus'];
      for (let i = 0; i < 16; i++) s.spawn(kinds[i % kinds.length]);
      s.enemies.forEach((en, i) => { en.y = s.fieldTop + 80 + (i % 6) * 70; en.spawnT = 1; });
    });
    await p.waitForTimeout(1800);
    await caption(p, 'SLICE THE AMMO!', 'Swipe the belt to reload your idols');
    await shot('1-battle');

    // 2. Boss
    await g.evaluate(() => {
      const s = window.__engine.top();
      s.enemies.forEach((en) => { en.dead = true; });
      s.spawn('boss_kraken');
      s.enemies[s.enemies.length - 1].y = s.fieldTop + 260;
      s.enemies[s.enemies.length - 1].spawnT = 1;
      for (let i = 0; i < 5; i++) s.spawn('gremlo');
    });
    await p.waitForTimeout(2600);
    await caption(p, 'EPIC BOSSES!', 'Take down the Spaghetti Kraken');
    await shot('2-boss');

    // 3. Level-up cards
    await g.evaluate(() => {
      const s = window.__engine.top();
      clearInterval(window.__bot);
      s.pendingLevels = 1;
    });
    await p.waitForTimeout(1400);
    await caption(p, 'BUILD YOUR COMBO', 'A new upgrade every level-up');
    await shot('3-cards');

    // 4. Squad roster
    g = await open();
    await g.evaluate(() => { const h = window.__engine.top(); h.tab = 'squad'; h.selectedHero = 2; });
    await p.waitForTimeout(500);
    await caption(p, 'MEET THE SQUAD', '5 idols, 5 wild weapons');
    await shot('4-squad');

    // 5. Home
    await g.evaluate(() => { window.__engine.top().tab = 'battle'; });
    await p.waitForTimeout(500);
    await caption(p, 'NO ADS · PLAY OFFLINE', '3 worlds · 30 areas · Survival mode');
    await shot('5-home');
    await p.close();
    console.log('wrote', dir);
  }
  await b.close();
})();
