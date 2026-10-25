// Procedural cartoon art. Everything is drawn with canvas paths so the game
// ships with no image assets: thick dark outlines, flat fills, one highlight.

import type { EnemyKind, HeroDef } from './data';
import { engine } from './engine';

export const INK = '#1d1033';

export function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rad = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

function fillStroke(ctx: CanvasRenderingContext2D, fill: string, lw = 5) {
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = lw;
  ctx.strokeStyle = INK;
  ctx.stroke();
}

function circle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
}

function ellipse(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, rot = 0) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
}

export function shadow(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number) {
  ctx.fillStyle = 'rgba(20,0,40,0.25)';
  ellipse(ctx, x, y, rx, ry);
  ctx.fill();
}

// --- Text ---

export const FONT = '"Arial Rounded MT Bold", "Nunito", "Trebuchet MS", system-ui, sans-serif';

export function text(
  ctx: CanvasRenderingContext2D, s: string, x: number, y: number, size: number,
  color = '#fff', align: CanvasTextAlign = 'center', outline = INK, weight = 900,
) {
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  if (outline) {
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(3, size * 0.2);
    ctx.strokeStyle = outline;
    ctx.strokeText(s, x, y);
  }
  ctx.fillStyle = color;
  ctx.fillText(s, x, y);
}

// --- Buttons & panels ---

export function panel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, top: string, bottom: string, r = 26) {
  ctx.save();
  rr(ctx, x, y + 8, w, h, r);
  ctx.fillStyle = 'rgba(20,0,40,0.35)';
  ctx.fill();
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  rr(ctx, x, y, w, h, r);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = INK;
  ctx.stroke();
  rr(ctx, x + 8, y + 7, w - 16, Math.min(h * 0.38, 40), r * 0.7);
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.fill();
  ctx.restore();
}

export interface Button {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  color: 'green' | 'pink' | 'blue' | 'yellow' | 'gray' | 'purple';
  sub?: string;
  disabled?: boolean;
  onTap: () => void;
}

const BTN: Record<Button['color'], [string, string]> = {
  green: ['#7cf06a', '#2fb33c'],
  pink: ['#ff8fd0', '#e0368f'],
  blue: ['#6fd3ff', '#2a86e0'],
  yellow: ['#ffe066', '#f5a300'],
  gray: ['#c9c3d8', '#857c9c'],
  purple: ['#b98cff', '#6d3ad6'],
};

export function drawButton(ctx: CanvasRenderingContext2D, b: Button, pressed = false) {
  const [a, c] = BTN[b.disabled ? 'gray' : b.color];
  const dy = pressed ? 5 : 0;
  ctx.save();
  ctx.translate(0, dy);
  panel(ctx, b.x, b.y, b.w, b.h, a, c, Math.min(28, b.h / 2.4));
  const size = Math.min(40, b.h * 0.42);
  if (b.sub) {
    text(ctx, b.label, b.x + b.w / 2, b.y + b.h * 0.4, size);
    text(ctx, b.sub, b.x + b.w / 2, b.y + b.h * 0.74, size * 0.6, '#fff8c4');
  } else {
    text(ctx, b.label, b.x + b.w / 2, b.y + b.h / 2 + 2, size);
  }
  ctx.restore();
}

export function hitButton(b: Button, x: number, y: number) {
  return x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
}

// --- Currency icons ---

export function coinIcon(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  circle(ctx, x, y, r);
  fillStroke(ctx, '#ffd23f', Math.max(2, r * 0.18));
  circle(ctx, x, y, r * 0.6);
  ctx.strokeStyle = '#e09a00';
  ctx.lineWidth = r * 0.15;
  ctx.stroke();
  text(ctx, '★', x, y + 1, r * 0.9, '#e09a00', 'center', '');
}

export function gemIcon(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color = '#4dff9a') {
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.lineTo(x + r * 0.85, y - r * 0.2);
  ctx.lineTo(x, y + r);
  ctx.lineTo(x - r * 0.85, y - r * 0.2);
  ctx.closePath();
  fillStroke(ctx, color, Math.max(2, r * 0.2));
  ctx.beginPath();
  ctx.moveTo(x - r * 0.3, y - r * 0.5);
  ctx.lineTo(x, y - r * 0.75);
  ctx.lineTo(x + r * 0.2, y - r * 0.3);
  ctx.closePath();
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.fill();
}

// --- Heroes ---

