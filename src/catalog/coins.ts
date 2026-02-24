export type CoinRow = {
  id: string;
  symbol: string;
  name: string;
};

export const TRACKED_COINS: CoinRow[] = [
  { id: "bitcoin", symbol: "BTC", name: "Bitcoin" },
  { id: "ethereum", symbol: "ETH", name: "Ethereum" },
  { id: "solana", symbol: "SOL", name: "Solana" },
  { id: "ripple", symbol: "XRP", name: "XRP" },
  { id: "binancecoin", symbol: "BNB", name: "BNB" },
  { id: "cardano", symbol: "ADA", name: "Cardano" },
  { id: "dogecoin", symbol: "DOGE", name: "Dogecoin" },
  { id: "tron", symbol: "TRX", name: "TRON" },
  { id: "chainlink", symbol: "LINK", name: "Chainlink" },
  { id: "avalanche-2", symbol: "AVAX", name: "Avalanche" },
  { id: "polkadot", symbol: "DOT", name: "Polkadot" },
  { id: "near", symbol: "NEAR", name: "NEAR Protocol" },
  { id: "litecoin", symbol: "LTC", name: "Litecoin" },
  { id: "bitcoin-cash", symbol: "BCH", name: "Bitcoin Cash" },
  { id: "uniswap", symbol: "UNI", name: "Uniswap" },
  { id: "internet-computer", symbol: "ICP", name: "Internet Computer" },
  { id: "stellar", symbol: "XLM", name: "Stellar" },
  { id: "aptos", symbol: "APT", name: "Aptos" },
  { id: "sui", symbol: "SUI", name: "Sui" },
  { id: "arbitrum", symbol: "ARB", name: "Arbitrum" },
  { id: "optimism", symbol: "OP", name: "Optimism" },
  { id: "polygon", symbol: "MATIC", name: "Polygon" },
  { id: "cosmos", symbol: "ATOM", name: "Cosmos" },
  { id: "algorand", symbol: "ALGO", name: "Algorand" },
  { id: "vechain", symbol: "VET", name: "VeChain" },
  { id: "aave", symbol: "AAVE", name: "Aave" },
  { id: "maker", symbol: "MKR", name: "Maker" },
  { id: "filecoin", symbol: "FIL", name: "Filecoin" },
  { id: "render-token", symbol: "RNDR", name: "Render" },
  { id: "the-graph", symbol: "GRT", name: "The Graph" },
  { id: "injective-protocol", symbol: "INJ", name: "Injective" },
  { id: "lido-dao", symbol: "LDO", name: "Lido DAO" },
  { id: "sei-network", symbol: "SEI", name: "Sei" },
  { id: "celestia", symbol: "TIA", name: "Celestia" },
  { id: "kaspa", symbol: "KAS", name: "Kaspa" },
  { id: "toncoin", symbol: "TON", name: "Toncoin" },
  { id: "shiba-inu", symbol: "SHIB", name: "Shiba Inu" },
  { id: "pepe", symbol: "PEPE", name: "Pepe" },
  { id: "monero", symbol: "XMR", name: "Monero" },
  { id: "immutable-x", symbol: "IMX", name: "Immutable" },
  { id: "crypto-com-chain", symbol: "CRO", name: "Cronos" },
];

export const TRACKED_COIN_IDS = TRACKED_COINS.map((coin) => coin.id);

export const TRACKED_COINS_BY_ID: Record<string, CoinRow> = Object.fromEntries(
  TRACKED_COINS.map((coin) => [coin.id, coin])
);
