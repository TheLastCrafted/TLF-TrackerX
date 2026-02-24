const MAP: Record<string, string> = {
  bitcoin: "BTC",
  ethereum: "ETH",
  solana: "SOL",
  ripple: "XRP",
  binancecoin: "BNB",
  cardano: "ADA",
  dogecoin: "DOGE",
  tron: "TRX",
  chainlink: "LINK",
  "avalanche-2": "AVAX",
  polkadot: "DOT",
  near: "NEAR",
  litecoin: "LTC",
  "bitcoin-cash": "BCH",
  uniswap: "UNI",
  "internet-computer": "ICP",
  stellar: "XLM",
  aptos: "APT",
  sui: "SUI",
  arbitrum: "ARB",
  optimism: "OP",
  polygon: "POL",
  cosmos: "ATOM",
  algorand: "ALGO",
  vechain: "VET",
  aave: "AAVE",
  maker: "MKR",
  filecoin: "FIL",
  "render-token": "RNDR",
  "the-graph": "GRT",
  "injective-protocol": "INJ",
  "lido-dao": "LDO",
  "sei-network": "SEI",
  celestia: "TIA",
  kaspa: "KAS",
  toncoin: "TON",
  "shiba-inu": "SHIB",
  pepe: "PEPE",
  monero: "XMR",
  "immutable-x": "IMX",
  "crypto-com-chain": "CRO",
};

export function tradingSymbolForCoinId(coinId: string, currency: "USD" | "EUR" = "USD"): string {
  const base = MAP[coinId];
  if (!base) return "";
  return `BINANCE:${base}${currency === "EUR" ? "EUR" : "USDT"}`;
}

export function tradingMarketCapSymbolForCoinId(coinId: string): string {
  const base = MAP[coinId];
  if (!base) return "";
  return `CRYPTOCAP:${base}`;
}