// Draws a chibi idol standing at (x, y) = feet. `aim` is the weapon angle in
// radians (0 = straight up). `kick` is 0..1 recoil.
export function drawHero(
  ctx: CanvasRenderingContext2D, h: HeroDef, x: number, y: number, s: number,
  t: number, aim = 0, kick = 0,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const bob = Math.sin(t * 6) * 1.5;
  shadow(ctx, 0, 0, 38, 11);

  // Legs and shoes
  rr(ctx, -18, -34, 14, 30, 6);
  fillStroke(ctx, h.outfitDark, 4);
  rr(ctx, 4, -34, 14, 30, 6);
  fillStroke(ctx, h.outfitDark, 4);
  ellipse(ctx, -12, -4, 13, 7);
  fillStroke(ctx, '#ffffff', 4);
  ellipse(ctx, 12, -4, 13, 7);
  fillStroke(ctx, '#ffffff', 4);

  ctx.translate(0, bob);

  // Long back hair (behind body)
  if (h.id === 'riya' || h.id === 'luna' || h.id === 'sora') {
    ctx.beginPath();
    ctx.moveTo(-36, -118);
    ctx.quadraticCurveTo(-48, -60, -30, -40);
    ctx.lineTo(30, -40);
    ctx.quadraticCurveTo(48, -60, 36, -118);
    ctx.closePath();
    fillStroke(ctx, h.hairDark, 5);
  }

  // Body / stage outfit
  ctx.beginPath();
  ctx.moveTo(-24, -82);
  ctx.lineTo(24, -82);
  ctx.lineTo(30, -30);
  ctx.lineTo(-30, -30);
  ctx.closePath();
  fillStroke(ctx, h.outfit, 5);
  // Collar stripe and belt
  ctx.fillStyle = h.accent;
  ctx.fillRect(-27, -44, 54, 7);
  ctx.beginPath();
  ctx.moveTo(-10, -82);
  ctx.lineTo(0, -66);
  ctx.lineTo(10, -82);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = INK;
  ctx.stroke();

  // Left arm (resting)
  rr(ctx, -38, -78, 14, 34, 7);
  fillStroke(ctx, h.outfit, 4);
  circle(ctx, -31, -42, 7);
  fillStroke(ctx, h.skin, 3);

  // Head
  const hy = -112;
  circle(ctx, 0, hy, 34);
  fillStroke(ctx, h.skin, 5);

  // Eyes
  const blink = (Math.sin(t * 1.3 + x) > 0.985) ? 0.15 : 1;
  for (const ex of [-13, 13]) {
    ellipse(ctx, ex, hy + 4, 7, 10 * blink);
    ctx.fillStyle = INK;
    ctx.fill();
    if (blink > 0.5) {
      ellipse(ctx, ex, hy + 7, 5, 5);
      ctx.fillStyle = h.accent;
      ctx.fill();
      circle(ctx, ex + 2.5, hy, 3);
      ctx.fillStyle = '#fff';
      ctx.fill();
    }
  }
  // Blush + smile
  ctx.fillStyle = 'rgba(255,90,140,0.35)';
  ellipse(ctx, -22, hy + 16, 6, 3.5);
  ctx.fill();
  ellipse(ctx, 22, hy + 16, 6, 3.5);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, hy + 16, 6, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.lineWidth = 3;
  ctx.strokeStyle = INK;
  ctx.stroke();

  // Hair on top (per-hero style)
  ctx.beginPath();
  if (h.id === 'sora') {
    // Spiky
    ctx.moveTo(-38, hy - 2);
    ctx.lineTo(-44, hy - 30);
    ctx.lineTo(-26, hy - 32);
    ctx.lineTo(-24, hy - 52);
    ctx.lineTo(-6, hy - 40);
    ctx.lineTo(4, hy - 60);
    ctx.lineTo(14, hy - 40);
    ctx.lineTo(32, hy - 50);
    ctx.lineTo(30, hy - 28);
    ctx.lineTo(44, hy - 26);
    ctx.lineTo(38, hy - 2);
    ctx.quadraticCurveTo(20, hy - 16, 0, hy - 12);
    ctx.quadraticCurveTo(-20, hy - 16, -38, hy - 2);
  } else {
    ctx.moveTo(-37, hy + 4);
    ctx.quadraticCurveTo(-42, hy - 40, 0, hy - 42);
    ctx.quadraticCurveTo(42, hy - 40, 37, hy + 4);
    ctx.quadraticCurveTo(30, hy - 12, 16, hy - 14);
    ctx.lineTo(10, hy - 4);
    ctx.lineTo(4, hy - 16);
    ctx.quadraticCurveTo(-14, hy - 12, -22, hy - 6);
    ctx.quadraticCurveTo(-30, hy - 10, -37, hy + 4);
  }
  ctx.closePath();
  fillStroke(ctx, h.hair, 5);
  // Hair shine
  ctx.beginPath();
  ctx.moveTo(-22, hy - 28);
  ctx.quadraticCurveTo(-8, hy - 38, 8, hy - 34);
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.stroke();

  // Accessories
  if (h.id === 'riya') {
    // Headset mic
    ctx.beginPath();
    ctx.arc(0, hy, 38, Math.PI * 1.05, Math.PI * 1.95);
    ctx.lineWidth = 5;
    ctx.strokeStyle = INK;
    ctx.stroke();
    circle(ctx, -36, hy + 4, 8);
    fillStroke(ctx, '#2b2b44', 4);
    ctx.beginPath();
    ctx.moveTo(-34, hy + 10);
    ctx.quadraticCurveTo(-28, hy + 26, -12, hy + 26);
    ctx.lineWidth = 3;
    ctx.stroke();
    circle(ctx, -10, hy + 26, 4);
    fillStroke(ctx, h.accent, 2);
  } else if (h.id === 'kai') {
    // Backwards cap
    ctx.beginPath();
    ctx.arc(0, hy - 14, 34, Math.PI, 0);
    ctx.closePath();
    fillStroke(ctx, h.accent, 5);
    rr(ctx, 18, hy - 20, 28, 10, 5);
    fillStroke(ctx, h.outfitDark, 4);
  } else if (h.id === 'luna') {
    star(ctx, 24, hy - 26, 11, h.accent);
  } else if (h.id === 'dae') {
    // Beanie
    ctx.beginPath();
    ctx.arc(0, hy - 12, 36, Math.PI, 0);
    ctx.closePath();
    fillStroke(ctx, h.outfit, 5);
    rr(ctx, -38, hy - 18, 76, 14, 7);
    fillStroke(ctx, h.outfitDark, 4);
    circle(ctx, 0, hy - 50, 9);
    fillStroke(ctx, '#ffffff', 4);
  }

  // Weapon arm, rotated toward target
  ctx.save();
  ctx.translate(24, -66);
  ctx.rotate(aim);
  ctx.translate(0, kick * 8);
  drawWeapon(ctx, h, t);
  ctx.restore();

  ctx.restore();
}

