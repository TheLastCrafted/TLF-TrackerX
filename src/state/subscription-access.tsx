import { useMemo } from "react";
import { getRouteAccessPolicy, isRouteUnlocked, routeRequiresPremium, type SubscriptionTier } from "../config/subscription";
import { useAccountState } from "./account";
import { useSettings } from "./settings";

export function useSubscriptionAccess() {
  const { isPro, subscription } = useAccountState();
  const { settings } = useSettings();

  return useMemo(() => {
    const baseTier: SubscriptionTier = isPro ? "premium" : "free";
    const effectiveTier: SubscriptionTier = settings.developerMode ? settings.developerTier : baseTier;

    return {
      effectiveTier,
      baseTier,
      accountTier: subscription.plan === "free" ? "free" : "premium" as SubscriptionTier,
      isDeveloperOverride: settings.developerMode,
      canAccessRoute: (route: string) => isRouteUnlocked(route, effectiveTier),
      requiresPremium: (route: string) => routeRequiresPremium(route),
      routePolicy: (route: string) => getRouteAccessPolicy(route),
    };
  }, [isPro, settings.developerMode, settings.developerTier, subscription.plan]);
}

