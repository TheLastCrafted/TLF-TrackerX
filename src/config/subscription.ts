export type SubscriptionTier = "free" | "premium";

export type AppRouteKey =
  | "index"
  | "charts"
  | "crypto"
  | "stocks"
  | "explore"
  | "liquidity"
  | "correlations"
  | "scenario"
  | "watchlist"
  | "news"
  | "research"
  | "tools"
  | "portfolio"
  | "strategy"
  | "budget"
  | "cashflow"
  | "debt";

export type RouteAccessPolicy = {
  route: AppRouteKey;
  label: string;
  tier: SubscriptionTier;
  group: "informational" | "personal";
  note?: string;
};

export const ROUTE_ACCESS_POLICY: RouteAccessPolicy[] = [
  { route: "index", label: "Home", tier: "free", group: "informational" },
  { route: "crypto", label: "Crypto", tier: "free", group: "informational" },
  { route: "stocks", label: "Stocks", tier: "free", group: "informational" },
  { route: "watchlist", label: "Watchlist", tier: "free", group: "informational" },
  { route: "news", label: "News", tier: "free", group: "informational" },
  { route: "charts", label: "Charts", tier: "premium", group: "informational", note: "Advanced chart workflows" },
  { route: "explore", label: "Macro", tier: "premium", group: "informational", note: "Macro dashboard and composite signals" },
  { route: "liquidity", label: "Liquidity", tier: "premium", group: "informational", note: "Liquidity regime tracking" },
  { route: "correlations", label: "Correlations", tier: "premium", group: "informational", note: "Cross-asset correlation engine" },
  { route: "scenario", label: "Scenario", tier: "premium", group: "informational", note: "Scenario stress simulator" },
  { route: "research", label: "Research", tier: "premium", group: "informational", note: "Research console and notes" },
  { route: "tools", label: "Hub", tier: "free", group: "personal" },
  { route: "budget", label: "Budget", tier: "free", group: "personal" },
  { route: "cashflow", label: "Cashflow", tier: "free", group: "personal" },
  { route: "debt", label: "Debt", tier: "free", group: "personal" },
  { route: "portfolio", label: "Portfolio", tier: "premium", group: "personal", note: "Live valuation and allocation analytics" },
  { route: "strategy", label: "Strategy", tier: "premium", group: "personal", note: "Projection and retirement planner" },
];

const policyByRoute = new Map<string, RouteAccessPolicy>(ROUTE_ACCESS_POLICY.map((row) => [row.route, row]));

export function getRouteAccessPolicy(route: string): RouteAccessPolicy | undefined {
  return policyByRoute.get(route);
}

export function routeRequiresPremium(route: string): boolean {
  return getRouteAccessPolicy(route)?.tier === "premium";
}

export function isRouteUnlocked(route: string, tier: SubscriptionTier): boolean {
  return !routeRequiresPremium(route) || tier === "premium";
}

export function listTierFeatures(tier: SubscriptionTier): RouteAccessPolicy[] {
  if (tier === "premium") return ROUTE_ACCESS_POLICY;
  return ROUTE_ACCESS_POLICY.filter((row) => row.tier === "free");
}

