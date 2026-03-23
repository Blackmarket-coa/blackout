import type { ExpoConfig } from "expo/config";

const config: ExpoConfig = {
  name: "Blackout",
  slug: "blackout",
  version: "1.0.0",
  scheme: "blackout",
  owner: "blackmarket-coa",
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "dark",
  splash: {
    image: "./assets/splash.png",
    resizeMode: "contain",
    backgroundColor: "#0D0D0D",
  },
  ios: {
    supportsTablet: true,
    bundleIdentifier: "co.bmc.blackout",
    infoPlist: {
      NSCameraUsageDescription: "Send photos and videos in chat",
      NSMicrophoneUsageDescription: "Voice and video calls",
      NSPhotoLibraryUsageDescription: "Share photos from your library",
    },
  },
  android: {
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png",
      backgroundColor: "#0D0D0D",
    },
    package: "co.bmc.blackout",
  },
  web: {
    favicon: "./assets/favicon.png",
    bundler: "metro",
  },
  plugins: [
    "expo-router",
    "expo-secure-store",
    [
      "expo-notifications",
      {
        icon: "./assets/notification-icon.png",
        color: "#2E7D32",
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
};

export default config;
