// All sound is synthesized at runtime with Web Audio — no audio files,
// nothing to license.

import { save } from './save';

let ac: AudioContext | null = null;
let master: GainNode;
let sfxBus: GainNode;
let musicBus: GainNode;
let musicTimer: number | null = null;
let musicStep = 0;
let nextNoteTime = 0;
let noiseBuf: AudioBuffer;

export function unlockAudio() {
  if (!ac) {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    ac = new Ctor();
    master = ac.createGain();
    master.gain.value = 0.8;
    master.connect(ac.destination);
    sfxBus = ac.createGain();
    sfxBus.gain.value = 0.55;
    sfxBus.connect(master);
    musicBus = ac.createGain();
    musicBus.gain.value = 0.22;
    musicBus.connect(master);
    noiseBuf = ac.createBuffer(1, ac.sampleRate * 0.5, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    if (save.music) startMusic();
  }
  if (ac.state === 'suspended') ac.resume();
}

function tone(freq: number, dur: number, type: OscillatorType, vol: number, slideTo?: number, when = 0, bus?: GainNode) {
  if (!ac) return;
  const t = ac.currentTime + when;
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(bus || sfxBus);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(dur: number, vol: number, freq: number, q = 1, when = 0, bus?: GainNode) {
  if (!ac) return;
  const t = ac.currentTime + when;
  const src = ac.createBufferSource();
  src.buffer = noiseBuf;
  const f = ac.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ac.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(bus || sfxBus);
  src.start(t);
  src.stop(t + dur + 0.02);
}

let lastShot = 0;

export const sfx = {
  shoot(kind: string) {
    if (!ac || !save.sound) return;
    // Rate-limit so a full squad doesn't turn into mush.
    const now = ac.currentTime;
    if (now - lastShot < 0.035) return;
    lastShot = now;
    switch (kind) {
      case 'rocket': noise(0.25, 0.35, 400, 0.8); tone(180, 0.2, 'sawtooth', 0.08, 60); break;
      case 'laser': tone(1400, 0.18, 'sawtooth', 0.06, 300); break;
      case 'freeze': tone(1800, 0.12, 'triangle', 0.08, 900); break;
      case 'lightning': noise(0.12, 0.3, 3000, 2); tone(900, 0.1, 'square', 0.05, 200); break;
      default: tone(900 + Math.random() * 200, 0.07, 'square', 0.05, 400);
    }
  },
  cut() {
    if (!save.sound) return;
    noise(0.06, 0.5, 5000 + Math.random() * 2000, 4);
    tone(2400 + Math.random() * 600, 0.05, 'sine', 0.08);
  },
  clink() {
    if (!save.sound) return;
    tone(3200 + Math.random() * 800, 0.08, 'sine', 0.06);
  },
  hit() {
    if (!save.sound) return;
    noise(0.05, 0.18, 1200, 1.5);
  },
  pop() {
    if (!save.sound) return;
    tone(520, 0.12, 'sine', 0.15, 1200);
    noise(0.08, 0.2, 2200, 1);
  },
  boom() {
    if (!save.sound) return;
    noise(0.5, 0.6, 180, 0.6);
    tone(90, 0.4, 'sine', 0.3, 40);
  },
  hurt() {
    if (!save.sound) return;
    tone(160, 0.2, 'square', 0.12, 80);
  },
  gem() {
    if (!save.sound) return;
    tone(1320 + Math.random() * 300, 0.06, 'triangle', 0.05);
  },
  levelUp() {
    if (!save.sound) return;
    [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.18, 'triangle', 0.14, undefined, i * 0.07));
  },
  click() {
    if (!save.sound) return;
    tone(700, 0.06, 'triangle', 0.12, 900);
  },
  coin() {
    if (!save.sound) return;
    tone(988, 0.08, 'square', 0.06);
    tone(1319, 0.14, 'square', 0.06, undefined, 0.07);
  },
  win() {
    if (!save.sound) return;
    [523, 659, 784, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, 'triangle', 0.15, undefined, i * 0.11));
  },
  lose() {
    if (!save.sound) return;
    [392, 330, 262, 196].forEach((f, i) => tone(f, 0.3, 'triangle', 0.15, undefined, i * 0.16));
  },
  bossRoar() {
    if (!save.sound) return;
    noise(1.0, 0.5, 220, 0.7);
    tone(110, 0.9, 'sawtooth', 0.12, 55);
  },
};

// --- A small upbeat synth-pop loop ---

const BPM = 118;
const CHORDS = [
  [57, 60, 64], // Am
  [53, 57, 60], // F
  [48, 52, 55], // C
  [55, 59, 62], // G
];
const LEAD = [76, -1, 74, 72, -1, 72, 74, 76, 79, -1, 76, -1, 74, 72, 74, -1];

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

function scheduleMusic() {
  if (!ac) return;
  const step = 60 / BPM / 4; // 16th notes
  while (nextNoteTime < ac.currentTime + 0.15) {
    const s = musicStep % 64;
    const bar = Math.floor(s / 16);
    const i = s % 16;
    const when = nextNoteTime - ac.currentTime;
    const chord = CHORDS[bar];
    if (i % 4 === 0) {
      tone(55, 0.18, 'sine', 0.5, 40, when, musicBus); // kick
    }
    if (i === 4 || i === 12) noise(0.12, 0.25, 1800, 0.8, when, musicBus); // snare
    if (i % 2 === 1) noise(0.03, 0.08, 8000, 2, when, musicBus); // hat
    if (i % 8 === 0 || i % 8 === 3 || i % 8 === 6) {
      tone(mtof(chord[0] - 12), 0.2, 'triangle', 0.25, undefined, when, musicBus); // bass
    }
    if (i % 4 === 2) {
      for (const n of chord) tone(mtof(n), 0.16, 'square', 0.025, undefined, when, musicBus);
    }
    if (bar % 2 === 1 || musicStep >= 64) {
      const n = LEAD[i];
      if (n > 0) tone(mtof(n), 0.16, 'triangle', 0.07, undefined, when, musicBus);
    }
    musicStep++;
    nextNoteTime += step;
  }
}

export function startMusic() {
  if (!ac || musicTimer !== null) return;
  nextNoteTime = ac.currentTime + 0.1;
  musicTimer = window.setInterval(scheduleMusic, 50);
}

export function stopMusic() {
  if (musicTimer !== null) {
    clearInterval(musicTimer);
    musicTimer = null;
  }
}

export function setMusic(on: boolean) {
  save.music = on;
  if (on) startMusic();
  else stopMusic();
}

// Pause audio while the app is backgrounded.
document.addEventListener('visibilitychange', () => {
  if (!ac) return;
  if (document.hidden) ac.suspend();
  else ac.resume();
});
