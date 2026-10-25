// Haptic feedback through Capacitor's Haptics plugin when running as the
// iOS app; silently does nothing in a browser.

import { save } from './save';

type Impact = 'LIGHT' | 'MEDIUM' | 'HEAVY';

interface HapticsPlugin {
  impact(opts: { style: Impact }): Promise<void>;
  notification(opts: { type: 'SUCCESS' | 'WARNING' | 'ERROR' }): Promise<void>;
}

function plugin(): HapticsPlugin | undefined {
  const cap = (window as unknown as { Capacitor?: { Plugins?: { Haptics?: HapticsPlugin } } }).Capacitor;
  return cap?.Plugins?.Haptics;
}

let lastLight = 0;

export function haptic(style: Impact = 'LIGHT') {
  if (!save.haptics) return;
  const p = plugin();
  if (!p) return;
  const now = performance.now();
  if (style === 'LIGHT') {
    if (now - lastLight < 40) return;
    lastLight = now;
  }
  p.impact({ style }).catch(() => {});
}

export function hapticNotify(type: 'SUCCESS' | 'WARNING' | 'ERROR') {
  if (!save.haptics) return;
  plugin()?.notification({ type }).catch(() => {});
}
