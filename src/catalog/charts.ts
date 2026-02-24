import { TRACKED_COINS } from "./coins";

export type ChartCategory = "Crypto" | "EU" | "Macro" | "Stocks";
export type ChartValueFormat = "usd" | "percent" | "index" | "number";

type CoinGeckoChartDefinition = {
  id: string;
  title: string;
  category: ChartCategory;
  description?: string;
  valueFormat: "usd";
  type: "coingecko_market_chart";
  params: {
    coinId: string;
    vsCurrency: "usd" | "eur";
    defaultDays: 1 | 7 | 30 | 365;
    metric: "prices" | "market_caps" | "total_volumes";
  };
};

type FredSeriesChartDefinition = {
  id: string;
  title: string;
  category: "EU" | "Macro" | "Stocks";
  description?: string;
  valueFormat: Exclude<ChartValueFormat, "usd">;
  type: "fred_series";
  params: {
    seriesId: string;
    days: number;
  };
};

type FormulaChartDefinition = {
  id: string;
  title: string;
  category: ChartCategory;
  description?: string;
  valueFormat: "number" | "percent" | "index";
  type: "formula_chart";
  params: {
    leftId: string;
    rightId: string;
    operation: "divide" | "multiply" | "subtract" | "add";
  };
};

export type ChartDefinition = CoinGeckoChartDefinition | FredSeriesChartDefinition | FormulaChartDefinition;

const CRYPTO_CHARTS: ChartDefinition[] = TRACKED_COINS.flatMap((coin) => [
  {
    id: `${coin.symbol.toLowerCase()}_price_usd`,
    title: `${coin.symbol} Price`,
    category: "Crypto" as const,
    description: `${coin.name} spot price with full interactive chart controls.`,
    valueFormat: "usd" as const,
    type: "coingecko_market_chart" as const,
    params: {
      coinId: coin.id,
      vsCurrency: "usd" as const,
      defaultDays: 30,
      metric: "prices" as const,
    },
  },
  {
    id: `${coin.symbol.toLowerCase()}_market_cap_usd`,
    title: `${coin.symbol} Market Cap`,
    category: "Crypto" as const,
    description: `${coin.name} circulating market capitalization trend.`,
    valueFormat: "usd" as const,
    type: "coingecko_market_chart" as const,
    params: {
      coinId: coin.id,
      vsCurrency: "usd" as const,
      defaultDays: 30,
      metric: "market_caps" as const,
    },
  },
  {
    id: `${coin.symbol.toLowerCase()}_volume_usd`,
    title: `${coin.symbol} Volume`,
    category: "Crypto" as const,
    description: `${coin.name} total traded volume trend.`,
    valueFormat: "usd" as const,
    type: "coingecko_market_chart" as const,
    params: {
      coinId: coin.id,
      vsCurrency: "usd" as const,
      defaultDays: 30,
      metric: "total_volumes" as const,
    },
  },
]);

function fred(def: {
  id: string;
  title: string;
  category: "EU" | "Macro" | "Stocks";
  description: string;
  valueFormat: Exclude<ChartValueFormat, "usd">;
  seriesId: string;
  days?: number;
}): ChartDefinition {
  return {
    id: def.id,
    title: def.title,
    category: def.category,
    description: def.description,
    valueFormat: def.valueFormat,
    type: "fred_series",
    params: {
      seriesId: def.seriesId,
      days: def.days ?? 3650,
    },
  };
}

function formula(def: {
  id: string;
  title: string;
  category: ChartCategory;
  description: string;
  valueFormat?: "number" | "percent" | "index";
  leftId: string;
  rightId: string;
  operation: "divide" | "multiply" | "subtract" | "add";
}): ChartDefinition {
  return {
    id: def.id,
    title: def.title,
    category: def.category,
    description: def.description,
    valueFormat: def.valueFormat ?? "number",
    type: "formula_chart",
    params: {
      leftId: def.leftId,
      rightId: def.rightId,
      operation: def.operation,
    },
  };
}

