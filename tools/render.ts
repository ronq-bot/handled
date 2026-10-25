// Renders the app icon and launch artwork from the game's own drawing code.
// Open /tools/render.html?what=icon (1024x1024) or ?what=splash (2732x2732);
// scripts/make-assets.cjs screenshots these into the Xcode asset catalog.

import { drawEnemy, drawHero, star, text } from '../src/art';
import { HEROES } from '../src/data';

const what = new URLSearchParams(location.search).get('what') || 'icon';
const size = what === 'icon' ? 1024 : 2732;
const c = document.getElementById('c') as HTMLCanvasElement;
c.width = c.height = size;
const ctx = c.getContext('2d')!;

function backdrop(s: number) {
  const g = ctx.createRadialGradient(s / 2, s * 0.42, s * 0.05, s / 2, s / 2, s * 0.75);
  g.addColorStop(0, '#9b5cff');
  g.addColorStop(0.55, '#4a1fa0');
  g.addColorStop(1, '#1a0b40');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  // Light rays
  ctx.save();
  ctx.translate(s / 2, s * 0.42);
  ctx.globalAlpha = 0.12;
  for (let i = 0; i < 12; i++) {
    ctx.rotate(Math.PI / 6);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-s * 0.08, -s);
    ctx.lineTo(s * 0.08, -s);
    ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.fill();
  }
  ctx.restore();
}

function draw() {
  if (what === 'icon') {
    backdrop(1024);
    // Brainrot monster peeking over the idol's shoulder
    drawEnemy(ctx, 'bonkito', 760, 380, 230, 0.6, 0, false, 0);
    star(ctx, 170, 190, 70, '#ffe066', 8);
    star(ctx, 120, 380, 36, '#7ee8ff', 6);
    drawHero(ctx, HEROES[0], 430, 1080, 4.4, 0.3, 0.35, 0);
  } else {
    backdrop(2732);
    const cx = 2732 / 2;
    drawEnemy(ctx, 'boss_gremking', cx, 1100, 360, 0.3, 0, false, 0);
    drawHero(ctx, HEROES[0], cx - 420, 1900, 3.2, 0.1, -0.2, 0);
    drawHero(ctx, HEROES[1], cx, 1960, 3.2, 0.5, 0, 0);
    drawHero(ctx, HEROES[2], cx + 420, 1900, 3.2, 0.9, 0.2, 0);
    ctx.save();
    ctx.translate(cx, 2200);
    ctx.rotate(-0.04);
    text(ctx, 'IDOL SQUAD', 0, 0, 230, '#ff8fd0');
    ctx.restore();
    text(ctx, 'BRAINROT DEFENSE', cx, 2390, 110, '#7ee8ff');
  }
  document.title = 'ready';
}

document.fonts.ready.then(draw);
