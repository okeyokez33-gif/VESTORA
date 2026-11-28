(()=>{
  "use strict";

  const symbols = [
    ["BTC","Bitcoin"],["ETH","Ethereum"],["BNB","BNB"],["SOL","Solana"],
    ["XRP","XRP"],["USDT","Tether"],["USDC","USD Coin"],["TRX","TRON"],
    ["DOGE","Dogecoin"],["ADA","Cardano"],
    ["AVAX","Avalanche"],["LINK","Chainlink"],["DOT","Polkadot"],
    ["BCH","Bitcoin Cash"],["LTC","Litecoin"],["NEAR","NEAR Protocol"],
    ["UNI","Uniswap"],["APT","Aptos"],["ARB","Arbitrum"],
    ["OP","Optimism"],["FIL","Filecoin"],["ATOM","Cosmos"],
    ["ETC","Ethereum Classic"],["XLM","Stellar"],["ICP","Internet Computer"],
    ["HBAR","Hedera"],["VET","VeChain"],["MKR","Maker"],
    ["AAVE","Aave"],["GRT","The Graph"],["ALGO","Algorand"],
    ["SAND","The Sandbox"],["MANA","Decentraland"],["AXS","Axie Infinity"],
    ["EOS","EOS"],["XTZ","Tezos"],["THETA","Theta Network"],
    ["EGLD","MultiversX"],["FLOW","Flow"],["CHZ","Chiliz"],
    ["APE","ApeCoin"],["CRV","Curve DAO"],["SNX","Synthetix"],
    ["COMP","Compound"],["DYDX","dYdX"],["RUNE","THORChain"],
    ["KAVA","Kava"],["ZEC","Zcash"],["DASH","Dash"],
    ["XMR","Monero"],["IOTA","IOTA"],["NEO","NEO"],
    ["QTUM","Qtum"],["ZIL","Zilliqa"],["ENJ","Enjin Coin"],
    ["BAT","Basic Attention Token"],["1INCH","1inch"],
    ["ANKR","Ankr"],["SUSHI","SushiSwap"],["YFI","yearn.finance"],
    ["MASK","Mask Network"],["ENS","Ethereum Name Service"],
    ["LDO","Lido DAO"],["RPL","Rocket Pool"],["IMX","Immutable"],
    ["GALA","Gala"],["ROSE","Oasis Network"],["CELO","Celo"],
    ["MINA","Mina"],["KSM","Kusama"],["DCR","Decred"],
    ["WAVES","Waves"],["ONT","Ontology"],["ICX","ICON"],
    ["RVN","Ravencoin"],["SC","Siacoin"],["ZEN","Horizen"],
    ["BAND","Band Protocol"],["STORJ","Storj"],["SKL","SKALE"],
    ["COTI","COTI"],["AUDIO","Audius"],["API3","API3"],
    ["OCEAN","Ocean Protocol"],["FET","Artificial Superintelligence"],
    ["AGIX","SingularityNET"],["WLD","Worldcoin"],
    ["JASMY","JasmyCoin"],["PEPE","Pepe"],["SHIB","Shiba Inu"],
    ["FLOKI","FLOKI"],["BONK","Bonk"],["WIF","dogwifhat"],
    ["ORDI","ORDI"],["SUI","Sui"],["SEI","Sei"],
    ["TIA","Celestia"],["INJ","Injective"],["JUP","Jupiter"],
    ["PYTH","Pyth Network"],["STRK","Starknet"],
    ["ONDO","Ondo"],["ENA","Ethena"],["TON","Toncoin"],
    ["POL","Polygon"],["PENDLE","Pendle"],["EIGEN","EigenLayer"]
  ];

  const assets=symbols.map(([symbol,name])=>({
    symbol,
    name,
    pair:symbol+"USDT",
    icon:symbol.toLowerCase()
  }));

  assets.splice(10,0,{
    symbol:"VST",
    name:"Vestora Coin",
    internal:true
  });

  const BYBIT_APIS=[
    "https://api.bybit.com",
    "https://api.bytick.com"
  ];

  const BYBIT_WS="wss://stream.bybit.com/v5/public/spot";

  const $=id=>document.getElementById(id);

  let selected="BTC";
  let interval="1m";
  let tickers={};
  let chart=null;
  let candleSeries=null;
  let watchOnly=false;
  let watch=new Set();
  let refreshTimer=null;
  let candleRequest=0;
  let resizeObserver=null;

  let liveSocket=null;
  let reconnectTimer=null;
  let heartbeatTimer=null;
  let socketGeneration=0;

  let marketSocket=null;
  let marketReconnectTimer=null;
  let marketHeartbeatTimer=null;
  let marketSocketGeneration=0;
  let marketSubscriptionSignature="";
  let marketReconnectAttempts=0;

  let tickerPromise=null;
  let priceSource="Bybit";
  let chartLoading=false;
  let liveCandle=null;
  let homePreviewInitialized=false;

  const HOME_COINS=[
    "BTC","ETH","BNB","SOL","XRP",
    "DOGE","ADA","LINK","TRX","AVAX"
  ];

  const fmt=n=>!Number.isFinite(n)?"—":
    n>=1000?n.toLocaleString("en-US",{
      minimumFractionDigits:2,
      maximumFractionDigits:2
    }):
    n>=1?n.toLocaleString("en-US",{
      minimumFractionDigits:2,
      maximumFractionDigits:4
    }):
    n.toLocaleString("en-US",{
      minimumFractionDigits:4,
      maximumFractionDigits:8
    });

  const money=n=>"$"+fmt(n);
  const icon=a=>"https://assets.coincap.io/assets/icons/"+a.icon+"@2x.png";
  const pairFor=s=>assets.find(a=>a.symbol===s)||assets[0];

  function setText(id,value){
    const el=$(id);
    if(el)el.textContent=value;
  }

  // BYBIT HTTP REQUEST WITH BACKUP ENDPOINT

  async function bybitRequest(path){
    const controllers=BYBIT_APIS.map(
      ()=>new AbortController()
    );

    const requests=BYBIT_APIS.map(async(base,index)=>{
      const controller=controllers[index];
      const timeout=setTimeout(
        ()=>controller.abort(),
        25000
      );

      try{
        const response=await fetch(base+path,{
          method:"GET",
          mode:"cors",
          cache:"no-store",
          headers:{"Accept":"application/json"},
          signal:controller.signal
        });

        if(!response.ok){
          throw new Error("Bybit HTTP "+response.status);
        }

        const result=await response.json();

        if(result.retCode!==0){
          throw new Error(
            result.retMsg||"Bybit API request failed"
          );
        }

        return result.result;

      }finally{
        clearTimeout(timeout);
      }
    });

    try{
      return await Promise.any(requests);
    }finally{
      controllers.forEach(controller=>{
        if(!controller.signal.aborted){
          controller.abort();
        }
      });
    }
  }

  // INTERVAL CONVERSION

  function bybitInterval(value){
    const map={
      "1m":"1","3m":"3","5m":"5","15m":"15",
      "30m":"30","1h":"60","2h":"120","4h":"240",
      "6h":"360","12h":"720","1d":"D","1w":"W","1M":"M"
    };

    return map[value]||"1";
  }

  // UPDATE A TICKER FROM BYBIT DATA

  function applyTicker(item){
    if(!item||!item.symbol)return;

    const price=Number(item.lastPrice);
    if(!Number.isFinite(price)||price<=0)return;

    const existing=tickers[item.symbol]||{
      symbol:item.symbol
    };

    existing.lastPrice=String(price);

    const change=Number(item.price24hPcnt);

    if(Number.isFinite(change)){
      existing.priceChangePercent=String(change*100);
    }

    if(item.highPrice24h){
      existing.highPrice=String(item.highPrice24h);
    }

    if(item.lowPrice24h){
      existing.lowPrice=String(item.lowPrice24h);
    }

    if(item.turnover24h){
      existing.quoteVolume=String(item.turnover24h);
    }

    tickers[item.symbol]=existing;
  }

  // LOAD BYBIT HISTORICAL TICKERS

  async function loadTickers(){
    if(tickerPromise)return tickerPromise;

    tickerPromise=(async()=>{
      try{
        const result=await bybitRequest(
          "/v5/market/tickers?category=spot"
        );

        if(!Array.isArray(result.list)||!result.list.length){
          throw new Error("No Bybit ticker data returned");
        }

        const updated={};

        result.list.forEach(item=>{
          if(!item.symbol)return;

          const price=Number(item.lastPrice);
          if(!Number.isFinite(price)||price<=0)return;

          const change=Number(item.price24hPcnt);

          updated[item.symbol]={
            symbol:item.symbol,
            lastPrice:String(price),
            priceChangePercent:String(
              Number.isFinite(change)?change*100:0
            ),
            highPrice:String(item.highPrice24h||0),
            lowPrice:String(item.lowPrice24h||0),
            quoteVolume:String(item.turnover24h||0)
          };
        });

        tickers=updated;

        tickers.USDTUSDT={
          symbol:"USDTUSDT",
          lastPrice:"1",
          priceChangePercent:"0",
          highPrice:"1",
          lowPrice:"1",
          quoteVolume:"0"
        };

        ["BTC","ETH","BNB","SOL"].forEach(s=>{
          const t=tickers[s+"USDT"];
          setText(
            "ticker"+s,
            t?money(Number(t.lastPrice)):"—"
          );
        });

        updatePair();
        renderRows();
        renderHomeRows();
        startAllTickerStream();

        setText(
          "marketStatus",
          "Live market prices connected · Bybit Spot"
        );

        priceSource="Bybit";

      }catch(error){
        console.error("Bybit ticker error:",error);

        setText(
          "marketStatus",
          "Market connection unavailable · Retrying automatically"
        );

        renderHomeRows();

      }finally{
        tickerPromise=null;
      }
    })();

    return tickerPromise;
  }

  function tickerFor(asset){
    if(!asset||asset.internal)return null;

    if(asset.symbol==="USDT"){
      return tickers.USDTUSDT||null;
    }

    return tickers[asset.pair]||null;
  }

  // HOMEPAGE MARKET PREVIEW

  function renderHomeRows(){
    const container=$("homeMarketRows");
    if(!container)return;

    const homeAssets=HOME_COINS
      .map(symbol=>pairFor(symbol))
      .filter(asset=>asset&&!asset.internal);

    const available=homeAssets.filter(asset=>
      tickerFor(asset)
    );

    if(!available.length){
      container.innerHTML=
        '<p class="home-market-loading">Connecting to live market prices…</p>';
      return;
    }

    container.innerHTML=available.map(asset=>{
      const ticker=tickerFor(asset);
      const price=Number(ticker.lastPrice);
      const change=Number(ticker.priceChangePercent);
      const positive=Number.isFinite(change)&&change>=0;

      return `
        <button type="button"
                class="home-market-item"
                data-home-coin="${asset.symbol}"
                aria-label="Open ${asset.name} chart">
          <span class="home-market-coin">
            <img src="${icon(asset)}"
                 alt=""
                 onerror="this.style.visibility='hidden'">
            <span>
              <strong>${asset.symbol}</strong>
              <small>${asset.name}</small>
            </span>
          </span>

          <span class="home-market-price">
            <strong>${Number.isFinite(price)?money(price):"—"}</strong>
            <small class="${positive?"positive":"negative"}">
              ${Number.isFinite(change)?
                (change>=0?"+":"")+change.toFixed(2)+"%":"—"}
            </small>
          </span>
        </button>
      `;
    }).join("");
  }

  function initHomePreview(){
    if(homePreviewInitialized)return;
    homePreviewInitialized=true;

    const container=$("homeMarketRows");

    if(container){
      container.addEventListener("click",event=>{
        const button=event.target.closest("[data-home-coin]");
        if(!button)return;

        const symbol=button.dataset.homeCoin;
        if(!symbol)return;

        const marketsButton=document.querySelector(
          '[data-page="markets"]'
        );

        if(marketsButton){
          marketsButton.click();
        }

        // Allow the Markets page to become visible before
        // creating the selected coin's chart.
        setTimeout(()=>{
          selectCoin(symbol);
        },300);
      });
    }

    // Public prices can load while the user is on the homepage.
    // This does not load a chart until a coin is selected.
    if(container){
      loadTickers();
    }
  }

  // ALL COIN LIVE TICKER WEBSOCKET

  function stopAllTickerStream(){
    marketSocketGeneration++;

    if(marketSocket){
      try{
        marketSocket.onclose=null;
        marketSocket.close();
      }catch(error){}

      marketSocket=null;
    }

    if(marketHeartbeatTimer){
      clearInterval(marketHeartbeatTimer);
      marketHeartbeatTimer=null;
    }

    if(marketReconnectTimer){
      clearTimeout(marketReconnectTimer);
      marketReconnectTimer=null;
    }
  }

  function startAllTickerStream(){
    const availableAssets=assets.filter(a=>
      !a.internal&&
      a.symbol!=="USDT"&&
      a.pair&&
      tickers[a.pair]
    );

    const topics=availableAssets.map(a=>
      "tickers."+a.pair
    );

    if(!topics.length){
      console.warn("No supported Bybit spot ticker pairs found.");
      return;
    }

    const signature=topics.join("|");

    if(
      signature===marketSubscriptionSignature&&
      marketSocket&&
      (
        marketSocket.readyState===WebSocket.OPEN||
        marketSocket.readyState===WebSocket.CONNECTING
      )
    ){
      return;
    }

    marketSubscriptionSignature=signature;
    stopAllTickerStream();

    const generation=marketSocketGeneration;

    try{
      marketSocket=new WebSocket(BYBIT_WS);
    }catch(error){
      console.error("All-market WebSocket error:",error);
      scheduleMarketReconnect();
      return;
    }

    marketSocket.onopen=()=>{
      if(generation!==marketSocketGeneration)return;

      marketReconnectAttempts=0;

      const batches=[];

      for(let i=0;i<topics.length;i+=10){
        batches.push(topics.slice(i,i+10));
      }

      batches.forEach((batch,index)=>{
        setTimeout(()=>{
          if(
            generation!==marketSocketGeneration||
            !marketSocket||
            marketSocket.readyState!==WebSocket.OPEN
          ){
            return;
          }

          marketSocket.send(JSON.stringify({
            op:"subscribe",
            args:batch
          }));

        },index*100);
      });

      marketHeartbeatTimer=setInterval(()=>{
        if(
          marketSocket&&
          marketSocket.readyState===WebSocket.OPEN
        ){
          marketSocket.send(JSON.stringify({
            op:"ping"
          }));
        }
      },20000);

      setText(
        "marketStatus",
        "Connecting live prices for "+topics.length+" Bybit markets…"
      );
    };

    marketSocket.onmessage=event=>{
      if(generation!==marketSocketGeneration)return;

      try{
        const message=JSON.parse(event.data);

        if(message.op==="subscribe"){
          if(message.success===false){
            console.warn(
              "Bybit ticker subscription failed:",
              message.ret_msg
            );
          }
          return;
        }

        if(
          typeof message.topic==="string"&&
          message.topic.startsWith("tickers.")
        ){
          if(Array.isArray(message.data)){
            message.data.forEach(applyTicker);
          }else if(message.data){
            applyTicker(message.data);
          }
        }

      }catch(error){
        console.error(
          "All-market ticker message error:",
          error
        );
      }
    };

    marketSocket.onerror=error=>{
      if(generation===marketSocketGeneration){
        console.warn("All-market WebSocket interrupted:",error);
      }
    };

    marketSocket.onclose=()=>{
      if(generation!==marketSocketGeneration)return;

      if(marketHeartbeatTimer){
        clearInterval(marketHeartbeatTimer);
        marketHeartbeatTimer=null;
      }

      scheduleMarketReconnect();
    };
  }

  function scheduleMarketReconnect(){
    if(marketReconnectTimer){
      clearTimeout(marketReconnectTimer);
    }

    marketReconnectAttempts++;

    const delay=Math.min(
      15000,
      2000*marketReconnectAttempts
    );

    setText(
      "marketStatus",
      "Bybit market feed reconnecting…"
    );

    marketReconnectTimer=setTimeout(()=>{
      if(
        $("marketCoinRows")||
        $("homeMarketRows")
      ){
        marketSubscriptionSignature="";
        startAllTickerStream();
      }
    },delay);
  }

  // REFRESH DISPLAYED PRICES USING REAL RECEIVED DATA

  function refreshVisiblePrices(){
    const container=$("marketCoinRows");

    if(container){
      container.querySelectorAll(
        ".market-coin-row[data-coin]"
      ).forEach(row=>{
        const symbol=row.dataset.coin;
        const asset=pairFor(symbol);

        if(!asset||asset.internal)return;

        const ticker=tickerFor(asset);
        const priceEl=row.querySelector(".market-row-price");
        const changeEl=row.querySelector(".market-row-change");

        if(!ticker)return;

        const price=Number(ticker.lastPrice);
        const change=Number(ticker.priceChangePercent);

        if(priceEl&&Number.isFinite(price)){
          priceEl.textContent=money(price);
        }

        if(changeEl&&Number.isFinite(change)){
          changeEl.textContent=
            (change>=0?"+":"")+change.toFixed(2)+"%";

          changeEl.classList.toggle("positive",change>=0);
          changeEl.classList.toggle("negative",change<0);
        }
      });
    }

    updatePair();
    renderHomeRows();
  }

  // WATCHLIST

  function toggleWatch(symbol){
    if(watch.has(symbol))watch.delete(symbol);
    else watch.add(symbol);

    try{
      localStorage.setItem(
        "vestora-market-watch",
        JSON.stringify([...watch])
      );
    }catch(error){}

    renderRows();
  }

  // MARKET COIN LIST

  function renderRows(){
    const container=$("marketCoinRows");
    if(!container)return;

    const q=($("marketSearch")?.value||"")
      .trim()
      .toLowerCase();

    const list=assets.filter(a=>
      (!watchOnly||watch.has(a.symbol))&&
      (
        a.symbol.toLowerCase().includes(q)||
        a.name.toLowerCase().includes(q)||
        (a.pair||"").toLowerCase().includes(q)
      )
    );

    container.innerHTML=list.map(a=>{
      const isWatched=watch.has(a.symbol);

      if(a.internal){
        return `
          <div class="market-coin-row ${a.symbol===selected?"selected":""}"
               data-coin="${a.symbol}" role="button" tabindex="0">
            <span class="market-asset">
              <span class="market-vst-mark">V</span>
              <span><b>VST</b><small>Vestora Coin</small></span>
            </span>
            <span class="market-row-price">Internal</span>
            <span class="market-row-change">Not traded</span>
            <button type="button"
                    class="market-watch-star ${isWatched?"active":""}"
                    data-watch="${a.symbol}"
                    aria-label="Toggle VST wishlist">
              ${isWatched?"★":"☆"}
            </button>
          </div>`;
      }

      const t=tickerFor(a);
      const p=t?Number(t.lastPrice):NaN;
      const c=t?Number(t.priceChangePercent):NaN;

      return `
        <div class="market-coin-row ${a.symbol===selected?"selected":""}"
             data-coin="${a.symbol}" role="button" tabindex="0">
          <span class="market-asset">
            <img src="${icon(a)}" alt=""
                 onerror="this.style.visibility='hidden'">
            <span><b>${a.symbol}</b><small>${a.name}</small></span>
          </span>
          <span class="market-row-price">
            ${Number.isFinite(p)?money(p):"—"}
          </span>
          <span class="market-row-change ${c>=0?"positive":"negative"}">
            ${Number.isFinite(c)?
              (c>=0?"+":"")+c.toFixed(2)+"%":"—"}
          </span>
          <button type="button"
                  class="market-watch-star ${isWatched?"active":""}"
                  data-watch="${a.symbol}"
                  aria-label="Toggle ${a.symbol} wishlist">
            ${isWatched?"★":"☆"}
          </button>
        </div>`;
    }).join("")||
      '<div class="market-empty">No matching coins found.</div>';
  }

  // SELECTED COIN DETAILS

  function updatePair(){
    const a=pairFor(selected);
    if(!a)return;

    const logo=$("marketCoinLogo");

    if(a.internal){
      if(logo)logo.style.visibility="hidden";

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

    if(logo){
      logo.src=icon(a);
      logo.style.visibility="visible";
      logo.onerror=()=>{
        logo.style.visibility="hidden";
      };
    }

    setText("marketPairTitle",a.symbol+" / USDT");
    setText("marketCoinName",a.name+" · Bybit Spot");

    setText(
      "marketCurrentPrice",
      Number.isFinite(p)?money(p):"—"
    );

    setText(
      "marketPriceChange",
      Number.isFinite(c)?
        (c>=0?"+":"")+c.toFixed(2)+"% (24h)":
        "Waiting for price"
    );

    const change=$("marketPriceChange");

    if(change){
      change.className=c>=0?"positive":"negative";
    }

    setText(
      "marketHigh",
      t?money(Number(t.highPrice)):"—"
    );

    setText(
      "marketLow",
      t?money(Number(t.lowPrice)):"—"
    );

    setText(
      "marketVolume",
      t?
        Number(t.quoteVolume).toLocaleString(
          "en-US",
          {maximumFractionDigits:0}
        )+" USDT":
        "—"
    );

    setText(
      "marketChangeStat",
      Number.isFinite(c)?
        (c>=0?"+":"")+c.toFixed(2)+"%":
        "—"
    );

    const stat=$("marketChangeStat");

    if(stat){
      stat.className=c>=0?"positive":"negative";
    }
  }

  // CHART MESSAGES

  function chartMessage(message){
    const el=$("vestoraPriceChart");
    if(!el)return;

    let note=el.querySelector(".chart-loading");

    if(!note){
      note=document.createElement("div");
      note.className="chart-loading";
      el.appendChild(note);
    }

    note.textContent=message;
  }

  // CREATE CHART

  function ensureChart(){
    const el=$("vestoraPriceChart");

    if(!el||!window.LightweightCharts)return false;
    if(chart&&candleSeries)return true;

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

      rightPriceScale:{
        borderColor:"#ffffff18"
      },

      timeScale:{
        borderColor:"#ffffff18",
        timeVisible:true,
        secondsVisible:false
      },

      crosshair:{
        mode:window.LightweightCharts.CrosshairMode
          ?window.LightweightCharts.CrosshairMode.Normal
          :0
      }
    });

    const candleOptions={
      upColor:"#18bd88",
      downColor:"#ef5b76",
      borderUpColor:"#18bd88",
      borderDownColor:"#ef5b76",
      wickUpColor:"#18bd88",
      wickDownColor:"#ef5b76"
    };

    if(typeof chart.addCandlestickSeries==="function"){
      candleSeries=chart.addCandlestickSeries(
        candleOptions
      );
    }else if(
      typeof chart.addSeries==="function"&&
      window.LightweightCharts.CandlestickSeries
    ){
      candleSeries=chart.addSeries(
        window.LightweightCharts.CandlestickSeries,
        candleOptions
      );
    }else{
      chart.remove();
      chart=null;
      throw new Error(
        "Unsupported Lightweight Charts version"
      );
    }

    if(window.ResizeObserver){
      if(resizeObserver)resizeObserver.disconnect();

      resizeObserver=new ResizeObserver(()=>{
        if(chart&&el.clientWidth){
          chart.applyOptions({
            width:el.clientWidth,
            height:Math.max(240,el.clientHeight)
          });
        }
      });

      resizeObserver.observe(el);
    }

    return true;
  }

  // STOP SELECTED COIN WEBSOCKET

  function stopLiveUpdates(){
    socketGeneration++;

    if(liveSocket){
      try{
        liveSocket.onclose=null;
        liveSocket.close();
      }catch(error){}

      liveSocket=null;
    }

    if(heartbeatTimer){
      clearInterval(heartbeatTimer);
      heartbeatTimer=null;
    }

    if(reconnectTimer){
      clearTimeout(reconnectTimer);
      reconnectTimer=null;
    }
  }

  // SELECTED COIN LIVE TRADES AND CANDLESTICKS

  function startLiveUpdates(asset){
    stopLiveUpdates();

    if(!asset||asset.internal||!("WebSocket" in window)){
      return;
    }

    const generation=socketGeneration;
    const candleInterval=bybitInterval(interval);
    const candleTopic="kline."+candleInterval+"."+asset.pair;
    const tradeTopic="publicTrade."+asset.pair;

    let tradeCandle=liveCandle?{...liveCandle}:null;

    function candleStart(timestamp){
      const date=new Date(timestamp);

      if(interval==="1M"){
        return Date.UTC(
          date.getUTCFullYear(),
          date.getUTCMonth(),
          1
        )/1000;
      }

      if(interval==="1w"){
        const day=date.getUTCDay()||7;
        date.setUTCDate(date.getUTCDate()-day+1);
        date.setUTCHours(0,0,0,0);
        return date.getTime()/1000;
      }

      const seconds={
        "1m":60,"3m":180,"5m":300,
        "15m":900,"30m":1800,
        "1h":3600,"2h":7200,
        "4h":14400,"6h":21600,
        "12h":43200,"1d":86400
      }[interval]||60;

      return Math.floor(timestamp/1000/seconds)*seconds;
    }

    function updateFromTrade(trade){
      const price=Number(trade.p);
      const timestamp=Number(trade.T);

      if(
        !Number.isFinite(price)||price<=0||
        !Number.isFinite(timestamp)
      ){
        return;
      }

      const bucket=candleStart(timestamp);

      if(!tradeCandle||bucket>tradeCandle.time){
        tradeCandle={
          time:bucket,
          open:price,
          high:price,
          low:price,
          close:price
        };
      }else if(bucket===tradeCandle.time){
        tradeCandle={
          ...tradeCandle,
          high:Math.max(tradeCandle.high,price),
          low:Math.min(tradeCandle.low,price),
          close:price
        };
      }else{
        return;
      }

      liveCandle={...tradeCandle};

      try{
        if(candleSeries){
          candleSeries.update(tradeCandle);
        }
      }catch(error){
        console.warn("Live trade candle update:",error);
      }

      const existing=tickers[asset.pair];

      if(existing){
        existing.lastPrice=String(price);
      }

      updatePair();
    }

    try{
      liveSocket=new WebSocket(BYBIT_WS);
    }catch(error){
      chartMessage("Unable to connect to Bybit live market data.");
      return;
    }

    liveSocket.onopen=()=>{
      if(generation!==socketGeneration)return;

      liveSocket.send(JSON.stringify({
        op:"subscribe",
        args:[candleTopic,tradeTopic]
      }));

      heartbeatTimer=setInterval(()=>{
        if(
          liveSocket&&
          liveSocket.readyState===WebSocket.OPEN
        ){
          liveSocket.send(JSON.stringify({
            op:"ping"
          }));
        }
      },20000);

      setText(
        "marketStatus",
        "Connecting to Bybit live trades and candles…"
      );
    };

    liveSocket.onmessage=event=>{
      if(generation!==socketGeneration)return;

      try{
        const message=JSON.parse(event.data);

        if(message.op==="subscribe"){
          if(message.success===false){
            console.warn(
              "Bybit chart subscription failed:",
              message.ret_msg
            );
          }
          return;
        }

        if(message.topic===tradeTopic){
          if(Array.isArray(message.data)){
            message.data.forEach(updateFromTrade);
          }
          return;
        }

        if(
          message.topic===candleTopic&&
          Array.isArray(message.data)
        ){
          message.data.forEach(item=>{
            const candle={
              time:Math.floor(Number(item.start)/1000),
              open:Number(item.open),
              high:Number(item.high),
              low:Number(item.low),
              close:Number(item.close)
            };

            if(
              !Number.isFinite(candle.time)||
              !Number.isFinite(candle.open)||
              !Number.isFinite(candle.high)||
              !Number.isFinite(candle.low)||
              !Number.isFinite(candle.close)
            ){
              return;
            }

            try{
              if(candleSeries){
                candleSeries.update(candle);
              }

              tradeCandle=candle;
              liveCandle={...candle};

            }catch(error){
              console.warn("Candle update skipped:",error);
            }
          });

          setText(
            "marketStatus",
            "Live Bybit prices and candlesticks connected · "+asset.symbol
          );
        }

      }catch(error){
        console.error("Bybit chart message error:",error);
      }
    };

    liveSocket.onerror=()=>{
      if(generation===socketGeneration){
        setText(
          "marketStatus",
          "Bybit chart connection interrupted"
        );
      }
    };

    liveSocket.onclose=()=>{
      if(generation!==socketGeneration)return;

      if(heartbeatTimer){
        clearInterval(heartbeatTimer);
        heartbeatTimer=null;
      }

      setText(
        "marketStatus",
        "Bybit chart disconnected · Reconnecting…"
      );

      reconnectTimer=setTimeout(()=>{
        if(
          generation===socketGeneration&&
          selected===asset.symbol
        ){
          startLiveUpdates(asset);
        }
      },4000);
    };
  }

  // LOAD HISTORICAL BYBIT CANDLES

  async function loadCandles(){
    stopLiveUpdates();
    liveCandle=null;

    const requestId=++candleRequest;
    const asset=pairFor(selected);
    const el=$("vestoraPriceChart");

    if(!el)return;

    if(asset.internal){
      if(chart){
        chart.remove();
        chart=null;
        candleSeries=null;
      }

      el.innerHTML=
        '<div class="chart-loading">VST is an internal Vestora asset. Public market charts are not available.</div>';

      return;
    }

    if(!window.LightweightCharts){
      chartMessage(
        "Chart library could not load. Refresh and try again."
      );
      return;
    }

    try{
      if(!ensureChart()){
        chartMessage("Chart area is not ready yet.");
        return;
      }
    }catch(error){
      console.error("Chart creation error:",error);
      chartMessage("Unable to create chart. Check the chart library.");
      return;
    }

    chartMessage("Loading "+asset.symbol+" Bybit historical candles…");
    chartLoading=true;

    const cacheKey=
      "vestora-bybit-candles-"+asset.pair+"-"+interval;

    let hasCached=false;

    try{
      const saved=localStorage.getItem(cacheKey);

      if(saved){
        const cached=JSON.parse(saved);

        if(Array.isArray(cached)&&cached.length){
          candleSeries.setData(cached);
          liveCandle={...cached[cached.length-1]};
          chart.timeScale().fitContent();
          hasCached=true;
          chartMessage("Updating Bybit historical candles…");
        }
      }
    }catch(error){
      console.warn("Bybit candle cache error:",error);
    }

    const apiInterval=bybitInterval(interval);

    try{
      const query=
        "/v5/market/kline?category=spot"+
        "&symbol="+encodeURIComponent(asset.pair)+
        "&interval="+encodeURIComponent(apiInterval)+
        "&limit=100";

      const result=await bybitRequest(query);

      if(requestId!==candleRequest)return;

      if(!Array.isArray(result.list)||!result.list.length){
        throw new Error(
          "No historical candles returned for "+asset.pair
        );
      }

      const candles=result.list.map(k=>({
        time:Math.floor(Number(k[0])/1000),
        open:Number(k[1]),
        high:Number(k[2]),
        low:Number(k[3]),
        close:Number(k[4])
      })).filter(k=>
        Number.isFinite(k.time)&&
        Number.isFinite(k.open)&&
        Number.isFinite(k.high)&&
        Number.isFinite(k.low)&&
        Number.isFinite(k.close)
      ).sort((a,b)=>a.time-b.time);

      if(!candles.length){
        throw new Error("Invalid Bybit candle data");
      }

      candleSeries.setData(candles);
      liveCandle={...candles[candles.length-1]};

      try{
        localStorage.setItem(
          cacheKey,
          JSON.stringify(candles)
        );
      }catch(error){}

      chart.timeScale().fitContent();

      const note=el.querySelector(".chart-loading");
      if(note)note.remove();

      chartLoading=false;

      setText(
        "marketStatus",
        "Bybit historical candles loaded · Connecting live chart"
      );

      startLiveUpdates(asset);

    }catch(error){
      if(requestId!==candleRequest)return;

      chartLoading=false;
      console.error("Bybit historical candle error:",error);

      if(hasCached){
        const note=el.querySelector(".chart-loading");
        if(note)note.remove();

        setText(
          "marketStatus",
          "Showing saved Bybit candles · Historical refresh unavailable"
        );

        startLiveUpdates(asset);

      }else{
        chartMessage(
          "Bybit historical candles unavailable. Please try again."
        );

        setText(
          "marketStatus",
          "Bybit chart data unavailable · Check your connection"
        );
      }
    }
  }

  // SELECT COIN

  async function selectCoin(symbol){
    if(!assets.some(a=>a.symbol===symbol))return;

    if(symbol==="VST"){
      document.querySelector(
        '[data-page="wallet"]'
      )?.click();

      return;
    }

    selected=symbol;

    updatePair();
    renderRows();

    await loadCandles();
  }

  // INITIALISE MARKETS PAGE

  function load(){
    const rows=$("marketCoinRows");
    if(!rows)return;

    initHomePreview();

    if(rows.dataset.ready){
      loadTickers();
      loadCandles();

      if(!refreshTimer){
        refreshTimer=setInterval(
          refreshVisiblePrices,
          1000
        );
      }

      return;
    }

    rows.dataset.ready="1";

    $("marketSearch")?.addEventListener(
      "input",
      renderRows
    );

    $("marketWatchToggle")?.addEventListener("click",()=>{
      watchOnly=!watchOnly;

      $("marketWatchToggle").classList.toggle(
        "active",
        watchOnly
      );

      $("marketWatchToggle").textContent=
        watchOnly?"★ Wishlist":"☆ Wishlist";

      renderRows();
    });

    $("chartIntervals")
      ?.querySelectorAll("[data-interval]")
      .forEach(b=>{
        b.addEventListener("click",()=>{
          interval=b.dataset.interval;

          $("chartIntervals")
            .querySelectorAll("button")
            .forEach(x=>{
              x.classList.toggle(
                "selected",
                x===b
              );
            });

          loadCandles();
        });
      });

    try{
      watch=new Set(
        JSON.parse(
          localStorage.getItem("vestora-market-watch")||"[]"
        )
      );
    }catch(error){
      watch=new Set();
    }

    rows.addEventListener("click",event=>{
      const star=event.target.closest("[data-watch]");

      if(star){
        event.stopPropagation();
        toggleWatch(star.dataset.watch);
        return;
      }

      const row=event.target.closest("[data-coin]");

      if(row){
        selectCoin(row.dataset.coin);
      }
    });

    rows.addEventListener("keydown",event=>{
      if(event.key!=="Enter"&&event.key!==" ")return;

      const row=event.target.closest("[data-coin]");

      if(!row||event.target.closest("[data-watch]")){
        return;
      }

      event.preventDefault();
      selectCoin(row.dataset.coin);
    });

    renderRows();
    renderHomeRows();

    loadTickers();
    loadCandles();

    if(refreshTimer){
      clearInterval(refreshTimer);
    }

    refreshTimer=setInterval(
      refreshVisiblePrices,
      1000
    );

    setInterval(loadTickers,30000);
  }

  // START HOMEPAGE PREVIEW WHEN THE SCRIPT LOADS

  initHomePreview();

  window.VestoraMarkets={
    load,
    selectCoin,
    getCoins:()=>assets.map(a=>({
      symbol:a.symbol,
      name:a.name,
      internal:!!a.internal
    }))
  };

})();