function drawWeapon(ctx: CanvasRenderingContext2D, h: HeroDef, t: number) {
  // Arm
  rr(ctx, -7, -6, 14, 30, 7);
  fillStroke(ctx, h.outfit, 4);
  switch (h.weapon) {
    case 'rapid': {
      // Big retro microphone blaster
      rr(ctx, -9, -52, 18, 50, 6);
      fillStroke(ctx, '#3a3a58', 4);
      circle(ctx, 0, -60, 15);
      fillStroke(ctx, '#c9d2e6', 4);
      ctx.strokeStyle = 'rgba(29,16,51,0.5)';
      ctx.lineWidth = 2;
      for (let i = -8; i <= 8; i += 5) {
        ctx.beginPath();
        ctx.moveTo(-12, -60 + i);
        ctx.lineTo(12, -60 + i);
        ctx.stroke();
      }
      ctx.fillStyle = h.accent;
      ctx.fillRect(-9, -30, 18, 6);
      break;
    }
    case 'rocket': {
      // Shoulder speaker-bazooka
      rr(ctx, -16, -70, 32, 72, 8);
      fillStroke(ctx, '#3d3d5c', 5);
      circle(ctx, 0, -50, 11);
      fillStroke(ctx, '#20203a', 4);
      circle(ctx, 0, -50, 5);
      fillStroke(ctx, h.accent, 2);
      circle(ctx, 0, -20, 7);
      fillStroke(ctx, '#20203a', 3);
      rr(ctx, -19, -76, 38, 12, 5);
      fillStroke(ctx, h.accent, 4);
      break;
    }
    case 'laser': {
      // Glowing lightstick
      rr(ctx, -6, -18, 12, 22, 4);
      fillStroke(ctx, '#ffffff', 4);
      const glow = 0.6 + Math.sin(t * 10) * 0.2;
      ctx.save();
      ctx.shadowColor = h.accent;
      ctx.shadowBlur = 18 * glow;
      ellipse(ctx, 0, -42, 16, 28);
      fillStroke(ctx, h.accent, 4);
      ctx.restore();
      star(ctx, 0, -42, 9, '#ffffff');
      break;
    }
    case 'freeze': {
      // Ice keytar-blaster
      rr(ctx, -12, -62, 24, 62, 8);
      fillStroke(ctx, '#d9f6ff', 4);
      for (let i = 0; i < 4; i++) {
        ctx.fillStyle = i % 2 ? INK : '#fff';
        ctx.fillRect(-8, -54 + i * 10, 16, 6);
      }
      ctx.beginPath();
      ctx.moveTo(-12, -62);
      ctx.lineTo(0, -82);
      ctx.lineTo(12, -62);
      ctx.closePath();
      fillStroke(ctx, h.accent, 4);
      break;
    }
    case 'lightning': {
      // Folding fan crackling with energy
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, 52, -Math.PI * 0.85, -Math.PI * 0.15);
      ctx.closePath();
      fillStroke(ctx, h.accent, 4);
      ctx.strokeStyle = h.outfit;
      ctx.lineWidth = 3;
      for (let a = -0.85; a <= -0.15; a += 0.14) {
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a * Math.PI) * 50, Math.sin(a * Math.PI) * 50);
        ctx.stroke();
      }
      break;
    }
  }
}