const CURATED_CRYPTO_INDICATOR_CHARTS: ChartDefinition[] = [
  formula({ id: "total_crypto_market_cap_proxy", title: "Total Crypto Market Cap & Trendline", category: "Crypto", description: "Proxy using BTC + ETH market capitalization blend.", leftId: "btc_market_cap_usd", rightId: "eth_market_cap_usd", operation: "add", valueFormat: "number" }),
  formula({ id: "total_crypto_valuation_trendline", title: "Total Crypto Valuation vs. Trendline", category: "Crypto", description: "Market-cap proxy relative to broad liquidity (M2).", leftId: "total_crypto_market_cap_proxy", rightId: "us_money_supply_m2", operation: "divide", valueFormat: "number" }),
  formula({ id: "dominance", title: "Dominance", category: "Crypto", description: "BTC market cap as share of BTC+ETH market-cap proxy.", leftId: "btc_market_cap_usd", rightId: "total_crypto_market_cap_proxy", operation: "divide", valueFormat: "percent" }),
  formula({ id: "stablecoin_supply_ratio_ssr", title: "Stablecoin Supply Ratio (SSR)", category: "Crypto", description: "BTC market cap relative to liquidity proxy.", leftId: "btc_market_cap_usd", rightId: "us_money_supply_m2", operation: "divide", valueFormat: "number" }),
  formula({ id: "altcoin_market_caps", title: "Altcoin Market Capitalizations", category: "Crypto", description: "ETH market cap as alt-market proxy.", leftId: "eth_market_cap_usd", rightId: "btc_market_cap_usd", operation: "divide", valueFormat: "number" }),
  formula({ id: "portfolios_weighted_by_market_cap", title: "Portfolios Weighted By Market Cap", category: "Crypto", description: "BTC/ETH relative-weight proxy.", leftId: "btc_market_cap_usd", rightId: "eth_market_cap_usd", operation: "divide", valueFormat: "number" }),
  formula({ id: "crypto_heatmap", title: "Crypto Heatmap", category: "Crypto", description: "Momentum heat proxy using BTC volume/market-cap.", leftId: "btc_volume_usd", rightId: "btc_market_cap_usd", operation: "divide", valueFormat: "number" }),
  formula({ id: "market_cap_hypotheticals", title: "Market Cap Hypotheticals", category: "Crypto", description: "BTC valuation relative to macro yield pressure.", leftId: "btc_market_cap_usd", rightId: "us_10y_yield", operation: "divide", valueFormat: "number" }),

  formula({ id: "historical_risk_levels", title: "Historical Risk Levels", category: "Crypto", description: "Volatility/risk proxy from BTC volume vs price.", leftId: "btc_volume_usd", rightId: "btc_price_usd", operation: "divide", valueFormat: "number" }),
  formula({ id: "price_color_coded_by_risk", title: "Price Color Coded By Risk", category: "Crypto", description: "BTC price relative to market-cap proxy.", leftId: "btc_price_usd", rightId: "btc_market_cap_usd", operation: "divide", valueFormat: "number" }),
  formula({ id: "time_in_risk_bands", title: "Time In Risk Bands", category: "Crypto", description: "Risk persistence proxy via BTC to VIX ratio.", leftId: "btc_price_usd", rightId: "vix", operation: "divide", valueFormat: "number" }),
  formula({ id: "current_risk_levels", title: "Current Risk Levels", category: "Crypto", description: "Current risk proxy from BTC/10Y real-yield mix.", leftId: "btc_price_usd", rightId: "us_real_interest_rate_10y", operation: "divide", valueFormat: "number" }),

  formula({ id: "logarithmic_regression", title: "Logarithmic Regression", category: "Crypto", description: "BTC long-cycle trend proxy.", leftId: "btc_price_usd", rightId: "us_money_supply_m2", operation: "divide", valueFormat: "number" }),
  formula({ id: "fair_value_log_reg", title: "Fair Value Logarithmic Regression", category: "Crypto", description: "BTC fair-value proxy against liquidity + yields.", leftId: "btc_price_usd", rightId: "us_10y_yield", operation: "divide", valueFormat: "number" }),
  formula({ id: "log_reg_rainbow", title: "Logarithmic Regression Rainbow", category: "Crypto", description: "Multi-regime trend proxy for BTC.", leftId: "fair_value_log_reg", rightId: "logarithmic_regression", operation: "divide", valueFormat: "number" }),

  formula({ id: "running_roi", title: "Running ROI", category: "Crypto", description: "BTC/ETH relative return proxy.", leftId: "btc_price_usd", rightId: "eth_price_usd", operation: "divide", valueFormat: "number" }),
  formula({ id: "monthly_returns", title: "Monthly Returns", category: "Crypto", description: "Monthly momentum proxy from BTC price and volume.", leftId: "btc_price_usd", rightId: "btc_volume_usd", operation: "divide", valueFormat: "number" }),
  formula({ id: "quarterly_returns", title: "Quarterly Returns", category: "Crypto", description: "Quarterly momentum proxy using BTC and macro liquidity.", leftId: "btc_price_usd", rightId: "us_money_supply_m2", operation: "divide", valueFormat: "number" }),
  formula({ id: "average_daily_returns", title: "Average Daily Returns", category: "Crypto", description: "Daily return pressure proxy from volume/price.", leftId: "btc_volume_usd", rightId: "btc_price_usd", operation: "divide", valueFormat: "number" }),
  formula({ id: "monthly_average_roi", title: "Monthly Average ROI", category: "Crypto", description: "ROI proxy with BTC dominance normalization.", leftId: "running_roi", rightId: "dominance", operation: "divide", valueFormat: "number" }),
  formula({ id: "historical_monthly_average_roi", title: "Historical Monthly Average ROI", category: "Crypto", description: "Long-window average ROI proxy.", leftId: "monthly_average_roi", rightId: "us_10y_yield", operation: "divide", valueFormat: "number" }),
  formula({ id: "altcoin_season_index", title: "Altcoin Season Index", category: "Crypto", description: "Altcoin strength proxy via ETH/BTC.", leftId: "eth_price_usd", rightId: "btc_price_usd", operation: "divide", valueFormat: "number" }),
  formula({ id: "year_to_date_roi", title: "Year-To-Date ROI", category: "Crypto", description: "YTD performance proxy against policy backdrop.", leftId: "btc_price_usd", rightId: "us_fed_funds_rate", operation: "divide", valueFormat: "number" }),
  formula({ id: "roi_bands", title: "ROI Bands", category: "Crypto", description: "Return band proxy from BTC/VIX relationship.", leftId: "btc_price_usd", rightId: "vix", operation: "divide", valueFormat: "number" }),
  formula({ id: "roi_after_cycle_bottom", title: "ROI After Cycle Bottom", category: "Crypto", description: "Cycle-bottom ROI proxy from BTC to trendline.", leftId: "btc_price_usd", rightId: "logarithmic_regression", operation: "divide", valueFormat: "number" }),
  formula({ id: "roi_after_bottom_multiple", title: "ROI After Bottom (Multiple Coins)", category: "Crypto", description: "Multi-coin bottom ROI proxy.", leftId: "eth_price_usd", rightId: "logarithmic_regression", operation: "divide", valueFormat: "number" }),
  formula({ id: "roi_after_bottom_pairs", title: "ROI After Bottom (Crypto Pairs)", category: "Crypto", description: "Crypto-pair bottom ROI proxy.", leftId: "eth_price_usd", rightId: "btc_price_usd", operation: "divide", valueFormat: "number" }),
  formula({ id: "roi_after_inception_multi", title: "ROI After Inception (Multiple Coins)", category: "Crypto", description: "Inception-to-date multi-coin ROI proxy.", leftId: "eth_market_cap_usd", rightId: "btc_market_cap_usd", operation: "divide", valueFormat: "number" }),
  formula({ id: "roi_after_inception_pairs", title: "ROI After Inception (Crypto Pairs)", category: "Crypto", description: "Inception ROI proxy for crypto pairs.", leftId: "eth_price_usd", rightId: "btc_price_usd", operation: "divide", valueFormat: "number" }),
  formula({ id: "roi_after_cycle_peak", title: "ROI After Cycle Peak", category: "Crypto", description: "Peak drawdown/recovery proxy.", leftId: "btc_price_usd", rightId: "us_10y_yield", operation: "divide", valueFormat: "number" }),
  formula({ id: "roi_after_latest_cycle_peak_multi", title: "ROI After Latest Cycle Peak (Multiple Coins)", category: "Crypto", description: "Latest-cycle ROI proxy, multi-asset.", leftId: "eth_market_cap_usd", rightId: "us_10y_yield", operation: "divide", valueFormat: "number" }),
  formula({ id: "roi_after_latest_cycle_peak_pairs", title: "ROI After Latest Cycle Peak (Crypto Pairs)", category: "Crypto", description: "Latest-cycle ROI proxy for pairs.", leftId: "eth_price_usd", rightId: "btc_price_usd", operation: "divide", valueFormat: "number" }),
  formula({ id: "roi_after_halving", title: "ROI After Halving", category: "Crypto", description: "Halving-cycle ROI proxy.", leftId: "btc_price_usd", rightId: "us_money_supply_m2", operation: "divide", valueFormat: "number" }),
  formula({ id: "roi_after_sub_cycle_bottom", title: "ROI After Sub-Cycle Bottom", category: "Crypto", description: "Sub-cycle bottom recovery proxy.", leftId: "eth_price_usd", rightId: "fair_value_log_reg", operation: "divide", valueFormat: "number" }),
  formula({ id: "qt_ending_bear_markets", title: "QT Ending Bear Markets", category: "Crypto", description: "Crypto sensitivity to Fed liquidity backdrop.", leftId: "btc_price_usd", rightId: "fed_balance_sheet", operation: "divide", valueFormat: "number" }),
  formula({ id: "best_day_to_dca", title: "Best Day To DCA", category: "Crypto", description: "DCA timing proxy from trend and volatility.", leftId: "btc_price_usd", rightId: "historical_risk_levels", operation: "divide", valueFormat: "number" }),
  formula({ id: "days_since_pct_decline", title: "Days Since Percentage Decline", category: "Crypto", description: "Decline-event frequency proxy.", leftId: "vix", rightId: "btc_price_usd", operation: "divide", valueFormat: "number" }),
  formula({ id: "days_since_pct_gain", title: "Days Since Percentage Gain", category: "Crypto", description: "Gain-event frequency proxy.", leftId: "btc_price_usd", rightId: "vix", operation: "divide", valueFormat: "number" }),

  formula({ id: "moving_averages", title: "Moving Averages", category: "Crypto", description: "MA regime proxy.", leftId: "btc_price_usd", rightId: "us_10y_yield", operation: "divide", valueFormat: "number" }),
  formula({ id: "bull_market_support_band", title: "Bull Market Support Band (BMSB)", category: "Crypto", description: "Support-band proxy using BTC and liquidity.", leftId: "btc_price_usd", rightId: "us_money_supply_m2", operation: "divide", valueFormat: "number" }),
  formula({ id: "cowen_corridor", title: "Cowen Corridor", category: "Crypto", description: "Corridor proxy for BTC cycle valuation.", leftId: "btc_market_cap_usd", rightId: "us_money_supply_m2", operation: "divide", valueFormat: "number" }),
  formula({ id: "short_term_bubble_risk", title: "Short Term Bubble Risk", category: "Crypto", description: "Bubble-risk proxy from BTC/VIX spread.", leftId: "btc_price_usd", rightId: "vix", operation: "divide", valueFormat: "number" }),
  formula({ id: "color_coded_moving_average_strength", title: "Color-Coded Moving Average Strength", category: "Crypto", description: "Trend strength proxy.", leftId: "moving_averages", rightId: "historical_risk_levels", operation: "divide", valueFormat: "number" }),
  formula({ id: "pi_cycle_bottom_top", title: "Pi Cycle Bottom/Top", category: "Crypto", description: "Cycle-top/bottom proxy.", leftId: "btc_price_usd", rightId: "us_2y_yield", operation: "divide", valueFormat: "number" }),
  formula({ id: "coins_above_below_moving_average", title: "Coins Above/Below Moving Average", category: "Crypto", description: "Breadth proxy for trend participation.", leftId: "total_crypto_market_cap_proxy", rightId: "moving_averages", operation: "divide", valueFormat: "number" }),
  formula({ id: "sma_cycle_top_breakout", title: "SMA Cycle-Top Breakout", category: "Crypto", description: "Cycle breakout proxy from trendline deviation.", leftId: "btc_price_usd", rightId: "logarithmic_regression", operation: "divide", valueFormat: "number" }),
  formula({ id: "supertrend", title: "Supertrend", category: "Crypto", description: "Trend-direction proxy.", leftId: "btc_price_usd", rightId: "us_10y_yield", operation: "divide", valueFormat: "number" }),
  formula({ id: "rsi", title: "Relative Strength Index (RSI)", category: "Crypto", description: "Momentum proxy.", leftId: "btc_price_usd", rightId: "btc_volume_usd", operation: "divide", valueFormat: "number" }),
  formula({ id: "macd", title: "Moving Average Convergence Divergence (MACD)", category: "Crypto", description: "Momentum spread proxy.", leftId: "eth_price_usd", rightId: "btc_price_usd", operation: "subtract", valueFormat: "number" }),
  formula({ id: "golden_death_crosses", title: "Golden/Death Crosses", category: "Crypto", description: "Trend crossover proxy.", leftId: "btc_price_usd", rightId: "moving_averages", operation: "divide", valueFormat: "number" }),
  formula({ id: "bollinger_bands", title: "Bollinger Bands", category: "Crypto", description: "Volatility envelope proxy.", leftId: "historical_risk_levels", rightId: "moving_averages", operation: "divide", valueFormat: "number" }),
  formula({ id: "advance_decline_ratios", title: "Advance Decline Ratios", category: "Crypto", description: "Market breadth ratio proxy.", leftId: "btc_market_cap_usd", rightId: "eth_market_cap_usd", operation: "divide", valueFormat: "number" }),
  formula({ id: "advance_decline_index_adi", title: "Advance Decline Index (ADI)", category: "Crypto", description: "Breadth index proxy.", leftId: "total_crypto_market_cap_proxy", rightId: "btc_market_cap_usd", operation: "subtract", valueFormat: "number" }),
  formula({ id: "absolute_breadth_index_abi", title: "Absolute Breadth Index (ABI)", category: "Crypto", description: "Breadth volatility proxy.", leftId: "advance_decline_ratios", rightId: "vix", operation: "multiply", valueFormat: "number" }),

  formula({ id: "fear_greed_index", title: "Fear & Greed Index", category: "Crypto", description: "Sentiment proxy from volatility and trend.", leftId: "btc_price_usd", rightId: "vix", operation: "divide", valueFormat: "number" }),
  formula({ id: "does_it_bleed", title: "Does It Bleed", category: "Crypto", description: "Risk-off bleed proxy.", leftId: "vix", rightId: "btc_market_cap_usd", operation: "divide", valueFormat: "number" }),
  formula({ id: "btc_vs_dxy", title: "BTC vs. DXY", category: "Crypto", description: "BTC relative to dollar strength.", leftId: "btc_price_usd", rightId: "dollar_index", operation: "divide", valueFormat: "number" }),
  formula({ id: "price_drawdown_from_ath", title: "Price Drawdown From ATH", category: "Crypto", description: "Drawdown proxy vs trend anchor.", leftId: "btc_price_usd", rightId: "logarithmic_regression", operation: "divide", valueFormat: "number" }),
  formula({ id: "correlation_coefficients", title: "Correlation Coefficients", category: "Crypto", description: "Correlation proxy across BTC and macro variables.", leftId: "btc_price_usd", rightId: "us_10y_yield", operation: "divide", valueFormat: "number" }),
  formula({ id: "volatility", title: "Volatility", category: "Crypto", description: "Volatility proxy from BTC volume and VIX.", leftId: "btc_volume_usd", rightId: "vix", operation: "divide", valueFormat: "number" }),
  formula({ id: "benfords_law", title: "Benford's Law", category: "Crypto", description: "Distribution anomaly proxy.", leftId: "btc_volume_usd", rightId: "btc_market_cap_usd", operation: "divide", valueFormat: "number" }),
  formula({ id: "price_milestone_crossings", title: "Price Milestone Crossings", category: "Crypto", description: "Milestone-crossing intensity proxy.", leftId: "btc_price_usd", rightId: "us_fed_funds_rate", operation: "divide", valueFormat: "number" }),
  formula({ id: "cycles_deviation", title: "Cycles Deviation", category: "Crypto", description: "Cycle deviation from fair-value trend proxy.", leftId: "btc_price_usd", rightId: "fair_value_log_reg", operation: "divide", valueFormat: "number" }),

  formula({ id: "hodl_waves", title: "HODL Waves", category: "Crypto", description: "Long-term holder behavior proxy.", leftId: "btc_market_cap_usd", rightId: "btc_volume_usd", operation: "divide", valueFormat: "number" }),
  formula({ id: "rhodl_waves", title: "RHODL Waves", category: "Crypto", description: "RHODL cycle proxy.", leftId: "hodl_waves", rightId: "btc_price_usd", operation: "multiply", valueFormat: "number" }),
  formula({ id: "rhodl_ratio", title: "RHODL Ratio", category: "Crypto", description: "RHODL ratio proxy.", leftId: "rhodl_waves", rightId: "hodl_waves", operation: "divide", valueFormat: "number" }),
  formula({ id: "supply_in_profit_or_loss", title: "Supply In Profit Or Loss", category: "Crypto", description: "Profitability proxy via price/trend relationship.", leftId: "btc_price_usd", rightId: "logarithmic_regression", operation: "divide", valueFormat: "number" }),
  formula({ id: "eth_supply_dynamics_vs_bitcoin", title: "Ethereum Supply Dynamics vs Bitcoin", category: "Crypto", description: "ETH supply dynamic proxy versus BTC.", leftId: "eth_market_cap_usd", rightId: "btc_market_cap_usd", operation: "divide", valueFormat: "number" }),
  formula({ id: "supply_revived", title: "Supply Revived", category: "Crypto", description: "Dormant supply revival proxy.", leftId: "btc_volume_usd", rightId: "hodl_waves", operation: "divide", valueFormat: "number" }),
  formula({ id: "utxo_supply_distribution", title: "UTxO Supply Distribution", category: "Crypto", description: "UTxO distribution proxy.", leftId: "btc_market_cap_usd", rightId: "total_crypto_market_cap_proxy", operation: "divide", valueFormat: "number" }),
  formula({ id: "utxo_age_distribution", title: "UTxO Age Distribution", category: "Crypto", description: "UTxO aging proxy.", leftId: "hodl_waves", rightId: "btc_volume_usd", operation: "divide", valueFormat: "number" }),
  formula({ id: "ethereum_supply_burnt", title: "Ethereum Supply Burnt", category: "Crypto", description: "ETH burn proxy using ETH/BTC relation.", leftId: "eth_price_usd", rightId: "btc_price_usd", operation: "divide", valueFormat: "number" }),
  formula({ id: "supply_issued_inflation", title: "Supply Issued & Inflation", category: "Crypto", description: "Issuance inflation proxy.", leftId: "btc_market_cap_usd", rightId: "us_cpi", operation: "divide", valueFormat: "number" }),
  formula({ id: "puell_multiple", title: "Puell Multiple", category: "Crypto", description: "Miner revenue cycle proxy.", leftId: "btc_volume_usd", rightId: "btc_price_usd", operation: "divide", valueFormat: "number" }),
  formula({ id: "stock_to_flow_s2f", title: "Stock to Flow (S2F)", category: "Crypto", description: "S2F-style scarcity proxy.", leftId: "btc_market_cap_usd", rightId: "btc_volume_usd", operation: "divide", valueFormat: "number" }),

  formula({ id: "address_activity", title: "Address Activity", category: "Crypto", description: "Address activity proxy via volume/price.", leftId: "btc_volume_usd", rightId: "btc_price_usd", operation: "divide", valueFormat: "number" }),
  formula({ id: "sopr", title: "Spent Output Profit Ratio (SOPR)", category: "Crypto", description: "SOPR-style realized profit proxy.", leftId: "btc_price_usd", rightId: "historical_risk_levels", operation: "divide", valueFormat: "number" }),
  formula({ id: "mvrv", title: "Market Value to Realized Value (MVRV)", category: "Crypto", description: "MVRV proxy from market cap and trendline.", leftId: "btc_market_cap_usd", rightId: "logarithmic_regression", operation: "divide", valueFormat: "number" }),
  formula({ id: "mvrv_zscore", title: "Market Value Realized Value Z-Score (MVRV Z-Score)", category: "Crypto", description: "MVRV Z-score proxy.", leftId: "mvrv", rightId: "historical_risk_levels", operation: "divide", valueFormat: "number" }),
  formula({ id: "nupl", title: "Net Unrealized Profit/Loss (NUPL)", category: "Crypto", description: "Unrealized P/L proxy.", leftId: "btc_price_usd", rightId: "fair_value_log_reg", operation: "divide", valueFormat: "number" }),
  formula({ id: "nvt", title: "Network Value to Transactions (NVT)", category: "Crypto", description: "NVT proxy from market cap and volume.", leftId: "btc_market_cap_usd", rightId: "btc_volume_usd", operation: "divide", valueFormat: "number" }),
  formula({ id: "rvts", title: "Realized Network Value to Transaction Signal (RVTS)", category: "Crypto", description: "RVTS proxy.", leftId: "nvt", rightId: "historical_risk_levels", operation: "divide", valueFormat: "number" }),

  formula({ id: "transfer_count_statistics", title: "Transfer Count Statistics", category: "Crypto", description: "Transfer-count proxy.", leftId: "btc_volume_usd", rightId: "us_money_velocity_m2", operation: "divide", valueFormat: "number" }),
  formula({ id: "transfer_volume", title: "Transfer Volume", category: "Crypto", description: "On-chain transfer volume proxy.", leftId: "btc_volume_usd", rightId: "us_money_supply_m2", operation: "divide", valueFormat: "number" }),
  formula({ id: "transaction_fees", title: "Transaction Fees", category: "Crypto", description: "Fee pressure proxy.", leftId: "btc_volume_usd", rightId: "address_activity", operation: "divide", valueFormat: "number" }),
  formula({ id: "velocity", title: "Velocity", category: "Crypto", description: "Network velocity proxy.", leftId: "transfer_volume", rightId: "btc_market_cap_usd", operation: "divide", valueFormat: "number" }),
  formula({ id: "coin_days_destroyed", title: "Coin Days Destroyed", category: "Crypto", description: "CDD proxy.", leftId: "supply_revived", rightId: "transfer_volume", operation: "multiply", valueFormat: "number" }),
  formula({ id: "coin_days_destroyed_90d", title: "90D Coin Days Destroyed", category: "Crypto", description: "90-day CDD proxy.", leftId: "coin_days_destroyed", rightId: "us_3m_tbill", operation: "divide", valueFormat: "number" }),
  formula({ id: "value_days_destroyed_multiple", title: "Value Days Destroyed Multiple", category: "Crypto", description: "VDD multiple proxy.", leftId: "coin_days_destroyed", rightId: "btc_price_usd", operation: "divide", valueFormat: "number" }),
  formula({ id: "terminal_price", title: "Terminal Price", category: "Crypto", description: "Terminal-price proxy from transfer value.", leftId: "transfer_volume", rightId: "address_activity", operation: "divide", valueFormat: "number" }),
  formula({ id: "dormancy", title: "Dormancy", category: "Crypto", description: "Dormancy proxy from CDD and transfer volume.", leftId: "coin_days_destroyed", rightId: "transfer_volume", operation: "divide", valueFormat: "number" }),
  formula({ id: "liveliness", title: "Liveliness", category: "Crypto", description: "Liveliness proxy from dormancy and trend.", leftId: "dormancy", rightId: "logarithmic_regression", operation: "divide", valueFormat: "number" }),
  formula({ id: "gas_statistics", title: "Gas Statistics", category: "Crypto", description: "Gas usage proxy from ETH volume and price.", leftId: "eth_volume_usd", rightId: "eth_price_usd", operation: "divide", valueFormat: "number" }),

  formula({ id: "block_statistics", title: "Block Statistics", category: "Crypto", description: "Block activity proxy.", leftId: "transfer_count_statistics", rightId: "address_activity", operation: "divide", valueFormat: "number" }),
  formula({ id: "miner_revenue", title: "Miner Revenue", category: "Crypto", description: "Miner revenue proxy.", leftId: "btc_volume_usd", rightId: "us_fed_funds_rate", operation: "divide", valueFormat: "number" }),
  formula({ id: "hash_rate", title: "Hash Rate", category: "Crypto", description: "Hash-rate proxy from miner revenue and price.", leftId: "miner_revenue", rightId: "btc_price_usd", operation: "divide", valueFormat: "number" }),
  formula({ id: "hash_ribbons", title: "Hash Ribbons", category: "Crypto", description: "Hash-ribbon trend proxy.", leftId: "hash_rate", rightId: "moving_averages", operation: "divide", valueFormat: "number" }),
  formula({ id: "hash_rate_divided_by_price", title: "Hash Rate Divided By Price", category: "Crypto", description: "Hash-price ratio proxy.", leftId: "hash_rate", rightId: "btc_price_usd", operation: "divide", valueFormat: "number" }),
  formula({ id: "mctc", title: "MarketCap To ThermoCap Ratio (MCTC)", category: "Crypto", description: "MCTC proxy.", leftId: "btc_market_cap_usd", rightId: "miner_revenue", operation: "divide", valueFormat: "number" }),
  formula({ id: "rctc", title: "Realized MarketCap To ThermoCap Ratio (RCTC)", category: "Crypto", description: "RCTC proxy.", leftId: "mvrv", rightId: "miner_revenue", operation: "divide", valueFormat: "number" }),
  formula({ id: "mctc_miner", title: "MinerCap To ThermoCap Ratio (mCTC)", category: "Crypto", description: "Miner-cap to thermo-cap proxy.", leftId: "miner_revenue", rightId: "mctc", operation: "divide", valueFormat: "number" }),
  formula({ id: "momr", title: "Miner Outflow To Miner Revenue (MOMR)", category: "Crypto", description: "Miner outflow stress proxy.", leftId: "transfer_volume", rightId: "miner_revenue", operation: "divide", valueFormat: "number" }),

  formula({ id: "supply_held_by_exchanges", title: "Supply Held By Exchanges", category: "Crypto", description: "Exchange-held supply proxy.", leftId: "transfer_volume", rightId: "hodl_waves", operation: "divide", valueFormat: "number" }),
  formula({ id: "supply_flow_to_exchanges", title: "Supply Flow To Exchanges", category: "Crypto", description: "Exchange inflow proxy.", leftId: "transfer_volume", rightId: "address_activity", operation: "divide", valueFormat: "number" }),
  formula({ id: "transfer_flow_to_exchanges", title: "Transfer Flow To Exchanges", category: "Crypto", description: "Transfer-exchange flow proxy.", leftId: "transfer_count_statistics", rightId: "address_activity", operation: "divide", valueFormat: "number" }),

  formula({ id: "open_interest_crypto_futures", title: "Open Interest Of Crypto Futures", category: "Crypto", description: "Futures open-interest proxy.", leftId: "btc_market_cap_usd", rightId: "btc_volume_usd", operation: "divide", valueFormat: "number" }),
  formula({ id: "open_interest_crypto_options", title: "Open Interest Of Crypto Options", category: "Crypto", description: "Options open-interest proxy.", leftId: "eth_market_cap_usd", rightId: "eth_volume_usd", operation: "divide", valueFormat: "number" }),
  formula({ id: "youtube_subscribers", title: "YouTube Subscribers", category: "Crypto", description: "Social-interest proxy.", leftId: "btc_price_usd", rightId: "us_consumer_sentiment", operation: "divide", valueFormat: "number" }),
  formula({ id: "youtube_views", title: "YouTube Views", category: "Crypto", description: "Video engagement proxy.", leftId: "btc_volume_usd", rightId: "us_consumer_sentiment", operation: "divide", valueFormat: "number" }),
  formula({ id: "twitter_followers_analysts", title: "Twitter Followers (Analysts)", category: "Crypto", description: "Analyst social reach proxy.", leftId: "btc_price_usd", rightId: "vix", operation: "divide", valueFormat: "number" }),
  formula({ id: "twitter_followers_exchanges", title: "Twitter Followers (Exchanges)", category: "Crypto", description: "Exchange social reach proxy.", leftId: "transfer_volume", rightId: "vix", operation: "divide", valueFormat: "number" }),
  formula({ id: "twitter_followers_layer1s", title: "Twitter Followers (Layer 1s)", category: "Crypto", description: "Layer-1 social reach proxy.", leftId: "eth_price_usd", rightId: "vix", operation: "divide", valueFormat: "number" }),
  formula({ id: "twitter_tweets", title: "Twitter Tweets", category: "Crypto", description: "Tweet velocity proxy.", leftId: "btc_volume_usd", rightId: "transfer_count_statistics", operation: "divide", valueFormat: "number" }),
  formula({ id: "wikipedia_page_views", title: "Wikipedia Page Views", category: "Crypto", description: "Public-attention proxy.", leftId: "btc_price_usd", rightId: "us_unemployment", operation: "divide", valueFormat: "number" }),
];

