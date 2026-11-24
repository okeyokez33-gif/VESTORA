VESTORA markets.js replacement

1. In your GitHub repository, open markets.js.
2. Replace the entire contents with the markets.js file in this ZIP.
3. Commit the change.
4. Wait for Render to deploy, then hard-refresh VESTORA.

This version:
- Tries multiple Binance public API hosts for prices and candles.
- Makes a normal click select a coin and load its chart.
- Keeps double-click watchlist behavior.
- Shows VST as an internal asset without inventing a public price or chart.
- Displays a clear message if all market-data hosts are unreachable.

The script was checked for JavaScript syntax. Live API behavior still needs to be verified in your browser.
