import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'co.bmc.blackout',
  appName: 'Blackout',
  webDir: '../apps/blackout-web/dist',
  server: {
    androidScheme: 'https',
    iosScheme: 'https',
    // Uncomment for live reload during development:
    // url: 'http://YOUR_LOCAL_IP:5173',
    // cleartext: true,
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 2000,
      backgroundColor: '#0D0D0D',
      showSpinner: false,
      androidScaleType: 'CENTER_CROP',
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#0D0D0D',
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    Keyboard: {
      resize: 'body',
      resizeOnFullScreen: true,
      style: 'DARK',
      scroll: true,
      scrollAssist: true,
    },
    Camera: {
      permissions: ['camera', 'photos'],
    },
    App: {
      handleApplicationNotifications: true,
    },
  },
  ios: {
    contentInset: 'automatic',
    backgroundColor: '#0D0D0D',
    preferredContentMode: 'mobile',
    scheme: 'blackout',
  },
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
    backgroundColor: '#0D0D0D',
    appendUserAgent: 'Blackout/1.0',
  },
};

export default config;
