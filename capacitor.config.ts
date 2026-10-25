import type { CapacitorConfig } from '@capacitor/cli';

// Change appId to a bundle ID you own (reverse-DNS of your domain or name)
// before creating the app record in App Store Connect.
const config: CapacitorConfig = {
  appId: 'com.idolsquad.brainrotdefense',
  appName: 'Idol Squad',
  webDir: 'dist',
  ios: {
    contentInset: 'never',
    backgroundColor: '#2a1450',
    scrollEnabled: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 600,
      backgroundColor: '#2a1450',
      showSpinner: false,
    },
  },
};

export default config;
