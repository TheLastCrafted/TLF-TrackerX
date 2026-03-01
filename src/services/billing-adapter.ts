export type BillingPlan = "pro_monthly" | "pro_yearly";

export type BillingPurchaseResult =
  | { ok: true; plan: BillingPlan; productId: string; renewsAt?: string }
  | { ok: false; reason: string };

export type BillingRestoreResult =
  | { ok: true; plan: BillingPlan; productId: string; renewsAt?: string }
  | { ok: false; reason: string };

export interface BillingAdapter {
  isConfigured(): boolean;
  purchase(plan: BillingPlan): Promise<BillingPurchaseResult>;
  restore(): Promise<BillingRestoreResult>;
}

export class PlaceholderBillingAdapter implements BillingAdapter {
  isConfigured(): boolean {
    return false;
  }

  async purchase(_plan: BillingPlan): Promise<BillingPurchaseResult> {
    return { ok: false, reason: "billing_not_integrated" };
  }

  async restore(): Promise<BillingRestoreResult> {
    return { ok: false, reason: "billing_not_integrated" };
  }
}