export function star(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, lw = 3) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const rad = i % 2 ? r * 0.45 : r;
    ctx.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
  }
  ctx.closePath();
  fillStroke(ctx, color, lw);
}

// --- Monsters ---

// Draws a monster centred at (x, y) with radius r. `flash` 0..1 tints white
// when hit; `frozen` tints icy blue.
export function drawEnemy(
  ctx: CanvasRenderingContext2D, kind: EnemyKind, x: number, y: number, r: number,
  t: number, flash = 0, frozen = false, phase = 0,
) {
  if (r <= 0.5) return;
  if (kind !== 'crocopter') shadow(ctx, x, y + r * 0.95, r * 0.9, r * 0.25);
  if (flash > 0 || frozen) {
    // Tint on a scratch canvas so the overlay only covers the monster itself.
    const k = engine.dpr * engine.scale;
    const size = Math.ceil(r * 4.4);
    const px = Math.ceil(size * k);
    if (tintCanvas.width < px || tintCanvas.height < px) {
      tintCanvas.width = tintCanvas.height = Math.max(px, tintCanvas.width);
    }
    const g = tintCtx;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, px, px);
    g.setTransform(k, 0, 0, k, (size / 2) * k, (size / 2) * k);
    paintEnemy(g, kind, r, t, phase);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = flash > 0 ? `rgba(255,255,255,${0.8 * flash})` : 'rgba(120,220,255,0.5)';
    g.fillRect(0, 0, px, px);
    ctx.drawImage(tintCanvas, 0, 0, px, px, x - size / 2, y - size / 2, size, size);
    return;
  }
  ctx.save();
  ctx.translate(x, y);
  paintEnemy(ctx, kind, r, t, phase);
  ctx.restore();
}

const tintCanvas = document.createElement('canvas');
const tintCtx = tintCanvas.getContext('2d')!;

function paintEnemy(ctx: CanvasRenderingContext2D, kind: EnemyKind, r: number, t: number, phase: number) {
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const k = r / 40; // art is authored at r = 40
  const walk = Math.sin(t * 8 + phase);
  ctx.scale(k, k);
  switch (kind) {
    case 'gremlo': gremlo(ctx, walk, '#ff7ac8', '#d64a9e'); break;
    case 'boss_gremking': gremlo(ctx, walk, '#9f6bff', '#6b3ad0', true); break;
    case 'bonkito': bonkito(ctx, walk, t + phase, false); break;
    case 'boss_bonk': bonkito(ctx, walk, t + phase, true); break;
    case 'sharky': sharky(ctx, walk); break;
    case 'ballerina': ballerina(ctx, t + phase); break;
    case 'crocopter': crocopter(ctx, t + phase); break;
    case 'cactus': cactus(ctx, walk); break;
    case 'boss_kraken': kraken(ctx, t + phase); break;
  }
  ctx.restore();
}

function eyes(ctx: CanvasRenderingContext2D, y: number, spread: number, size: number, angry = false) {
  for (const sx of [-1, 1]) {
    circle(ctx, sx * spread, y, size);
    fillStroke(ctx, '#ffffff', 3);
    circle(ctx, sx * spread + sx * -1, y + 1, size * 0.5);
    ctx.fillStyle = INK;
    ctx.fill();
    if (angry) {
      ctx.beginPath();
      ctx.moveTo(sx * (spread + size + 2), y - size - 4);
      ctx.lineTo(sx * (spread - size), y - size + 2);
      ctx.lineWidth = 4;
      ctx.strokeStyle = INK;
      ctx.stroke();
    }
  }
}

