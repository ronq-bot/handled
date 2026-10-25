// World backdrops: sky, the ground the monsters march across, and side props.
// The static part is cached to an offscreen canvas per world + size.

import { W, engine } from './engine';
import { INK, rr, star } from './art';
import type { WorldDef } from './data';

let cache: { key: string; canvas: HTMLCanvasElement } | null = null;

export function drawBackground(
  ctx: CanvasRenderingContext2D, world: WorldDef, fieldTop: number, wallY: number, H: number, t: number,
) {
  const key = `${world.id}:${fieldTop}:${wallY}:${H}:${engine.dpr}:${engine.scale}`;
  if (!cache || cache.key !== key) {
    const c = document.createElement('canvas');
    const k = engine.dpr * engine.scale;
    c.width = Math.round(W * k);
    c.height = Math.round(H * k);
    const g = c.getContext('2d')!;
    g.scale(k, k);
    paintStatic(g, world, fieldTop, wallY, H);
    cache = { key, canvas: c };
  }
  ctx.drawImage(cache.canvas, 0, 0, W, H);
  paintAnimated(ctx, world, fieldTop, t);
}

function paintStatic(g: CanvasRenderingContext2D, world: WorldDef, fieldTop: number, wallY: number, H: number) {
  const horizon = fieldTop - 40;
  const sky = g.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0, world.sky[0]);
  sky.addColorStop(1, world.sky[1]);
  g.fillStyle = sky;
  g.fillRect(0, 0, W, horizon + 2);

  if (world.props === 'space') {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    g.fillStyle = '#fff';
    for (let i = 0; i < 70; i++) {
      g.globalAlpha = 0.4 + rnd() * 0.6;
      g.beginPath();
      g.arc(rnd() * W, rnd() * horizon, rnd() * 2 + 0.5, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
    // Ringed planet
    g.beginPath();
    g.arc(590, horizon - 70, 46, 0, Math.PI * 2);
    g.fillStyle = '#ff8fd0';
    g.fill();
    g.lineWidth = 5;
    g.strokeStyle = INK;
    g.stroke();
    g.beginPath();
    g.ellipse(590, horizon - 70, 80, 16, -0.3, 0, Math.PI * 2);
    g.lineWidth = 6;
    g.strokeStyle = '#ffe066';
    g.stroke();
  } else {
    // Soft hills on the horizon
    g.fillStyle = world.props === 'beach' ? '#4fb6e8' : '#ffb3de';
    g.beginPath();
    g.moveTo(0, horizon);
    for (let x = 0; x <= W; x += 40) g.lineTo(x, horizon - 30 - Math.sin(x * 0.012) * 24 - Math.sin(x * 0.031) * 10);
    g.lineTo(W, horizon);
    g.closePath();
    g.fill();
  }

  // Ground
  const gr = g.createLinearGradient(0, horizon, 0, wallY + 80);
  gr.addColorStop(0, world.ground[1]);
  gr.addColorStop(1, world.ground[0]);
  g.fillStyle = gr;
  g.fillRect(0, horizon, W, wallY + 80 - horizon);
  // Path, narrowing toward the horizon for depth
  g.fillStyle = world.path;
  g.beginPath();
  g.moveTo(W / 2 - 160, horizon);
  g.lineTo(W / 2 + 160, horizon);
  g.lineTo(W + 20, wallY + 80);
  g.lineTo(-20, wallY + 80);
  g.closePath();
  g.fill();
  // Ground speckles
  let seed = 3;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  g.fillStyle = 'rgba(0,0,0,0.06)';
  for (let i = 0; i < 60; i++) {
    const y = horizon + rnd() * (wallY - horizon);
    g.beginPath();
    g.ellipse(rnd() * W, y, 6 + rnd() * 10, 3 + rnd() * 3, 0, 0, Math.PI * 2);
    g.fill();
  }

  // Side props
  const rows = [horizon + 30, horizon + (wallY - horizon) * 0.4, horizon + (wallY - horizon) * 0.78];
  rows.forEach((y, i) => {
    const s = 0.6 + (i / 2) * 0.5;
    prop(g, world.props, 30 + i * 6, y, s, i);
    prop(g, world.props, W - 30 - i * 6, y + 30, s, i + 3);
  });
  void H;
}

function prop(g: CanvasRenderingContext2D, kind: WorldDef['props'], x: number, y: number, s: number, v: number) {
  g.save();
  g.translate(x, y);
  g.scale(s, s);
  g.lineWidth = 5;
  g.strokeStyle = INK;
  g.lineJoin = 'round';
  if (kind === 'beach') {
    if (v % 2 === 0) {
      // Palm tree
      g.beginPath();
      g.moveTo(-6, 60);
      g.quadraticCurveTo(10, 0, 0, -60);
      g.lineTo(12, -60);
      g.quadraticCurveTo(24, 0, 8, 60);
      g.closePath();
      g.fillStyle = '#b07a3a';
      g.fill();
      g.stroke();
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + (i - 2) * 0.7;
        g.beginPath();
        g.ellipse(6 + Math.cos(a) * 34, -62 + Math.sin(a) * 18 + 10, 40, 12, a, 0, Math.PI * 2);
        g.fillStyle = '#3fbf5a';
        g.fill();
        g.stroke();
      }
    } else {
      // Sandcastle
      rr(g, -40, 0, 80, 50, 6);
      g.fillStyle = '#f5d495';
      g.fill();
      g.stroke();
      rr(g, -26, -36, 52, 40, 6);
      g.fill();
      g.stroke();
      g.beginPath();
      g.moveTo(0, -36);
      g.lineTo(0, -66);
      g.stroke();
      g.beginPath();
      g.moveTo(0, -66);
      g.lineTo(22, -58);
      g.lineTo(0, -50);
      g.fillStyle = '#ff5fb4';
      g.fill();
      g.stroke();
    }
  } else if (kind === 'toys') {
    const colors = ['#ff5fb4', '#7ee8ff', '#ffd23f', '#7cf06a'];
    for (let i = 0; i < 3; i++) {
      rr(g, -30 + (i % 2) * 14, -i * 46, 56, 46, 8);
      g.fillStyle = colors[(i + v) % 4];
      g.fill();
      g.stroke();
      g.font = '900 30px sans-serif';
      g.fillStyle = '#fff';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('ABC'[(i + v) % 3], -2 + (i % 2) * 14, -i * 46 + 24);
    }
  } else {
    // Crystal cluster
    const cols = ['#7ee8ff', '#b98cff', '#ff8fd0'];
    for (let i = 0; i < 3; i++) {
      g.save();
      g.rotate((i - 1) * 0.35);
      g.beginPath();
      g.moveTo(-14, 40);
      g.lineTo(-14, -20 - i * 6);
      g.lineTo(0, -46 - i * 10);
      g.lineTo(14, -20 - i * 6);
      g.lineTo(14, 40);
      g.closePath();
      g.fillStyle = cols[(i + v) % 3];
      g.fill();
      g.stroke();
      g.restore();
    }
  }
  g.restore();
}

function paintAnimated(ctx: CanvasRenderingContext2D, world: WorldDef, fieldTop: number, t: number) {
  const horizon = fieldTop - 40;
  if (world.props === 'space') {
    for (let i = 0; i < 4; i++) {
      const x = (i * 197 + t * 20) % (W + 40) - 20;
      const y = 60 + ((i * 73) % Math.max(60, horizon - 80));
      ctx.globalAlpha = 0.5 + Math.sin(t * 3 + i) * 0.5;
      star(ctx, x, y, 7, '#fff6a8', 2);
    }
    ctx.globalAlpha = 1;
  } else {
    // Drifting clouds
    for (let i = 0; i < 3; i++) {
      const x = ((i * 280 + t * (12 + i * 5)) % (W + 300)) - 150;
      const y = 50 + i * 38;
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.beginPath();
      ctx.ellipse(x, y, 60, 18, 0, 0, Math.PI * 2);
      ctx.ellipse(x + 30, y - 12, 34, 20, 0, 0, Math.PI * 2);
      ctx.ellipse(x - 30, y - 6, 28, 16, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