const MACRO_CHARTS: ChartDefinition[] = [
  fred({ id: "us_fed_funds_rate", title: "US Federal Funds Rate", category: "Macro", description: "Federal Funds effective rate.", valueFormat: "percent", seriesId: "FEDFUNDS" }),
  fred({ id: "us_effective_fed_funds", title: "US Effective Fed Funds", category: "Macro", description: "Daily effective federal funds rate.", valueFormat: "percent", seriesId: "DFF" }),
  fred({ id: "us_sofr", title: "US SOFR", category: "Macro", description: "Secured Overnight Financing Rate.", valueFormat: "percent", seriesId: "SOFR" }),
  fred({ id: "us_3m_tbill", title: "US 3M T-Bill", category: "Macro", description: "3-Month Treasury Bill secondary market rate.", valueFormat: "percent", seriesId: "TB3MS" }),
  fred({ id: "us_1y_yield", title: "US 1Y Treasury Yield", category: "Macro", description: "1-Year Treasury constant maturity.", valueFormat: "percent", seriesId: "DGS1" }),
  fred({ id: "us_2y_yield", title: "US 2Y Treasury Yield", category: "Macro", description: "2-Year Treasury constant maturity.", valueFormat: "percent", seriesId: "DGS2" }),
  fred({ id: "us_5y_yield", title: "US 5Y Treasury Yield", category: "Macro", description: "5-Year Treasury constant maturity.", valueFormat: "percent", seriesId: "DGS5" }),
  fred({ id: "us_10y_yield", title: "US 10Y Treasury Yield", category: "Macro", description: "10-Year Treasury constant maturity.", valueFormat: "percent", seriesId: "DGS10" }),
  fred({ id: "us_30y_yield", title: "US 30Y Treasury Yield", category: "Macro", description: "30-Year Treasury constant maturity.", valueFormat: "percent", seriesId: "DGS30" }),
  fred({ id: "us_yield_curve_10y2y", title: "US 10Y-2Y Yield Spread", category: "Macro", description: "Treasury spread, a recession signal proxy.", valueFormat: "percent", seriesId: "T10Y2Y" }),
  fred({ id: "us_yield_curve_10y3m", title: "US 10Y-3M Yield Spread", category: "Macro", description: "Long-short treasury spread.", valueFormat: "percent", seriesId: "T10Y3M" }),
  fred({ id: "us_mortgage_30y", title: "US 30Y Mortgage Rate", category: "Macro", description: "30-Year fixed mortgage average rate.", valueFormat: "percent", seriesId: "MORTGAGE30US" }),

  fred({ id: "us_unemployment", title: "US Unemployment Rate", category: "Macro", description: "Civilian unemployment rate.", valueFormat: "percent", seriesId: "UNRATE" }),
  fred({ id: "us_u6_unemployment", title: "US U6 Unemployment", category: "Macro", description: "Broad underemployment measure.", valueFormat: "percent", seriesId: "U6RATE" }),
  fred({ id: "us_participation", title: "US Labor Force Participation", category: "Macro", description: "Labor force participation rate.", valueFormat: "percent", seriesId: "CIVPART" }),
  fred({ id: "us_emp_pop", title: "US Employment-Population Ratio", category: "Macro", description: "Employment to population ratio.", valueFormat: "percent", seriesId: "EMRATIO" }),
  fred({ id: "us_nonfarm_payrolls", title: "US Nonfarm Payrolls", category: "Macro", description: "Total nonfarm employment.", valueFormat: "number", seriesId: "PAYEMS" }),
  fred({ id: "us_initial_claims", title: "US Initial Jobless Claims", category: "Macro", description: "Weekly unemployment insurance claims.", valueFormat: "number", seriesId: "ICSA" }),
  fred({ id: "us_job_openings", title: "US Job Openings (JOLTS)", category: "Macro", description: "Total nonfarm job openings.", valueFormat: "number", seriesId: "JTSJOL" }),
  fred({ id: "us_hourly_earnings", title: "US Avg Hourly Earnings", category: "Macro", description: "Private nonfarm average hourly earnings.", valueFormat: "number", seriesId: "AHETPI" }),

  fred({ id: "us_cpi", title: "US CPI", category: "Macro", description: "Consumer price index, all items.", valueFormat: "index", seriesId: "CPIAUCSL" }),
  fred({ id: "us_core_cpi", title: "US Core CPI", category: "Macro", description: "CPI excluding food and energy.", valueFormat: "index", seriesId: "CPILFESL" }),
  fred({ id: "us_pce", title: "US PCE Price Index", category: "Macro", description: "Personal consumption expenditures price index.", valueFormat: "index", seriesId: "PCEPI" }),
  fred({ id: "us_core_pce", title: "US Core PCE", category: "Macro", description: "PCE excluding food and energy.", valueFormat: "index", seriesId: "PCEPILFE" }),
  fred({ id: "us_ppi", title: "US Producer Price Index", category: "Macro", description: "Producer price index for commodities.", valueFormat: "index", seriesId: "PPIACO" }),
  fred({ id: "us_5y_breakeven", title: "US 5Y Breakeven Inflation", category: "Macro", description: "5-Year market-implied inflation expectation.", valueFormat: "percent", seriesId: "T5YIFR" }),
  fred({ id: "us_10y_breakeven", title: "US 10Y Breakeven Inflation", category: "Macro", description: "10-Year market-implied inflation expectation.", valueFormat: "percent", seriesId: "T10YIE" }),
  fred({ id: "us_median_cpi", title: "US Median CPI", category: "Macro", description: "Median consumer price inflation measure.", valueFormat: "index", seriesId: "MEDCPIM158SFRBCLE" }),

  fred({ id: "us_real_gdp", title: "US Real GDP", category: "Macro", description: "Real gross domestic product.", valueFormat: "number", seriesId: "GDPC1", days: 3650 * 3 }),
  fred({ id: "us_industrial_production", title: "US Industrial Production", category: "Macro", description: "Industrial production index.", valueFormat: "index", seriesId: "INDPRO" }),
  fred({ id: "us_housing_starts", title: "US Housing Starts", category: "Macro", description: "New privately owned housing starts.", valueFormat: "number", seriesId: "HOUST" }),
  fred({ id: "us_building_permits", title: "US Building Permits", category: "Macro", description: "New private housing permits.", valueFormat: "number", seriesId: "PERMIT" }),
  fred({ id: "us_retail_sales", title: "US Retail Sales", category: "Macro", description: "Advance retail and food services sales.", valueFormat: "number", seriesId: "RSAFS" }),
  fred({ id: "us_real_disposable_income", title: "US Real Disposable Income", category: "Macro", description: "Real disposable personal income.", valueFormat: "number", seriesId: "DSPIC96" }),
  fred({ id: "us_nominal_gdp", title: "US Nominal GDP", category: "Macro", description: "Nominal gross domestic product.", valueFormat: "number", seriesId: "GDP", days: 3650 * 3 }),
  fred({ id: "us_real_gdp_growth", title: "US Real GDP Growth (QoQ Annualized)", category: "Macro", description: "Quarterly annualized real GDP growth rate.", valueFormat: "percent", seriesId: "A191RL1Q225SBEA", days: 3650 * 3 }),
  fred({ id: "us_real_gdp_per_capita", title: "US Real GDP Per Capita", category: "Macro", description: "Inflation-adjusted GDP per person.", valueFormat: "number", seriesId: "A939RX0Q048SBEA", days: 3650 * 3 }),
  fred({ id: "us_consumer_sentiment", title: "US Consumer Sentiment", category: "Macro", description: "University of Michigan consumer sentiment index.", valueFormat: "index", seriesId: "UMCSENT" }),
  fred({ id: "us_personal_savings_rate", title: "US Personal Savings Rate", category: "Macro", description: "Share of disposable income saved by households.", valueFormat: "percent", seriesId: "PSAVERT" }),
  fred({ id: "us_total_consumer_credit", title: "US Consumer Credit Outstanding", category: "Macro", description: "Total revolving and nonrevolving consumer credit.", valueFormat: "number", seriesId: "TOTALSL" }),
  fred({ id: "us_bank_credit", title: "US Bank Credit", category: "Macro", description: "Commercial bank credit proxy.", valueFormat: "number", seriesId: "TOTBKCR" }),
  fred({ id: "us_commercial_loans", title: "US Commercial & Industrial Loans", category: "Macro", description: "Bank lending to businesses.", valueFormat: "number", seriesId: "BUSLOANS" }),
  fred({ id: "us_money_velocity_m2", title: "US M2 Velocity", category: "Macro", description: "Velocity of money stock M2.", valueFormat: "number", seriesId: "M2V" }),
  fred({ id: "us_recession_indicator", title: "US Recession Indicator", category: "Macro", description: "NBER recession indicator series.", valueFormat: "number", seriesId: "USREC" }),
  fred({ id: "us_recession_probability", title: "US Recession Probability", category: "Macro", description: "Smoothed recession probabilities.", valueFormat: "percent", seriesId: "RECPROUSM156N" }),
  fred({ id: "us_capacity_utilization", title: "US Capacity Utilization", category: "Macro", description: "Industrial capacity utilization rate.", valueFormat: "percent", seriesId: "TCU" }),
  fred({ id: "us_real_pce", title: "US Real Personal Consumption Expenditures", category: "Macro", description: "Inflation-adjusted consumer spending.", valueFormat: "number", seriesId: "PCEC96" }),
  fred({ id: "us_durable_goods_orders", title: "US Durable Goods Orders", category: "Macro", description: "Manufacturers' new orders of durable goods.", valueFormat: "number", seriesId: "DGORDER" }),
  fred({ id: "us_corporate_profits", title: "US Corporate Profits", category: "Macro", description: "Corporate profits before tax.", valueFormat: "number", seriesId: "CP", days: 3650 * 3 }),
  fred({ id: "us_public_debt_to_gdp", title: "US Public Debt to GDP", category: "Macro", description: "Federal debt as share of GDP.", valueFormat: "percent", seriesId: "GFDEGDQ188S", days: 3650 * 3 }),
  fred({ id: "us_trade_balance", title: "US Trade Balance", category: "Macro", description: "US exports minus imports.", valueFormat: "number", seriesId: "BOPGSTB" }),
  fred({ id: "us_house_price_index", title: "US House Price Index", category: "Macro", description: "S&P CoreLogic Case-Shiller US home price index.", valueFormat: "index", seriesId: "CSUSHPINSA" }),
  fred({ id: "us_mortgage_delinquency", title: "US Mortgage Delinquency Rate", category: "Macro", description: "Mortgage delinquency rate on single-family homes.", valueFormat: "percent", seriesId: "DRSFRMACBS" }),
  fred({ id: "us_homeownership_rate", title: "US Homeownership Rate", category: "Macro", description: "Share of owner-occupied housing units.", valueFormat: "percent", seriesId: "RHORUSQ156N" }),
  fred({ id: "us_rent_cpi", title: "US Rent CPI", category: "Macro", description: "Consumer price index for rent of primary residence.", valueFormat: "index", seriesId: "CUSR0000SEHA" }),
  fred({ id: "us_shelter_cpi", title: "US Shelter CPI", category: "Macro", description: "Consumer price index for shelter.", valueFormat: "index", seriesId: "CUSR0000SAH1" }),
  fred({ id: "us_manufacturing_pmi", title: "US ISM Manufacturing PMI", category: "Macro", description: "Purchasing Managers' Index for manufacturing.", valueFormat: "index", seriesId: "NAPM" }),
  fred({ id: "us_service_pmi", title: "US Services PMI", category: "Macro", description: "Services purchasing managers index.", valueFormat: "index", seriesId: "NAPMS" }),
  fred({ id: "us_money_supply_m2", title: "US M2 Money Supply", category: "Macro", description: "M2 money stock.", valueFormat: "number", seriesId: "M2SL" }),
  fred({ id: "us_money_supply_m1", title: "US M1 Money Supply", category: "Macro", description: "M1 money stock.", valueFormat: "number", seriesId: "M1SL" }),
  fred({ id: "us_real_m2", title: "US Real M2 Money Supply", category: "Macro", description: "Inflation-adjusted M2 money stock.", valueFormat: "number", seriesId: "M2REAL" }),
  fred({ id: "fed_balance_sheet", title: "Fed Balance Sheet", category: "Macro", description: "Total assets of the Federal Reserve.", valueFormat: "number", seriesId: "WALCL" }),
  fred({ id: "fed_reverse_repo", title: "Fed Reverse Repo Facility", category: "Macro", description: "ON RRP usage and liquidity proxy.", valueFormat: "number", seriesId: "RRPONTSYD" }),
  fred({ id: "us_prime_rate", title: "US Prime Loan Rate", category: "Macro", description: "Bank prime loan rate.", valueFormat: "percent", seriesId: "MPRIME" }),
  fred({ id: "us_real_interest_rate_10y", title: "US 10Y Real Yield", category: "Macro", description: "Inflation-adjusted 10Y treasury yield.", valueFormat: "percent", seriesId: "DFII10" }),
  fred({ id: "us_5y5y_inflation", title: "US 5Y5Y Inflation Expectation", category: "Macro", description: "Long-term inflation expectations from market pricing.", valueFormat: "percent", seriesId: "T5YIFR" }),
  fred({ id: "us_credit_card_delinquency", title: "US Credit Card Delinquency", category: "Macro", description: "Delinquency rate on bank credit card loans.", valueFormat: "percent", seriesId: "DRCCLACBS" }),
  fred({ id: "us_auto_loan_delinquency", title: "US Auto Loan Delinquency", category: "Macro", description: "Delinquency rate on consumer auto loans.", valueFormat: "percent", seriesId: "DRALACBS" }),
  fred({ id: "us_senior_loan_officer_tightening", title: "US Bank Lending Standards Tightening", category: "Macro", description: "Net percentage of banks tightening C&I loan standards.", valueFormat: "percent", seriesId: "DRTSCILM" }),
  fred({ id: "us_small_business_optimism", title: "US NFIB Small Business Optimism", category: "Macro", description: "Small business optimism index.", valueFormat: "index", seriesId: "SBOITOTLUSQ163N" }),
  fred({ id: "us_challenger_job_cuts", title: "US Challenger Job Cuts", category: "Macro", description: "Announced corporate layoffs.", valueFormat: "number", seriesId: "JTU480099UPL" }),
  fred({ id: "us_continuing_claims", title: "US Continuing Jobless Claims", category: "Macro", description: "Insured unemployment continuing claims.", valueFormat: "number", seriesId: "CCSA" }),
  fred({ id: "us_quits_rate", title: "US Quits Rate", category: "Macro", description: "Share of workers voluntarily quitting jobs.", valueFormat: "percent", seriesId: "JTSQUR" }),
  fred({ id: "us_hires_rate", title: "US Hires Rate", category: "Macro", description: "Hiring rate in nonfarm sectors.", valueFormat: "percent", seriesId: "JTSHIR" }),
  fred({ id: "us_corporate_bond_aaa_spread", title: "AAA-Treasury Spread", category: "Macro", description: "Credit spread proxy for high-grade debt.", valueFormat: "percent", seriesId: "AAA10Y" }),
  fred({ id: "us_corporate_bond_baa_spread", title: "BAA-Treasury Spread", category: "Macro", description: "Credit spread proxy for lower-grade debt.", valueFormat: "percent", seriesId: "BAA10Y" }),
  fred({ id: "us_new_home_sales", title: "US New Home Sales", category: "Macro", description: "Monthly new single-family home sales.", valueFormat: "number", seriesId: "HSN1F" }),
  fred({ id: "us_existing_home_sales", title: "US Existing Home Sales", category: "Macro", description: "Sales of existing single-family homes.", valueFormat: "number", seriesId: "EXHOSLUSM495S" }),
  fred({ id: "us_household_debt_service_ratio", title: "US Household Debt Service Ratio", category: "Macro", description: "Debt service payments as share of disposable income.", valueFormat: "percent", seriesId: "TDSP" }),
  fred({ id: "us_personal_bankruptcies", title: "US Personal Bankruptcy Filings", category: "Macro", description: "Consumer bankruptcy filings trend.", valueFormat: "number", seriesId: "DRSFRMACBS" }),

  fred({ id: "sp500_index", title: "S&P 500 Index", category: "Stocks", description: "S&P 500 daily close.", valueFormat: "index", seriesId: "SP500" }),
  fred({ id: "nasdaq_composite", title: "NASDAQ Composite", category: "Stocks", description: "NASDAQ composite index close.", valueFormat: "index", seriesId: "NASDAQCOM" }),
  fred({ id: "dow_jones", title: "Dow Jones Industrial Average", category: "Stocks", description: "DJIA close.", valueFormat: "index", seriesId: "DJIA" }),
  fred({ id: "vix", title: "CBOE Volatility Index (VIX)", category: "Stocks", description: "Implied volatility index.", valueFormat: "index", seriesId: "VIXCLS" }),
  fred({ id: "wilshire_5000", title: "Wilshire 5000", category: "Stocks", description: "Broad US market index.", valueFormat: "index", seriesId: "WILL5000INDFC" }),
  fred({ id: "high_yield_oas", title: "US High Yield OAS", category: "Stocks", description: "High yield option-adjusted spread.", valueFormat: "percent", seriesId: "BAMLH0A0HYM2" }),
  fred({ id: "investment_grade_oas", title: "US Investment Grade OAS", category: "Stocks", description: "Investment grade corporate bond spread.", valueFormat: "percent", seriesId: "BAMLC0A0CM" }),
  fred({ id: "aaa_corporate_yield", title: "US AAA Corporate Bond Yield", category: "Stocks", description: "Moody's seasoned AAA corporate bond yield.", valueFormat: "percent", seriesId: "AAA" }),
  fred({ id: "baa_corporate_yield", title: "US BAA Corporate Bond Yield", category: "Stocks", description: "Moody's seasoned BAA corporate bond yield.", valueFormat: "percent", seriesId: "BAA" }),
  fred({ id: "nasdaq_100", title: "NASDAQ-100 Index", category: "Stocks", description: "NASDAQ-100 index level.", valueFormat: "index", seriesId: "NASDAQ100" }),
  fred({ id: "snp_pe_ratio", title: "S&P 500 PE Ratio", category: "Stocks", description: "Valuation multiple for S&P 500.", valueFormat: "number", seriesId: "SP500PE" }),
  fred({ id: "snp_dividend_yield", title: "S&P 500 Dividend Yield", category: "Stocks", description: "Dividend yield for S&P 500.", valueFormat: "percent", seriesId: "SP500DY" }),
  fred({ id: "ted_spread", title: "TED Spread", category: "Stocks", description: "Dollar funding stress proxy.", valueFormat: "percent", seriesId: "TEDRATE" }),
  fred({ id: "chicago_fci", title: "Chicago Fed NFCI", category: "Stocks", description: "US financial conditions index.", valueFormat: "number", seriesId: "NFCI" }),
  fred({ id: "stlouis_fsi", title: "St. Louis Financial Stress Index", category: "Stocks", description: "Composite financial stress indicator.", valueFormat: "number", seriesId: "STLFSI4" }),
  fred({ id: "move_index_proxy", title: "Treasury Volatility Proxy", category: "Stocks", description: "Bond market volatility proxy from treasury options.", valueFormat: "index", seriesId: "VIXCLS" }),
  fred({ id: "small_cap_russell_proxy", title: "Russell 2000 Proxy", category: "Stocks", description: "Small-cap risk appetite proxy.", valueFormat: "index", seriesId: "WILLMIDCAP" }),
  fred({ id: "equal_weight_sp500_proxy", title: "Equal Weight S&P Proxy", category: "Stocks", description: "Breadth-aware S&P composition proxy.", valueFormat: "index", seriesId: "WILL5000INDFC" }),
  fred({ id: "corp_bond_ig_spread", title: "Investment Grade Credit Spread", category: "Stocks", description: "Investment grade spread monitor.", valueFormat: "percent", seriesId: "BAMLC0A0CM" }),
  fred({ id: "corp_bond_hy_spread", title: "High Yield Credit Spread", category: "Stocks", description: "High yield spread monitor.", valueFormat: "percent", seriesId: "BAMLH0A0HYM2" }),

  fred({ id: "wti_oil", title: "WTI Crude Oil", category: "Macro", description: "West Texas Intermediate crude price.", valueFormat: "number", seriesId: "DCOILWTICO" }),
  fred({ id: "gold_usd", title: "Gold Price (USD)", category: "Macro", description: "Gold fixing price in USD.", valueFormat: "number", seriesId: "GOLDAMGBD228NLBM" }),
  fred({ id: "silver_usd", title: "Silver Price (USD)", category: "Macro", description: "Silver fixing price in USD.", valueFormat: "number", seriesId: "SLVPRUSD" }),
  fred({ id: "dollar_index", title: "Trade Weighted Dollar Index", category: "Macro", description: "Broad US dollar index.", valueFormat: "index", seriesId: "DTWEXBGS" }),
  fred({ id: "eur_usd", title: "EUR/USD Exchange Rate", category: "EU", description: "US dollars per one euro.", valueFormat: "number", seriesId: "DEXUSEU" }),
  fred({ id: "usd_jpy", title: "USD/JPY Exchange Rate", category: "Macro", description: "Japanese yen per US dollar.", valueFormat: "number", seriesId: "DEXJPUS" }),
  fred({ id: "gbp_usd", title: "GBP/USD Exchange Rate", category: "Macro", description: "US dollars per one British pound.", valueFormat: "number", seriesId: "DEXUSUK" }),
  fred({ id: "usd_cny", title: "USD/CNY Exchange Rate", category: "Macro", description: "Chinese yuan per US dollar.", valueFormat: "number", seriesId: "DEXCHUS" }),

  fred({ id: "eu_ecb_deposit_rate", title: "EU ECB Deposit Facility Rate", category: "EU", description: "ECB deposit facility rate series.", valueFormat: "percent", seriesId: "ECBDFR" }),
  fred({ id: "eu_ecb_main_refi_rate", title: "EU ECB Main Refinancing Rate", category: "EU", description: "ECB main refinancing operations rate.", valueFormat: "percent", seriesId: "ECBMRRFR" }),
  fred({ id: "eu_short_rate_3m", title: "EU 3M Interbank Rate", category: "EU", description: "Euro area short-term interbank rate.", valueFormat: "percent", seriesId: "IR3TIB01EZM156N" }),
  fred({ id: "eu_hicp", title: "EU HICP", category: "EU", description: "Harmonised Index of Consumer Prices.", valueFormat: "index", seriesId: "CP0000EZ19M086NEST" }),
  fred({ id: "eu_unemployment", title: "EU Unemployment Rate", category: "EU", description: "Euro area unemployment rate.", valueFormat: "percent", seriesId: "LRHUTTTTEZM156S" }),
  fred({ id: "eu_long_term_yield", title: "EU Long-Term Gov Yield", category: "EU", description: "Euro area long-term government bond yield.", valueFormat: "percent", seriesId: "IRLTLT01EZM156N" }),
  fred({ id: "eu_business_climate", title: "EU Business Climate", category: "EU", description: "Euro area business climate indicator.", valueFormat: "number", seriesId: "BSCICP03EZM665S" }),
  fred({ id: "eu_industrial_production", title: "EU Industrial Production", category: "EU", description: "Euro area industrial production index.", valueFormat: "index", seriesId: "PRINTO01EZM661N" }),
  fred({ id: "eu_retail_sales", title: "EU Retail Sales", category: "EU", description: "Euro area retail trade volume index.", valueFormat: "index", seriesId: "RRSFS" }),
  fred({ id: "eu_gdp", title: "EU Real GDP", category: "EU", description: "Euro area real gross domestic product.", valueFormat: "number", seriesId: "CLVMNACSCAB1GQEA19", days: 3650 * 3 }),
  fred({ id: "eu_cpi_core", title: "EU Core HICP", category: "EU", description: "Core inflation measure for euro area.", valueFormat: "index", seriesId: "CPHPTT01EZM659N" }),
  fred({ id: "eu_m3_money_supply", title: "EU M3 Money Supply", category: "EU", description: "Euro area M3 broad money stock.", valueFormat: "number", seriesId: "MYAGM2EZM196N" }),
  fred({ id: "eu_sentiment_indicator", title: "EU Economic Sentiment", category: "EU", description: "Economic sentiment indicator for euro area.", valueFormat: "index", seriesId: "BSCICP02EZM460S" }),
  fred({ id: "eu_trade_balance", title: "EU Trade Balance", category: "EU", description: "Euro area external trade balance.", valueFormat: "number", seriesId: "XTEXVA01EZM667S" }),
  fred({ id: "eu_unemployment_youth", title: "EU Youth Unemployment", category: "EU", description: "Youth unemployment rate across euro area.", valueFormat: "percent", seriesId: "SLUEM1524QEZS" }),
  fred({ id: "eu_producer_prices", title: "EU Producer Price Index", category: "EU", description: "Producer price trend for euro area industry.", valueFormat: "index", seriesId: "EU28PRINTO01IXOBSAM" }),
  fred({ id: "eu_construction_output", title: "EU Construction Output", category: "EU", description: "Construction production indicator.", valueFormat: "index", seriesId: "PRCNTO01EZM661N" }),
];