function gremlo(ctx: CanvasRenderingContext2D, walk: number, fur: string, dark: string, king = false) {
  // Fluffy plush gremlin with a toothy grin and bunny ears.
  const sq = 1 + walk * 0.05;
  ctx.save();
  ctx.scale(1 / sq, sq);
  // Ears
  for (const sx of [-1, 1]) {
    ellipse(ctx, sx * 16, -40, 9, 22, sx * 0.25);
    fillStroke(ctx, fur, 4);
    ellipse(ctx, sx * 16, -38, 4, 14, sx * 0.25);
    ctx.fillStyle = '#ffd1ea';
    ctx.fill();
  }
  // Fuzzy body
  ctx.beginPath();
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    const rad = 36 + (i % 2 ? 4 : 0);
    ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad * 0.95);
  }
  ctx.closePath();
  fillStroke(ctx, fur, 5);
  ellipse(ctx, 0, 10, 22, 18);
  ctx.fillStyle = dark;
  ctx.fill();
  // Eyes (big and a bit unhinged)
  eyes(ctx, -10, 13, 8);
  // Toothy grin
  ctx.beginPath();
  ctx.moveTo(-20, 8);
  ctx.quadraticCurveTo(0, 30, 20, 8);
  ctx.closePath();
  fillStroke(ctx, '#3a0d2e', 3);
  ctx.fillStyle = '#ffffff';
  for (let i = -3; i <= 3; i++) {
    ctx.beginPath();
    ctx.moveTo(i * 5.5 - 2.5, 9 + Math.abs(i) * -0.3);
    ctx.lineTo(i * 5.5, 15 - Math.abs(i) * 0.8);
    ctx.lineTo(i * 5.5 + 2.5, 9);
    ctx.fill();
  }
  // Feet
  for (const sx of [-1, 1]) {
    ellipse(ctx, sx * 16, 36 + (sx * walk) * 3, 10, 6);
    fillStroke(ctx, dark, 4);
  }
  ctx.restore();
  if (king) {
    ctx.beginPath();
    ctx.moveTo(-22, -40);
    ctx.lineTo(-22, -62);
    ctx.lineTo(-11, -50);
    ctx.lineTo(0, -68);
    ctx.lineTo(11, -50);
    ctx.lineTo(22, -62);
    ctx.lineTo(22, -40);
    ctx.closePath();
    fillStroke(ctx, '#ffd23f', 4);
    circle(ctx, 0, -48, 4);
    ctx.fillStyle = '#ff4d6d';
    ctx.fill();
  }
}

function bonkito(ctx: CanvasRenderingContext2D, walk: number, t: number, boss: boolean) {
  // A wooden log with stubby legs, swinging a bat.
  for (const sx of [-1, 1]) {
    rr(ctx, sx * 12 - 5, 26 + sx * walk * 3, 10, 16, 4);
    fillStroke(ctx, '#7a4a22', 4);
  }
  rr(ctx, -24, -44, 48, 76, 20);
  fillStroke(ctx, '#c9874a', 5);
  // Wood grain
  ctx.strokeStyle = '#9b6232';
  ctx.lineWidth = 3;
  for (const gx of [-12, 10]) {
    ctx.beginPath();
    ctx.moveTo(gx, -30);
    ctx.quadraticCurveTo(gx + 4, 0, gx, 24);
    ctx.stroke();
  }
  ellipse(ctx, 0, -40, 20, 7);
  fillStroke(ctx, '#e8b07a', 4);
  ctx.beginPath();
  ctx.ellipse(0, -40, 10, 3.5, 0, 0, Math.PI * 2);
  ctx.strokeStyle = '#9b6232';
  ctx.lineWidth = 2;
  ctx.stroke();
  eyes(ctx, -14, 9, 7, boss);
  // Open shouting mouth
  ellipse(ctx, 0, 6, 9, 11 + Math.sin(t * 6) * 2);
  fillStroke(ctx, '#3a0d0d', 3);
  // Bat
  ctx.save();
  ctx.translate(28, 10);
  ctx.rotate(0.55 + Math.sin(t * 5) * 0.35);
  rr(ctx, -6, -52, 12, 56, 6);
  fillStroke(ctx, '#e3c07f', 4);
  rr(ctx, -9, -60, 18, 26, 9);
  fillStroke(ctx, '#e3c07f', 4);
  ctx.restore();
  if (boss) {
    // Headband
    rr(ctx, -26, -32, 52, 9, 4);
    fillStroke(ctx, '#ff3b5c', 3);
  }
}

