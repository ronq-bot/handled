// Native app lifecycle: hide the status bar, dismiss the splash once the
// first frame is up, and pause battles when the app goes to the background.

import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { SplashScreen } from '@capacitor/splash-screen';
import { StatusBar } from '@capacitor/status-bar';
import { engine } from './engine';

export function initNative() {
  const pause = () => {
    const top = engine.top() as { mode?: string } | undefined;
    if (top && top.mode === 'play') top.mode = 'paused';
  };
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pause();
  });
  if (!Capacitor.isNativePlatform()) return;
  StatusBar.hide().catch(() => {});
  App.addListener('appStateChange', ({ isActive }) => {
    if (!isActive) pause();
  });
  requestAnimationFrame(() => SplashScreen.hide().catch(() => {}));
}
