// Home screen: Battle / Squad / Upgrades tabs plus settings.

import { engine, W, type Scene } from './engine';
import {
  AREAS_PER_WORLD, HEROES, META, SURVIVAL_UNLOCK_AREA, TOTAL_AREAS,
  heroLevelCost, metaCost, worldForArea, type HeroDef,
} from './data';
import {
  Button, coinIcon, drawButton, drawEnemy, drawHero, hitButton, panel, rr, star, text,
} from './art';
import { persist, resetSave, save, todayKey } from './save';
import { setMusic, sfx, unlockAudio } from './audio';
import { haptic } from './haptics';
import { Battle, fmtTime } from './battle';

type Tab = 'battle' | 'squad' | 'upgrades';

export class Home implements Scene {
  tab: Tab = 'battle';
  buttons: Button[] = [];
  pressed: Button | null = null;
  selectedArea = Math.min(save.highestArea, TOTAL_AREAS);
  selectedHero = 0;
  settingsOpen = false;
  confirmReset = false;
  dailyOpen = false;
  toast = '';
  toastT = 0;
  coinBump = 0;
  dragStartX = 0;

  onEnter() {
    this.selectedArea = Math.min(save.highestArea, TOTAL_AREAS);
    if (save.lastDaily !== todayKey() && save.tutorialDone) this.dailyOpen = true;
  }

  update(dt: number) {
    if (this.toastT > 0) this.toastT -= dt;
    if (this.coinBump > 0) this.coinBump -= dt * 3;
  }

  say(msg: string) {
    this.toast = msg;
    this.toastT = 1.8;
  }

  spend(cost: number) {
    if (save.coins < cost) {
      this.say('Not enough coins!');
      sfx.hurt();
      return false;
    }
    save.coins -= cost;
    this.coinBump = 1;
    sfx.coin();
    haptic('MEDIUM');
    persist();
    return true;
  }

  startBattle(area: number, survival = false) {
    unlockAudio();
    const battle: Battle = new Battle({
      area,
      survival,
      onExit: () => {
        const action = battle.exitAction;
        const next = action === 'next' ? Math.min(TOTAL_AREAS, area + 1) : area;
        if (action === 'home') engine.replace(new Home());
        else this.startBattleReplace(next, survival);
      },
    });
    engine.replace(battle);
  }

  startBattleReplace(area: number, survival: boolean) {
    const h = new Home();
    h.startBattle(area, survival);
  }

  // --- Input ---

  onDown(x: number, y: number) {
    unlockAudio();
    this.pressed = this.buttons.find((b) => hitButton(b, x, y) && !b.disabled) || null;
    this.dragStartX = x;
  }

  onUp(x: number, y: number) {
    const b = this.pressed;
    this.pressed = null;
    if (b && hitButton(b, x, y)) {
      sfx.click();
      haptic('LIGHT');
      b.onTap();
    }
  }

  // --- Render ---

  render(ctx: CanvasRenderingContext2D) {
    const H = engine.H;
    const t = engine.time;
    this.buttons = [];
    // Backdrop
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#3a1a7a');
    g.addColorStop(1, '#1a0b40');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.globalAlpha = 0.08;
    for (let i = 0; i < 18; i++) {
      const x = (i * 131) % W;
      const y = ((i * 211 + t * 20) % (H + 100)) - 50;
      star(ctx, x, y, 18 + (i % 3) * 8, '#ffffff', 0);
    }
    ctx.restore();

    this.drawTopBar(ctx);
    if (this.tab === 'battle') this.drawBattleTab(ctx, t);
    else if (this.tab === 'squad') this.drawSquadTab(ctx, t);
    else this.drawUpgradesTab(ctx);
    this.drawTabBar(ctx);

    if (this.settingsOpen) this.drawSettings(ctx);
    if (this.dailyOpen) this.drawDaily(ctx, t);
    if (this.toastT > 0) {
      ctx.globalAlpha = Math.min(1, this.toastT * 3);
      rr(ctx, 120, H * 0.45, W - 240, 70, 35);
      ctx.fillStyle = 'rgba(20,0,40,0.85)';
      ctx.fill();
      text(ctx, this.toast, W / 2, H * 0.45 + 36, 28);
      ctx.globalAlpha = 1;
    }
  }

  get top() { return engine.safeTop + 12; }
  get bottom() { return engine.H - engine.safeBottom; }

