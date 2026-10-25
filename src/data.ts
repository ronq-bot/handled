// Static game content: heroes, monsters, worlds, run upgrades and meta upgrades.
// Every character here is an original design for this game.

export type WeaponKind = 'rapid' | 'rocket' | 'laser' | 'freeze' | 'lightning';

export interface HeroDef {
  id: string;
  name: string;
  title: string;
  weapon: WeaponKind;
  hair: string;
  hairDark: string;
  outfit: string;
  outfitDark: string;
  skin: string;
  accent: string;
  damage: number;
  fireRate: number; // shots per second
  magazine: number;
  range: number;
  unlockCost: number; // coins; 0 = starter
  blurb: string;
}

export const HEROES: HeroDef[] = [
  {
    id: 'riya', name: 'RIYA', title: 'Mic Blaster', weapon: 'rapid',
    hair: '#ff5fb4', hairDark: '#c42f84', outfit: '#2b2b44', outfitDark: '#16162a',
    skin: '#ffd9c2', accent: '#ff5fb4',
    damage: 10, fireRate: 4, magazine: 24, range: 900, unlockCost: 0,
    blurb: 'Rapid-fire sound blasts. The squad leader.',
  },
  {
    id: 'kai', name: 'KAI', title: 'Bass Bazooka', weapon: 'rocket',
    hair: '#3d3d5c', hairDark: '#22223a', outfit: '#ffb020', outfitDark: '#c27a00',
    skin: '#f3c9a8', accent: '#ffb020',
    damage: 34, fireRate: 0.9, magazine: 8, range: 900, unlockCost: 0,
    blurb: 'Bass-drop rockets that splash whole crowds.',
  },
  {
    id: 'luna', name: 'LUNA', title: 'Lightstick Laser', weapon: 'laser',
    hair: '#8f7bff', hairDark: '#5a45d6', outfit: '#eaf1ff', outfitDark: '#a9b8de',
    skin: '#ffe2cf', accent: '#7ee8ff',
    damage: 16, fireRate: 1.6, magazine: 12, range: 1000, unlockCost: 400,
    blurb: 'Her lightstick beam pierces every monster in a line.',
  },
  {
    id: 'dae', name: 'DAE', title: 'Freeze Beat', weapon: 'freeze',
    hair: '#e9f6ff', hairDark: '#9cc7e6', outfit: '#3a8dde', outfitDark: '#1e5c9e',
    skin: '#f6cfb3', accent: '#9ff0ff',
    damage: 12, fireRate: 2.2, magazine: 16, range: 900, unlockCost: 1500,
    blurb: 'Icy beats that slow monsters to a shuffle.',
  },
  {
    id: 'sora', name: 'SORA', title: 'Thunder Fan', weapon: 'lightning',
    hair: '#ffd23f', hairDark: '#d19a00', outfit: '#7b2fd0', outfitDark: '#4d1690',
    skin: '#ffdcc4', accent: '#ffe066',
    damage: 18, fireRate: 1.3, magazine: 12, range: 900, unlockCost: 3500,
    blurb: 'Fan-flick lightning that chains between monsters.',
  },
];

export type EnemyKind =
  | 'gremlo' | 'bonkito' | 'sharky' | 'ballerina' | 'crocopter' | 'cactus' | 'meatball'
  | 'boss_bonk' | 'boss_kraken' | 'boss_gremking';

export interface EnemyDef {
  kind: EnemyKind;
  name: string;
  hp: number;
  speed: number; // units per second at base
  size: number; // radius
  damage: number; // per hit on the barricade
  xp: number;
  coins: number;
  boss?: boolean;
  flying?: boolean;
}

export const ENEMIES: Record<EnemyKind, EnemyDef> = {
  gremlo: { kind: 'gremlo', name: 'Gremlo', hp: 18, speed: 70, size: 26, damage: 2, xp: 1, coins: 1 },
  bonkito: { kind: 'bonkito', name: 'Bonkito', hp: 45, speed: 52, size: 36, damage: 5, xp: 2, coins: 2 },
  sharky: { kind: 'sharky', name: 'Sharky Kicks', hp: 32, speed: 115, size: 34, damage: 4, xp: 2, coins: 2 },
  ballerina: { kind: 'ballerina', name: 'Latte Ballerina', hp: 60, speed: 62, size: 34, damage: 6, xp: 3, coins: 3 },
  crocopter: { kind: 'crocopter', name: 'Crocopter', hp: 40, speed: 90, size: 38, damage: 6, xp: 3, coins: 3, flying: true },
  cactus: { kind: 'cactus', name: 'Cactus Elefanto', hp: 220, speed: 32, size: 54, damage: 14, xp: 8, coins: 8 },
  meatball: { kind: 'meatball', name: 'Meatball', hp: 14, speed: 150, size: 20, damage: 4, xp: 0, coins: 0 },
  boss_bonk: { kind: 'boss_bonk', name: 'MEGA BONKITO', hp: 1600, speed: 22, size: 110, damage: 40, xp: 40, coins: 60, boss: true },
  boss_kraken: { kind: 'boss_kraken', name: 'SPAGHETTI KRAKEN', hp: 2400, speed: 18, size: 120, damage: 50, xp: 50, coins: 80, boss: true },
  boss_gremking: { kind: 'boss_gremking', name: 'KING GREMLO', hp: 2000, speed: 26, size: 110, damage: 45, xp: 45, coins: 70, boss: true },
};