function sharky(ctx: CanvasRenderingContext2D, walk: number) {
  // Upright shark sprinting in chunky sneakers.
  for (const sx of [-1, 1]) {
    rr(ctx, sx * 12 - 5, 18, 10, 18 + sx * walk * 4, 4);
    fillStroke(ctx, '#5a7a96', 4);
    rr(ctx, sx * 12 - 13, 32 + sx * walk * 4, 24, 12, 6);
    fillStroke(ctx, '#ffffff', 4);
    ctx.fillStyle = '#2a86e0';
    ctx.fillRect(sx * 12 - 10, 36 + sx * walk * 4, 18, 3);
  }
  // Fin
  ctx.beginPath();
  ctx.moveTo(-8, -40);
  ctx.lineTo(4, -64);
  ctx.lineTo(12, -38);
  ctx.closePath();
  fillStroke(ctx, '#6f9cc4', 5);
  // Body
  ellipse(ctx, 0, -6, 28, 38);
  fillStroke(ctx, '#7fb0d8', 5);
  ellipse(ctx, 0, 4, 18, 26);
  ctx.fillStyle = '#eaf6ff';
  ctx.fill();
  // Side fins
  for (const sx of [-1, 1]) {
    ellipse(ctx, sx * 30, 0, 7, 16, sx * -0.6);
    fillStroke(ctx, '#6f9cc4', 4);
  }
  eyes(ctx, -22, 11, 6, true);
  // Jaws
  ctx.beginPath();
  ctx.moveTo(-16, -6);
  ctx.quadraticCurveTo(0, 10, 16, -6);
  ctx.closePath();
  fillStroke(ctx, '#8b1a2b', 3);
  ctx.fillStyle = '#fff';
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath();
    ctx.moveTo(i * 6 - 3, -5);
    ctx.lineTo(i * 6, 1);
    ctx.lineTo(i * 6 + 3, -5);
    ctx.fill();
  }
}

function ballerina(ctx: CanvasRenderingContext2D, t: number) {
  // A latte-cup head on a twirling tutu.
  ctx.save();
  ctx.rotate(Math.sin(t * 4) * 0.12);
  // Legs
  ctx.strokeStyle = INK;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(-5, 12);
  ctx.lineTo(-8, 40);
  ctx.moveTo(5, 12);
  ctx.lineTo(10, 38);
  ctx.stroke();
  ctx.strokeStyle = '#ffd0e4';
  ctx.lineWidth = 3;
  ctx.stroke();
  // Tutu
  ctx.beginPath();
  for (let i = 0; i <= 12; i++) {
    const a = Math.PI + (i / 12) * Math.PI;
    const rad = i % 2 ? 30 : 38;
    ctx.lineTo(Math.cos(a) * rad, 14 - Math.sin(a) * rad * 0.35);
  }
  ctx.closePath();
  fillStroke(ctx, '#ff9ad5', 4);
  // Cup
  ctx.beginPath();
  ctx.moveTo(-26, -46);
  ctx.lineTo(26, -46);
  ctx.lineTo(18, 6);
  ctx.lineTo(-18, 6);
  ctx.closePath();
  fillStroke(ctx, '#ffffff', 5);
  ctx.beginPath();
  ctx.arc(27, -24, 10, -Math.PI / 2, Math.PI / 2);
  ctx.lineWidth = 6;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();
  // Latte foam with heart
  ellipse(ctx, 0, -46, 26, 8);
  fillStroke(ctx, '#c8935a', 4);
  ellipse(ctx, 0, -46, 16, 4.5);
  ctx.fillStyle = '#f5e1c8';
  ctx.fill();
  eyes(ctx, -24, 9, 6);
  ctx.beginPath();
  ctx.arc(0, -10, 6, 0.1 * Math.PI, 0.9 * Math.PI);
  ctx.lineWidth = 3;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.restore();
}

function crocopter(ctx: CanvasRenderingContext2D, t: number) {
  // A crocodile with a helicopter rotor for a hat.
  ctx.translate(0, Math.sin(t * 3) * 4);
  // Tail
  ctx.beginPath();
  ctx.moveTo(0, -10);
  ctx.quadraticCurveTo(-30, -30, -44, -18);
  ctx.lineTo(-38, -10);
  ctx.quadraticCurveTo(-20, -18, 0, 4);
  ctx.closePath();
  fillStroke(ctx, '#4f9d4a', 4);
  // Body
  ellipse(ctx, 0, -4, 28, 20);
  fillStroke(ctx, '#64b85d', 5);
  // Snout pointing down
  rr(ctx, -16, 4, 32, 34, 12);
  fillStroke(ctx, '#64b85d', 5);
  ctx.fillStyle = '#fff';
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(sx * 16, 12 + i * 9);
      ctx.lineTo(sx * 22, 15 + i * 9);
      ctx.lineTo(sx * 16, 18 + i * 9);
      ctx.fill();
    }
  }
  circle(ctx, -6, 34, 2.5);
  ctx.fillStyle = INK;
  ctx.fill();
  circle(ctx, 6, 34, 2.5);
  ctx.fill();
  eyes(ctx, -10, 11, 7);
  // Rotor
  rr(ctx, -3, -34, 6, 14, 3);
  fillStroke(ctx, '#666', 3);
  const blade = Math.abs(Math.cos(t * 30)) * 50 + 8;
  ellipse(ctx, 0, -36, blade, 4);
  fillStroke(ctx, '#d0d0d0', 3);
}

