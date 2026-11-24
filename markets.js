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
    {symbol:"ADA",name:"Cardano",pair:"ADAUSDT",icon:"ada"},
    {symbol:"VST",name:"Vestora Coin",internal:true}
  ];

  const API_HOSTS = [
    "https://api.binance.com",
    "https://api1.binance.com",
    "https://api2.binance.com",
    "https://api3.binance.com",
    "https://api4.binance.com",
    "https://api-gcp.binance.com",
    "https://data-api.binance.vision"
  ];

  const $ = id => document.getElementById(id);

  let selected = "BTC";
  let interval = "1m";
  let tickers = {};
  let chart = null;
  let candleSeries = null;
  let watchOnly = false;
  let watch = new Set();
  let refreshTimer = null;
  let candleRequest = 0;
  let preferredHost = null;

  let liveSocket = null;
  let liveFlushTimer = null;
  let reconnectTimer = null;
  let socketGeneration = 0;
  let liveCandle = null;
  let pendingCandle = null;

  const fmt = n => !Number.isFinite(n) ? "—" :
    n >= 1000 ? n.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2}) :
    n >= 1 ? n.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:4}) :
    n.toLocaleString("en-US",{minimumFractionDigits:4,maximumFractionDigits:6});

  const money = n => "$" + fmt(n);
  const icon = a => "https://assets.coincap.io/assets/icons/" + (a.icon || "vst") + "@2x.png";
  const pairFor = s => assets.find(a => a.symbol === s) || assets[0];

  function setText(id,value) {
    const el=$(id);
    if(el) el.textContent=value;
  }

  // Try market-data servers simultaneously.
  // Remember the first successful server for faster future requests.
  async function fetchFromHosts(path) {
    const hosts = preferredHost
      ? [preferredHost,...API_HOSTS.filter(h => h !== preferredHost)]
      : API_HOSTS;

    const controllers = [];
    const attempts = hosts.map(host => new Promise(async (resolve,reject) => {
      const controller = new AbortController();
      controllers.push(controller);

      const timeout = setTimeout(() => controller.abort(),4500);

      try {
        const response = await fetch(host + path,{
          method:"GET",
          mode:"cors",
          cache:"no-store",
          headers:{"Accept":"application/json"},
          signal:controller.signal
        });

        if(!response.ok) {
          throw new Error("HTTP " + response.status);
        }

        const data = await response.json();
        preferredHost = host;
        resolve(data);

      } catch(error) {
        reject(error);
      } finally {
        clearTimeout(timeout);
      }
    }));

    try {
      const result = await Promise.any(attempts);

      // Stop requests to slower servers after one succeeds.
      controllers.forEach(controller => controller.abort());

      return result;

    } catch(error) {
      throw new Error("All market-data servers failed");
    }
  }

  function tickerFor(asset) {
    if(!asset || asset.internal) return null;

    if(asset.symbol === "USDT") {
      const t=tickers.USDCUSDT;

      return t ? {
        ...t,
        lastPrice:String(1 / Number(t.lastPrice)),
        priceChangePercent:String(-Number(t.priceChangePercent))
      } : null;
    }

    return tickers[asset.pair];
  }

  function renderRows() {
    const container=$("marketCoinRows");
    if(!container) return;

    const q=($("marketSearch")?.value || "").trim().toLowerCase();

    const list=assets.filter(a =>
      (!watchOnly || watch.has(a.symbol)) &&
      (
        a.symbol.toLowerCase().includes(q) ||
        a.name.toLowerCase().includes(q) ||
        (a.pair || "").toLowerCase().includes(q)
      )
    );

    container.innerHTML=list.map(a => {
      if(a.internal) {
        return `<button class="market-coin-row ${a.symbol===selected?"selected":""}" data-coin="${a.symbol}">
          <span class="market-asset">
            <span class="market-vst-mark">V</span>
            <span><b>VST</b><small>Vestora Coin</small></span>
          </span>
          <span class="market-row-price">Internal</span>
          <span class="market-row-change">Not traded</span>
        </button>`;
      }

      const t=tickerFor(a);
      const p=t?Number(t.lastPrice):NaN;
      const c=t?Number(t.priceChangePercent):NaN;

      return `<button class="market-coin-row ${a.symbol===selected?"selected":""}" data-coin="${a.symbol}">
        <span class="market-asset">
          <img src="${icon(a)}" alt="" onerror="this.style.visibility='hidden'">
          <span><b>${a.symbol}</b><small>${a.name}</small></span>
        </span>
        <span class="market-row-price">${Number.isFinite(p)?money(p):"—"}</span>
        <span class="market-row-change ${c>=0?"positive":"negative"}">${Number.isFinite(c)?(c>=0?"+":"")+c.toFixed(2)+"%":"—"}</span>
      </button>`;
    }).join("") || '<div class="market-empty">No matching assets in this view.</div>';
  }

  function updatePair() {
    const a=pairFor(selected);
    if(!a) return;

    const logo=$("marketCoinLogo");

    if(a.internal) {
      if(logo) logo.style.visibility="hidden";

      setText("marketPairTitle","VST");
      setText("marketCoinName","Vestora Coin · Internal asset");
      setText("marketCurrentPrice","—");
      setText("marketPriceChange","Not publicly traded");
      setText("marketHigh","—");
      setText("marketLow","—");
      setText("marketVolume","—");
      setText("marketChangeStat","—");
      return;
    }

    const t=tickerFor(a);
    const p=t?Number(t.lastPrice):NaN;
    const c=t?Number(t.priceChangePercent):NaN;

    if(logo) {
      logo.src=icon(a);
      logo.style.visibility="visible";
      logo.onerror=()=>{logo.style.visibility="hidden";};
    }

    setText("marketPairTitle",a.symbol+" / USDT");
    setText("marketCoinName",a.name+" · Spot market");
    setText("marketCurrentPrice",Number.isFinite(p)?money(p):"—");
    setText("marketPriceChange",Number.isFinite(c)?(c>=0?"+":"")+c.toFixed(2)+"% (24h)":"Waiting for price");

    const change=$("marketPriceChange");
    if(change) change.className=c>=0?"positive":"negative";

    setText("marketHigh",t?money(Number(t.highPrice)):"—");
    setText("marketLow",t?money(Number(t.lowPrice)):"—");
    setText("marketVolume",t?Number(t.quoteVolume).toLocaleString("en-US",{maximumFractionDigits:0})+" USDT":"—");
    setText("marketChangeStat",Number.isFinite(c)?(c>=0?"+":"")+c.toFixed(2)+"%":"—");

    const stat=$("marketChangeStat");
    if(stat) stat.className=c>=0?"positive":"negative";
  }

  async function loadTickers() {
    try {
      const data=await fetchFromHosts("/api/v3/ticker/24hr");

      tickers=Object.fromEntries(data.map(x=>[x.symbol,x]));

      ["BTC","ETH","BNB","SOL"].forEach(s=>{
        const t=tickers[s+"USDT"];
        setText("ticker"+s,t?money(Number(t.lastPrice)):"—");
      });

      updatePair();
      renderRows();

      setText("marketStatus","Prices refresh automatically · Public spot market data");

    } catch(error) {
      setText("marketStatus","Live prices could not connect. Check your network and try again.");
    }
  }

  function chartMessage(message) {
    const el=$("vestoraPriceChart");
    if(!el) return;

    let note=el.querySelector(".chart-loading");

    if(!note) {
      note=document.createElement("div");
      note.className="chart-loading";
      el.appendChild(note);
    }

    note.textContent=message;
  }

  function ensureChart() {
    const el=$("vestoraPriceChart");

    if(!el || !window.LightweightCharts) return false;
    if(chart && candleSeries) return true;

    el.innerHTML="";

    chart=window.LightweightCharts.createChart(el,{
      width:Math.max(300,el.clientWidth),
      height:Math.max(240,el.clientHeight),

      layout:{
        background:{color:"#101729"},
        textColor:"#8995b4",
        fontFamily:"DM Sans, sans-serif"
      },

      grid:{
        vertLines:{color:"#ffffff0a"},
        horzLines:{color:"#ffffff0a"}
      },

      rightPriceScale:{borderColor:"#ffffff18"},

      timeScale:{
        borderColor:"#ffffff18",
        timeVisible:true,
        secondsVisible:false
      },

      crosshair:{
        mode:window.LightweightCharts.CrosshairMode.Normal
      }
    });

    candleSeries=chart.addCandlestickSeries({
      upColor:"#18bd88",
      downColor:"#ef5b76",
      borderUpColor:"#18bd88",
      borderDownColor:"#ef5b76",
      wickUpColor:"#18bd88",
      wickDownColor:"#ef5b76"
    });

    if(window.ResizeObserver) {
      const observer=new ResizeObserver(()=>{
        if(chart && el.clientWidth) {
          chart.applyOptions({
            width:el.clientWidth,
            height:Math.max(240,el.clientHeight)
          });
        }
      });

      observer.observe(el);
    }

    return true;
  }

  function intervalSeconds(value) {
    const match=/^(\d+)(m|h|d)$/.exec(value);
    if(!match) return 60;

    const amount=Number(match[1]);

    return amount * (
      match[2]==="m" ? 60 :
      match[2]==="h" ? 3600 :
      86400
    );
  }

  function stopLiveUpdates() {
    socketGeneration++;

    if(liveSocket) {
      try {
        liveSocket.onclose=null;
        liveSocket.close();
      } catch(error) {}

      liveSocket=null;
    }

    if(liveFlushTimer) {
      clearInterval(liveFlushTimer);
      liveFlushTimer=null;
    }

    if(reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer=null;
    }

    liveCandle=null;
    pendingCandle=null;
  }

  function startLiveUpdates(asset) {
    stopLiveUpdates();

    if(!asset || asset.internal || !("WebSocket" in window)) return;

    const generation=socketGeneration;
    const stream="wss://stream.binance.com:443/ws/"+asset.pair.toLowerCase()+"@aggTrade";

    try {
      liveSocket=new WebSocket(stream);
    } catch(error) {
      setText("marketStatus","Live chart connection could not start.");
      return;
    }

    liveSocket.onopen=()=>{
      if(generation!==socketGeneration) return;
      setText("marketStatus","Live chart connected · Updating every 0.5 seconds");
    };

    liveSocket.onmessage=event=>{
      if(generation!==socketGeneration || selected!==asset.symbol) return;

      try {
        const d=JSON.parse(event.data);
        const price=Number(d.p);
        const time=Number(d.T);

        if(!Number.isFinite(price) || !Number.isFinite(time)) return;

        const seconds=intervalSeconds(interval);
        const candleTime=Math.floor(time/(seconds*1000))*seconds;

        if(!liveCandle || candleTime>liveCandle.time) {
          liveCandle={
            time:candleTime,
            open:price,
            high:price,
            low:price,
            close:price
          };
        } else if(candleTime===liveCandle.time) {
          liveCandle.high=Math.max(liveCandle.high,price);
          liveCandle.low=Math.min(liveCandle.low,price);
          liveCandle.close=price;
        } else {
          return;
        }

        pendingCandle={...liveCandle};

      } catch(error) {}
    };

    liveSocket.onerror=()=>{
      if(generation===socketGeneration) {
        try { liveSocket.close(); } catch(error) {}
      }
    };

    liveSocket.onclose=()=>{
      if(generation!==socketGeneration || selected!==asset.symbol) return;

      setText("marketStatus","Live chart reconnecting…");

      reconnectTimer=setTimeout(()=>{
        if(generation===socketGeneration && selected===asset.symbol) {
          startLiveUpdates(asset);
        }
      },2000);
    };

    if(liveFlushTimer) clearInterval(liveFlushTimer);

    liveFlushTimer=setInterval(()=>{
      if(!pendingCandle || generation!==socketGeneration || !candleSeries) return;

      const candle={...pendingCandle};
      pendingCandle=null;

      try {
        candleSeries.update(candle);
      } catch(error) {}
    },500);
  }

  async function loadCandles() {
    stopLiveUpdates();

    const requestId=++candleRequest;
    const asset=pairFor(selected);
    const el=$("vestoraPriceChart");

    if(!el) return;

    if(asset.internal) {
      if(chart) {
        chart.remove();
        chart=null;
        candleSeries=null;
      }

      el.innerHTML='<div class="chart-loading">VST is an internal Vestora asset. Public market charts and prices are not available.</div>';
      return;
    }

    if(!window.LightweightCharts) {
      chartMessage("Chart library could not be loaded. Refresh the page and try again.");
      return;
    }

    if(!ensureChart()) {
      chartMessage("Chart area is not ready yet.");
      return;
    }

    chartMessage("Loading "+asset.symbol+" chart…");

    try {
      const data=await fetchFromHosts(
        "/api/v3/klines?symbol="+encodeURIComponent(asset.pair)+
        "&interval="+encodeURIComponent(interval)+
        "&limit=160"
      );

      if(requestId!==candleRequest) return;

      if(!Array.isArray(data) || !data.length) {
        throw new Error("No candle data returned");
      }

      const candles=data.map(k=>({
        time:Math.floor(Number(k[0])/1000),
        open:Number(k[1]),
        high:Number(k[2]),
        low:Number(k[3]),
        close:Number(k[4])
      })).filter(k=>
        Number.isFinite(k.time) &&
        Number.isFinite(k.open) &&
        Number.isFinite(k.high) &&
        Number.isFinite(k.low) &&
        Number.isFinite(k.close)
      );

      if(!candles.length) {
        throw new Error("Candle data was invalid");
      }

      candleSeries.setData(candles);

      liveCandle={...candles[candles.length-1]};
      pendingCandle=null;

      chart.timeScale().fitContent();

      const note=el.querySelector(".chart-loading");
      if(note) note.remove();

      // Start the live trade stream after historical candles load.
      startLiveUpdates(asset);

    } catch(error) {
      if(requestId!==candleRequest) return;

      chartMessage("Live chart unavailable from the market-data providers. Please try again shortly.");
      setText("marketStatus","Market chart connection failed. Please try again.");
    }
  }

  async function selectCoin(symbol) {
    if(!assets.some(a=>a.symbol===symbol)) return;

    selected=symbol;

    updatePair();
    renderRows();

    await loadCandles();
  }

  function load() {
    const rows=$("marketCoinRows");
    if(!rows) return;

    if(rows.dataset.ready) {
      loadTickers();
      loadCandles();
      return;
    }

    rows.dataset.ready="1";

    $("marketSearch")?.addEventListener("input",renderRows);

    $("marketWatchToggle")?.addEventListener("click",()=>{
      watchOnly=!watchOnly;

      $("marketWatchToggle").classList.toggle("active",watchOnly);
      $("marketWatchToggle").textContent=watchOnly?"★ Watchlist":"☆ Watchlist";

      renderRows();
    });

    $("chartIntervals")?.querySelectorAll("[data-interval]").forEach(b=>{
      b.addEventListener("click",()=>{
        interval=b.dataset.interval;

        $("chartIntervals").querySelectorAll("button").forEach(x=>{
          x.classList.toggle("selected",x===b);
        });

        loadCandles();
      });
    });

    try {
      watch=new Set(JSON.parse(localStorage.getItem("vestora-market-watch")||"[]"));
    } catch(error) {
      watch=new Set();
    }

    rows.addEventListener("click",event=>{
      const button=event.target.closest("[data-coin]");
      if(!button) return;

      selectCoin(button.dataset.coin);
    });

    rows.addEventListener("dblclick",event=>{
      const button=event.target.closest("[data-coin]");
      if(!button) return;

      const symbol=button.dataset.coin;

      watch.has(symbol) ? watch.delete(symbol) : watch.add(symbol);

      try {
        localStorage.setItem("vestora-market-watch",JSON.stringify([...watch]));
      } catch(error) {}

      renderRows();
    });

    renderRows();

    loadTickers();
    loadCandles();

    if(refreshTimer) clearInterval(refreshTimer);

    refreshTimer=setInterval(loadTickers,15000);
  }

  window.VestoraMarkets={load,selectCoin};
})();
