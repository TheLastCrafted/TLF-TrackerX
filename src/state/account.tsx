import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { loadPersistedJson, savePersistedJson } from "../lib/persistence";

export type AuthProvider = "none" | "apple";
export type SubscriptionPlan = "free" | "pro_monthly" | "pro_yearly";
export type SubscriptionStatus = "inactive" | "trial" | "active" | "grace_period" | "expired";

export type AccountAuthState = {
  status: "guest" | "signed_in";
  provider: AuthProvider;
  userId?: string;
  displayName?: string;
  email?: string;
  updatedAt: number;
};

export type AccountSubscriptionState = {
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  source: "none" | "app_store";
  productId?: string;
  renewsAt?: string;
  updatedAt: number;
};

type AccountState = {
  auth: AccountAuthState;
  subscription: AccountSubscriptionState;
  appleSignInConfigured: boolean;
};

type AccountContextValue = {
  auth: AccountAuthState;
  subscription: AccountSubscriptionState;
  appleSignInConfigured: boolean;
  isPro: boolean;
  prepareAppleSignIn: () => void;
  signInWithApple: () => Promise<{ ok: boolean; reason?: string }>;
  signOut: () => void;
  activateProPreview: (plan: Exclude<SubscriptionPlan, "free">) => void;
  resetSubscription: () => void;
  restorePurchases: () => Promise<{ ok: boolean; reason?: string }>;
};

const ACCOUNT_PERSIST_KEY = "account_state_v1";

const defaultAuth: AccountAuthState = {
  status: "guest",
  provider: "none",
  updatedAt: Date.now(),
};

const defaultSubscription: AccountSubscriptionState = {
  plan: "free",
  status: "inactive",
  source: "none",
  updatedAt: Date.now(),
};

const defaultAccountState: AccountState = {
  auth: defaultAuth,
  subscription: defaultSubscription,
  appleSignInConfigured: false,
};

function normalizeAccountState(input: AccountState | null | undefined): AccountState {
  if (!input || typeof input !== "object") return defaultAccountState;
  return {
    auth: {
      ...defaultAuth,
      ...(input.auth ?? {}),
      updatedAt: Number.isFinite(input.auth?.updatedAt) ? Number(input.auth?.updatedAt) : Date.now(),
    },
    subscription: {
      ...defaultSubscription,
      ...(input.subscription ?? {}),
      updatedAt: Number.isFinite(input.subscription?.updatedAt) ? Number(input.subscription?.updatedAt) : Date.now(),
    },
    appleSignInConfigured: Boolean(input.appleSignInConfigured),
  };
}

const AccountContext = createContext<AccountContextValue | null>(null);

export function AccountProvider(props: { children: ReactNode }) {
  const [state, setState] = useState<AccountState>(defaultAccountState);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const saved = await loadPersistedJson<AccountState | null>(ACCOUNT_PERSIST_KEY, null);
      if (!alive) return;
      setState(normalizeAccountState(saved));
      setHydrated(true);
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    void savePersistedJson(ACCOUNT_PERSIST_KEY, state);
  }, [hydrated, state]);

  const value = useMemo<AccountContextValue>(() => {
    const isPro = state.subscription.plan !== "free" && ["trial", "active", "grace_period"].includes(state.subscription.status);
    return {
      auth: state.auth,
      subscription: state.subscription,
      appleSignInConfigured: state.appleSignInConfigured,
      isPro,
      prepareAppleSignIn: () => {
        setState((prev) => ({ ...prev, appleSignInConfigured: true }));
      },
      signInWithApple: async () => {
        // Framework hook:
        // replace this mock branch with real Apple auth when credentials/services are ready.
        if (!state.appleSignInConfigured) {
          return { ok: false, reason: "apple_signin_not_configured" };
        }
        setState((prev) => ({
          ...prev,
          auth: {
            status: "signed_in",
            provider: "apple",
            userId: prev.auth.userId || `apple_${Date.now()}`,
            displayName: prev.auth.displayName || "TrackerX User",
            email: prev.auth.email,
            updatedAt: Date.now(),
          },
        }));
        return { ok: true };
      },
      signOut: () => {
        setState((prev) => ({
          ...prev,
          auth: { ...defaultAuth, updatedAt: Date.now() },
        }));
      },
      activateProPreview: (plan) => {
        setState((prev) => ({
          ...prev,
          subscription: {
            plan,
            status: "active",
            source: "app_store",
            productId: plan === "pro_yearly" ? "trackerx.pro.yearly" : "trackerx.pro.monthly",
            renewsAt: new Date(Date.now() + (plan === "pro_yearly" ? 365 : 30) * 24 * 60 * 60 * 1000).toISOString(),
            updatedAt: Date.now(),
          },
        }));
      },
      resetSubscription: () => {
        setState((prev) => ({
          ...prev,
          subscription: { ...defaultSubscription, updatedAt: Date.now() },
        }));
      },
      restorePurchases: async () => {
        // Framework hook:
        // wire to StoreKit receipt validation / billing backend later.
        return { ok: false, reason: "billing_not_integrated" };
      },
    };
  }, [state]);

  return <AccountContext.Provider value={value}>{props.children}</AccountContext.Provider>;
}

export function useAccountState() {
  const ctx = useContext(AccountContext);
  if (!ctx) throw new Error("useAccountState must be used inside AccountProvider");
  return ctx;
}
