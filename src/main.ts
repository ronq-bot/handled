import { engine } from './engine';
import { Home } from './menu';

engine.init(document.getElementById('game') as HTMLCanvasElement);
engine.replace(new Home());

// Hook for automated playtesting in a headless browser.
(window as unknown as { __engine: typeof engine }).__engine = engine;
