# Crypto Chart Canonical Audit

This file summarizes how each crypto formula chart is currently sourced in the app.

Reference definitions checked during this pass:
- RSI, MACD, Bollinger Bands: TradingView knowledge base.
  - https://www.tradingview.com/support/solutions/43000502338-relative-strength-index-rsi/
  - https://www.tradingview.com/support/solutions/43000502344-macd-moving-average-convergence-divergence/
  - https://www.tradingview.com/support/solutions/43000501840-bollinger-bands-bb/
- Fear and Greed (0-100): Alternative.me API docs.
  - https://alternative.me/crypto/fear-and-greed-index/
- Altcoin Season Index method: BlockchainCenter (75% of top 50 outperform BTC over 90D).
  - https://www.blockchaincenter.net/en/altcoin-season-index/
- BTC/DXY and WALCL liquidity context: FRED series DTWEXBGS and WALCL.
  - https://fred.stlouisfed.org/series/DTWEXBGS
  - https://fred.stlouisfed.org/series/WALCL
- On-chain metrics: BGeometrics datasets and CoinMetrics community catalog.
  - https://charts.bgeometrics.com/
  - https://community-api.coinmetrics.io/v4/catalog/asset-metrics

| Chart ID | Title | Source Mode | Details |
|---|---|---|---|
| absolute_breadth_index_abi | Absolute Breadth Index (ABI) | Computed canonical | Derived from CoinMetrics/FRED/BGeometrics canonical inputs. |
| address_activity | Address Activity | BGeometrics file | addresses_active.json |
| advance_decline_index_adi | Advance Decline Index (ADI) | Computed canonical | Derived from CoinMetrics/FRED/BGeometrics canonical inputs. |
| advance_decline_ratios | Advance Decline Ratios | Computed canonical | Derived from CoinMetrics/FRED/BGeometrics canonical inputs. |
| altcoin_market_caps | Altcoin Market Capitalizations | Computed canonical | Derived from CoinMetrics/FRED/BGeometrics canonical inputs. |
| altcoin_season_index | Altcoin Season Index | Computed canonical | Derived from CoinMetrics/FRED/BGeometrics canonical inputs. |
| average_daily_returns | Average Daily Returns | Special ROI | Event-anchored ROI transform from historical price series. |
| benfords_law | Benford's Law | Computed canonical | Derived from CoinMetrics/FRED/BGeometrics canonical inputs. |
| best_day_to_dca | Best Day To DCA | BGeometrics file | realized_price.json, realized_price_btc_price.json |
| block_statistics | Block Statistics | Computed canonical | Derived from CoinMetrics/FRED/BGeometrics canonical inputs. |
| bollinger_bands | Bollinger Bands | Special indicator | Standard technical indicator implementation (or dedicated API series). |
| btc_vs_dxy | BTC vs. DXY | Computed canonical | Derived from CoinMetrics/FRED/BGeometrics canonical inputs. |
| bull_market_support_band | Bull Market Support Band (BMSB) | Special indicator | Standard technical indicator implementation (or dedicated API series). |
| coin_days_destroyed | Coin Days Destroyed | BGeometrics file | cdd.json |
| coin_days_destroyed_90d | 90D Coin Days Destroyed | BGeometrics file | cdd_terminal_ajusted_90dma.json |
| coins_above_below_moving_average | Coins Above/Below Moving Average | Computed canonical | Derived from CoinMetrics/FRED/BGeometrics canonical inputs. |
| color_coded_moving_average_strength | Color-Coded Moving Average Strength | Computed canonical | Derived from CoinMetrics/FRED/BGeometrics canonical inputs. |
| correlation_coefficients | Correlation Coefficients | Special indicator | Standard technical indicator implementation (or dedicated API series). |
| cowen_corridor | Cowen Corridor | Computed canonical | Derived from CoinMetrics/FRED/BGeometrics canonical inputs. |
| crypto_heatmap | Crypto Heatmap | Computed canonical | Derived from CoinMetrics/FRED/BGeometrics canonical inputs. |
| current_risk_levels | Current Risk Levels | BGeometrics inline series | mvrv_dark.html :: data_mvrv_zscore (7D smoothed, normalized to 0-100) |
| cycles_deviation | Cycles Deviation | Computed canonical | Derived from CoinMetrics/FRED/BGeometrics canonical inputs. |
| days_since_pct_decline | Days Since Percentage Decline | Computed canonical | Derived from CoinMetrics/FRED/BGeometrics canonical inputs. |
| days_since_pct_gain | Days Since Percentage Gain | Computed canonical | Derived from CoinMetrics/FRED/BGeometrics canonical inputs. |
| does_it_bleed | Does It Bleed | Computed canonical | Derived from CoinMetrics/FRED/BGeometrics canonical inputs. |
| dominance | Dominance | Computed canonical | Derived from CoinMetrics/FRED/BGeometrics canonical inputs. |
| dormancy | Dormancy | BGeometrics file | cdd_terminal_ajusted.json |
| eth_supply_dynamics_vs_bitcoin | Ethereum Supply Dynamics vs Bitcoin | Computed canonical | Derived from CoinMetrics/FRED/BGeometrics canonical inputs. |
| ethereum_supply_burnt | Ethereum Supply Burnt | Computed canonical | Derived from CoinMetrics/FRED/BGeometrics canonical inputs. |
| fair_value_log_reg | Fair Value Logarithmic Regression | Special indicator | Standard technical indicator implementation (or dedicated API series). |
| fear_greed_index | Fear & Greed Index | Special indicator | Standard technical indicator implementation (or dedicated API series). |
| gas_statistics | Gas Statistics | Computed canonical | Derived from CoinMetrics/FRED/BGeometrics canonical inputs. |
| golden_death_crosses | Golden/Death Crosses | Special indicator | Standard technical indicator implementation (or dedicated API series). |
| hash_rate | Hash Rate | BGeometrics file | hashrate.json |
| hash_rate_divided_by_price | Hash Rate Divided By Price | Computed canonical | Derived from CoinMetrics/FRED/BGeometrics canonical inputs. |
| hash_ribbons | Hash Ribbons | Computed canonical | Derived from CoinMetrics/FRED/BGeometrics canonical inputs. |
| historical_monthly_average_roi | Historical Monthly Average ROI | Special ROI | Event-anchored ROI transform from historical price series. |
| historical_risk_levels | Historical Risk Levels | BGeometrics inline series | mvrv_dark.html :: data_mvrv_zscore (normalized to 0-100) |
| hodl_waves | HODL Waves | BGeometrics file | hw_age_supply_10.json |
| liveliness | Liveliness | Computed canonical | Derived from CoinMetrics/FRED/BGeometrics canonical inputs. |
| log_reg_rainbow | Logarithmic Regression Rainbow | Special indicator | Standard technical indicator implementation (or dedicated API series). |
| logarithmic_regression | Logarithmic Regression | Special indicator | Standard technical indicator implementation (or dedicated API series). |
| macd | Moving Average Convergence Divergence (MACD) | Special indicator | Standard technical indicator implementation (or dedicated API series). |
| market_cap_hypotheticals | Market Cap Hypotheticals | Computed canonical | Derived from CoinMetrics/FRED/BGeometrics canonical inputs. |
| mctc | MarketCap To ThermoCap Ratio (MCTC) | Computed canonical | Derived from CoinMetrics/FRED/BGeometrics canonical inputs. |
| mctc_miner | MinerCap To ThermoCap Ratio (mCTC) | Computed canonical | Derived from CoinMetrics/FRED/BGeometrics canonical inputs. |
| miner_revenue | Miner Revenue | Computed canonical | Derived from CoinMetrics/FRED/BGeometrics canonical inputs. |
| momr | Miner Outflow To Miner Revenue (MOMR) | Computed canonical | Derived from CoinMetrics/FRED/BGeometrics canonical inputs. |
| monthly_average_roi | Monthly Average ROI | Special ROI | Event-anchored ROI transform from historical price series. |
| monthly_returns | Monthly Returns | Special ROI | Event-anchored ROI transform from historical price series. |
| moving_averages | Moving Averages | Special indicator | Standard technical indicator implementation (or dedicated API series). |
| mvrv | Market Value to Realized Value (MVRV) | BGeometrics file | mvrv_365dma.json |
| mvrv_zscore | Market Value Realized Value Z-Score (MVRV Z-Score) | BGeometrics inline series | mvrv_dark.html :: data_mvrv_zscore |
| nupl | Net Unrealized Profit/Loss (NUPL) | BGeometrics file | nupl_7dma.json |
| nvt | Network Value to Transactions (NVT) | BGeometrics file | nvts_bg.json |
| open_interest_crypto_futures | Open Interest Of Crypto Futures | BGeometrics file | oi_total.json |
| open_interest_crypto_options | Open Interest Of Crypto Options | BGeometrics file | oi_total.json |
| pi_cycle_bottom_top | Pi Cycle Bottom/Top | Special indicator | Standard technical indicator implementation (or dedicated API series). |
| portfolios_weighted_by_market_cap | Portfolios Weighted By Market Cap | Computed canonical | Derived from CoinMetrics/FRED/BGeometrics canonical inputs. |
| price_color_coded_by_risk | Price Color Coded By Risk | BGeometrics inline series | mvrv_dark.html :: data_mvrv_zscore (normalized to 0-100) |
| price_drawdown_from_ath | Price Drawdown From ATH | Special indicator | Standard technical indicator implementation (or dedicated API series). |
| price_milestone_crossings | Price Milestone Crossings | Computed canonical | Derived from CoinMetrics/FRED/BGeometrics canonical inputs. |
| puell_multiple | Puell Multiple | BGeometrics file | puell_multiple_7dma.json |
| qt_ending_bear_markets | QT Ending Bear Markets | Computed canonical | Derived from CoinMetrics/FRED/BGeometrics canonical inputs. |
| quarterly_returns | Quarterly Returns | Special ROI | Event-anchored ROI transform from historical price series. |
| rctc | Realized MarketCap To ThermoCap Ratio (RCTC) | Computed canonical | Derived from CoinMetrics/FRED/BGeometrics canonical inputs. |
| rhodl_ratio | RHODL Ratio | BGeometrics file | rhodl.json |
| rhodl_waves | RHODL Waves | BGeometrics file | rhodl_1m.json |
| roi_after_bottom_multiple | ROI After Bottom (Multiple Coins) | Special ROI | Event-anchored ROI transform from historical price series. |
| roi_after_bottom_pairs | ROI After Bottom (Crypto Pairs) | Special ROI | Event-anchored ROI transform from historical price series. |
| roi_after_cycle_bottom | ROI After Cycle Bottom | Special ROI | Event-anchored ROI transform from historical price series. |
| roi_after_cycle_peak | ROI After Cycle Peak | Special ROI | Event-anchored ROI transform from historical price series. |
| roi_after_halving | ROI After Halving | Special ROI | Event-anchored ROI transform from historical price series. |
| roi_after_inception_multi | ROI After Inception (Multiple Coins) | Special ROI | Event-anchored ROI transform from historical price series. |
| roi_after_inception_pairs | ROI After Inception (Crypto Pairs) | Special ROI | Event-anchored ROI transform from historical price series. |
| roi_after_latest_cycle_peak_multi | ROI After Latest Cycle Peak (Multiple Coins) | Special ROI | Event-anchored ROI transform from historical price series. |
| roi_after_latest_cycle_peak_pairs | ROI After Latest Cycle Peak (Crypto Pairs) | Special ROI | Event-anchored ROI transform from historical price series. |
| roi_after_sub_cycle_bottom | ROI After Sub-Cycle Bottom | Special ROI | Event-anchored ROI transform from historical price series. |
| roi_bands | ROI Bands | Special ROI | Event-anchored ROI transform from historical price series. |
| rsi | Relative Strength Index (RSI) | Special indicator | Standard technical indicator implementation (or dedicated API series). |
| running_roi | Running ROI | Special ROI | Event-anchored ROI transform from historical price series. |
| rvts | Realized Network Value to Transaction Signal (RVTS) | BGeometrics file | nvts_730dma_bg.json |
| short_term_bubble_risk | Short Term Bubble Risk | BGeometrics file | fear_greed.json |
| sma_cycle_top_breakout | SMA Cycle-Top Breakout | Computed canonical | Derived from CoinMetrics/FRED/BGeometrics canonical inputs. |
| sopr | Spent Output Profit Ratio (SOPR) | BGeometrics file | sopr_7sma.json |
| stablecoin_supply_ratio_ssr | Stablecoin Supply Ratio (SSR) | Computed canonical | Derived from CoinMetrics/FRED/BGeometrics canonical inputs. |
| stock_to_flow_s2f | Stock to Flow (S2F) | Computed canonical | Derived from CoinMetrics/FRED/BGeometrics canonical inputs. |
| supertrend | Supertrend | Computed canonical | Derived from CoinMetrics/FRED/BGeometrics canonical inputs. |
| supply_flow_to_exchanges | Supply Flow To Exchanges | Computed canonical | Derived from CoinMetrics/FRED/BGeometrics canonical inputs. |
| supply_held_by_exchanges | Supply Held By Exchanges | Computed canonical | Derived from CoinMetrics/FRED/BGeometrics canonical inputs. |
| supply_in_profit_or_loss | Supply In Profit Or Loss | BGeometrics file | profit_loss.json |
| supply_issued_inflation | Supply Issued & Inflation | Computed canonical | Derived from CoinMetrics/FRED/BGeometrics canonical inputs. |
| supply_revived | Supply Revived | Computed canonical | Derived from CoinMetrics/FRED/BGeometrics canonical inputs. |
| terminal_price | Terminal Price | BGeometrics file | terminal_price.json |
| time_in_risk_bands | Time In Risk Bands | Computed canonical | Days spent in current MVRV risk band (resets to 0 on band change). |
| total_crypto_market_cap_proxy | Total Crypto Market Cap & Trendline | Computed canonical | Derived from CoinMetrics/FRED/BGeometrics canonical inputs. |
| total_crypto_valuation_trendline | Total Crypto Valuation vs. Trendline | Computed canonical | Derived from CoinMetrics/FRED/BGeometrics canonical inputs. |
| transaction_fees | Transaction Fees | Special indicator | Standard technical indicator implementation (or dedicated API series). |
| transfer_count_statistics | Transfer Count Statistics | BGeometrics file | addresses_active.json |
| transfer_flow_to_exchanges | Transfer Flow To Exchanges | Computed canonical | Derived from CoinMetrics/FRED/BGeometrics canonical inputs. |
| transfer_volume | Transfer Volume | Computed canonical | Derived from CoinMetrics/FRED/BGeometrics canonical inputs. |
| twitter_followers_analysts | Twitter Followers (Analysts) | Canonical-only (disabled) | No reliable free historical source integrated yet for this social metric. |
| twitter_followers_exchanges | Twitter Followers (Exchanges) | Canonical-only (disabled) | No reliable free historical source integrated yet for this social metric. |
| twitter_followers_layer1s | Twitter Followers (Layer 1s) | Canonical-only (disabled) | No reliable free historical source integrated yet for this social metric. |
| twitter_tweets | Twitter Tweets | Canonical-only (disabled) | No reliable free historical source integrated yet for this social metric. |
| utxo_age_distribution | UTxO Age Distribution | Computed canonical | Derived from CoinMetrics/FRED/BGeometrics canonical inputs. |
| utxo_supply_distribution | UTxO Supply Distribution | Computed canonical | Derived from CoinMetrics/FRED/BGeometrics canonical inputs. |
| value_days_destroyed_multiple | Value Days Destroyed Multiple | BGeometrics file | vdd_multiple.json |
| velocity | Velocity | Computed canonical | Derived from CoinMetrics/FRED/BGeometrics canonical inputs. |
| volatility | Volatility | Special indicator | Standard technical indicator implementation (or dedicated API series). |
| wikipedia_page_views | Wikipedia Page Views | Computed canonical | Derived from CoinMetrics/FRED/BGeometrics canonical inputs. |
| year_to_date_roi | Year-To-Date ROI | Special ROI | Event-anchored ROI transform from historical price series. |
| youtube_subscribers | YouTube Subscribers | Canonical-only (disabled) | No reliable free historical source integrated yet for this social metric. |
| youtube_views | YouTube Views | Canonical-only (disabled) | No reliable free historical source integrated yet for this social metric. |
