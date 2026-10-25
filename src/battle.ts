// The battle: idols defend a stage barrier against waves of monsters.
// The player swipes across the ammo belt to slice bullets into ammo, and
// picks an upgrade card on every level-up.

import { engine, W, type Scene } from './engine';
import {
  CARDS, ENEMIES, HEROES, SURVIVAL_UNLOCK_AREA, worldForArea,
  type CardDef, type EnemyDef, type EnemyKind, type HeroDef, type WorldDef,
} from './data';
import {
  INK, Button, cardIcon, coinIcon, drawButton, drawEnemy, drawHero, gemIcon, hitButton, panel, rr, star, text,
} from './art';
import { save, persist } from './save';
import { sfx } from './audio';
import { haptic, hapticNotify } from './haptics';
import { drawBackground } from './background';

const SLOT_X = [150, 360, 570];
const MAX_SLOTS = 3;

interface Hero {
  def: HeroDef;
  slot: number;
  x: number;
  y: number;
  lvl: number; // permanent level from the roster
  runLvl: number; // number of cards taken for this hero
  dmgMul: number;
  rateMul: number;
  magMul: number;
  crit: number;
  freeze: number;
  pierce: number;
  multi: number;
  ammo: number;
  cooldown: number;
  aim: number;
  kick: number;
  feedT: number;
  pulse: number;
}

interface Enemy {
  def: EnemyDef;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  speed: number;
  flash: number;
  slowT: number;
  freezeT: number;
  phase: number;
  attackT: number;
  atWall: boolean;
  dead: boolean;
  wobble: number;
  spawnT: number;
  abilityT: number;
  chargeT: number;
}

interface Shot {
  x: number;
  y: number;
  vx: number;
  vy: number;
  dmg: number;
  kind: HeroDef['weapon'];
  pierce: number;
  hit: Set<Enemy>;
  crit: boolean;
  freeze: boolean;
  color: string;
  life: number;
}

interface Beam {
  x1: number; y1: number; x2: number; y2: number;
  color: string; life: number; max: number; width: number; zig?: number[];
}

interface Particle {
  x: number; y: number; vx: number; vy: number;
  life: number; max: number; size: number; color: string;
  kind: 'dot' | 'star' | 'ring' | 'text' | 'shell';
  text?: string; rot?: number; vr?: number; grav?: number;
}

interface BeltBullet {
  x: number;
  cut: boolean;
  cutT: number;
  gold: boolean;
}

interface AmmoToken {
  x: number; y: number; tx: number; ty: number; t: number; hero: Hero; amount: number;
}

interface GemToken {
  x: number; y: number; vx: number; vy: number; t: number; value: number;
}

interface CardOffer {
  card: CardDef;
  hero?: Hero;
  newHero?: HeroDef;
}

type Mode = 'intro' | 'play' | 'cards' | 'paused' | 'won' | 'lost';

export interface BattleOptions {
  area: number;
  survival?: boolean;
  onExit: (result: { won: boolean; coins: number; area: number; survival: boolean; time: number }) => void;
}

export class Battle implements Scene {
  world: WorldDef;
  area: number;
  survival: boolean;
  mode: Mode = 'intro';
  modeT = 0;
  time = 0;
  heroes: Hero[] = [];
  enemies: Enemy[] = [];
  shots: Shot[] = [];
  beams: Beam[] = [];
  particles: Particle[] = [];
  belt: BeltBullet[] = [];
  beltOffset = 0;
  ammoTokens: AmmoToken[] = [];
  gems: GemToken[] = [];
  cards: CardOffer[] = [];
  cardStacks: Record<string, number> = {};
  pendingLevels = 0;
  wave = 0;
  waves = 3;
  spawnQueue: { kind: EnemyKind; at: number }[] = [];
  waveT = 0;
  bossSpawned = false;
  barrier = 100;
  barrierMax = 100;
  barrierHit = 0;
  xp = 0;
  xpNeed = 12;
  level = 1;
  xpMul = 1;
  cutPower = 1;
  feederMul = 1;
  coins = 0;
  kills = 0;
  shake = 0;
  banner = '';
  bannerT = 0;
  swipe: { x: number; y: number }[] = [];
  swiping = false;
  cutsMade = 0;
  pressed: Button | null = null;
  buttons: Button[] = [];
  opts: BattleOptions;
  hpMul = 1;
  nextBossAt = 90;
  stars = 0;

  constructor(opts: BattleOptions) {
    this.opts = opts;
    this.area = opts.area;
    this.survival = !!opts.survival;
    this.world = this.survival ? worldForArea(Math.max(1, save.highestArea)) : worldForArea(this.area);
    const m = save.meta;
    this.barrierMax = Math.round(100 * (1 + (m.barrier || 0) * 0.12));
    this.barrier = this.barrierMax;
    this.cutPower = 1 + (m.slice || 0);
    this.feederMul = 1 + (m.feeder || 0) * 0.15;
    const a = this.area - 1;
    this.hpMul = 1 + a * 0.24 + a * a * 0.007;
    const squad = save.squad.filter((id) => save.heroLevels[id] > 0).slice(0, MAX_SLOTS);
    if (squad.length === 0) squad.push('riya');
    squad.forEach((id, i) => this.addHero(HEROES.find((h) => h.id === id)!, i));
    this.layout();
    for (let i = 0; i < 40; i++) this.belt.push({ x: i * 34, cut: false, cutT: 0, gold: false });
    this.banner = this.survival ? 'SURVIVAL!' : `AREA ${this.area}`;
    this.bannerT = 2;
  }

  // --- Layout (depends on screen height) ---

  get top() { return engine.safeTop + 12; }
  get fieldTop() { return this.top + 190; }
  get wallY() { return engine.H - 430 - engine.safeBottom * 0.5; }
  get heroY() { return this.wallY + 190; }
  get beltY() { return engine.H - 120 - engine.safeBottom; }

  layout() {
    // Spread heroes evenly across the stage for however many we have.
    const n = this.heroes.length;
    const xs = n === 1 ? [360] : n === 2 ? [240, 480] : SLOT_X;
    this.heroes.forEach((h, i) => {
      h.slot = i;
      h.x = xs[i];
      h.y = this.heroY;
    });
  }

  onResize() {
    this.layout();
  }

  persp(y: number) {
    const f = Math.max(0, Math.min(1, (y - this.fieldTop) / (this.wallY - this.fieldTop)));
    return 0.78 + 0.5 * f;
  }

  addHero(def: HeroDef, slot: number) {
    this.heroes.push({
      def, slot, x: SLOT_X[slot], y: 0, lvl: save.heroLevels[def.id] || 1, runLvl: 1,
      dmgMul: 1, rateMul: 1, magMul: 1, crit: 0.05, freeze: def.weapon === 'freeze' ? 0.12 : 0,
      pierce: def.weapon === 'laser' ? 99 : 0, multi: 0, ammo: def.magazine, cooldown: Math.random() * 0.5,
      aim: 0, kick: 0, feedT: 0, pulse: 0,
    });
  }

  magSize(h: Hero) {
    return Math.round(h.def.magazine * h.magMul);
  }

  heroDamage(h: Hero) {
    return h.def.damage * (1 + (h.lvl - 1) * 0.22) * (1 + (save.meta.power || 0) * 0.1) * h.dmgMul;
  }

  // --- Waves ---