export interface WorldDef {
  id: string;
  name: string;
  sky: [string, string];
  ground: [string, string];
  path: string;
  props: 'beach' | 'toys' | 'space';
  pool: EnemyKind[];
  boss: EnemyKind;
}

export const WORLDS: WorldDef[] = [
  {
    id: 'beach', name: 'Brainrot Beach', sky: ['#5ec8ff', '#b9ecff'], ground: ['#f2cf8a', '#e3b56b'],
    path: '#e9c27c', props: 'beach', pool: ['gremlo', 'bonkito', 'sharky', 'ballerina'], boss: 'boss_bonk',
  },
  {
    id: 'toys', name: 'Toybox Town', sky: ['#ff9ad5', '#ffd3ec'], ground: ['#8fd6a0', '#6cbf84'],
    path: '#b8e6c2', props: 'toys', pool: ['gremlo', 'bonkito', 'ballerina', 'crocopter', 'cactus'], boss: 'boss_gremking',
  },
  {
    id: 'space', name: 'Cosmic Disco', sky: ['#120a33', '#3a1a7a'], ground: ['#4b3a8f', '#382a72'],
    path: '#5d4aa8', props: 'space', pool: ['gremlo', 'sharky', 'ballerina', 'crocopter', 'cactus'], boss: 'boss_kraken',
  },
];

export const AREAS_PER_WORLD = 10;
export const TOTAL_AREAS = WORLDS.length * AREAS_PER_WORLD;
export const SURVIVAL_UNLOCK_AREA = 5; // clearing this area unlocks Survival

export function worldForArea(area: number): WorldDef {
  return WORLDS[Math.min(WORLDS.length - 1, Math.floor((area - 1) / AREAS_PER_WORLD))];
}

// --- In-run upgrade cards (the roguelike layer) ---

export type CardPillar = 'skill' | 'firepower' | 'ammo';

export interface CardDef {
  id: string;
  pillar: CardPillar;
  title: string;
  text: string;
  icon: string; // key for the icon painter
  heroSpecific?: boolean; // applied to the hero shown on the card
  maxStacks?: number;
}

export const CARDS: CardDef[] = [
  { id: 'dmg', pillar: 'firepower', title: 'DAMAGE BOOST', text: 'Damage +20%', icon: 'skull', heroSpecific: true },
  { id: 'rate', pillar: 'firepower', title: 'TEMPO UP', text: 'Fire rate +15%', icon: 'note', heroSpecific: true },
  { id: 'crit', pillar: 'skill', title: 'ENCORE CRIT', text: 'Crit chance +8%', icon: 'star', heroSpecific: true, maxStacks: 6 },
  { id: 'freeze', pillar: 'skill', title: 'FREEZE CHANCE', text: 'Freeze chance +6%', icon: 'ice', heroSpecific: true, maxStacks: 5 },
  { id: 'pierce', pillar: 'skill', title: 'PIERCING SHOT', text: 'Shots pierce +1', icon: 'arrow', heroSpecific: true, maxStacks: 3 },
  { id: 'multishot', pillar: 'skill', title: 'DUET SHOT', text: '+1 extra shot', icon: 'double', heroSpecific: true, maxStacks: 2 },
  { id: 'mag', pillar: 'ammo', title: 'BIG MAGAZINE', text: 'Magazine +40%', icon: 'mag', heroSpecific: true },
  { id: 'cut', pillar: 'ammo', title: 'SHARP SLICE', text: 'Each cut gives +1 ammo', icon: 'blade', maxStacks: 5 },
  { id: 'feeder', pillar: 'ammo', title: 'AUTO FEEDER', text: 'Auto-reload +50%', icon: 'gear', maxStacks: 5 },
  { id: 'wall', pillar: 'skill', title: 'STAGE BARRIER', text: 'Barrier max HP +30% & repair', icon: 'shield' },
  { id: 'gems', pillar: 'skill', title: 'FAN CLUB', text: 'XP gain +25%', icon: 'gem', maxStacks: 4 },
  { id: 'hero', pillar: 'firepower', title: 'ADD HERO', text: 'A new idol joins!', icon: 'hero' },
];

// --- Permanent (meta) upgrades bought with coins between runs ---

export interface MetaDef {
  id: string;
  name: string;
  text: (lvl: number) => string;
  baseCost: number;
  max: number;
}

export const META: MetaDef[] = [
  { id: 'power', name: 'Star Power', text: (l) => `All damage +${l * 10}%`, baseCost: 60, max: 30 },
  { id: 'barrier', name: 'Stage Barrier', text: (l) => `Barrier HP +${l * 12}%`, baseCost: 50, max: 30 },
  { id: 'slice', name: 'Sharp Slice', text: (l) => `+${l} ammo per cut`, baseCost: 120, max: 10 },
  { id: 'feeder', name: 'Auto Feeder', text: (l) => `Auto-reload +${l * 15}%`, baseCost: 80, max: 20 },
  { id: 'coins', name: 'Fan Donations', text: (l) => `Coins +${l * 10}%`, baseCost: 100, max: 20 },
];

export function metaCost(def: MetaDef, lvl: number) {
  return Math.round(def.baseCost * Math.pow(1.28, lvl));
}

export function heroLevelCost(lvl: number) {
  return Math.round(80 * Math.pow(1.35, lvl - 1));
}
