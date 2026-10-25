// Canvas, scaling, input and the scene stack.
// The game is laid out in a logical space that is always 720 units wide;
// its height follows the device's aspect ratio so tall phones get more field.

export const W = 720;

export interface Pointer {
  x: number;
  y: number;
  down: boolean;
}

export interface Scene {
  update(dt: number): void;
  render(ctx: CanvasRenderingContext2D): void;
  onDown?(x: number, y: number): void;
  onMove?(x: number, y: number): void;
  onUp?(x: number, y: number): void;
  onEnter?(): void;
  onResize?(): void;
}

class Engine {
  canvas!: HTMLCanvasElement;
  ctx!: CanvasRenderingContext2D;
  H = 1280;
  scale = 1;
  dpr = 1;
  safeTop = 0;
  safeBottom = 0;
  time = 0;
  pointer: Pointer = { x: 0, y: 0, down: false };
  private stack: Scene[] = [];
  private last = 0;

  init(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 200));

    const toLocal = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      return { x: (e.clientX - r.left) / this.scale, y: (e.clientY - r.top) / this.scale };
    };
    canvas.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const p = toLocal(e);
      this.pointer = { ...p, down: true };
      this.top()?.onDown?.(p.x, p.y);
    });
    canvas.addEventListener('pointermove', (e) => {
      e.preventDefault();
      const p = toLocal(e);
      this.pointer.x = p.x;
      this.pointer.y = p.y;
      this.top()?.onMove?.(p.x, p.y);
    });
    const up = (e: PointerEvent) => {
      e.preventDefault();
      const p = toLocal(e);
      this.pointer = { ...p, down: false };
      this.top()?.onUp?.(p.x, p.y);
    };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    document.addEventListener('contextmenu', (e) => e.preventDefault());

    requestAnimationFrame((t) => this.frame(t));
  }

  resize() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (vh / vw >= 1100 / W) {
      // Phones: fill the width, extend the field to the screen's height.
      this.scale = vw / W;
      this.H = Math.min(1700, Math.round(vh / this.scale));
      if (this.H === 1700) this.scale = vh / this.H;
    } else {
      // iPad and other wide screens: fit by height, centre horizontally.
      this.H = 1100;
      this.scale = vh / this.H;
    }
    this.dpr = Math.min(window.devicePixelRatio || 1, 3);
    const cssW = W * this.scale;
    const cssH = this.H * this.scale;
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;
    this.canvas.style.left = `${(vw - cssW) / 2}px`;
    this.canvas.style.top = `${(vh - cssH) / 2}px`;
    this.canvas.width = Math.round(cssW * this.dpr);
    this.canvas.height = Math.round(cssH * this.dpr);

    const cs = getComputedStyle(document.documentElement);
    this.safeTop = (parseFloat(cs.getPropertyValue('--sat')) || 0) / this.scale;
    this.safeBottom = (parseFloat(cs.getPropertyValue('--sab')) || 0) / this.scale;
    for (const s of this.stack) s.onResize?.();
  }

  top() {
    return this.stack[this.stack.length - 1];
  }

  push(s: Scene) {
    this.stack.push(s);
    s.onEnter?.();
  }

  pop() {
    this.stack.pop();
    this.top()?.onEnter?.();
  }

  replace(s: Scene) {
    this.stack = [s];
    s.onEnter?.();
  }

  private frame(t: number) {
    const dt = Math.min(0.05, (t - this.last) / 1000 || 0);
    this.last = t;
    this.time += dt;
    const top = this.top();
    // Overlays (popups) sit above the scene below them: update only the top,
    // render the whole stack so the game stays visible underneath.
    top?.update(dt);
    const ctx = this.ctx;
    ctx.setTransform(this.dpr * this.scale, 0, 0, this.dpr * this.scale, 0, 0);
    for (const s of this.stack) s.render(ctx);
    requestAnimationFrame((tt) => this.frame(tt));
  }
}

export const engine = new Engine();