  drawTopBar(ctx: CanvasRenderingContext2D) {
    const y = this.top;
    panel(ctx, 20, y + 6, 280, 64, '#5b2fa0', '#3a1a7a', 32);
    const s = 1 + Math.max(0, this.coinBump) * 0.2;
    ctx.save();
    ctx.translate(56, y + 38);
    ctx.scale(s, s);
    coinIcon(ctx, 0, 0, 24);
    ctx.restore();
    text(ctx, `${save.coins}`, 92, y + 40, 32, '#fff', 'left');
    const gear: Button = {
      x: W - 100, y: y + 4, w: 80, h: 68, label: '⚙', color: 'purple',
      onTap: () => { this.settingsOpen = true; this.confirmReset = false; },
    };
    if (!this.settingsOpen && !this.dailyOpen) this.buttons.push(gear);
    drawButton(ctx, gear, this.pressed === gear);
  }

  drawTabBar(ctx: CanvasRenderingContext2D) {
    const y = this.bottom - 120;
    ctx.fillStyle = '#140730';
    ctx.fillRect(0, y - 10, W, engine.H - y + 10);
    const tabs: [Tab, string][] = [['squad', 'SQUAD'], ['battle', 'BATTLE'], ['upgrades', 'BOOST']];
    tabs.forEach(([id, label], i) => {
      const active = this.tab === id;
      const b: Button = {
        x: 16 + i * 232, y: y + (active ? 0 : 12), w: 224, h: active ? 104 : 92, label,
        color: active ? (id === 'battle' ? 'green' : 'pink') : 'purple',
        onTap: () => { this.tab = id; },
      };
      if (!this.settingsOpen && !this.dailyOpen) this.buttons.push(b);
      drawButton(ctx, b, this.pressed === b);
    });
  }

  // --- Battle tab ---

