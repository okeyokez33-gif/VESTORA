VESTORA — BYBIT-INSPIRED MARKETS PATCH

This is an add-on patch for the current VESTORA source. It is NOT a complete replacement for your website.

FILES
- markets.js: public market prices, coin list, candlestick charts, intervals, search and watchlist.
- markets.css: responsive exchange-style market layout.
- markets-section.html: replacement markup for the current placeholder Markets section.
- INSTALL.txt: exact integration steps.

IMPORTANT
- The market data uses Binance public spot market endpoints. It does not place trades.
- Prices refresh every 10 seconds. Candles load from the selected interval.
- The chart library is loaded from a public CDN.
- Network/API availability can vary by region and provider policy. If the feed is blocked, the page will show an unavailable message rather than invented prices.
- The USDT row uses the USDC/USDT market as an indicative reciprocal value. It is not a separate USDT/USD exchange pair.
- Coin logos load from CoinCap's public icon CDN.
- Watchlist is stored locally in the visitor's browser.
- This patch does not alter Supabase, login, Face ID/passkeys, wallets, deposits, or admin functions.
