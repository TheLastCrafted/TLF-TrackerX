# TLF TrackerX

Mobile-first finance tracker built with Expo + React Native.

## Core Modules

- Informational workspace: Home, Charts, Crypto, Stocks, Macro, Liquidity, Correlations, Scenario, Watchlist, News, Research
- Personal workspace: Hub, Portfolio, Strategy, Budget, Cashflow, Debt
- Command Center overlay + quick navigation
- Local-first persistence for watchlist, finance tools, widget layouts, settings, alerts, and account framework state

## Tech Stack

- Expo SDK 54 / React Native 0.81 / React 19
- Expo Router
- Vercel serverless endpoints (`/api/http`, `/api/stooq`, `/api/yfinance`) for web proxy/fallback flows

## Setup

```bash
npm install
npx expo start
```

## Quality Checks

```bash
npm run lint
npx tsc --noEmit
```

CI (GitHub Actions) runs the same checks on push/PR.

## Build Commands

```bash
npm run build:alpha:ios
npm run build:preview:ios
npm run build:prod:ios
```

Equivalent Android commands are also available in `package.json`.

## Release Readiness Notes

Implemented now:

- Settings persistence (`settings_v1`)
- Price alerts persistence (`price_alerts_v1`)
- Account/subscription framework state (`account_state_v1`)
- Account screen wired to framework actions and statuses

Prepared framework hooks (not fully integrated with external services yet):

- Apple sign-in adapter contract (`src/services/auth-adapter.ts`)
- Billing adapter contract (`src/services/billing-adapter.ts`)
- Account provider APIs for sign-in, restore purchases, and entitlements

Pending external integration:

- Real Sign in with Apple credentials + token exchange
- App Store billing / receipt validation backend flow
- Production analytics/crash reporting pipeline