  drawBattleTab(ctx: CanvasRenderingContext2D, t: number) {
    const y0 = this.top + 90;
    // Logo
    ctx.save();
    ctx.translate(W / 2, y0 + 60);
    ctx.rotate(-0.04);
    text(ctx, 'IDOL SQUAD', 0, 0, 84, '#ff8fd0');
    ctx.restore();
    text(ctx, 'BRAINROT DEFENSE', W / 2, y0 + 128, 38, '#7ee8ff');

    // Hero line-up with a monster looming behind
    const world = worldForArea(this.selectedArea);
    // Controls hug the tab bar; the showcase scales into whatever space is left.
    const sy = this.bottom - 140 - 370;
    const stageY = sy - 30;
    // Boss top sits ~470k above the stage line; keep it clear of the logo.
    const k = Math.max(0.6, Math.min(1.3, (stageY - (y0 + 180)) / 470));
    // Spotlight glow behind the showcase
    const glow = ctx.createRadialGradient(W / 2, stageY - 200 * k, 20, W / 2, stageY - 200 * k, 340 * k);
    glow.addColorStop(0, 'rgba(255,143,208,0.45)');
    glow.addColorStop(1, 'rgba(255,143,208,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, stageY - 560 * k, W, 600 * k);
    drawEnemy(ctx, world.boss, W / 2, stageY - 230 * k, 150 * k, t, 0, false, 0);
    const squad = save.squad.map((id) => HEROES.find((h) => h.id === id)!).filter(Boolean);
    const xs = squad.length === 1 ? [360] : squad.length === 2 ? [250, 470] : [150, 360, 570];
    squad.forEach((h, i) => drawHero(ctx, h, xs[i], stageY - (squad.length === 3 && i === 1 ? 20 : 0), 1.15 * k, t + i, Math.sin(t + i) * 0.2, 0));

    panel(ctx, 60, sy, W - 120, 120, '#7b4fd0', '#4a2596');
    text(ctx, world.name.toUpperCase(), W / 2, sy + 36, 26, '#ffe066');
    text(ctx, `AREA ${this.selectedArea}`, W / 2, sy + 82, 44);
    const got = save.stars[this.selectedArea] || 0;
    for (let i = 0; i < 3; i++) star(ctx, W / 2 + 112 + i * 26, sy + 80, 11, i < got ? '#ffd23f' : '#3a2a6a', 3);
    const prev: Button = {
      x: 76, y: sy + 30, w: 80, h: 76, label: '◀', color: 'blue', disabled: this.selectedArea <= 1,
      onTap: () => { this.selectedArea = Math.max(1, this.selectedArea - 1); },
    };
    const next: Button = {
      x: W - 156, y: sy + 30, w: 80, h: 76, label: '▶', color: 'blue',
      disabled: this.selectedArea >= Math.min(save.highestArea, TOTAL_AREAS),
      onTap: () => { this.selectedArea = Math.min(save.highestArea, TOTAL_AREAS, this.selectedArea + 1); },
    };
    const play: Button = {
      x: 140, y: sy + 140, w: W - 280, h: 120, label: 'PLAY', color: 'green',
      sub: this.selectedArea % AREAS_PER_WORLD === 0 ? 'BOSS AREA' : undefined,
      onTap: () => this.startBattle(this.selectedArea),
    };
    const survivalOpen = save.highestArea > SURVIVAL_UNLOCK_AREA;
    const surv: Button = {
      x: 180, y: sy + 274, w: W - 360, h: 76, label: survivalOpen ? 'SURVIVAL' : `🔒 SURVIVAL`, color: 'pink',
      sub: survivalOpen ? (save.bestSurvival ? `Best ${fmtTime(save.bestSurvival)}` : 'How long can you last?') : `Clear area ${SURVIVAL_UNLOCK_AREA}`,
      disabled: !survivalOpen,
      onTap: () => this.startBattle(save.highestArea, true),
    };
    const playPulse = 1 + Math.sin(t * 4) * 0.03;
    for (const b of [prev, next, surv]) {
      if (!this.settingsOpen && !this.dailyOpen) this.buttons.push(b);
      drawButton(ctx, b, this.pressed === b);
    }
    if (!this.settingsOpen && !this.dailyOpen) this.buttons.push(play);
    ctx.save();
    ctx.translate(W / 2, play.y + play.h / 2);
    ctx.scale(playPulse, playPulse);
    ctx.translate(-W / 2, -(play.y + play.h / 2));
    drawButton(ctx, play, this.pressed === play);
    ctx.restore();
  }

  // --- Squad tab ---

  drawSquadTab(ctx: CanvasRenderingContext2D, t: number) {
    const y0 = this.top + 90;
    text(ctx, 'YOUR SQUAD', W / 2, y0 + 20, 44, '#ffe066');
    text(ctx, 'Tap an idol, then add them to your team (max 3)', W / 2, y0 + 62, 20, '#e0d4ff');
    // Roster grid
    const cw = 128;
    const gap = 10;
    const x0 = (W - (cw * 5 + gap * 4)) / 2;
    HEROES.forEach((h, i) => {
      const x = x0 + i * (cw + gap);
      const y = y0 + 92;
      const owned = save.heroLevels[h.id] > 0;
      const inSquad = save.squad.includes(h.id);
      const sel = this.selectedHero === i;
      panel(ctx, x, y, cw, 170, sel ? '#ff8fd0' : owned ? '#7b4fd0' : '#4a3a6a', sel ? '#c42f84' : owned ? '#4a2596' : '#2a1f40', 18);
      ctx.save();
      rr(ctx, x + 4, y + 4, cw - 8, 162, 14);
      ctx.clip();
      if (!owned) ctx.globalAlpha = 0.45;
      drawHero(ctx, h, x + cw / 2, y + 190, 0.95, t + i, 0, 0);
      ctx.restore();
      text(ctx, h.name, x + cw / 2, y + 150, 22);
      if (inSquad) {
        star(ctx, x + cw - 18, y + 20, 15, '#ffe066', 3);
      }
      if (!owned) text(ctx, '🔒', x + cw / 2, y + 60, 36, '#fff', 'center', '');
      const b: Button = { x, y, w: cw, h: 170, label: '', color: 'purple', onTap: () => { this.selectedHero = i; } };
      if (!this.settingsOpen) this.buttons.push(b);
    });

    // Detail panel
    const h = HEROES[this.selectedHero];
    const owned = save.heroLevels[h.id] > 0;
    const lvl = save.heroLevels[h.id];
    const py = y0 + 290;
    const ph = Math.min(engine.H - py - 150 - engine.safeBottom, 560);
    panel(ctx, 30, py, W - 60, ph, '#5b2fa0', '#3a1a7a');
    ctx.save();
    rr(ctx, 40, py + 10, 260, ph - 20, 20);
    ctx.clip();
    ctx.fillStyle = '#2a1658';
    ctx.fillRect(40, py + 10, 260, ph - 20);
    drawHero(ctx, h, 170, py + ph * 0.72, 1.7, t, Math.sin(t * 1.5) * 0.3, 0);
    ctx.restore();
    const tx = 320;
    text(ctx, h.name, tx, py + 50, 48, h.hair, 'left');
    text(ctx, h.title.toUpperCase(), tx, py + 96, 26, '#ffe066', 'left');
    blurb(ctx, h.blurb, tx, py + 140);
    const dmg = h.damage * (1 + (Math.max(1, lvl) - 1) * 0.22);
    const stats: [string, string][] = [
      ['Level', owned ? `${lvl}` : '—'],
      ['Damage', `${Math.round(dmg)}`],
      ['Speed', `${h.fireRate}/s`],
      ['Magazine', `${h.magazine}`],
    ];
    stats.forEach(([k, v], i) => {
      text(ctx, k, tx, py + 230 + i * 38, 22, '#e0d4ff', 'left');
      text(ctx, v, W - 60, py + 230 + i * 38, 24, '#fff', 'right');
    });
    const by = py + ph - 120;
    let action: Button;
    if (!owned) {
      action = {
        x: tx, y: by, w: W - 60 - tx - 10, h: 100, label: 'UNLOCK', sub: `${h.unlockCost} coins`, color: 'yellow',
        onTap: () => {
          if (this.spend(h.unlockCost)) {
            save.heroLevels[h.id] = 1;
            if (save.squad.length < 3) save.squad.push(h.id);
            persist();
            this.say(`${h.name} joined!`);
          }
        },
      };
    } else {
      const cost = heroLevelCost(lvl);
      action = {
        x: tx, y: by, w: 200, h: 100, label: 'LEVEL UP', sub: `${cost} coins`, color: 'green',
        disabled: lvl >= 30,
        onTap: () => {
          if (this.spend(cost)) {
            save.heroLevels[h.id] = lvl + 1;
            persist();
          }
        },
      };
      const inSquad = save.squad.includes(h.id);
      const toggle: Button = {
        x: tx + 210, y: by, w: W - 60 - tx - 220, h: 100, label: inSquad ? 'BENCH' : 'ADD', color: inSquad ? 'pink' : 'blue',
        onTap: () => this.toggleSquad(h),
      };
      if (!this.settingsOpen) this.buttons.push(toggle);
      drawButton(ctx, toggle, this.pressed === toggle);
    }
    if (!this.settingsOpen) this.buttons.push(action);
    drawButton(ctx, action, this.pressed === action);
  }

  toggleSquad(h: HeroDef) {
    const i = save.squad.indexOf(h.id);
    if (i >= 0) {
      if (save.squad.length === 1) {
        this.say('You need at least one idol!');
        return;
      }
      save.squad.splice(i, 1);
    } else {
      if (save.squad.length >= 3) {
        this.say('Squad is full — bench someone first');
        return;
      }
      save.squad.push(h.id);
    }
    persist();
  }

  // --- Upgrades tab ---

  drawUpgradesTab(ctx: CanvasRenderingContext2D) {
    const y0 = this.top + 90;
    text(ctx, 'BOOSTS', W / 2, y0 + 20, 44, '#ffe066');
    text(ctx, 'Permanent upgrades for every run', W / 2, y0 + 62, 20, '#e0d4ff');
    const rowH = Math.min(150, (engine.H - y0 - 260 - engine.safeBottom) / META.length);
    META.forEach((m, i) => {
      const y = y0 + 100 + i * rowH;
      const lvl = save.meta[m.id] || 0;
      const max = lvl >= m.max;
      panel(ctx, 30, y, W - 60, rowH - 14, '#7b4fd0', '#4a2596', 22);
      text(ctx, m.name, 60, y + rowH * 0.3, 30, '#fff', 'left');
      text(ctx, `Lv ${lvl}`, 60 + measure(ctx, m.name, 30) + 20, y + rowH * 0.3, 22, '#ffe066', 'left');
      text(ctx, lvl ? m.text(lvl) : m.text(1).replace(/\d+/, '0'), 60, y + rowH * 0.62, 22, '#e0d4ff', 'left');
      const cost = metaCost(m, lvl);
      const b: Button = {
        x: W - 260, y: y + 14, w: 210, h: rowH - 42, label: max ? 'MAX' : `${cost}`, color: 'green', disabled: max,
        sub: max ? undefined : 'coins',
        onTap: () => {
          if (this.spend(cost)) {
            save.meta[m.id] = lvl + 1;
            persist();
          }
        },
      };
      if (!this.settingsOpen) this.buttons.push(b);
      drawButton(ctx, b, this.pressed === b);
    });
  }

  // --- Overlays ---

  drawSettings(ctx: CanvasRenderingContext2D) {
    const H = engine.H;
    ctx.fillStyle = 'rgba(20,0,40,0.75)';
    ctx.fillRect(0, 0, W, H);
    const py = H / 2 - 360;
    panel(ctx, 70, py, W - 140, 720, '#7b4fd0', '#4a2596');
    text(ctx, 'SETTINGS', W / 2, py + 60, 50);
    const toggles: [string, boolean, () => void][] = [
      ['SOUND', save.sound, () => { save.sound = !save.sound; persist(); }],
      ['MUSIC', save.music, () => { unlockAudio(); setMusic(!save.music); persist(); }],
      ['VIBRATION', save.haptics, () => { save.haptics = !save.haptics; persist(); }],
    ];
    toggles.forEach(([label, on, fn], i) => {
      const b: Button = {
        x: 130, y: py + 120 + i * 110, w: W - 260, h: 90, label: `${label}: ${on ? 'ON' : 'OFF'}`,
        color: on ? 'green' : 'gray', onTap: fn,
      };
      this.buttons.push(b);
      drawButton(ctx, b, this.pressed === b);
    });
    const reset: Button = {
      x: 130, y: py + 460, w: W - 260, h: 80, label: this.confirmReset ? 'TAP AGAIN TO ERASE' : 'RESET PROGRESS',
      color: 'pink',
      onTap: () => {
        if (this.confirmReset) {
          resetSave();
          this.selectedArea = 1;
          this.confirmReset = false;
          this.say('Progress erased');
        } else this.confirmReset = true;
      },
    };
    const close: Button = {
      x: 180, y: py + 580, w: W - 360, h: 100, label: 'CLOSE', color: 'blue',
      onTap: () => { this.settingsOpen = false; },
    };
    for (const b of [reset, close]) {
      this.buttons.push(b);
      drawButton(ctx, b, this.pressed === b);
    }
    text(ctx, 'v1.0 · No ads · No tracking · Works offline', W / 2, py + 700, 18, '#e0d4ff');
  }

  drawDaily(ctx: CanvasRenderingContext2D, t: number) {
    const H = engine.H;
    ctx.fillStyle = 'rgba(20,0,40,0.75)';
    ctx.fillRect(0, 0, W, H);
    const py = H / 2 - 260;
    panel(ctx, 90, py, W - 180, 520, '#ff8fd0', '#c42f84');
    text(ctx, 'DAILY GIFT!', W / 2, py + 60, 54, '#ffe066');
    const reward = 50 + Math.min(10, save.highestArea) * 20;
    ctx.save();
    ctx.translate(W / 2, py + 210);
    ctx.rotate(Math.sin(t * 2) * 0.1);
    coinIcon(ctx, 0, 0, 80);
    ctx.restore();
    text(ctx, `+${reward} coins`, W / 2, py + 330, 44);
    const claim: Button = {
      x: 180, y: py + 380, w: W - 360, h: 110, label: 'CLAIM', color: 'green',
      onTap: () => {
        save.coins += reward;
        save.lastDaily = todayKey();
        persist();
        this.dailyOpen = false;
        this.coinBump = 1;
        sfx.coin();
      },
    };
    this.buttons.push(claim);
    drawButton(ctx, claim, this.pressed === claim);
  }
}

function measure(ctx: CanvasRenderingContext2D, s: string, size: number) {
  ctx.font = `900 ${size}px "Arial Rounded MT Bold", "Nunito", "Trebuchet MS", system-ui, sans-serif`;
  return ctx.measureText(s).width;
}

function blurb(ctx: CanvasRenderingContext2D, s: string, x: number, y: number) {
  const words = s.split(' ');
  let line = '';
  let ly = y;
  for (const w of words) {
    const test = (line + ' ' + w).trim();
    if (measure(ctx, test, 20) > W - 60 - x - 20 && line) {
      text(ctx, line, x, ly, 20, '#ffffff', 'left', '', 700);
      line = w;
      ly += 28;
    } else line = test;
  }
  if (line) text(ctx, line, x, ly, 20, '#ffffff', 'left', '', 700);
}