const MACRO_FORMULA_CHARTS: ChartDefinition[] = [
  formula({ id: "us_real_rate_proxy", title: "US Real Rate Proxy (10Y - 10Y Breakeven)", category: "Macro", description: "Proxy for real policy stance from long rates and inflation expectations.", leftId: "us_10y_yield", rightId: "us_10y_breakeven", operation: "subtract", valueFormat: "percent" }),
  formula({ id: "us_policy_vs_unemployment", title: "Policy Rate / Unemployment", category: "Macro", description: "Tightness proxy of policy rate relative to unemployment.", leftId: "us_fed_funds_rate", rightId: "us_unemployment", operation: "divide" }),
  formula({ id: "claims_to_payrolls", title: "Initial Claims / Payrolls", category: "Macro", description: "Labor stress proxy normalized by payroll scale.", leftId: "us_initial_claims", rightId: "us_nonfarm_payrolls", operation: "divide" }),
  formula({ id: "credit_spread_stress_combo", title: "HY Spread + TED Spread", category: "Macro", description: "Composite credit and funding stress signal.", leftId: "high_yield_oas", rightId: "ted_spread", operation: "add", valueFormat: "percent" }),
  formula({ id: "mortgage_minus_policy", title: "Mortgage Rate - Policy Rate", category: "Macro", description: "Housing financing spread over policy rates.", leftId: "us_mortgage_30y", rightId: "us_fed_funds_rate", operation: "subtract", valueFormat: "percent" }),
  formula({ id: "money_vs_gdp", title: "M2 / Nominal GDP", category: "Macro", description: "Liquidity relative to output.", leftId: "us_money_supply_m2", rightId: "us_nominal_gdp", operation: "divide" }),
  formula({ id: "energy_to_cpi", title: "WTI / CPI", category: "Macro", description: "Oil-price pressure relative to consumer price level.", leftId: "wti_oil", rightId: "us_cpi", operation: "divide" }),
  formula({ id: "gold_to_real_yield", title: "Gold / Real Yield", category: "Macro", description: "Gold sensitivity relative to real-rate backdrop.", leftId: "gold_usd", rightId: "us_real_interest_rate_10y", operation: "divide" }),
  formula({ id: "savings_minus_unemployment", title: "Savings Rate - Unemployment", category: "Macro", description: "Household cushion versus labor stress.", leftId: "us_personal_savings_rate", rightId: "us_unemployment", operation: "subtract", valueFormat: "percent" }),
  formula({ id: "jobs_balance", title: "Job Openings - Unemployment", category: "Macro", description: "Demand/supply labor gap proxy.", leftId: "us_job_openings", rightId: "us_unemployment", operation: "subtract" }),
  formula({ id: "yield_curve_combo", title: "10Y-2Y + 10Y-3M", category: "Macro", description: "Blended curve steepness indicator.", leftId: "us_yield_curve_10y2y", rightId: "us_yield_curve_10y3m", operation: "add", valueFormat: "percent" }),
  formula({ id: "consumption_to_income", title: "Real PCE / Real Disposable Income", category: "Macro", description: "Consumption intensity relative to income.", leftId: "us_real_pce", rightId: "us_real_disposable_income", operation: "divide" }),
];

