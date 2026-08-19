import { DarkTheme, ThemeProvider } from "@react-navigation/native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { loadApiBase } from "../lib/api";

// Modified by FireDev LLC dba MeshVault on 2026-08-13.

export default function Layout() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void loadApiBase().finally(() => setReady(true));
  }, []);

  if (!ready) {
    return <View style={{ flex: 1, backgroundColor: "#000" }} />;
  }

  return (
    <ThemeProvider value={DarkTheme}>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: "#000" },
          headerTintColor: "#ECECEE",
          headerShadowVisible: false,
          headerBackButtonDisplayMode: "minimal",
          contentStyle: { backgroundColor: "#000" },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false, title: "MeshVault" }} />
        <Stack.Screen name="sign-in" options={{ headerShown: false }} />
        <Stack.Screen
          name="founding"
          options={{
            title: "Pre-release",
            headerStyle: { backgroundColor: "#F7F7F4" },
            headerTintColor: "#1B1B1E",
            contentStyle: { backgroundColor: "#F7F7F4" },
          }}
        />
        <Stack.Screen
          name="new"
          options={{
            title: "New bot",
            presentation: "modal",
            gestureEnabled: true,
            headerBackVisible: false,
          }}
        />
        <Stack.Screen name="thread" options={{ title: "Thread" }} />
        <Stack.Screen name="bot" options={{ title: "Identity" }} />
        <Stack.Screen name="routines" options={{ title: "Routines" }} />
        <Stack.Screen name="computer" options={{ title: "Computer" }} />
        <Stack.Screen name="commerce" options={{ title: "Skills pack" }} />
      </Stack>
    </ThemeProvider>
  );
}
