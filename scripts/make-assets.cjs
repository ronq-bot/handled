// Regenerates the iOS app icon and splash images from tools/render.html.
// Usage: npm run dev (in another terminal), then: node scripts/make-assets.cjs
const { chromium } = require('playwright');
const path = require('path');

const base = process.env.URL || 'http://localhost:5173';
const xc = path.join(__dirname, '..', 'ios', 'App', 'App', 'Assets.xcassets');

(async () => {
  const b = await chromium.launch();
  for (const [what, size, outs] of [
    ['icon', 1024, ['AppIcon.appiconset/AppIcon-512@2x.png']],
    ['splash', 2732, ['Splash.imageset/splash-2732x2732.png', 'Splash.imageset/splash-2732x2732-1.png', 'Splash.imageset/splash-2732x2732-2.png']],
  ]) {
    const p = await b.newPage({ viewport: { width: size, height: size } });
    await p.goto(`${base}/tools/render.html?what=${what}`);
    await p.waitForFunction(() => document.title === 'ready');
    const el = await p.$('canvas');
    for (const o of outs) await el.screenshot({ path: path.join(xc, o), omitBackground: false });
    await p.close();
  }
  await b.close();
  console.log('assets written');
})();
