(() => {
  "use strict";
  const assets = [
    {symbol:"BTC",name:"Bitcoin",pair:"BTCUSDT",icon:"btc"},
    {symbol:"ETH",name:"Ethereum",pair:"ETHUSDT",icon:"eth"},
    {symbol:"BNB",name:"BNB",pair:"BNBUSDT",icon:"bnb"},
    {symbol:"SOL",name:"Solana",pair:"SOLUSDT",icon:"sol"},
    {symbol:"XRP",name:"XRP",pair:"XRPUSDT",icon:"xrp"},
    {symbol:"USDT",name:"Tether",pair:"USDCUSDT",icon:"usdt",stable:true},
    {symbol:"USDC",name:"USD Coin",pair:"USDCUSDT",icon:"usdc"},
    {symbol:"TRX",name:"TRON",pair:"TRXUSDT",icon:"trx"},
    {symbol:"DOGE",name:"Dogecoin",pair:"DOGEUSDT",icon:"doge"},
    {symbol:"ADA",name:"Cardano",pair:"ADAUSDT",icon:"ada"}
  ];
  const $ = id => document.getElementById(id);
  let selected = "BTC", interval = "1m", tickers = {}, chart = null, candleSeries = null;
  let watchOnly = false, watch = new Set(), refreshTimer = null;
  const fmt = n => !Number.isFinite(n) ? "—" :
    n >= 1000 ? n.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2}) :
    n >= 1 ? n.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:4}) :
    n.toLocaleString("en-US",{minimumFractionDigits:4,maximumFractionDigits:6});
  const money = n => "$" + fmt(n);
  const icon = a => "https://assets.coincap.io/assets/icons/" + a.icon + "@2x.png";
  const pairFor = s => assets.find(a => a.symbol === s) || assets[0];
  function tickerFor(a) {
    if (a.symbol === "USDT") {
      const t = tickers.USDCUSDT;
      return t ? {...t,lastPrice:String(1/Number(t.lastPrice)),priceChangePercent:String(-Number(t.priceChangePercent))} : null;
    }
    return tickers[a.pair];
  }
  function setText(id,value) { const el=$(id); if(el) el.textContent=value; }
  function renderRows() {
    const q = ($("marketSearch")?.value || "").trim().toLowerCase();
    const list = assets.filter(a =>
      (!watchOnly || watch.has(a.symbol)) &&
      (a.symbol.toLowerCase().includes(q) || a.name.toLowerCase().includes(q) || a.pair.toLowerCase().includes(q))
    );
    $("marketCoinRows").innerHTML = list.map(a => {
      const t=tickerFor(a), p=t?Number(t.lastPrice):NaN, c=t?Number(t.priceChangePercent):NaN;
      return `<button class="market-coin-row ${a.symbol===selected?"selected":""}" data-coin="${a.symbol}">
        <span class="market-asset"><img src="${icon(a)}" alt="" onerror="this.style.visibility='hidden'">
        <span><b>${a.symbol}</b><small>${a.name}</small></span></span>
        <span class="market-row-price">${Number.isFinite(p)?money(p):"—"}</span>
        <span class="market-row-change ${c>=0?"positive":"negative"}">${Number.isFinite(c)?(c>=0?"+":"")+c.toFixed(2)+"%":"—"}</span>
      </button>`;
    }).join("") || '<div class="market-empty">No matching assets in this view.</div>';
  }
  function updatePair() {
    const a=pairFor(selected), t=tickerFor(a), p=t?Number(t.lastPrice):NaN, c=t?Number(t.priceChangePercent):NaN;
    $("marketCoinLogo").src=icon(a);
    $("marketCoinLogo").onerror=()=>$("marketCoinLogo").style.visibility="hidden";
    $("marketCoinLogo").style.visibility="visible";
    setText("marketPairTitle",a.symbol+" / USDT");
    setText("marketCoinName",a.name+" · Spot market");
    setText("marketCurrentPrice",Number.isFinite(p)?money(p):"—");
    setText("marketPriceChange",Number.isFinite(c)?(c>=0?"+":"")+c.toFixed(2)+"% (24h)":"Waiting for price");
    $("marketPriceChange").className=c>=0?"positive":"negative";
    setText("marketHigh",t?money(Number(t.highPrice)):"—");
    setText("marketLow",t?money(Number(t.lowPrice)):"—");
    setText("marketVolume",t?Number(t.quoteVolume).toLocaleString("en-US",{maximumFractionDigits:0})+" USDT":"—");
    setText("marketChangeStat",Number.isFinite(c)?(c>=0?"+":"")+c.toFixed(2)+"%":"—");
    $("marketChangeStat").className=c>=0?"positive":"negative";
  }
  async function loadTickers() {
    try {
      const r=await fetch("https://api.binance.com/api/v3/ticker/24hr");
      if(!r.ok) throw Error("Market feed returned "+r.status);
      const data=await r.json();
      tickers=Object.fromEntries(data.map(x=>[x.symbol,x]));
      ["BTC","ETH","BNB","SOL"].forEach(s=>{
        const t=tickers[s+"USDT"]; setText("ticker"+s,t?money(Number(t.lastPrice)):"—");
      });
      updatePair(); renderRows();
      setText("marketStatus","Prices refresh automatically · Public spot market data");
    } catch(e) {
      setText("marketStatus","Live market feed is temporarily unavailable. Please refresh shortly.");
    }
  }
  function ensureChart() {
    const el=$("vestoraPriceChart");
    if(!el || !window.LightweightCharts) return;
    if(chart) return;
    el.innerHTML="";
    chart=LightweightCharts.createChart(el,{
      width:el.clientWidth,height:el.clientHeight,
      layout:{background:{color:"#101729"},textColor:"#8995b4",fontFamily:"DM Sans, sans-serif"},
      grid:{vertLines:{color:"#ffffff0a"},horzLines:{color:"#ffffff0a"}},
      rightPriceScale:{borderColor:"#ffffff18"},
      timeScale:{borderColor:"#ffffff18",timeVisible:true,secondsVisible:false},
      crosshair:{mode:LightweightCharts.CrosshairMode.Normal}
    });
    candleSeries=chart.addCandlestickSeries({
      upColor:"#18bd88",downColor:"#ef5b76",
      borderUpColor:"#18bd88",borderDownColor:"#ef5b76",
      wickUpColor:"#18bd88",wickDownColor:"#ef5b76"
    });
    if(window.ResizeObserver) new ResizeObserver(()=>{
      if(chart) chart.applyOptions({width:el.clientWidth,height:el.clientHeight});
    }).observe(el);
  }
  async function loadCandles() {
    const a=pairFor(selected);
    if(!window.LightweightCharts) {
      $("vestoraPriceChart").innerHTML='<div class="chart-loading">Chart library could not be loaded.</div>';
      return;
    }
    ensureChart();
    $("vestoraPriceChart").style.opacity=".55";
    try {
      const r=await fetch("https://api.binance.com/api/v3/klines?symbol="+a.pair+"&interval="+interval+"&limit=160");
      if(!r.ok) throw Error("Chart data unavailable");
      const data=await r.json();
      const candles=data.map(k=>({time:Math.floor(k[0]/1000),open:Number(k[1]),high:Number(k[2]),low:Number(k[3]),close:Number(k[4])}));
      candleSeries.setData(candles);
      chart.timeScale().fitContent();
      $("vestoraPriceChart").style.opacity="1";
    } catch(e) {
      $("vestoraPriceChart").innerHTML='<div class="chart-loading">Chart data is temporarily unavailable.</div>';
      chart=null; candleSeries=null;
    }
  }
  async function selectCoin(symbol) {
    selected=symbol; updatePair(); renderRows(); await loadCandles();
  }
  function load() {
    if($("marketCoinRows").dataset.ready) return;
    $("marketCoinRows").dataset.ready="1";
    $("marketSearch").addEventListener("input",renderRows);
    $("marketWatchToggle").addEventListener("click",()=>{
      watchOnly=!watchOnly;
      $("marketWatchToggle").classList.toggle("active",watchOnly);
      $("marketWatchToggle").textContent=watchOnly?"★ Watchlist":"☆ Watchlist";
      renderRows();
    });
    $("chartIntervals").querySelectorAll("[data-interval]").forEach(b=>b.addEventListener("click",()=>{
      interval=b.dataset.interval;
      $("chartIntervals").querySelectorAll("button").forEach(x=>x.classList.toggle("selected",x===b));
      loadCandles();
    }));
    try { watch=new Set(JSON.parse(localStorage.getItem("vestora-market-watch")||"[]")); } catch(e) {}
    $("marketCoinRows").addEventListener("dblclick",e=>{
      const b=e.target.closest("[data-coin]"); if(!b) return;
      watch.has(b.dataset.coin)?watch.delete(b.dataset.coin):watch.add(b.dataset.coin);
      localStorage.setItem("vestora-market-watch",JSON.stringify([...watch]));
      renderRows();
    });
    loadTickers(); loadCandles();
    if(refreshTimer) clearInterval(refreshTimer);
    refreshTimer=setInterval(loadTickers,10000);
  }
  window.VestoraMarkets={load,selectCoin};
})();
