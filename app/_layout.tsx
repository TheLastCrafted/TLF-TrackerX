import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { AppModeProvider } from '@/src/state/app-mode';
import { FinanceToolsProvider } from '@/src/state/finance-tools';
import { NewsProvider } from '@/src/state/news';
import { PriceAlertProvider } from '@/src/state/price-alerts';
import { ResearchNotesProvider } from '@/src/state/research-notes';
import { SettingsProvider, useSettings } from '@/src/state/settings';
import { WatchlistProvider } from '@/src/state/watchlist';

export const unstable_settings = {
  anchor: '(tabs)',
};

function RootNavigator() {
  const deviceColorScheme = useColorScheme();
  const { settings } = useSettings();
  const activeTheme = settings.appAppearance === "system" ? deviceColorScheme : settings.appAppearance;

  return (
    <ThemeProvider value={activeTheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
      </Stack>
      <StatusBar style={activeTheme === "dark" ? "light" : "dark"} />
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <SettingsProvider>
      <WatchlistProvider>
        <AppModeProvider>
          <PriceAlertProvider>
            <FinanceToolsProvider>
              <NewsProvider>
                <ResearchNotesProvider>
                  <RootNavigator />
                </ResearchNotesProvider>
              </NewsProvider>
            </FinanceToolsProvider>
          </PriceAlertProvider>
        </AppModeProvider>
      </WatchlistProvider>
    </SettingsProvider>
  );
}
