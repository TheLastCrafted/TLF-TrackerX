export type ResearchTopic = "indicators" | "macro" | "crypto" | "risk" | "playbooks";

export type ResearchMaterial = {
  id: string;
  topic: ResearchTopic;
  title: string;
  source: string;
  url: string;
  why: string;
  explainer: string;
  imageUrl?: string;
};

type MaterialSeed = {
  title: string;
  source: string;
  url: string;
  why: string;
};

function buildResearchImage(url: string): string | undefined {
  const safe = String(url || "").trim();
  if (!safe.startsWith("http://") && !safe.startsWith("https://")) return undefined;
  // Use full-page previews so materials show an actual relevant visual instead of a tiny icon.
  return `https://image.thum.io/get/width/1200/noanimate/${safe}`;
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

function longExplainer(seed: MaterialSeed, topic: ResearchTopic): string {
  const topicGuidance: Record<ResearchTopic, string> = {
    indicators:
      "Treat indicators as measurement tools, not prediction engines. Most of them are transformed versions of price, volume, or volatility and should be interpreted in sequence with market structure, trend state, and liquidity regime.",
    macro:
      "Macro series must be read in sequence, not in isolation. Level, rate of change, and surprise versus consensus each carry different information, and revisions can alter the narrative that price has already discounted.",
    crypto:
      "Crypto metrics require context around token design, exchange microstructure, and on-chain behavior quality. A single strong metric can be invalidated by emission pressure, concentration risk, or unstable liquidity.",
    risk:
      "Risk work should start with loss tolerance and position sizing, then map exposure drivers. Correlation, volatility clustering, and liquidity compression are often the true drivers of drawdowns in stressed windows.",
    playbooks:
      "A playbook is only useful when it defines entry, add, reduce, and invalidation logic before volatility arrives. Good process quality lowers emotional drift and improves consistency across regimes.",
  };

  return [
    `${seed.title} is most useful when it is embedded inside a repeatable decision framework instead of used as a one-off headline signal. ${seed.why} ${topicGuidance[topic]} In practical workflow terms, start by defining the operating context: trend regime, volatility regime, and event-risk calendar. Then score whether this input is a primary driver, confirmation signal, or only a background condition. This one step prevents over-weighting a popular metric that has weak explanatory power for the current market state.`,
    `Operationally, use a three-layer read: current level, direction of change, and speed of change. Level tells you where the system sits, direction tells you whether conditions are improving or deteriorating, and speed tells you whether the shift is gradual or shock-like. Always pair this with what price has already done. If price already repriced aggressively before the data moved, the next reaction may be muted or even reversed. Build a short scenario map (base, upside, downside) and assign specific actions: hold size, de-risk, or add selectively. This converts research into an executable plan instead of passive information intake.`,
    `For ongoing use, log what this input suggested before each major move and compare it with outcome quality over time. Track false positives, late signals, and regime-specific breakdowns. Keep checkpoints simple: does this input improve timing, improve risk control, or improve conviction quality? If it does none, demote it in your stack. If it improves one area consistently, keep it but only in that role. The goal is not collecting more indicators or readings; the goal is improving decisions under uncertainty. Use this material as a structured reference, then combine it with your thesis notes, position sizing rules, and catalyst calendar for a complete research loop.`,
  ].join("\n\n");
}

function buildTopic(topic: ResearchTopic, seeds: MaterialSeed[]): ResearchMaterial[] {
  return seeds.map((seed) => {
    const baseId = `${topic}_${slugify(seed.title)}`;
    return {
      id: baseId,
      topic,
      title: seed.title,
      source: seed.source,
      url: seed.url,
      why: seed.why,
      explainer: longExplainer(seed, topic),
      imageUrl: buildResearchImage(seed.url),
    };
  });
}

const INDICATOR_SEEDS: MaterialSeed[] = [
  { title: "RSI Regime Framework", source: "Fidelity Learn", url: "https://www.fidelity.com/learning-center/trading-investing/technical-analysis/technical-indicator-guide/RSI", why: "Defines RSI behavior across trend and range regimes." },
  { title: "MACD Signal Structure", source: "CFI", url: "https://corporatefinanceinstitute.com/resources/career-map/sell-side/capital-markets/macd-oscillator-technical-analysis/", why: "Breaks down line crossovers, histogram, and divergence." },
  { title: "Bollinger Band Compression", source: "Investopedia", url: "https://www.investopedia.com/terms/b/bollingerbands.asp", why: "Useful for expansion/compression volatility transitions." },
  { title: "ATR for Risk Budgeting", source: "Investopedia", url: "https://www.investopedia.com/terms/a/atr.asp", why: "Links volatility state to position sizing and stop placement." },
  { title: "ADX Trend Strength", source: "Fidelity Learn", url: "https://www.fidelity.com/learning-center/trading-investing/technical-analysis/technical-indicator-guide/adx", why: "Separates directional trend strength from noise." },
  { title: "Stochastic Oscillator Context", source: "Investopedia", url: "https://www.investopedia.com/terms/s/stochasticoscillator.asp", why: "Clarifies overbought/oversold in momentum cycles." },
  { title: "Ichimoku Cloud Breakdown", source: "CFI", url: "https://corporatefinanceinstitute.com/resources/career-map/sell-side/capital-markets/ichimoku-cloud/", why: "Combines trend, support/resistance, and momentum in one model." },
  { title: "VWAP Execution Discipline", source: "Investopedia", url: "https://www.investopedia.com/terms/v/vwap.asp", why: "Anchors intraday execution quality and participation levels." },
  { title: "OBV Volume Confirmation", source: "Investopedia", url: "https://www.investopedia.com/terms/o/onbalancevolume.asp", why: "Validates trend strength using cumulative volume flow." },
  { title: "Parabolic SAR Usage", source: "Investopedia", url: "https://www.investopedia.com/terms/p/parabolicindicator.asp", why: "Trail logic for trending environments with strict invalidation." },
  { title: "Moving Average Stack Logic", source: "Schwab", url: "https://www.schwab.com/learn/story/how-to-use-moving-averages", why: "Framework for trend hierarchy and pullback structure." },
  { title: "Keltner Channel Framework", source: "Investopedia", url: "https://www.investopedia.com/terms/k/keltnerchannel.asp", why: "Volatility envelope variant for trend continuation mapping." },
  { title: "Donchian Breakout Rules", source: "Investopedia", url: "https://www.investopedia.com/terms/d/donchianchannels.asp", why: "Classic breakout method and trend-following trigger logic." },
  { title: "Aroon Trend Timing", source: "Investopedia", url: "https://www.investopedia.com/terms/a/aroon.asp", why: "Measures trend emergence and trend decay windows." },
  { title: "Pivot Point Session Mapping", source: "Investopedia", url: "https://www.investopedia.com/terms/p/pivotpoint.asp", why: "Intraday reaction zones and tactical level planning." },
  { title: "Cumulative Delta Basics", source: "CME Group", url: "https://www.cmegroup.com/education/courses/understanding-futures-markets.html", why: "Order-flow perspective for auction imbalance context." },
  { title: "Indicator Confluence Design", source: "Investopedia", url: "https://www.investopedia.com/terms/t/technicalindicator.asp", why: "How to combine indicators without duplicating signal information." },
  { title: "Timeframe Alignment Method", source: "Babypips", url: "https://www.babypips.com/learn/forex/multiple-time-frame-analysis", why: "Top-down structure for reducing low-timeframe noise." },
];

const MACRO_SEEDS: MaterialSeed[] = [
  { title: "Yield Curve Interpretation", source: "Federal Reserve Bank of Cleveland", url: "https://www.clevelandfed.org/indicators-and-data/yield-curve-and-gdp-growth", why: "Core framework for growth and recession probability context." },
  { title: "FOMC Statement Analysis", source: "Federal Reserve", url: "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm", why: "Primary source for US policy path shifts and guidance tone." },
  { title: "ECB Policy Signals", source: "ECB", url: "https://www.ecb.europa.eu/press/govcdec/mopo/html/index.en.html", why: "Official euro-area policy direction and communication." },
  { title: "CPI vs Core CPI Mechanics", source: "BLS", url: "https://www.bls.gov/cpi/", why: "Explains inflation composition and persistence signals." },
  { title: "PCE Inflation Framework", source: "BEA", url: "https://www.bea.gov/data/personal-consumption-expenditures-price-index", why: "Fed-preferred inflation gauge and category sensitivity." },
  { title: "Labor Market Dashboard", source: "BLS", url: "https://www.bls.gov/news.release/empsit.toc.htm", why: "Payrolls, unemployment, participation, and wage trend context." },
  { title: "Initial Claims Leading Signal", source: "FRED", url: "https://fred.stlouisfed.org/series/ICSA", why: "High-frequency labor stress early-warning indicator." },
  { title: "PMI and Business Cycle", source: "S&P Global", url: "https://www.spglobal.com/marketintelligence/en/mi/research-analysis/economics.html", why: "Manufacturing/services activity pulse and inflection signals." },
  { title: "Credit Spreads and Risk", source: "FRED", url: "https://fred.stlouisfed.org/series/BAMLH0A0HYM2", why: "Risk appetite and financing stress proxy for equities/credit." },
  { title: "Dollar Liquidity Transmission", source: "BIS", url: "https://www.bis.org/topics/global_liquidity.htm", why: "Shows how dollar strength impacts global risk assets." },
  { title: "Money Supply and Velocity", source: "FRED", url: "https://fred.stlouisfed.org/series/M2SL", why: "Liquidity stock and turnover interpretation." },
  { title: "QT and Balance Sheet Effects", source: "Federal Reserve", url: "https://www.federalreserve.gov/monetarypolicy/bst_recenttrends.htm", why: "Balance-sheet regime and risk-asset sensitivity." },
  { title: "Real Rates and Valuation", source: "FRED", url: "https://fred.stlouisfed.org/series/DFII10", why: "Discount-rate pressure on duration-sensitive assets." },
  { title: "Housing Starts Cycle Signal", source: "FRED", url: "https://fred.stlouisfed.org/series/HOUST", why: "Construction cycle as growth and credit signal." },
  { title: "Retail Sales Demand Pulse", source: "FRED", url: "https://fred.stlouisfed.org/series/RRSAFS", why: "Consumer demand trend versus real-income constraints." },
  { title: "ISM Services Leading Clues", source: "ISM", url: "https://www.ismworld.org/supply-management-news-and-reports/reports/ism-report-on-business/", why: "Services momentum and broad growth resilience." },
  { title: "Global Macro Event Mapping", source: "IMF", url: "https://www.imf.org/en/Publications/WEO", why: "Cross-country regime comparison and policy divergence." },
  { title: "Macro Surprise Index Usage", source: "Citi Research", url: "https://www.citigroup.com/global/insights", why: "How economic surprises change market pricing speed." },
];

const CRYPTO_SEEDS: MaterialSeed[] = [
  { title: "On-Chain Data Methodology", source: "Coin Metrics Docs", url: "https://docs.coinmetrics.io/network-data/network-data-overview", why: "Definitions and caveats behind on-chain metrics." },
  { title: "Supply in Profit/Loss", source: "Glassnode Academy", url: "https://academy.glassnode.com/", why: "Cycle-state signal from holder profitability." },
  { title: "MVRV and Valuation Bands", source: "Glassnode Academy", url: "https://academy.glassnode.com/indicators/mvrv-ratio", why: "Valuation proxy for market overheating/undervaluation." },
  { title: "SOPR Interpretation", source: "Glassnode Academy", url: "https://academy.glassnode.com/indicators/sopr", why: "Realized profit-taking pressure and trend continuation clues." },
  { title: "NUPL Regime Reading", source: "Glassnode Academy", url: "https://academy.glassnode.com/indicators/nupl-net-unrealized-profit-loss", why: "Unrealized P/L phases across cycles." },
  { title: "Token Unlock Risk", source: "Messari", url: "https://messari.io/", why: "Emission and vesting pressure on market supply." },
  { title: "Stablecoin Liquidity Tracking", source: "CoinGecko", url: "https://www.coingecko.com/en/stablecoins", why: "Liquidity expansion/contraction context for risk appetite." },
  { title: "Derivatives Funding Structure", source: "Coinglass", url: "https://www.coinglass.com/", why: "Perp funding and open-interest fragility mapping." },
  { title: "Basis and Carry Signals", source: "CME Group", url: "https://www.cmegroup.com/markets/cryptocurrencies.html", why: "Futures basis as leverage and demand proxy." },
  { title: "Exchange Flow Interpretation", source: "CryptoQuant Guide", url: "https://cryptoquant.com/guide", why: "Inflow/outflow context for sell pressure risk." },
  { title: "Miner Behavior and Revenue", source: "Hashrate Index", url: "https://hashrateindex.com/blog/", why: "Miner economics as supply pressure monitor." },
  { title: "L2 Activity and Fees", source: "L2BEAT", url: "https://l2beat.com/scaling/summary", why: "Network demand quality beyond headline token price." },
  { title: "TVL and Real Usage", source: "DefiLlama", url: "https://defillama.com/", why: "Capital stickiness versus mercenary liquidity." },
  { title: "Governance Concentration Risk", source: "Messari Governance", url: "https://messari.io/governance", why: "Voting power concentration and protocol capture risk." },
  { title: "Treasury Management Signals", source: "Token Terminal", url: "https://tokenterminal.com/", why: "Protocol revenue and treasury runway quality." },
  { title: "Network Security Metrics", source: "Blockchair", url: "https://blockchair.com/", why: "Hashrate/staking participation and attack-cost context." },
  { title: "Cross-Chain Liquidity Rotation", source: "Artemis", url: "https://app.artemis.xyz/", why: "Flow migration across ecosystems and narrative cycles." },
  { title: "Crypto Correlation Matrix", source: "Kaiko Learn", url: "https://www.kaiko.com/research", why: "Inter-asset dependency and diversification reality check." },
];

const RISK_SEEDS: MaterialSeed[] = [
  { title: "Value at Risk Fundamentals", source: "Investopedia", url: "https://www.investopedia.com/terms/v/var.asp", why: "Baseline downside distribution framing." },
  { title: "Expected Shortfall in Practice", source: "BIS", url: "https://www.bis.org/bcbs/publ/d352.pdf", why: "Tail-loss measure beyond VaR cutoff." },
  { title: "Maximum Drawdown Control", source: "CFA Institute", url: "https://www.cfainstitute.org/", why: "Drawdown-aware risk budgeting and recovery math." },
  { title: "Volatility Clustering", source: "Risk.net", url: "https://www.risk.net/", why: "Regime persistence and shock spillover behavior." },
  { title: "Position Sizing Under Uncertainty", source: "Van Tharp Institute", url: "https://vantharpinstitute.com/", why: "Risk-per-idea framework for durability." },
  { title: "Correlation Breakdown in Stress", source: "Vanguard", url: "https://investor.vanguard.com/investor-resources-education/understanding-investment-types/diversification", why: "Diversification assumptions during crisis periods." },
  { title: "Liquidity Risk Measurement", source: "SEC", url: "https://www.investor.gov/", why: "Execution slippage and spread expansion risk." },
  { title: "Scenario Stress Testing", source: "IMF", url: "https://www.imf.org/en/Publications/Global-Financial-Stability-Report", why: "Systematic base/bull/bear mapping process." },
  { title: "Tail Hedging Logic", source: "CBOE", url: "https://www.cboe.com/insights/", why: "Convex payoff design for left-tail protection." },
  { title: "Portfolio Heat and Concentration", source: "MSCI", url: "https://www.msci.com/research-and-insights", why: "Factor overlap and hidden concentration exposure." },
  { title: "Leverage and Liquidation Risk", source: "CME Education", url: "https://www.cmegroup.com/education.html", why: "Margin dynamics in fast-moving markets." },
  { title: "Risk of Ruin Basics", source: "Quantpedia", url: "https://quantpedia.com/", why: "Probability framework for strategy survival." },
  { title: "Convexity and Gamma Exposure", source: "CBOE", url: "https://www.cboe.com/tradable_products/", why: "Option positioning impact on underlying volatility." },
  { title: "Stop-Loss Design Tradeoffs", source: "Schwab", url: "https://www.schwab.com/learn/story/using-stop-orders", why: "Structural versus volatility-based stop placement." },
  { title: "Risk Parity Intuition", source: "AQR", url: "https://www.aqr.com/Insights", why: "Balancing risk contributions instead of capital only." },
  { title: "Regime-Based Exposure Limits", source: "Bridgewater Daily Observations", url: "https://www.bridgewater.com/research-and-insights", why: "Adapting risk limits to macro regime shifts." },
  { title: "Distribution Assumption Failures", source: "Taleb Lectures", url: "https://www.fooledbyrandomness.com/", why: "Fat-tail awareness and model humility." },
  { title: "Post-Mortem Risk Review", source: "CFA Institute", url: "https://www.cfainstitute.org/en/research", why: "Feedback loop to improve decision quality." },
];

const PLAYBOOK_SEEDS: MaterialSeed[] = [
  { title: "Trend-Following Execution", source: "Turtle Rules (Public Summaries)", url: "https://www.turtletrader.com/rules/", why: "Rule-based trend participation and scale logic." },
  { title: "Mean Reversion Setup Design", source: "QuantStart", url: "https://www.quantstart.com/", why: "Conditions where reversion has edge." },
  { title: "Breakout Validation Checklist", source: "Investopedia", url: "https://www.investopedia.com/terms/b/breakout.asp", why: "Volume and structure filters for breakout quality." },
  { title: "Event-Driven Trade Planning", source: "CME Education", url: "https://www.cmegroup.com/education/courses.html", why: "Scenario plans around macro releases." },
  { title: "Earnings Window Framework", source: "Nasdaq Learn", url: "https://www.nasdaq.com/articles", why: "Pre/post earnings volatility and positioning map." },
  { title: "Swing Trade Structure", source: "Schwab", url: "https://www.schwab.com/learn", why: "Timeframe-specific entry/exit structure rules." },
  { title: "Intraday Open Auction Playbook", source: "NYSE Education", url: "https://www.nyse.com/markets/hours-calendars", why: "Open-drive versus fade conditions." },
  { title: "Pullback Continuation Model", source: "Fidelity Learn", url: "https://www.fidelity.com/learning-center/trading-investing", why: "Risk-defined continuation entries in trend." },
  { title: "Range Trading Playbook", source: "Babypips", url: "https://www.babypips.com/learn/forex/ranging-markets", why: "Bounded-market execution and invalidation logic." },
  { title: "Momentum Rotation Strategy", source: "MSCI Insights", url: "https://www.msci.com/research-and-insights", why: "Leadership transitions across sectors/asset classes." },
  { title: "DCA with Risk Controls", source: "Vanguard", url: "https://investor.vanguard.com/investor-resources-education", why: "Systematic accumulation with volatility filters." },
  { title: "Portfolio Rebalance Protocol", source: "Morningstar", url: "https://www.morningstar.com/articles", why: "Rebalancing cadence and threshold discipline." },
  { title: "Hedge Overlay Workflow", source: "CBOE", url: "https://www.cboe.com/insights/posts/", why: "Protective hedging decision tree design." },
  { title: "Execution Quality Audit", source: "SEC", url: "https://www.investor.gov/introduction-investing/investing-basics/how-stock-markets-work", why: "Slippage, spread, and fill-quality review process." },
  { title: "Thesis Journal Method", source: "TraderFeed", url: "https://traderfeed.blogspot.com/", why: "Structured review loop for discretionary systems." },
  { title: "Playbook for De-Risking", source: "CFA Institute", url: "https://www.cfainstitute.org/en/research", why: "Rules for reducing exposure under stress." },
  { title: "Playbook for Re-Risking", source: "FRED", url: "https://fred.stlouisfed.org/", why: "Conditions to re-add risk after drawdowns." },
  { title: "Multi-Asset Rotation Playbook", source: "BlackRock Insights", url: "https://www.blackrock.com/us/individual/insights", why: "Cross-asset allocation under changing macro regimes." },
];

const MATERIALS: ResearchMaterial[] = [
  ...buildTopic("indicators", INDICATOR_SEEDS),
  ...buildTopic("macro", MACRO_SEEDS),
  ...buildTopic("crypto", CRYPTO_SEEDS),
  ...buildTopic("risk", RISK_SEEDS),
  ...buildTopic("playbooks", PLAYBOOK_SEEDS),
];

export function getResearchMaterials(topic: ResearchTopic): ResearchMaterial[] {
  return MATERIALS.filter((row) => row.topic === topic);
}

export function getResearchMaterialById(id: string): ResearchMaterial | undefined {
  return MATERIALS.find((row) => row.id === id);
}

export function getResearchTopicCharts(topic: ResearchTopic): string[] {
  if (topic === "indicators") return ["us_vix", "us_nasdaq_daily_close", "sp500_daily_close"];
  if (topic === "macro") return ["us_10y_yield", "us_unemployment", "us_cpi", "eu_ecb_deposit_rate"];
  if (topic === "crypto") return ["btc_market_cap", "btc_price_usd", "total_crypto_market_cap"];
  if (topic === "risk") return ["us_vix", "us_hy_spread", "us_10y_2y_spread"];
  return ["sp500_daily_close", "us_dxy", "btc_price_usd"];
}
