import { Tabs } from "expo-router";
import React from "react";
import { View, useColorScheme } from "react-native";

import { HapticTab } from "@/components/haptic-tab";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useAppMode } from "@/src/state/app-mode";
import { useSettings } from "@/src/state/settings";
import { CommandCenterOverlay } from "@/src/ui/command-center-overlay";
import { MinimalBottomBar } from "@/src/ui/minimal-bottom-bar";

export default function TabLayout() {
  const { mode, setMode } = useAppMode();
  const { settings } = useSettings();
  const deviceScheme = useColorScheme();
  const activeScheme = settings.appAppearance === "system" ? (deviceScheme ?? "dark") : settings.appAppearance;
  const isDark = activeScheme === "dark";
  const info = mode === "informational";
  const personal = mode === "personal";
  const workspaceMode = settings.workspaceMode ?? (settings.institutionalMode ? "institutional" : "hybrid");
  const institution = workspaceMode === "institutional";
  const personalOnly = workspaceMode === "personal";

  React.useEffect(() => {
    if (institution && mode !== "informational") setMode("informational");
    if (personalOnly && mode !== "personal") setMode("personal");
  }, [institution, personalOnly, mode, setMode]);

  return (
    <View style={{ flex: 1 }}>
    <Tabs
      tabBar={(props) => <MinimalBottomBar {...props} />}
      screenOptions={{
        tabBarActiveTintColor: info ? (isDark ? "#A98BFF" : "#7A58D6") : isDark ? "#9E74F3" : "#6D49B8",
        tabBarInactiveTintColor: isDark ? "#6B6B7A" : "#8E95AD",
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "700",
        },
        tabBarStyle: {
          backgroundColor: info ? (isDark ? "#0A101B" : "#EEF4FF") : isDark ? "#110E1B" : "#F4EEFF",
          borderTopColor: info ? (isDark ? "#1A2B43" : "#C8D8F0") : isDark ? "#2B1F47" : "#D7C8F0",
          height: 0,
          paddingBottom: 0,
          paddingTop: 0,
        },
        headerShown: false,
        tabBarButton: (props) => <HapticTab {...props} hapticsEnabled={settings.haptics} />,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarItemStyle: personal || personalOnly ? { display: "none" } : undefined,
          tabBarIcon: ({ color }) => <IconSymbol size={24} name="house.fill" color={color} />,
        }}
      />

      <Tabs.Screen
        name="charts"
        options={{
          title: "Charts",
          tabBarItemStyle: personal || personalOnly ? { display: "none" } : undefined,
          tabBarIcon: ({ color }) => <IconSymbol size={24} name="chart.line.uptrend.xyaxis" color={color} />,
        }}
      />

      <Tabs.Screen
        name="crypto"
        options={{
          title: "Crypto",
          tabBarItemStyle: personal || personalOnly ? { display: "none" } : undefined,
          tabBarIcon: ({ color }) => <IconSymbol size={24} name="bitcoinsign.circle.fill" color={color} />,
        }}
      />

      <Tabs.Screen
        name="stocks"
        options={{
          title: "Stocks",
          tabBarItemStyle: personal || personalOnly ? { display: "none" } : undefined,
          tabBarIcon: ({ color }) => <IconSymbol size={24} name="chart.line.uptrend.xyaxis.circle.fill" color={color} />,
        }}
      />

      <Tabs.Screen
        name="explore"
        options={{
          title: "Macro",
          tabBarItemStyle: personal || personalOnly ? { display: "none" } : undefined,
          tabBarIcon: ({ color }) => <IconSymbol size={24} name="globe.europe.africa.fill" color={color} />,
        }}
      />

      <Tabs.Screen
        name="watchlist"
        options={{
          title: "Watchlist",
          tabBarItemStyle: personal || personalOnly ? { display: "none" } : undefined,
          tabBarIcon: ({ color }) => <IconSymbol size={24} name="star.fill" color={color} />,
        }}
      />

      <Tabs.Screen
        name="news"
        options={{
          title: "News",
          tabBarItemStyle: personal || personalOnly ? { display: "none" } : undefined,
          tabBarIcon: ({ color }) => <IconSymbol size={24} name="newspaper.fill" color={color} />,
        }}
      />

      <Tabs.Screen
        name="research"
        options={{
          title: "Research",
          tabBarItemStyle: personal || personalOnly ? { display: "none" } : undefined,
          tabBarIcon: ({ color }) => <IconSymbol size={24} name="book.fill" color={color} />,
        }}
      />

      <Tabs.Screen
        name="liquidity"
        options={{
          title: "Liquidity",
          tabBarItemStyle: personal || personalOnly ? { display: "none" } : undefined,
          tabBarIcon: ({ color }) => <IconSymbol size={24} name="drop.fill" color={color} />,
        }}
      />

      <Tabs.Screen
        name="correlations"
        options={{
          title: "Correlations",
          tabBarItemStyle: personal || personalOnly ? { display: "none" } : undefined,
          tabBarIcon: ({ color }) => <IconSymbol size={24} name="point.3.connected.trianglepath.dotted" color={color} />,
        }}
      />

      <Tabs.Screen
        name="scenario"
        options={{
          title: "Scenario",
          tabBarItemStyle: personal || personalOnly ? { display: "none" } : undefined,
          tabBarIcon: ({ color }) => <IconSymbol size={24} name="wand.and.stars" color={color} />,
        }}
      />

      <Tabs.Screen
        name="tools"
        options={{
          title: "Personal",
          tabBarItemStyle: (info && !personalOnly) || institution ? { display: "none" } : undefined,
          tabBarIcon: ({ color }) => <IconSymbol size={24} name="wrench.and.screwdriver.fill" color={color} />,
        }}
      />

      <Tabs.Screen
        name="portfolio"
        options={{
          title: "Portfolio",
          tabBarItemStyle: (info && !personalOnly) || institution ? { display: "none" } : undefined,
          tabBarIcon: ({ color }) => <IconSymbol size={24} name="briefcase.fill" color={color} />,
        }}
      />

      <Tabs.Screen
        name="strategy"
        options={{
          title: "Strategy",
          tabBarItemStyle: (info && !personalOnly) || institution ? { display: "none" } : undefined,
          tabBarIcon: ({ color }) => <IconSymbol size={24} name="function" color={color} />,
        }}
      />

      <Tabs.Screen
        name="budget"
        options={{
          title: "Budget",
          tabBarItemStyle: (info && !personalOnly) || institution ? { display: "none" } : undefined,
          tabBarIcon: ({ color }) => <IconSymbol size={24} name="wallet.pass.fill" color={color} />,
        }}
      />

      <Tabs.Screen
        name="cashflow"
        options={{
          title: "Cashflow",
          tabBarItemStyle: (info && !personalOnly) || institution ? { display: "none" } : undefined,
          tabBarIcon: ({ color }) => <IconSymbol size={24} name="chart.bar.fill" color={color} />,
        }}
      />

      <Tabs.Screen
        name="debt"
        options={{
          title: "Debt",
          tabBarItemStyle: (info && !personalOnly) || institution ? { display: "none" } : undefined,
          tabBarIcon: ({ color }) => <IconSymbol size={24} name="creditcard.fill" color={color} />,
        }}
      />

      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          href: undefined,
          tabBarIcon: ({ color }) => <IconSymbol size={24} name="gearshape.fill" color={color} />,
        }}
      />
    </Tabs>
    <CommandCenterOverlay />
    </View>
  );
}