  startWave() {
    this.wave++;
    this.waveT = 0;
    this.bossSpawned = false;
    // Weighted mix: tanky and tricky monsters get rarer weights, and the
    // cactus only shows up from the third area of each world.
    const inWorld = ((this.area - 1) % 10) + 1;
    const weights: Partial<Record<EnemyKind, number>> = {
      gremlo: 3, bonkito: 3, sharky: 2, ballerina: 2, crocopter: 1.4, cactus: inWorld >= 3 ? 0.5 + inWorld * 0.05 : 0,
    };
    const pool = this.world.pool.filter((k) => (weights[k] || 0) > 0);
    const total = pool.reduce((a, k) => a + (weights[k] || 0), 0);
    const pick = (): EnemyKind => {
      let r = Math.random() * total;
      for (const k of pool) {
        r -= weights[k] || 0;
        if (r <= 0) return k;
      }
      return pool[0];
    };
    // Late areas get more monsters, but spread over a longer wave so the
    // opening seconds of a run aren't an instant swarm.
    const count = Math.round(10 + this.area * 1.2 + this.wave * 4);
    const dur = Math.max(18 + this.wave * 4, count * 0.5);
    this.spawnQueue = [];
    for (let i = 0; i < count; i++) {
      this.spawnQueue.push({ kind: pick(), at: (i / count) * dur + Math.random() * 0.8 });
    }
    // Small clusters of gremlos
    if (this.wave >= 2) {
      for (let c = 0; c < this.wave; c++) {
        const at = 3 + Math.random() * dur;
        for (let i = 0; i < 5; i++) this.spawnQueue.push({ kind: 'gremlo', at: at + i * 0.15 });
      }
    }
    this.spawnQueue.sort((a, b) => a.at - b.at);
    this.banner = this.wave === this.waves ? 'FINAL WAVE!' : `WAVE ${this.wave}/${this.waves}`;
    this.bannerT = 1.6;
  }

  spawn(kind: EnemyKind, x?: number, y?: number) {
    const def = ENEMIES[kind];
    const hpMul = this.survival ? 1 + this.time / 30 + Math.pow(this.time / 150, 2) : this.hpMul;
    // Bosses scale a little slower than the crowd so they stay beatable.
    // The first wave is a little softer so a fresh run (no cards yet) can find its feet.
    const grace = !this.survival && this.wave <= 1 ? 0.8 : 1;
    const hp = def.hp * grace * (def.boss ? Math.pow(hpMul, 0.85) : hpMul);
    this.enemies.push({
      def, x: Math.max(60, Math.min(W - 60, x ?? 90 + Math.random() * (W - 180))), y: y ?? this.fieldTop - 20,
      hp, maxHp: hp, speed: def.speed * (0.9 + Math.random() * 0.2) * (this.survival ? 1 + Math.min(0.6, this.time / 300) : 1 + Math.min(0.3, this.area * 0.01)),
      flash: 0, slowT: 0, freezeT: 0, phase: Math.random() * 10, attackT: 0, atWall: false, dead: false,
      wobble: Math.random() * Math.PI * 2, spawnT: 0, abilityT: 4, chargeT: 0,
    });
    if (def.boss) {
      this.enemies[this.enemies.length - 1].x = W / 2;
      this.banner = def.name;
      this.bannerT = 2.2;
      this.shake = 18;
      sfx.bossRoar();
      haptic('HEAVY');
    }
  }

  // --- Update ---

  update(dt: number) {
    this.modeT += dt;
    if (this.bannerT > 0) this.bannerT -= dt;
    this.updateParticles(dt);
    this.updateBelt(dt);
    if (this.mode === 'intro') {
      if (this.modeT > 1.2) {
        this.mode = 'play';
        this.modeT = 0;
        if (!this.survival) this.startWave();
      }
      return;
    }
    if (this.mode !== 'play') return;

    this.time += dt;
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 40);
    if (this.barrierHit > 0) this.barrierHit -= dt;

    // Spawning
    if (this.survival) {
      const rate = 0.8 + this.time / 45;
      if (Math.random() < rate * dt) {
        const pool = ['gremlo', 'bonkito', 'sharky', 'ballerina', 'crocopter', ...(this.time > 60 ? ['cactus'] : [])] as EnemyKind[];
        this.spawn(pool[Math.floor(Math.random() * pool.length)]);
      }
      if (this.time >= this.nextBossAt) {
        const bosses: EnemyKind[] = ['boss_bonk', 'boss_gremking', 'boss_kraken'];
        this.spawn(bosses[Math.floor(this.nextBossAt / 90 - 1) % 3]);
        this.nextBossAt += 90;
      }
    } else {
      this.waveT += dt;
      while (this.spawnQueue.length && this.spawnQueue[0].at <= this.waveT) {
        this.spawn(this.spawnQueue.shift()!.kind);
      }
      const alive = this.enemies.some((e) => !e.dead);
      if (!this.spawnQueue.length && this.wave === this.waves && !this.bossSpawned && this.waveT > 4) {
        this.bossSpawned = true;
        this.spawn(this.world.boss);
      }
      if (!this.spawnQueue.length && !alive && (this.wave < this.waves || this.bossSpawned)) {
        if (this.wave < this.waves) this.startWave();
        else if (this.gems.length === 0) this.finish(true);
      }
    }

    this.updateHeroes(dt);
    this.updateShots(dt);
    this.updateEnemies(dt);
    this.updateTokens(dt);

