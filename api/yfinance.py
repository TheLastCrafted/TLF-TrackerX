from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, urlparse
import json

import yfinance as yf

MAX_SYMBOLS = 220


def as_float(value):
  try:
    if value is None:
      return None
    out = float(value)
    if out != out:  # NaN guard
      return None
    return out
  except Exception:
    return None


def unique_symbols(raw):
  seen = set()
  out = []
  for token in raw.split(","):
    symbol = token.strip().upper()
    if not symbol or symbol in seen:
      continue
    seen.add(symbol)
    out.append(symbol)
  return out


def parse_close_and_prev(history):
  if history is None or len(history.index) == 0:
    return (None, None, None)
  closes = history["Close"].dropna().tolist() if "Close" in history.columns else []
  volumes = history["Volume"].dropna().tolist() if "Volume" in history.columns else []
  close = as_float(closes[-1]) if len(closes) >= 1 else None
  prev_close = as_float(closes[-2]) if len(closes) >= 2 else None
  volume = as_float(volumes[-1]) if len(volumes) >= 1 else None
  return (close, prev_close, volume)


class handler(BaseHTTPRequestHandler):
  def do_GET(self):
    parsed = urlparse(self.path)
    params = parse_qs(parsed.query)
    raw = (params.get("symbols", [""])[0] or "").strip()
    symbols = unique_symbols(raw)[:MAX_SYMBOLS]

    if not symbols:
      self.send_response(400)
      self.send_header("Content-Type", "application/json; charset=utf-8")
      self.end_headers()
      self.wfile.write(json.dumps({"error": "missing_symbols"}).encode("utf-8"))
      return

    payload = []
    tickers = yf.Tickers(" ".join(symbols))

    for symbol in symbols:
      ticker = tickers.tickers.get(symbol)
      if ticker is None:
        ticker = yf.Ticker(symbol)

      fast = {}
      try:
        fast = dict(getattr(ticker, "fast_info", {}) or {})
      except Exception:
        fast = {}

      close = as_float(fast.get("lastPrice") or fast.get("last_price") or fast.get("regularMarketPrice"))
      prev_close = as_float(fast.get("previousClose") or fast.get("previous_close"))
      volume = as_float(fast.get("lastVolume") or fast.get("last_volume"))
      market_cap = as_float(fast.get("marketCap") or fast.get("market_cap"))
      currency = fast.get("currency")
      exchange = fast.get("exchange")

      if close is None:
        try:
          history = ticker.history(period="5d", interval="1d", auto_adjust=False)
          h_close, h_prev, h_vol = parse_close_and_prev(history)
          if close is None:
            close = h_close
          if prev_close is None:
            prev_close = h_prev
          if volume is None:
            volume = h_vol
        except Exception:
          pass

      if close is None:
        continue

      change_pct = None
      if prev_close is not None and prev_close > 0:
        change_pct = ((close - prev_close) / prev_close) * 100.0

      payload.append(
        {
          "symbol": symbol,
          "price": close,
          "previousClose": prev_close,
          "changePct": change_pct,
          "marketCap": market_cap,
          "volume": volume,
          "averageVolume": None,
          "high24h": None,
          "low24h": None,
          "currency": currency or "USD",
          "exchange": exchange,
          "name": symbol,
        }
      )

    self.send_response(200)
    self.send_header("Content-Type", "application/json; charset=utf-8")
    self.send_header("Cache-Control", "s-maxage=12, stale-while-revalidate=60")
    self.end_headers()
    self.wfile.write(json.dumps(payload).encode("utf-8"))
