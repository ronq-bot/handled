// Haptic feedback via Capacitor's Haptics plugin. Only fires inside the
// native app; browsers get nothing.

import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { save } from './save';

type Impact = 'LIGHT' | 'MEDIUM' | 'HEAVY';

const native = Capacitor.isNativePlatform();
const STYLE: Record<Impact, ImpactStyle> = {
  LIGHT: ImpactStyle.Light,
  MEDIUM: ImpactStyle.Medium,
  HEAVY: ImpactStyle.Heavy,
};
const NOTE = {
  SUCCESS: NotificationType.Success,
  WARNING: NotificationType.Warning,
  ERROR: NotificationType.Error,
};

let lastLight = 0;

export function haptic(style: Impact = 'LIGHT') {
  if (!native || !save.haptics) return;
  const now = performance.now();
  if (style === 'LIGHT') {
    if (now - lastLight < 40) return;
    lastLight = now;
  }
  Haptics.impact({ style: STYLE[style] }).catch(() => {});
}

export function hapticNotify(type: keyof typeof NOTE) {
  if (!native || !save.haptics) return;
  Haptics.notification({ type: NOTE[type] }).catch(() => {});
}