    if (this.pendingLevels > 0 && this.mode === 'play') this.openCards();
  }

  updateHeroes(dt: number) {
    for (const h of this.heroes) {
      h.kick = Math.max(0, h.kick - dt * 6);
      h.pulse = Math.max(0, h.pulse - dt * 3);
      // Auto-feeder trickles ammo in even without slicing.
      h.feedT += dt * this.feederMul;
      const feedEvery = 1.4;
      while (h.feedT >= feedEvery) {
        h.feedT -= feedEvery;
        h.ammo = Math.min(this.magSize(h), h.ammo + 1);
      }
      h.cooldown -= dt;
      const target = this.pickTarget(h);
      if (target) {
        const ang = Math.atan2(target.x - h.x, -(target.y - (h.y - 90)));
        h.aim += (ang - h.aim) * Math.min(1, dt * 14);
      } else {
        h.aim += (0 - h.aim) * Math.min(1, dt * 4);
      }
      if (target && h.cooldown <= 0 && h.ammo >= 1) {
        h.cooldown = 1 / (h.def.fireRate * h.rateMul);
        h.ammo -= 1;
        this.fire(h, target);
      }
    }
  }

  pickTarget(h: Hero): Enemy | null {
    // Closest to the barrier first, so the biggest threat dies first.
    let best: Enemy | null = null;
    let bestY = -Infinity;
    for (const e of this.enemies) {
      if (e.dead || e.y < this.fieldTop - 10) continue;
      const score = e.y - Math.abs(e.x - h.x) * 0.25;
      if (score > bestY) {
        bestY = score;
        best = e;
      }
    }
    return best;
  }

  fire(h: Hero, target: Enemy) {
    const ox = h.x + Math.sin(h.aim) * 70 + 24;
    const oy = h.y - 66 - Math.cos(h.aim) * 70;
    const dmg = this.heroDamage(h);
    h.kick = 1;
    sfx.shoot(h.def.weapon);
    // Ejected "shell" for that tactile feel
    this.particles.push({
      x: h.x + 28, y: h.y - 70, vx: 60 + Math.random() * 60, vy: -160, life: 0.6, max: 0.6,
      size: 5, color: '#ffd23f', kind: 'shell', rot: 0, vr: 12, grav: 700,
    });
    const shots = 1 + h.multi;
    for (let s = 0; s < shots; s++) {
      const spread = (s - (shots - 1) / 2) * 0.12;
      const ang = Math.atan2(target.y - oy, target.x - ox) + spread;
      const crit = Math.random() < h.crit;
      const freeze = Math.random() < h.freeze;
      const d = dmg * (crit ? 2.2 : 1);
      switch (h.def.weapon) {
        case 'laser': {
          const len = 1400;
          const x2 = ox + Math.cos(ang) * len;
          const y2 = oy + Math.sin(ang) * len;
          this.beams.push({ x1: ox, y1: oy, x2, y2, color: h.def.accent, life: 0.18, max: 0.18, width: 16 });
          for (const e of this.enemies) {
            if (e.dead) continue;
            const r = e.def.size * this.persp(e.y);
            if (distToSeg(e.x, e.y, ox, oy, x2, y2) < r + 10) this.damage(e, d, crit, freeze, h);
          }
          break;
        }
        case 'lightning': {
          let cur: Enemy | null = target;
          let px = ox;
          let py = oy;
          const hit = new Set<Enemy>();
          const chains = 3 + h.pierce;
          for (let c = 0; c < chains && cur; c++) {
            hit.add(cur);
            this.beams.push({
              x1: px, y1: py, x2: cur.x, y2: cur.y, color: h.def.accent, life: 0.16, max: 0.16, width: 6,
              zig: Array.from({ length: 6 }, () => (Math.random() - 0.5) * 30),
            });
            this.damage(cur, d * (c === 0 ? 1 : 0.7), crit, freeze, h);
            px = cur.x;
            py = cur.y;
            let next: Enemy | null = null;
            let nd = 220;
            for (const e of this.enemies) {
              if (e.dead || hit.has(e)) continue;
              const dd = Math.hypot(e.x - px, e.y - py);
              if (dd < nd) {
                nd = dd;
                next = e;
              }
            }
            cur = next;
          }
          break;
        }
        default: {
          const speed = h.def.weapon === 'rocket' ? 900 : 1500;
          this.shots.push({
            x: ox, y: oy, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, dmg: d,
            kind: h.def.weapon, pierce: h.pierce, hit: new Set(), crit,
            freeze: freeze || h.def.weapon === 'freeze', color: h.def.accent, life: 1.6,
          });
        }
      }
    }
    // Muzzle flash
    this.particles.push({ x: ox, y: oy, vx: 0, vy: 0, life: 0.08, max: 0.08, size: 26, color: '#fff6a8', kind: 'star' });
  }

  updateShots(dt: number) {
    for (const s of this.shots) {
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.life -= dt;
      if (s.kind === 'rocket' && Math.random() < 0.6) {
        this.particles.push({
          x: s.x, y: s.y, vx: (Math.random() - 0.5) * 40, vy: (Math.random() - 0.5) * 40,
          life: 0.35, max: 0.35, size: 8, color: 'rgba(255,200,120,0.8)', kind: 'dot',
        });
      }
      for (const e of this.enemies) {
        if (e.dead || s.hit.has(e)) continue;
        const r = e.def.size * this.persp(e.y);
        if (Math.hypot(e.x - s.x, e.y - s.y) < r + 8) {
          s.hit.add(e);
          if (s.kind === 'rocket') {
            this.explode(s.x, s.y, 95, s.dmg, s.crit);
            s.life = 0;
            break;
          }
          this.damage(e, s.dmg, s.crit, s.freeze, null);
          if (s.pierce-- <= 0) {
            s.life = 0;
            break;
          }
        }
      }
      if (s.y < this.fieldTop - 80 || s.x < -50 || s.x > W + 50) s.life = 0;
    }
    this.shots = this.shots.filter((s) => s.life > 0);
    for (const b of this.beams) b.life -= dt;
    this.beams = this.beams.filter((b) => b.life > 0);
  }

  explode(x: number, y: number, radius: number, dmg: number, crit: boolean) {
    sfx.boom();
    this.shake = Math.max(this.shake, 6);
    this.particles.push({ x, y, vx: 0, vy: 0, life: 0.3, max: 0.3, size: radius, color: '#ffb020', kind: 'ring' });
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 100 + Math.random() * 200;
      this.particles.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.4, max: 0.4,
        size: 10, color: i % 2 ? '#ffd23f' : '#ff7a2f', kind: 'dot',
      });
    }
    for (const e of this.enemies) {
      if (e.dead) continue;
      if (Math.hypot(e.x - x, e.y - y) < radius + e.def.size * this.persp(e.y)) this.damage(e, dmg, crit, false, null);
    }
  }

  damage(e: Enemy, dmg: number, crit: boolean, freeze: boolean, _h: Hero | null) {
    if (e.dead) return;
    e.hp -= dmg;
    e.flash = 1;
    if (freeze) {
      e.slowT = 2;
      if (!e.def.boss) e.freezeT = Math.max(e.freezeT, 0.9);
    }
    sfx.hit();
    this.particles.push({
      x: e.x + (Math.random() - 0.5) * 20, y: e.y - e.def.size * this.persp(e.y) - 10,
      vx: (Math.random() - 0.5) * 60, vy: -120, life: 0.7, max: 0.7, size: crit ? 34 : 24,
      color: crit ? '#ffd23f' : '#ffffff', kind: 'text', text: `${Math.round(dmg)}${crit ? '!' : ''}`,
    });
    if (e.hp <= 0) this.kill(e);
  }

  kill(e: Enemy) {
    e.dead = true;
    this.kills++;
    this.coins += e.def.coins;
    sfx.pop();
    haptic(e.def.boss ? 'HEAVY' : 'LIGHT');
    const colors = ['#ff5fb4', '#ffd23f', '#7ee8ff', '#7cf06a', '#b98cff'];
    const n = e.def.boss ? 60 : 14;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 80 + Math.random() * (e.def.boss ? 500 : 260);
      this.particles.push({
        x: e.x, y: e.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 100, life: 0.8, max: 0.8,
        size: 6 + Math.random() * 6, color: colors[i % colors.length], kind: i % 3 ? 'dot' : 'star', grav: 500,
        rot: Math.random() * 6, vr: (Math.random() - 0.5) * 10,
      });
    }
    if (e.def.boss) {
      this.shake = 24;
      hapticNotify('SUCCESS');
    }
    const gemCount = Math.min(8, e.def.xp);
    for (let i = 0; i < gemCount; i++) {
      this.gems.push({
        x: e.x, y: e.y, vx: (Math.random() - 0.5) * 300, vy: -150 - Math.random() * 200, t: 0,
        value: e.def.xp / gemCount,
      });
    }
  }

  updateEnemies(dt: number) {
    for (const e of this.enemies) {
      if (e.dead) continue;
      e.spawnT += dt;
      e.flash = Math.max(0, e.flash - dt * 10);
      e.slowT = Math.max(0, e.slowT - dt);
      e.freezeT = Math.max(0, e.freezeT - dt);
      const scale = this.persp(e.y);
      const bottom = e.y + e.def.size * scale * 0.9;
      const stopY = this.wallY - 12;
      if (bottom < stopY) {
        e.atWall = false;
        if (e.def.boss) this.bossAbility(e, dt);
        if (e.freezeT <= 0) {
          const sp = e.speed * (e.slowT > 0 ? 0.5 : 1) * (e.chargeT > 0 ? 4 : 1);
          e.y += sp * dt * (0.6 + 0.4 * scale);
          e.wobble += dt * 3;
          if (e.def.kind === 'ballerina') e.x += Math.sin(e.wobble) * 60 * dt;
          if (e.def.kind === 'crocopter') e.x += Math.sin(e.wobble * 0.7) * 90 * dt;
          e.x = Math.max(60, Math.min(W - 60, e.x));
        }
      } else {
        e.atWall = true;
        if (e.freezeT <= 0) e.attackT -= dt;
        if (e.attackT <= 0) {
          e.attackT = 1.1;
          this.barrier -= e.def.damage;
          this.barrierHit = 0.25;
          this.shake = Math.max(this.shake, e.def.boss ? 14 : 4);
          sfx.hurt();
          haptic(e.def.boss ? 'HEAVY' : 'MEDIUM');
          for (let i = 0; i < 6; i++) {
            this.particles.push({
              x: e.x + (Math.random() - 0.5) * 40, y: this.wallY, vx: (Math.random() - 0.5) * 200,
              vy: -100 - Math.random() * 150, life: 0.5, max: 0.5, size: 6, color: '#ffe6a0', kind: 'dot', grav: 600,
            });
          }
          if (this.barrier <= 0) {
            this.barrier = 0;
            this.finish(false);
            return;
          }
        }
      }
    }
    this.enemies = this.enemies.filter((e) => !e.dead);
  }

  // Each boss has a signature move on a timer.
  bossAbility(e: Enemy, dt: number) {
    e.chargeT = Math.max(0, e.chargeT - dt);
    e.abilityT -= dt;
    if (e.abilityT > 0) return;
    const r = e.def.size * this.persp(e.y);
    switch (e.def.kind) {
      case 'boss_bonk':
        // BONK RUSH: a short charge toward the barrier.
        e.abilityT = 7;
        e.chargeT = 0.9;
        this.shake = 10;
        sfx.bossRoar();
        this.floatText(e.x, e.y - r - 40, 'BONK RUSH!', '#ff3b5c');
        break;
      case 'boss_gremking':
        // Summons a ring of gremlos.
        e.abilityT = 5.5;
        for (let i = 0; i < 4; i++) this.spawn('gremlo', e.x + (i - 1.5) * 70, e.y + 20);
        this.floatText(e.x, e.y - r - 40, 'MINIONS!', '#b98cff');
        break;
      case 'boss_kraken':
        // Flings meatballs that race for the barrier.
        e.abilityT = 4.5;
        for (let i = 0; i < 3; i++) this.spawn('meatball', e.x + (i - 1) * 90, e.y + r * 0.6);
        this.floatText(e.x, e.y - r - 40, 'MEATBALLS!', '#ff7a2f');
        break;
    }
  }

  floatText(x: number, y: number, s: string, color: string) {
    this.particles.push({ x, y, vx: 0, vy: -60, life: 1.2, max: 1.2, size: 36, color, kind: 'text', text: s });
  }

  // --- Ammo belt: the satisfying slicing bit ---

  updateBelt(dt: number) {
    const speed = 150;
    this.beltOffset += speed * dt;
    for (const b of this.belt) {
      b.x += speed * dt;
      if (b.cut) b.cutT += dt;
    }
    // Recycle bullets that roll off the right; respawn fresh on the left.
    for (const b of this.belt) {
      if (b.x > W + 40) {
        b.x -= 40 * 34;
        b.cut = false;
        b.cutT = 0;
        b.gold = Math.random() < 0.04;
      }
    }
  }

  trySlice(x1: number, y1: number, x2: number, y2: number) {
    const by = this.beltY;
    if (Math.max(y1, y2) < by - 70 || Math.min(y1, y2) > by + 70) return;
    for (const b of this.belt) {
      if (b.cut) continue;
      if (distToSeg(b.x, by, x1, y1, x2, y2) < 34) {
        b.cut = true;
        b.cutT = 0;
        this.cutsMade++;
        sfx.cut();
        haptic('LIGHT');
        // Send ammo to whoever is emptiest.
        const hero = [...this.heroes].sort((a, c) => a.ammo / this.magSize(a) - c.ammo / this.magSize(c))[0];
        if (b.gold) {
          // Golden bullet: a full burst of ammo for the whole squad.
          for (const h of this.heroes) {
            this.ammoTokens.push({ x: b.x, y: by, tx: h.x, ty: h.y - 40, t: 0, hero: h, amount: 6 * this.cutPower });
          }
          sfx.coin();
          this.particles.push({ x: b.x, y: by - 50, vx: 0, vy: -80, life: 0.9, max: 0.9, size: 30, color: '#ffe066', kind: 'text', text: 'GOLDEN!' });
        } else if (hero) {
          this.ammoTokens.push({ x: b.x, y: by, tx: hero.x, ty: hero.y - 40, t: 0, hero, amount: 2 * this.cutPower });
        }
        for (let i = 0; i < 6; i++) {
          this.particles.push({
            x: b.x, y: by, vx: (Math.random() - 0.5) * 300, vy: -Math.random() * 300, life: 0.4, max: 0.4,
            size: 4, color: '#fff3b0', kind: 'dot', grav: 900,
          });
        }
      }
    }
  }

  updateTokens(dt: number) {
    for (const a of this.ammoTokens) {
      a.t += dt * 2.6;
      if (a.t >= 1) {
        a.hero.ammo = Math.min(this.magSize(a.hero), a.hero.ammo + a.amount);
        a.hero.pulse = 1;
        sfx.clink();
      }
    }
    this.ammoTokens = this.ammoTokens.filter((a) => a.t < 1);

    const tx = 60;
    const ty = this.top + 40;
    for (const g of this.gems) {
      g.t += dt;
      if (g.t < 0.45) {
        g.x += g.vx * dt;
        g.y += g.vy * dt;
        g.vy += 600 * dt;
        g.vx *= 0.96;
      } else {
        const k = Math.min(1, dt * (6 + g.t * 10));
        g.x += (tx - g.x) * k;
        g.y += (ty - g.y) * k;
        if (Math.hypot(tx - g.x, ty - g.y) < 20) {
          g.t = -1;
          this.xp += g.value * this.xpMul;
          sfx.gem();
          while (this.xp >= this.xpNeed) {
            this.xp -= this.xpNeed;
            this.level++;
            this.xpNeed = Math.round(12 + this.level * 9 + Math.pow(this.level, 1.6) * 2);
            this.pendingLevels++;
          }
        }
      }
    }
    this.gems = this.gems.filter((g) => g.t >= 0);
  }

  updateParticles(dt: number) {
    for (const p of this.particles) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.grav) p.vy += p.grav * dt;
      if (p.kind === 'text') p.vy *= 0.92;
      if (p.vr) p.rot = (p.rot || 0) + p.vr * dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    if (this.particles.length > 600) this.particles.splice(0, this.particles.length - 600);
  }

  // --- Level-up cards ---

  openCards() {
    this.pendingLevels--;
    this.mode = 'cards';
    this.modeT = 0;
    sfx.levelUp();
    hapticNotify('SUCCESS');
    this.cards = this.rollCards();
  }

  rollCards(): CardOffer[] {
    const offers: CardOffer[] = [];
    const avail = CARDS.filter((c) => {
      const n = this.cardStacks[c.id] || 0;
      if (c.id === 'hero') return this.heroes.length < MAX_SLOTS && this.spareHeroes().length > 0;
      return !c.maxStacks || n < c.maxStacks;
    });
    const pool = [...avail];
    // Make "add hero" show up eagerly when there's room, like a gift.
    const heroCard = pool.find((c) => c.id === 'hero');
    if (heroCard && Math.random() < 0.7) {
      offers.push({ card: heroCard, newHero: this.spareHeroes()[0] });
      pool.splice(pool.indexOf(heroCard), 1);
    }
    while (offers.length < 3 && pool.length) {
      const i = Math.floor(Math.random() * pool.length);
      const card = pool.splice(i, 1)[0];
      if (card.id === 'hero') {
        offers.push({ card, newHero: this.spareHeroes()[0] });
        continue;
      }
      const hero = card.heroSpecific ? this.heroes[Math.floor(Math.random() * this.heroes.length)] : undefined;
      offers.push({ card, hero });
    }
    return offers;
  }

  spareHeroes() {
    const inSquad = new Set(this.heroes.map((h) => h.def.id));
    return HEROES.filter((h) => save.heroLevels[h.id] > 0 && !inSquad.has(h.id));
  }

  applyCard(o: CardOffer) {
    this.cardStacks[o.card.id] = (this.cardStacks[o.card.id] || 0) + 1;
    const h = o.hero;
    switch (o.card.id) {
      case 'dmg': h!.dmgMul += 0.2; break;
      case 'rate': h!.rateMul += 0.15; break;
      case 'crit': h!.crit += 0.08; break;
      case 'freeze': h!.freeze += 0.06; break;
      case 'pierce': h!.pierce += 1; break;
      case 'multishot': h!.multi += 1; break;
      case 'mag': h!.magMul += 0.4; h!.ammo = this.magSize(h!); break;
      case 'cut': this.cutPower += 1; break;
      case 'feeder': this.feederMul += 0.5; break;
      case 'wall': {
        const add = Math.round(this.barrierMax * 0.3);
        this.barrierMax += add;
        this.barrier = Math.min(this.barrierMax, this.barrier + add + this.barrierMax * 0.25);
        break;
      }
      case 'gems': this.xpMul += 0.25; break;
      case 'hero':
        if (o.newHero) {
          this.addHero(o.newHero, this.heroes.length);
          this.layout();
        }
        break;
    }
    if (h) h.runLvl++;
    sfx.click();
    this.mode = 'play';
    this.modeT = 0;
  }

  // --- End of run ---

  finish(won: boolean) {
    if (this.mode === 'won' || this.mode === 'lost') return;
    this.mode = won ? 'won' : 'lost';
    this.modeT = 0;
    const bonus = 1 + (save.meta.coins || 0) * 0.1;
    let coins = this.coins;
    if (won) coins += 40 + this.area * 15;
    if (this.survival) coins += Math.floor(this.time / 2);
    this.coins = Math.round(coins * bonus);
    save.coins += this.coins;
    if (won && !this.survival && this.area >= save.highestArea) save.highestArea = this.area + 1;
    if (won && !this.survival) {
      // Stars reward keeping the barrier healthy.
      const f = this.barrier / this.barrierMax;
      this.stars = f >= 0.9 ? 3 : f >= 0.5 ? 2 : 1;
      save.stars[this.area] = Math.max(save.stars[this.area] || 0, this.stars);
    }
    if (this.survival) save.bestSurvival = Math.max(save.bestSurvival, Math.floor(this.time));
    persist();
    if (won) {
      sfx.win();
      hapticNotify('SUCCESS');
    } else {
      sfx.lose();
      hapticNotify('ERROR');
    }
  }

  // --- Input ---

  onDown(x: number, y: number) {
    this.pressed = this.buttons.find((b) => hitButton(b, x, y) && !b.disabled) || null;
    if (this.pressed) return;
    if (this.mode === 'cards') return;
    if (this.mode === 'play' || this.mode === 'intro') {
      this.swiping = true;
      this.swipe = [{ x, y }];
      this.trySlice(x - 1, y, x + 1, y);
    }
  }

  onMove(x: number, y: number) {
    if (!this.swiping) return;
    const last = this.swipe[this.swipe.length - 1];
    this.trySlice(last.x, last.y, x, y);
    this.swipe.push({ x, y });
    if (this.swipe.length > 12) this.swipe.shift();
  }

  onUp(x: number, y: number) {
    this.swiping = false;
    this.swipe = [];
    if (this.mode === 'cards' && this.modeT > 0.35) {
      const cw = 210;
      const gap = 18;
      const x0 = (W - (cw * 3 + gap * 2)) / 2;
      const cy = engine.H / 2 - 210;
      this.cards.forEach((c, i) => {
        const cx = x0 + i * (cw + gap);
        if (x >= cx && x <= cx + cw && y >= cy && y <= cy + 400) this.applyCard(c);
      });
      return;
    }
    const b = this.pressed;
    this.pressed = null;
    if (b && hitButton(b, x, y)) {
      sfx.click();
      b.onTap();
    }
  }

  // --- Render ---

  render(ctx: CanvasRenderingContext2D) {
    const H = engine.H;
    const t = engine.time;
    this.buttons = [];
    ctx.save();
    if (this.shake > 0) ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);

    drawBackground(ctx, this.world, this.fieldTop, this.wallY, H, t);
    this.drawWall(ctx);

    // Monsters, back to front
    const sorted = [...this.enemies].sort((a, b) => a.y - b.y);
    for (const e of sorted) {
      const s = this.persp(e.y);
      const pop = Math.min(1, e.spawnT * 4);
      const r = e.def.size * s * pop;
      const attackLunge = e.atWall ? Math.max(0, Math.sin((1.1 - e.attackT) * 6)) * 8 : 0;
      drawEnemy(ctx, e.def.kind, e.x, e.y + attackLunge, r, t, e.flash, e.freezeT > 0 || e.slowT > 0, e.phase);
      if (e.def.boss || e.hp < e.maxHp) {
        const bw = e.def.boss ? 240 : r * 2;
        const bh = e.def.boss ? 18 : 9;
        const by = e.y - r - (e.def.boss ? 30 : 16);
        rr(ctx, e.x - bw / 2, by, bw, bh, bh / 2);
        ctx.fillStyle = INK;
        ctx.fill();
        rr(ctx, e.x - bw / 2 + 2, by + 2, (bw - 4) * Math.max(0, e.hp / e.maxHp), bh - 4, (bh - 4) / 2);
        ctx.fillStyle = e.def.boss ? '#ff3b5c' : '#ff5fb4';
        ctx.fill();
      }
    }

    // Shots and beams
    for (const s of this.shots) {
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(Math.atan2(s.vy, s.vx));
      if (s.kind === 'rocket') {
        rr(ctx, -16, -7, 32, 14, 7);
        ctx.fillStyle = '#ffb020';
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = INK;
        ctx.stroke();
      } else if (s.kind === 'freeze') {
        ctx.fillStyle = '#d9f8ff';
        ctx.strokeStyle = INK;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(12, 0);
        ctx.lineTo(0, 7);
        ctx.lineTo(-12, 0);
        ctx.lineTo(0, -7);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else {
        // Glowing music-note bolt
        ctx.fillStyle = s.color;
        ctx.globalAlpha = 0.35;
        rr(ctx, -26, -6, 34, 12, 6);
        ctx.fill();
        ctx.globalAlpha = 1;
        rr(ctx, -10, -5, 20, 10, 5);
        ctx.fillStyle = '#fff';
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = s.color;
        ctx.stroke();
      }
      ctx.restore();
    }
    for (const b of this.beams) {
      const a = b.life / b.max;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.lineCap = 'round';
      ctx.strokeStyle = b.color;
      ctx.lineWidth = b.width * (0.5 + a);
      ctx.shadowColor = b.color;
      ctx.shadowBlur = 20;
      ctx.beginPath();
      ctx.moveTo(b.x1, b.y1);
      if (b.zig) {
        b.zig.forEach((z, i) => {
          const f = (i + 1) / (b.zig!.length + 1);
          const nx = -(b.y2 - b.y1);
          const ny = b.x2 - b.x1;
          const nl = Math.hypot(nx, ny) || 1;
          ctx.lineTo(b.x1 + (b.x2 - b.x1) * f + (nx / nl) * z, b.y1 + (b.y2 - b.y1) * f + (ny / nl) * z);
        });
      }
      ctx.lineTo(b.x2, b.y2);
      ctx.stroke();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = b.width * 0.35;
      ctx.stroke();
      ctx.restore();
    }

    this.drawStage(ctx, t);
    for (const h of this.heroes) {
      drawHero(ctx, h.def, h.x, h.y, 0.95 + h.pulse * 0.06, t + h.slot, h.aim, h.kick);
      this.drawAmmoBar(ctx, h);
    }

    this.drawBelt(ctx, t);
    this.drawParticles(ctx);

    for (const a of this.ammoTokens) {
      const k = easeInOut(a.t);
      const x = a.x + (a.tx - a.x) * k;
      const y = a.y + (a.ty - a.y) * k - Math.sin(k * Math.PI) * 120;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(a.t * 10);
      bulletShape(ctx, 0, 0, 0.8);
      ctx.restore();
    }
    for (const g of this.gems) gemIcon(ctx, g.x, g.y, 11);

    // Slash trail
    if (this.swipe.length > 1) {
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (let pass = 0; pass < 2; pass++) {
        ctx.beginPath();
        this.swipe.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
        ctx.strokeStyle = pass ? '#ffffff' : 'rgba(255,95,180,0.6)';
        ctx.lineWidth = pass ? 5 : 16;
        ctx.stroke();
      }
      ctx.restore();
    }
    ctx.restore();

    this.drawHud(ctx);
    if (this.bannerT > 0) {
      const a = Math.min(1, this.bannerT * 3);
      const s = 1 + Math.max(0, this.bannerT - 1.4) * 1.5;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(W / 2, engine.H * 0.36);
      ctx.scale(s, s);
      text(ctx, this.banner, 0, 0, 68, '#fff', 'center', INK);
      ctx.restore();
    }
    if (this.mode === 'play' && !save.tutorialDone) this.drawTutorial(ctx, t);
    if (this.mode === 'cards') this.drawCards(ctx, t);
    if (this.mode === 'paused') this.drawPause(ctx);
    if (this.mode === 'won' || this.mode === 'lost') this.drawResult(ctx, t);
  }

  drawWall(ctx: CanvasRenderingContext2D) {
    // Stage barrier: a row of light-up speaker blocks.
    const y = this.wallY;
    const hit = this.barrierHit > 0;
    ctx.save();
    ctx.fillStyle = 'rgba(20,0,40,0.25)';
    ctx.fillRect(0, y + 30, W, 16);
    for (let i = 0; i < 9; i++) {
      const x = i * 82 - 10;
      rr(ctx, x, y - 18, 78, 52, 10);
      ctx.fillStyle = hit ? '#ff8fa0' : '#43307a';
      ctx.fill();
      ctx.lineWidth = 5;
      ctx.strokeStyle = INK;
      ctx.stroke();
      const on = Math.floor(engine.time * 4 + i) % 2 === 0;
      ctx.beginPath();
      ctx.arc(x + 39, y + 8, 14, 0, Math.PI * 2);
      ctx.fillStyle = '#20163f';
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x + 39, y + 8, 6, 0, Math.PI * 2);
      ctx.fillStyle = on ? '#ff5fb4' : '#7ee8ff';
      ctx.fill();
    }
    ctx.restore();
    // Barrier HP
    const bw = 300;
    const bx = W / 2 - bw / 2;
    const by = y - 52;
    rr(ctx, bx, by, bw, 24, 12);
    ctx.fillStyle = INK;
    ctx.fill();
    const f = this.barrier / this.barrierMax;
    rr(ctx, bx + 3, by + 3, (bw - 6) * f, 18, 9);
    ctx.fillStyle = f > 0.5 ? '#7cf06a' : f > 0.25 ? '#ffd23f' : '#ff3b5c';
    ctx.fill();
    text(ctx, `${Math.ceil(this.barrier)} / ${this.barrierMax}`, W / 2, by + 13, 17);
  }

  drawStage(ctx: CanvasRenderingContext2D, t: number) {
    const y = this.wallY + 80;
    const g = ctx.createLinearGradient(0, y, 0, this.beltY - 60);
    g.addColorStop(0, '#5b2fa0');
    g.addColorStop(1, '#2d1660');
    ctx.fillStyle = g;
    ctx.fillRect(0, y, W, this.beltY - 60 - y);
    ctx.fillStyle = '#ff5fb4';
    ctx.fillRect(0, y, W, 6);
    // Spotlights sweeping across the stage
    ctx.save();
    ctx.globalAlpha = 0.12;
    for (let i = 0; i < 3; i++) {
      const sx = W / 2 + Math.sin(t * 0.8 + i * 2) * 260;
      ctx.beginPath();
      ctx.moveTo(sx - 30, y);
      ctx.lineTo(sx + 30, y);
      ctx.lineTo(sx + 110, this.beltY - 60);
      ctx.lineTo(sx - 110, this.beltY - 60);
      ctx.closePath();
      ctx.fillStyle = ['#ff8fd0', '#7ee8ff', '#ffe066'][i];
      ctx.fill();
    }
    ctx.restore();
    // Hero platforms
    for (const h of this.heroes) {
      ctx.beginPath();
      ctx.ellipse(h.x, h.y, 72, 20, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#7b4fd0';
      ctx.fill();
      ctx.lineWidth = 5;
      ctx.strokeStyle = INK;
      ctx.stroke();
    }
  }

  drawAmmoBar(ctx: CanvasRenderingContext2D, h: Hero) {
    const w = 120;
    const x = h.x - w / 2;
    const y = h.y + 26;
    const mag = this.magSize(h);
    rr(ctx, x, y, w, 20, 10);
    ctx.fillStyle = INK;
    ctx.fill();
    const f = h.ammo / mag;
    if (f > 0) {
      rr(ctx, x + 3, y + 3, (w - 6) * f, 14, 7);
      ctx.fillStyle = f < 0.2 ? '#ff3b5c' : '#ffd23f';
      ctx.fill();
    }
    text(ctx, `${Math.floor(h.ammo)}`, h.x, y + 10, 15);
    // Hero level badge
    ctx.beginPath();
    ctx.arc(x - 6, y + 10, 15, 0, Math.PI * 2);
    ctx.fillStyle = '#3a6ee0';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = INK;
    ctx.stroke();
    text(ctx, `${h.runLvl}`, x - 6, y + 11, 15);
    if (h.ammo < 1) {
      const a = 0.5 + Math.sin(engine.time * 10) * 0.5;
      ctx.globalAlpha = a;
      text(ctx, 'RELOAD!', h.x, h.y - 190, 26, '#ff3b5c');
      ctx.globalAlpha = 1;
    }
  }

  drawBelt(ctx: CanvasRenderingContext2D, t: number) {
    const y = this.beltY;
    const H = engine.H;
    ctx.fillStyle = '#1f1440';
    ctx.fillRect(0, y - 60, W, H - y + 60);
    // Conveyor track
    rr(ctx, -10, y - 40, W + 20, 80, 20);
    ctx.fillStyle = '#3b3160';
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, y - 36, W, 72);
    ctx.clip();
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 6;
    for (let i = -2; i < 26; i++) {
      const x = (i * 34 + (this.beltOffset % 34));
      ctx.beginPath();
      ctx.moveTo(x, y - 36);
      ctx.lineTo(x - 20, y + 36);
      ctx.stroke();
    }
    ctx.restore();
    for (const b of this.belt) {
      if (b.x < -30 || b.x > W + 30) continue;
      if (!b.cut) {
        bulletShape(ctx, b.x, y + 4, 1.1, 0, b.gold);
        if (b.gold) {
          ctx.globalAlpha = 0.5 + Math.sin(t * 12 + b.x) * 0.5;
          star(ctx, b.x + 10, y - 22, 7, '#ffffff', 0);
          ctx.globalAlpha = 1;
        }
      } else if (b.cutT < 0.4) {
        // Two halves flying apart
        const k = b.cutT / 0.4;
        ctx.save();
        ctx.globalAlpha = 1 - k;
        bulletHalf(ctx, b.x - k * 20, y - k * 70, -k * 3, true);
        bulletHalf(ctx, b.x, y + 4, 0, false);
        ctx.restore();
      }
    }
  }

  drawParticles(ctx: CanvasRenderingContext2D) {
    for (const p of this.particles) {
      const a = Math.max(0, p.life / p.max);
      ctx.globalAlpha = Math.min(1, a * 1.5);
      switch (p.kind) {
        case 'dot':
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * (0.4 + a * 0.6), 0, Math.PI * 2);
          ctx.fill();
          break;
        case 'star':
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot || 0);
          star(ctx, 0, 0, p.size, p.color, 2);
          ctx.restore();
          break;
        case 'ring':
          ctx.strokeStyle = p.color;
          ctx.lineWidth = 10 * a;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * (1.1 - a * 0.6), 0, Math.PI * 2);
          ctx.stroke();
          break;
        case 'text':
          text(ctx, p.text || '', p.x, p.y, p.size, p.color);
          break;
        case 'shell':
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot || 0);
          ctx.fillStyle = '#ffd23f';
          ctx.fillRect(-3, -6, 6, 12);
          ctx.restore();
          break;
      }
    }
    ctx.globalAlpha = 1;
  }

  drawHud(ctx: CanvasRenderingContext2D) {
    const y = this.top;
    // XP bar
    panel(ctx, 20, y + 14, W - 140, 52, '#5b2fa0', '#3a1a7a', 26);
    const bx = 70;
    const bw = W - 210;
    rr(ctx, bx, y + 28, bw, 24, 12);
    ctx.fillStyle = INK;
    ctx.fill();
    rr(ctx, bx + 3, y + 31, (bw - 6) * Math.min(1, this.xp / this.xpNeed), 18, 9);
    ctx.fillStyle = '#ffb020';
    ctx.fill();
    gemIcon(ctx, 52, y + 40, 18);
    text(ctx, `LV ${this.level}`, bx + bw / 2, y + 41, 18);
    // Area / wave label
    const label = this.survival ? `SURVIVAL  ${fmtTime(this.time)}` : `AREA ${this.area} · WAVE ${Math.max(1, this.wave)}/${this.waves}`;
    text(ctx, label, W / 2 - 50, y + 92, 26, '#ffffff');
    // Coins
    coinIcon(ctx, 40, y + 132, 16);
    text(ctx, `${this.coins}`, 64, y + 133, 24, '#fff', 'left');
    // Pause button
    const pb: Button = {
      x: W - 108, y: y + 10, w: 88, h: 60, label: 'II', color: 'purple',
      onTap: () => {
        if (this.mode === 'play') {
          this.mode = 'paused';
          this.modeT = 0;
        }
      },
    };
    if (this.mode === 'play') {
      this.buttons.push(pb);
      drawButton(ctx, pb, this.pressed === pb);
    }
  }

  drawTutorial(ctx: CanvasRenderingContext2D, t: number) {
    if (this.cutsMade >= 6) {
      save.tutorialDone = true;
      persist();
      return;
    }
    const y = this.beltY;
    const k = (t * 0.9) % 1;
    const hx = 120 + k * 480;
    const hy = y + Math.sin(k * Math.PI) * -30;
    ctx.fillStyle = 'rgba(20,0,40,0.55)';
    rr(ctx, 60, y - 160, W - 120, 70, 35);
    ctx.fill();
    text(ctx, 'SWIPE TO SLICE AMMO!', W / 2, y - 125, 34, '#ffe066');
    // Pointing hand
    ctx.save();
    ctx.translate(hx, hy + 30);
    ctx.rotate(-0.3);
    rr(ctx, -14, -40, 28, 50, 14);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = INK;
    ctx.stroke();
    rr(ctx, -24, 0, 48, 46, 18);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  drawCards(ctx: CanvasRenderingContext2D, t: number) {
    const H = engine.H;
    ctx.fillStyle = 'rgba(25,8,60,0.78)';
    ctx.fillRect(0, 0, W, H);
    const appear = Math.min(1, this.modeT * 4);
    text(ctx, 'LEVEL UP!', W / 2, H / 2 - 350, 64, '#ffe066');
    text(ctx, 'Choose an upgrade', W / 2, H / 2 - 296, 26, '#ffffff');
    const cw = 210;
    const gap = 18;
    const x0 = (W - (cw * 3 + gap * 2)) / 2;
    const cy = H / 2 - 210;
    this.cards.forEach((o, i) => {
      const cx = x0 + i * (cw + gap);
      const pop = easeOutBack(Math.max(0, Math.min(1, appear * 1.5 - i * 0.2)));
      ctx.save();
      ctx.translate(cx + cw / 2, cy + 200);
      ctx.scale(pop, pop);
      ctx.translate(-(cx + cw / 2), -(cy + 200));
      const isHero = o.card.id === 'hero';
      const [top, bot] = isHero ? ['#7cf06a', '#2f9e3c'] : o.card.pillar === 'ammo' ? ['#ffd23f', '#d68a00'] : o.card.pillar === 'skill' ? ['#7ee8ff', '#2a86e0'] : ['#ff8fd0', '#c42f84'];
      panel(ctx, cx, cy + 40, cw, 360, top, bot, 22);
      // Title ribbon
      rr(ctx, cx + 8, cy + 52, cw - 16, 44, 12);
      ctx.fillStyle = 'rgba(20,0,40,0.35)';
      ctx.fill();
      text(ctx, o.card.title, cx + cw / 2, cy + 75, o.card.title.length > 12 ? 19 : 22);
      // Art window
      rr(ctx, cx + 18, cy + 106, cw - 36, 140, 14);
      ctx.fillStyle = '#2a1658';
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = INK;
      ctx.stroke();
      if (isHero && o.newHero) {
        ctx.save();
        ctx.beginPath();
        rr(ctx, cx + 18, cy + 106, cw - 36, 140, 14);
        ctx.clip();
        drawHero(ctx, o.newHero, cx + cw / 2, cy + 300, 1.0, t, 0, 0);
        ctx.restore();
      } else {
        cardIcon(ctx, o.card.icon, cx + cw / 2, cy + 176, 1.4, t);
      }
      const desc = isHero && o.newHero ? `${o.newHero.name}\n${o.newHero.title}` : o.card.text;
      desc.split('\n').forEach((line, li) => {
        wrap(line, 15).forEach((l, wi) => text(ctx, l, cx + cw / 2, cy + 280 + (li * 2 + wi) * 28, 21));
      });
      // Stack pips, plus the pillar this card feeds
      const max = o.card.maxStacks;
      if (max) {
        const have = this.cardStacks[o.card.id] || 0;
        for (let p = 0; p < max; p++) {
          star(ctx, cx + cw / 2 + (p - (max - 1) / 2) * 26, cy + 362, 11, p < have ? '#ffe066' : 'rgba(20,0,40,0.35)', 2);
        }
      }
      if (!isHero) {
        const pillar = o.card.pillar === 'firepower' ? 'FIREPOWER' : o.card.pillar === 'ammo' ? 'AMMO' : 'SKILL';
        text(ctx, pillar, cx + cw / 2, cy + (max ? 330 : 362), 16, 'rgba(255,255,255,0.75)', 'center', '');
      }
      // Hero portrait for hero-specific cards
      if (o.hero) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx + cw / 2, cy + 18, 46, 0, Math.PI * 2);
        ctx.fillStyle = '#3a1a7a';
        ctx.fill();
        ctx.lineWidth = 5;
        ctx.strokeStyle = INK;
        ctx.stroke();
        ctx.clip();
        drawHero(ctx, o.hero.def, cx + cw / 2, cy + 128, 0.85, t, 0, 0);
        ctx.restore();
      }
      ctx.restore();
    });
  }

  drawPause(ctx: CanvasRenderingContext2D) {
    const H = engine.H;
    ctx.fillStyle = 'rgba(25,8,60,0.75)';
    ctx.fillRect(0, 0, W, H);
    panel(ctx, 110, H / 2 - 220, 500, 440, '#7b4fd0', '#4a2596');
    text(ctx, 'PAUSED', W / 2, H / 2 - 160, 60);
    const resume: Button = {
      x: 180, y: H / 2 - 90, w: 360, h: 100, label: 'RESUME', color: 'green',
      onTap: () => { this.mode = 'play'; },
    };
    const quit: Button = {
      x: 180, y: H / 2 + 40, w: 360, h: 100, label: 'GIVE UP', color: 'pink',
      onTap: () => this.finish(false),
    };
    for (const b of [resume, quit]) {
      this.buttons.push(b);
      drawButton(ctx, b, this.pressed === b);
    }
  }

  drawResult(ctx: CanvasRenderingContext2D, t: number) {
    const H = engine.H;
    const won = this.mode === 'won';
    const a = Math.min(1, this.modeT * 2);
    ctx.fillStyle = `rgba(25,8,60,${0.8 * a})`;
    ctx.fillRect(0, 0, W, H);
    if (this.modeT < 0.3) return;
    const py = H / 2 - 330;
    panel(ctx, 70, py, 580, 640, won ? '#7b4fd0' : '#6a4f8a', won ? '#4a2596' : '#3a2a5a');
    if (won) {
      for (let i = 0; i < 3; i++) {
        const lit = i < this.stars && this.modeT > 0.5 + i * 0.25;
        star(ctx, W / 2 + (i - 1) * 110, py + 10 - (i === 1 ? 24 : 0) + Math.sin(t * 3 + i) * 4, i === 1 ? 52 : 40, lit ? '#ffd23f' : '#5a4a7a', 5);
      }
    }
    const title = this.survival ? 'TIME UP!' : won ? 'VICTORY!' : 'DEFEATED';
    text(ctx, title, W / 2, py + 100, 64, won ? '#ffe066' : '#ffffff');
    if (this.survival) {
      text(ctx, `You lasted ${fmtTime(this.time)}`, W / 2, py + 170, 30);
      text(ctx, `Best: ${fmtTime(save.bestSurvival)}`, W / 2, py + 210, 24, '#ffe066');
    } else {
      text(ctx, won ? `Area ${this.area} cleared!` : `Area ${this.area} · Wave ${this.wave}`, W / 2, py + 170, 30);
      text(ctx, `${this.kills} monsters defeated`, W / 2, py + 210, 24, '#e0d4ff');
    }
    rr(ctx, 170, py + 250, 380, 90, 45);
    ctx.fillStyle = 'rgba(20,0,40,0.4)';
    ctx.fill();
    coinIcon(ctx, 240, py + 295, 30);
    text(ctx, `+${this.coins}`, 290, py + 297, 48, '#ffe066', 'left');
    const home: Button = {
      x: 120, y: py + 380, w: 230, h: 100, label: 'HOME', color: 'blue',
      onTap: () => this.exit(),
    };
    const next: Button = won && !this.survival
      ? { x: 370, y: py + 380, w: 230, h: 100, label: 'NEXT', color: 'green', onTap: () => this.exit('next') }
      : { x: 370, y: py + 380, w: 230, h: 100, label: 'RETRY', color: 'green', onTap: () => this.exit('retry') };
    for (const b of [home, next]) {
      this.buttons.push(b);
      drawButton(ctx, b, this.pressed === b);
    }
    if (!won && !this.survival) {
      text(ctx, 'Tip: spend coins on upgrades at home!', W / 2, py + 540, 22, '#e0d4ff');
    }
    if (won && this.area === SURVIVAL_UNLOCK_AREA && !this.survival) {
      text(ctx, 'SURVIVAL MODE UNLOCKED!', W / 2, py + 540, 28, '#7cf06a');
    }
  }

  exitAction: 'home' | 'next' | 'retry' = 'home';

  exit(action: 'home' | 'next' | 'retry' = 'home') {
    this.exitAction = action;
    this.opts.onExit({ won: this.mode === 'won', coins: this.coins, area: this.area, survival: this.survival, time: this.time });
  }
}