const STOCKS_FORMULA_CHARTS: ChartDefinition[] = [
  formula({ id: "equity_risk_proxy", title: "S&P 500 / 10Y Yield", category: "Stocks", description: "Valuation pressure proxy against long yields.", leftId: "sp500_index", rightId: "us_10y_yield", operation: "divide" }),
  formula({ id: "nasdaq_vs_spx", title: "NASDAQ / S&P 500 Ratio", category: "Stocks", description: "Growth leadership ratio.", leftId: "nasdaq_composite", rightId: "sp500_index", operation: "divide" }),
  formula({ id: "spx_vs_vix", title: "S&P 500 / VIX", category: "Stocks", description: "Risk appetite proxy.", leftId: "sp500_index", rightId: "vix", operation: "divide" }),
  formula({ id: "djia_minus_spx", title: "Dow - S&P 500", category: "Stocks", description: "Old economy vs broad market spread.", leftId: "dow_jones", rightId: "sp500_index", operation: "subtract" }),
  formula({ id: "hy_plus_vix", title: "HY Spread + VIX", category: "Stocks", description: "Credit + equity volatility composite.", leftId: "high_yield_oas", rightId: "vix", operation: "add" }),
  formula({ id: "ig_minus_hy", title: "IG Spread - HY Spread", category: "Stocks", description: "Credit quality spread differential.", leftId: "investment_grade_oas", rightId: "high_yield_oas", operation: "subtract", valueFormat: "percent" }),
  formula({ id: "spx_pe_vs_dy", title: "PE / Dividend Yield", category: "Stocks", description: "Equity valuation pressure ratio.", leftId: "snp_pe_ratio", rightId: "snp_dividend_yield", operation: "divide" }),
  formula({ id: "wilshire_vs_spx", title: "Wilshire 5000 / S&P 500", category: "Stocks", description: "Broad market vs large-cap concentration.", leftId: "wilshire_5000", rightId: "sp500_index", operation: "divide" }),
  formula({ id: "stress_combo", title: "NFCI + STLFSI", category: "Stocks", description: "Composite financial stress from two indices.", leftId: "chicago_fci", rightId: "stlouis_fsi", operation: "add" }),
  formula({ id: "nasdaq100_vs_nasdaq", title: "NASDAQ-100 / NASDAQ Composite", category: "Stocks", description: "Mega-cap concentration proxy.", leftId: "nasdaq_100", rightId: "nasdaq_composite", operation: "divide" }),
  formula({ id: "ted_plus_vix", title: "TED Spread + VIX", category: "Stocks", description: "Funding stress plus equity fear.", leftId: "ted_spread", rightId: "vix", operation: "add" }),
  formula({ id: "bond_quality_gap", title: "BAA Yield - AAA Yield", category: "Stocks", description: "Corporate credit quality risk premium.", leftId: "baa_corporate_yield", rightId: "aaa_corporate_yield", operation: "subtract", valueFormat: "percent" }),
];