function cactus(ctx: CanvasRenderingContext2D, walk: number) {
  // A stomping cactus shaped like an elephant.
  for (const sx of [-1, 1]) {
    rr(ctx, sx * 18 - 9, 18 + sx * walk * 3, 18, 22, 6);
    fillStroke(ctx, '#3c9a52', 4);
  }
  ellipse(ctx, 0, -4, 38, 32);
  fillStroke(ctx, '#4fbf68', 5);
  // Ears
  for (const sx of [-1, 1]) {
    ellipse(ctx, sx * 36, -14, 14, 20, sx * 0.3);
    fillStroke(ctx, '#4fbf68', 4);
  }
  // Trunk
  ctx.beginPath();
  ctx.moveTo(-8, 0);
  ctx.quadraticCurveTo(-10, 30, 6, 34);
  ctx.quadraticCurveTo(14, 34, 10, 26);
  ctx.quadraticCurveTo(4, 22, 8, 0);
  ctx.closePath();
  fillStroke(ctx, '#4fbf68', 4);
  // Spines
  ctx.strokeStyle = '#fff6c8';
  ctx.lineWidth = 2;
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const px = Math.cos(a) * 30;
    const py = Math.sin(a) * 24 - 4;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px * 1.15, py * 1.15);
    ctx.stroke();
  }
  eyes(ctx, -14, 14, 6, true);
  // Flower on head
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    circle(ctx, Math.cos(a) * 6, -36 + Math.sin(a) * 6, 5);
    fillStroke(ctx, '#ff5fb4', 2);
  }
  circle(ctx, 0, -36, 4);
  ctx.fillStyle = '#ffd23f';
  ctx.fill();
}

function kraken(ctx: CanvasRenderingContext2D, t: number) {
  // A heap of spaghetti with noodle tentacles and meatball eyes.
  ctx.strokeStyle = INK;
  for (let i = 0; i < 6; i++) {
    const a = Math.PI * (0.15 + i * 0.14);
    const wob = Math.sin(t * 3 + i) * 10;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * 20, 10);
    ctx.bezierCurveTo(Math.cos(a) * 40, 30 + wob, Math.cos(a) * 30 + wob, 40, Math.cos(a) * 46, 46 + wob * 0.5);
    ctx.lineWidth = 11;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#ffe08a';
    ctx.stroke();
  }
  // Plate
  ellipse(ctx, 0, 14, 44, 12);
  fillStroke(ctx, '#ffffff', 4);
  // Noodle mound
  ctx.beginPath();
  ctx.moveTo(-38, 12);
  ctx.quadraticCurveTo(-40, -40, 0, -46);
  ctx.quadraticCurveTo(40, -40, 38, 12);
  ctx.closePath();
  fillStroke(ctx, '#ffd36b', 5);
  ctx.strokeStyle = '#e6a92a';
  ctx.lineWidth = 3;
  for (let i = 0; i < 6; i++) {
    ctx.beginPath();
    ctx.arc(-18 + i * 7, -14 + (i % 2) * 8, 12, Math.PI * 1.1, Math.PI * 1.9);
    ctx.stroke();
  }
  // Sauce
  ctx.beginPath();
  ctx.moveTo(-24, -34);
  ctx.quadraticCurveTo(0, -54, 24, -34);
  ctx.quadraticCurveTo(16, -22, 4, -28);
  ctx.quadraticCurveTo(-8, -20, -24, -34);
  fillStroke(ctx, '#e23b2e', 3);
  // Meatball eyes
  for (const sx of [-1, 1]) {
    circle(ctx, sx * 15, -8, 11);
    fillStroke(ctx, '#8a4a2a', 4);
    circle(ctx, sx * 15, -8, 5);
    ctx.fillStyle = '#fff';
    ctx.fill();
    circle(ctx, sx * 15, -7, 2.5);
    ctx.fillStyle = INK;
    ctx.fill();
  }
  // Fork crown
  ctx.save();
  ctx.translate(0, -52);
  rr(ctx, -3, -4, 6, 20, 2);
  fillStroke(ctx, '#d6dbe6', 3);
  rr(ctx, -12, -18, 24, 8, 3);
  fillStroke(ctx, '#d6dbe6', 3);
  for (let i = -1; i <= 1; i++) {
    rr(ctx, i * 8 - 2, -32, 4, 16, 2);
    fillStroke(ctx, '#d6dbe6', 2);
  }
  ctx.restore();
}