// --- Helpers ---

function bulletShape(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, rot = 0, gold = false) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.scale(s, s);
  ctx.beginPath();
  ctx.moveTo(-9, 18);
  ctx.lineTo(-9, -4);
  ctx.quadraticCurveTo(-9, -22, 0, -26);
  ctx.quadraticCurveTo(9, -22, 9, -4);
  ctx.lineTo(9, 18);
  ctx.closePath();
  ctx.fillStyle = gold ? '#fff2a8' : '#ffcf3f';
  ctx.fill();
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.fillStyle = gold ? '#ffb020' : '#c98a2a';
  ctx.fillRect(-9, 4, 18, 5);
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.fillRect(-5, -14, 3, 24);
  ctx.restore();
}

function bulletHalf(ctx: CanvasRenderingContext2D, x: number, y: number, rot: number, top: boolean) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.beginPath();
  if (top) {
    ctx.moveTo(-9, 0);
    ctx.lineTo(-9, -4);
    ctx.quadraticCurveTo(-9, -22, 0, -26);
    ctx.quadraticCurveTo(9, -22, 9, -4);
    ctx.lineTo(9, 3);
  } else {
    ctx.moveTo(-9, 2);
    ctx.lineTo(-9, 18);
    ctx.lineTo(9, 18);
    ctx.lineTo(9, -2);
  }
  ctx.closePath();
  ctx.fillStyle = '#ffcf3f';
  ctx.fill();
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.restore();
}

function distToSeg(px: number, py: number, x1: number, y1: number, x2: number, y2: number) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - x1) * dx + (py - y1) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function easeInOut(t: number) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function easeOutBack(t: number) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

export function fmtTime(s: number) {
  const m = Math.floor(s / 60);
  const ss = Math.floor(s % 60);
  return `${m}:${ss.toString().padStart(2, '0')}`;
}

function wrap(s: string, max: number) {
  const words = s.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > max && cur) {
      lines.push(cur);
      cur = w;
    } else cur = (cur + ' ' + w).trim();
  }
  if (cur) lines.push(cur);
  return lines;
}