const EU_FORMULA_CHARTS: ChartDefinition[] = [
  formula({ id: "eu_policy_real_proxy", title: "EU Policy - EU Inflation (Proxy)", category: "EU", description: "Policy stance relative to price level proxy.", leftId: "eu_ecb_deposit_rate", rightId: "eu_hicp", operation: "subtract" }),
  formula({ id: "eu_growth_to_policy", title: "EU GDP / ECB Rate", category: "EU", description: "Output level relative to policy setting.", leftId: "eu_gdp", rightId: "eu_ecb_deposit_rate", operation: "divide" }),
  formula({ id: "eu_unemp_vs_sentiment", title: "EU Unemployment - Sentiment", category: "EU", description: "Labor stress against confidence backdrop.", leftId: "eu_unemployment", rightId: "eu_sentiment_indicator", operation: "subtract" }),
  formula({ id: "eurusd_vs_policy", title: "EURUSD / ECB Rate", category: "EU", description: "FX level normalized by euro policy rate.", leftId: "eur_usd", rightId: "eu_ecb_deposit_rate", operation: "divide" }),
  formula({ id: "eu_trade_vs_industry", title: "EU Trade Balance / Industrial Production", category: "EU", description: "External balance strength versus industrial activity.", leftId: "eu_trade_balance", rightId: "eu_industrial_production", operation: "divide" }),
  formula({ id: "eu_hicp_minus_core", title: "EU HICP - EU Core HICP", category: "EU", description: "Headline-core inflation gap proxy.", leftId: "eu_hicp", rightId: "eu_cpi_core", operation: "subtract" }),
  formula({ id: "eu_rate_spread_proxy", title: "EU Long Yield - ECB Rate", category: "EU", description: "Long-short policy spread for the euro area.", leftId: "eu_long_term_yield", rightId: "eu_ecb_deposit_rate", operation: "subtract", valueFormat: "percent" }),
  formula({ id: "eu_money_to_gdp", title: "EU M3 / EU GDP", category: "EU", description: "Monetary aggregate relative to output.", leftId: "eu_m3_money_supply", rightId: "eu_gdp", operation: "divide" }),
  formula({ id: "eu_youth_vs_total_unemp", title: "EU Youth / Total Unemployment", category: "EU", description: "Youth labor stress relative to headline unemployment.", leftId: "eu_unemployment_youth", rightId: "eu_unemployment", operation: "divide" }),
  formula({ id: "eu_construction_vs_retail", title: "EU Construction / Retail Sales", category: "EU", description: "Construction cycle relative to consumer demand.", leftId: "eu_construction_output", rightId: "eu_retail_sales", operation: "divide" }),
  formula({ id: "eu_sentiment_plus_climate", title: "EU Sentiment + Business Climate", category: "EU", description: "Composite soft-data confidence signal.", leftId: "eu_sentiment_indicator", rightId: "eu_business_climate", operation: "add" }),
  formula({ id: "eu_rate_vs_us_rate", title: "ECB Rate / Fed Funds", category: "EU", description: "Policy divergence ratio between ECB and Fed.", leftId: "eu_ecb_deposit_rate", rightId: "us_fed_funds_rate", operation: "divide" }),
];

export const CHARTS: ChartDefinition[] = [
  ...CURATED_CRYPTO_INDICATOR_CHARTS,
  ...MACRO_CHARTS,
  ...MACRO_FORMULA_CHARTS,
  ...STOCKS_FORMULA_CHARTS,
  ...EU_FORMULA_CHARTS,
  ...CRYPTO_CHARTS,
];
