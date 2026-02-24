const MAP: Record<string, string> = {
  sp500_index: "TVC:SPX",
  nasdaq_composite: "TVC:IXIC",
  dow_jones: "TVC:DJI",
  vix: "CBOE:VIX",
  wilshire_5000: "TVC:W5000",
  wti_oil: "TVC:USOIL",
  gold_usd: "OANDA:XAUUSD",
  silver_usd: "OANDA:XAGUSD",
  eur_usd: "FX:EURUSD",
  usd_jpy: "FX:USDJPY",
  gbp_usd: "FX:GBPUSD",
  usd_cny: "FX:USDCNY",
  us_10y_yield: "TVC:US10Y",
  us_2y_yield: "TVC:US02Y",
  us_30y_yield: "TVC:US30Y",
  dollar_index: "TVC:DXY",
};

export function tradingSymbolForChartId(chartId: string): string {
  return MAP[chartId] ?? "";
}
