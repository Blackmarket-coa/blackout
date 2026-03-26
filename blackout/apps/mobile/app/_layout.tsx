import "../polyfills";
import { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { AuthProvider, useBlackoutAuth } from "../lib/auth-context";
import { colors } from "@blackout/config";

SplashScreen.preventAutoHideAsync();

function RootNav() {
  const { isLoading, isAuthenticated } = useBlackoutAuth();

  useEffect(() => {
    if (!isLoading) {
      SplashScreen.hideAsync();
    }
  }, [isLoading]);

  if (isLoading) return null;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.black },
        animation: "fade",
      }}
    >
      {isAuthenticated ? (
        <Stack.Screen name="(tabs)" />
      ) : (
        <Stack.Screen name="auth" />
      )}
      <Stack.Screen
        name="room/[roomId]"
        options={{
          animation: "slide_from_right",
          headerShown: true,
          headerStyle: { backgroundColor: colors.surface },
          headerTintColor: colors.textPrimary,
        }}
      />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <StatusBar style="light" backgroundColor={colors.black} />
      <RootNav />
    </AuthProvider>
  );
}