// --- Card icons ---

export function cardIcon(ctx: CanvasRenderingContext2D, icon: string, x: number, y: number, s: number, t: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.lineJoin = 'round';
  switch (icon) {
    case 'skull':
      circle(ctx, 0, -6, 24);
      fillStroke(ctx, '#f2ecff', 4);
      rr(ctx, -12, 8, 24, 14, 4);
      fillStroke(ctx, '#f2ecff', 4);
      circle(ctx, -9, -6, 7);
      ctx.fillStyle = INK;
      ctx.fill();
      circle(ctx, 9, -6, 7);
      ctx.fill();
      break;
    case 'note':
      ctx.lineWidth = 6;
      ctx.strokeStyle = INK;
      ellipse(ctx, -12, 16, 11, 8, -0.4);
      fillStroke(ctx, '#ff5fb4', 4);
      ellipse(ctx, 16, 10, 11, 8, -0.4);
      fillStroke(ctx, '#ff5fb4', 4);
      ctx.beginPath();
      ctx.moveTo(-3, 14);
      ctx.lineTo(-3, -24);
      ctx.lineTo(25, -30);
      ctx.lineTo(25, 8);
      ctx.lineWidth = 6;
      ctx.stroke();
      break;
    case 'star':
      star(ctx, 0, 0, 30, '#ffd23f', 4);
      break;
    case 'ice':
      ctx.beginPath();
      ctx.moveTo(0, -30);
      ctx.lineTo(24, -10);
      ctx.lineTo(16, 24);
      ctx.lineTo(-16, 24);
      ctx.lineTo(-24, -10);
      ctx.closePath();
      fillStroke(ctx, '#b8f0ff', 4);
      ctx.beginPath();
      ctx.moveTo(-8, -14);
      ctx.lineTo(0, -22);
      ctx.lineTo(4, -6);
      ctx.fillStyle = '#fff';
      ctx.fill();
      break;
    case 'arrow':
      ctx.beginPath();
      ctx.moveTo(0, -32);
      ctx.lineTo(18, -8);
      ctx.lineTo(7, -8);
      ctx.lineTo(7, 28);
      ctx.lineTo(-7, 28);
      ctx.lineTo(-7, -8);
      ctx.lineTo(-18, -8);
      ctx.closePath();
      fillStroke(ctx, '#7ee8ff', 4);
      break;
    case 'double':
      for (const sx of [-12, 12]) {
        rr(ctx, sx - 7, -26, 14, 44, 7);
        fillStroke(ctx, '#ffd23f', 4);
      }
      break;
    case 'mag':
      rr(ctx, -18, -28, 36, 56, 8);
      fillStroke(ctx, '#5a6280', 4);
      for (let i = 0; i < 4; i++) {
        rr(ctx, -10, -22 + i * 12, 20, 8, 4);
        fillStroke(ctx, '#ffd23f', 2);
      }
      break;
    case 'blade':
      ctx.beginPath();
      ctx.moveTo(-26, 22);
      ctx.lineTo(20, -26);
      ctx.lineTo(26, -20);
      ctx.lineTo(-20, 28);
      ctx.closePath();
      fillStroke(ctx, '#e6ecf5', 4);
      rr(ctx, -30, 18, 14, 14, 3);
      fillStroke(ctx, '#ff5fb4', 3);
      break;
    case 'gear': {
      ctx.beginPath();
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2 + t;
        const rad = i % 2 ? 22 : 30;
        ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
      }
      ctx.closePath();
      fillStroke(ctx, '#ffb020', 4);
      circle(ctx, 0, 0, 9);
      fillStroke(ctx, '#fff', 3);
      break;
    }
    case 'shield':
      ctx.beginPath();
      ctx.moveTo(0, -30);
      ctx.lineTo(26, -20);
      ctx.quadraticCurveTo(24, 16, 0, 30);
      ctx.quadraticCurveTo(-24, 16, -26, -20);
      ctx.closePath();
      fillStroke(ctx, '#7cf06a', 4);
      star(ctx, 0, -2, 11, '#fff');
      break;
    case 'gem':
      gemIcon(ctx, 0, 0, 28);
      break;
    case 'hero':
      star(ctx, 0, 0, 32, '#ff8fd0', 4);
      break;
  }
  ctx.restore();
}
