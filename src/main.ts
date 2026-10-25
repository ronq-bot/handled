import { engine } from './engine';
import { Home } from './menu';
import { initNative } from './native';
import { restoreNativeBackup } from './save';

restoreNativeBackup().finally(() => {
  engine.init(document.getElementById('game') as HTMLCanvasElement);
  engine.replace(new Home());
  initNative();
});

// Hooks for automated playtesting in a headless browser.
const w = window as unknown as { __engine: typeof engine; __start: (a: number, s?: boolean) => void };
w.__engine = engine;
w.__start = (area, survival) => new Home().startBattle(area, survival);
