export type AppleAuthResult =
  | { ok: true; userId: string; email?: string; displayName?: string }
  | { ok: false; reason: string };

export interface AuthAdapter {
  isConfigured(): boolean;
  signInWithApple(): Promise<AppleAuthResult>;
  signOut(): Promise<void>;
}

export class PlaceholderAuthAdapter implements AuthAdapter {
  isConfigured(): boolean {
    return false;
  }

  async signInWithApple(): Promise<AppleAuthResult> {
    return { ok: false, reason: "apple_auth_not_integrated" };
  }

  async signOut(): Promise<void> {
    return;
  }
}

