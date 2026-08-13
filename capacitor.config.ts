import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.lanyaomedia.xmt',
  appName: 'XMT',
  webDir: 'dist',
  android: { allowMixedContent: false },
  plugins: {
    SplashScreen: { launchShowDuration: 0, launchAutoHide: true, backgroundColor: '#0b1018' },
    StatusBar: { style: 'DARK', backgroundColor: '#0b1018' },
  },
};

export default config;
