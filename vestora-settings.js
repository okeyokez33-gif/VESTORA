(()=>{
  "use strict";

  const cfg=window.VESTORA_CONFIG;
  if(!cfg||!window.supabase)return;

  const sb=window.supabase.createClient(
    cfg.SUPABASE_URL,
    cfg.SUPABASE_ANON_KEY,
    {auth:{experimental:{passkey:true}}}
  );

  const $=id=>document.getElementById(id);

  const toast=msg=>{
    let t=$("toast");
    if(!t){
      t=document.createElement("div");
      t.id="toast";
      document.body.appendChild(t);
    }
    t.textContent=msg;
    t.classList.add("show");
    setTimeout(()=>t.classList.remove("show"),3800);
  };

  let currentUser=null;
  let passkeyBusy=false;

  // =====================================================
  // BTC WALLET-PANEL CHART
  // Uses Bybit historical BTCUSDT candles.
  // Does not read or modify wallet balances.
  // =====================================================

  const BYBIT_ENDPOINTS=[
    "https://api.bybit.com",
    "https://api.bytick.com"
  ];

  let btcChartRequest=0;
  let btcChartTimer=null;
  let btcChartInitialized=false;

  const btcRanges={
    "1D":{interval:"5",limit:288,duration:86400000},
    "1W":{interval:"30",limit:336,duration:7*86400000},
    "1M":{interval:"60",limit:720,duration:30*86400000},
    "3M":{interval:"240",limit:540,duration:90*86400000},
    "1Y":{interval:"D",limit:365,duration:365*86400000},
    "ALL":{interval:"D",limit:1000,duration:null}
  };

  function btcMoney(value){
    return "$"+Number(value).toLocaleString("en-US",{
      minimumFractionDigits:2,
      maximumFractionDigits:2
    });
  }

  function selectedBtcRange(){
    const selected=document.querySelector(
      "#portfolioIntervals [data-range].selected"
    );

    return selected?.dataset.range||"1D";
  }

  async function getBybitBTC(interval,limit,duration){
    const end=Date.now();
    const start=duration
      ?end-duration
      :end-(1000*86400000);

    const params=new URLSearchParams({
      category:"spot",
      symbol:"BTCUSDT",
      interval:String(interval),
      start:String(start),
      end:String(end),
      limit:String(limit)
    });

    const path="/v5/market/kline?"+params.toString();

    const requests=BYBIT_ENDPOINTS.map(async base=>{
      const controller=new AbortController();
      const timeout=setTimeout(()=>controller.abort(),18000);

      try{
        const response=await fetch(base+path,{
          method:"GET",
          mode:"cors",
          cache:"no-store",
          headers:{Accept:"application/json"},
          signal:controller.signal
        });

        if(!response.ok){
          throw new Error("Bybit HTTP "+response.status);
        }

        const result=await response.json();

        if(result.retCode!==0){
          throw new Error(result.retMsg||"Bybit request failed");
        }

        return result.result?.list||[];

      }finally{
        clearTimeout(timeout);
      }
    });

    return await Promise.any(requests);
  }

  function drawBTCChart(candles,range){
    const svg=$("portfolioChart");
    const status=$("portfolioChartStatus");

    if(!svg||!status)return;

    const points=candles
      .map(c=>({
        time:Number(c[0]),
        price:Number(c[4])
      }))
      .filter(p=>
        Number.isFinite(p.time)&&
        Number.isFinite(p.price)&&
        p.price>0
      )
      .sort((a,b)=>a.time-b.time);

    if(!points.length){
      showBTCChartMessage(
        "No Bitcoin history returned",
        "Please try again shortly."
      );
      return;
    }

    const width=900;
    const height=230;
    const left=78;
    const right=25;
    const top=20;
    const bottom=35;

    const prices=points.map(p=>p.price);
    let min=Math.min(...prices);
    let max=Math.max(...prices);

    if(min===max){
      const padding=Math.max(min*0.002,1);
      min-=padding;
      max+=padding;
    }

    const x=index=>{
      if(points.length===1)return left;
      return left+
        index/(points.length-1)*(width-left-right);
    };

    const y=value=>
      top+(max-value)/(max-min)*(height-top-bottom);

    const path=points.map((p,i)=>
      (i===0?"M":"L")+
      x(i).toFixed(2)+" "+
      y(p.price).toFixed(2)
    ).join(" ");

    const area=path+
      ` L ${x(points.length-1)} ${height-bottom}`+
      ` L ${left} ${height-bottom} Z`;

    const grid=[0,1,2,3].map(i=>{
      const gy=top+i*(height-top-bottom)/3;
      const value=max-i*(max-min)/3;

      return `
        <line
          x1="${left}" y1="${gy}"
          x2="${width-right}" y2="${gy}"
          stroke="#ffffff18"
          stroke-dasharray="4 6"
        />
        <text
          x="${left-10}" y="${gy+4}"
          text-anchor="end"
          fill="#aab4ca"
          font-size="11"
        >${btcMoney(value)}</text>
      `;
    }).join("");

    const first=points[0];
    const last=points[points.length-1];

    const dateLabel=time=>new Date(time).toLocaleDateString(
      undefined,
      {month:"short",day:"numeric",year:"2-digit"}
    );

    const latestX=x(points.length-1);
    const latestY=y(last.price);

    svg.innerHTML=`
      <defs>
        <linearGradient
          id="btcWalletArea"
          x1="0" y1="0" x2="0" y2="1"
        >
          <stop offset="0%" stop-color="#d9b45f" stop-opacity=".30"/>
          <stop offset="100%" stop-color="#d9b45f" stop-opacity="0"/>
        </linearGradient>
      </defs>

      ${grid}

      <path
        d="${area}"
        fill="url(#btcWalletArea)"
      />

      <path
        d="${path}"
        fill="none"
        stroke="#e2bd68"
        stroke-width="3"
        stroke-linecap="round"
        stroke-linejoin="round"
      />

      <circle
        cx="${latestX}"
        cy="${latestY}"
        r="5"
        fill="#f0d58e"
        stroke="#101622"
        stroke-width="3"
      />

      <text
        x="${left}"
        y="${height-8}"
        fill="#aab4ca"
        font-size="10"
      >${dateLabel(first.time)}</text>

      <text
        x="${width-right}"
        y="${height-8}"
        text-anchor="end"
        fill="#aab4ca"
        font-size="10"
      >${dateLabel(last.time)}</text>
    `;

    svg.setAttribute(
      "aria-label",
      "Bitcoin BTC USDT historical market price chart"
    );

    status.textContent=
      "BTC / USD market history · "+
      points.length+" Bybit price records · "+
      "Latest: "+btcMoney(last.price)+
      " · "+range;
  }

  function showBTCChartMessage(title,subtitle){
    const svg=$("portfolioChart");
    const status=$("portfolioChartStatus");

    if(svg){
      svg.innerHTML=`
        <text
          x="450" y="105"
          text-anchor="middle"
          fill="#dce3f3"
          font-size="16"
        >${title}</text>

        <text
          x="450" y="132"
          text-anchor="middle"
          fill="#929bb8"
          font-size="12"
        >${subtitle}</text>
      `;
    }

    if(status)status.textContent=title;
  }

  async function loadBTCChart(){
    const svg=$("portfolioChart");
    if(!svg)return;

    const request=++btcChartRequest;
    const range=selectedBtcRange();
    const settings=btcRanges[range]||btcRanges["1D"];

    showBTCChartMessage(
      "Loading Bitcoin market history...",
      "Getting real historical BTC prices from Bybit"
    );

    try{
      const candles=await getBybitBTC(
        settings.interval,
        settings.limit,
        settings.duration
      );

      if(request!==btcChartRequest)return;

      drawBTCChart(candles,range);

    }catch(error){
      if(request!==btcChartRequest)return;

      console.error("VESTORA BTC chart:",error);

      showBTCChartMessage(
        "Bitcoin chart temporarily unavailable",
        "Bybit historical data could not be loaded. Please retry."
      );
    }
  }

  function setBTCChartHeadings(){
    const panel=document.querySelector(".portfolio-panel");
    if(!panel)return;

    const small=panel.querySelector(".portfolio-topline small");
    const description=panel.querySelector(".portfolio-topline p");
    const badge=panel.querySelector(".portfolio-live");

    if(small)small.textContent="BITCOIN MARKET PERFORMANCE";

    if(description){
      description.textContent=
        "Bitcoin historical price movement in USD. Your wallet balance is unchanged.";
    }

    if(badge)badge.textContent="BTC / USD";

    const svg=$("portfolioChart");
    if(svg){
      svg.setAttribute(
        "aria-label",
        "Bitcoin historical market price in USD"
      );
    }
  }

  function initBTCChart(){
    if(btcChartInitialized)return;
    if(!$("portfolioChart")||!$("portfolioIntervals"))return;

    btcChartInitialized=true;
    setBTCChartHeadings();

    document.querySelectorAll(
      "#portfolioIntervals [data-range]"
    ).forEach(button=>{
      button.addEventListener("click",()=>{
        clearTimeout(btcChartTimer);

        // Wait for the existing dashboard range handler first.
        btcChartTimer=setTimeout(()=>{
          loadBTCChart();
        },80);
      });
    });

    // Keep the BTC chart visible after the original app
    // finishes its account-loading process.
    const app=$("app");

    if(app){
      new MutationObserver(()=>{
        if(!app.classList.contains("hide")){
          setBTCChartHeadings();
          loadBTCChart();
        }
      }).observe(app,{
        attributes:true,
        attributeFilter:["class"]
      });
    }

    loadBTCChart();

    // Refresh market history periodically.
    setInterval(()=>{
      if(app&&!app.classList.contains("hide")&&
         !$("overview")?.classList.contains("hide")){
        loadBTCChart();
      }
    },60000);
  }

  // =====================================================
  // SETTINGS PAGE
  // =====================================================

  function addSettingsPage(){
    const nav=document.querySelector(".app aside nav");
    const content=document.querySelector(".content");

    if(!nav||!content||$("settings"))return;

    const button=document.createElement("button");
    button.type="button";
    button.dataset.page="settings";
    button.id="settingsNav";
    button.innerHTML="⚙　Settings";
    nav.appendChild(button);

    const page=document.createElement("section");
    page.id="settings";
    page.className="page hide";

    page.innerHTML=`
      <div class="lux-page-heading">
        <small>PERSONALISE YOUR EXPERIENCE</small>
        <h1>Settings</h1>
        <p>Manage your VESTORA account, appearance and security.</p>
      </div>

      <div class="lux-settings-grid">
        <article class="lux-setting-card">
          <div class="lux-card-icon">◐</div>
          <div>
            <h3>Appearance</h3>
            <p>Choose the look that feels right for you.</p>
          </div>
          <div class="lux-setting-row">
            <div>
              <b>Theme</b>
              <small>Switch between dark and light mode</small>
            </div>
            <button id="luxThemeToggle" class="lux-action">
              Switch to light mode
            </button>
          </div>
        </article>

        <article class="lux-setting-card">
          <div class="lux-card-icon">⌑</div>
          <div>
            <h3>Passkey security</h3>
            <p>Use your device's supported passkey authentication. Face ID availability is controlled by your device.</p>
          </div>
          <div class="lux-passkey-status" id="luxPasskeyStatus">
            Checking your registered passkeys…
          </div>
          <div class="lux-actions">
            <button id="luxAddPasskey" class="lux-action primary">
              Set up a passkey
            </button>
            <button id="luxRemovePasskey" class="lux-action danger">
              Remove a passkey
            </button>
          </div>
        </article>

        <article class="lux-setting-card">
          <div class="lux-card-icon">✳</div>
          <div>
            <h3>Change password</h3>
            <p>Confirm your current password before choosing a new one.</p>
          </div>
          <form id="luxPasswordForm" class="lux-form">
            <label>
              Current password
              <input id="luxCurrentPassword" type="password"
                autocomplete="current-password" required>
            </label>
            <label>
              New password
              <input id="luxNewPassword" type="password"
                autocomplete="new-password" minlength="8" required>
            </label>
            <label>
              Confirm new password
              <input id="luxConfirmPassword" type="password"
                autocomplete="new-password" minlength="8" required>
            </label>
            <button class="lux-action primary" type="submit">
              Update password
            </button>
          </form>
        </article>

        <article class="lux-setting-card">
          <div class="lux-card-icon">✉</div>
          <div>
            <h3>Help & feedback</h3>
            <p>Send a report, account question, security concern or suggestion.</p>
          </div>
          <form id="luxFeedbackForm" class="lux-form">
            <label>
              Category
              <select id="luxFeedbackCategory">
                <option>Feedback</option>
                <option>Report</option>
                <option>Security</option>
                <option>Account</option>
              </select>
            </label>
            <label>
              Your message
              <textarea id="luxFeedbackMessage"
                minlength="8" maxlength="5000" rows="4"
                required placeholder="Tell us how we can help…"></textarea>
            </label>
            <button class="lux-action primary" type="submit">
              Send message
            </button>
            <small class="lux-note">
              Your message is saved securely to your account.
              Support inbox delivery is not configured yet.
            </small>
          </form>
        </article>
      </div>`;

    content.appendChild(page);

    button.addEventListener("click",()=>showSettings());
    $("luxThemeToggle").addEventListener("click",toggleTheme);
    $("luxAddPasskey").addEventListener("click",addPasskey);
    $("luxRemovePasskey").addEventListener("click",removePasskey);
    $("luxPasswordForm").addEventListener("submit",changePassword);
    $("luxFeedbackForm").addEventListener("submit",sendFeedback);

    applyTheme(localStorage.getItem("vestora-theme")||"dark");
  }

  function showSettings(){
    document.querySelectorAll(".page").forEach(el=>
      el.classList.toggle("hide",el.id!=="settings")
    );

    document.querySelectorAll("[data-page]").forEach(el=>
      el.classList.toggle("active",el.dataset.page==="settings")
    );

    const title=$("title");
    if(title)title.textContent="Settings";

    refreshPasskeys();
  }

  function applyTheme(theme){
    document.documentElement.dataset.vestoraTheme=theme;
    localStorage.setItem("vestora-theme",theme);

    const button=$("luxThemeToggle");

    if(button){
      button.textContent=theme==="dark"
        ?"Switch to light mode"
        :"Switch to dark mode";
    }
  }

  function toggleTheme(){
    applyTheme(
      document.documentElement.dataset.vestoraTheme==="dark"
        ?"light"
        :"dark"
    );
  }

  async function refreshPasskeys(){
    const status=$("luxPasskeyStatus");
    if(!status)return;

    if(!currentUser){
      status.textContent="Sign in to manage passkeys.";
      return;
    }

    try{
      const {data,error}=await sb.auth.passkey.list();
      if(error)throw error;

      const keys=Array.isArray(data)
        ?data
        :(data?.passkeys||[]);

      status.textContent=keys.length
        ?`${keys.length} passkey${keys.length===1?"":"s"} registered on this account.`
        :"No passkeys registered yet.";

    }catch(e){
      status.textContent=
        e.message||"Passkey status is unavailable right now.";
    }
  }

  async function addPasskey(){
    if(passkeyBusy)return;
    if(!currentUser)return toast("Please sign in first.");

    if(!window.isSecureContext||!window.PublicKeyCredential){
      return toast("Passkeys are not supported in this browser.");
    }

    passkeyBusy=true;
    $("luxAddPasskey").disabled=true;

    try{
      const {error}=await sb.auth.registerPasskey();
      if(error)throw error;

      toast("Passkey registered successfully.");
      await refreshPasskeys();

    }catch(e){
      toast(e.message||"Passkey setup failed.");

    }finally{
      passkeyBusy=false;
      $("luxAddPasskey").disabled=false;
    }
  }

  async function removePasskey(){
    if(!currentUser)return toast("Please sign in first.");

    try{
      const {data,error}=await sb.auth.passkey.list();
      if(error)throw error;

      const keys=Array.isArray(data)
        ?data
        :(data?.passkeys||[]);

      if(!keys.length){
        return toast("There are no registered passkeys to remove.");
      }

      let selected=keys[0];

      if(keys.length>1){
        const choices=keys.map((k,i)=>
          `${i+1}. ${k.friendlyName||k.name||"Passkey"}`
        ).join("\n");

        const answer=prompt(
          "Choose the passkey number to remove:\n"+choices,
          "1"
        );

        if(answer===null)return;

        const n=Number(answer);

        if(!Number.isInteger(n)||n<1||n>keys.length){
          return toast("Invalid passkey selection.");
        }

        selected=keys[n-1];
      }

      if(!selected.id){
        return toast("Could not identify that passkey.");
      }

      if(!confirm("Remove this passkey from your VESTORA account?")){
        return;
      }

      const result=await sb.auth.passkey.delete({
        passkeyId:selected.id
      });

      if(result.error)throw result.error;

      toast("Passkey removed.");
      await refreshPasskeys();

    }catch(e){
      toast(e.message||"Could not remove passkey.");
    }
  }

  async function changePassword(event){
    event.preventDefault();

    if(!currentUser?.email){
      return toast("Your account email could not be confirmed. Sign in again.");
    }

    const current=$("luxCurrentPassword").value;
    const next=$("luxNewPassword").value;
    const confirmNext=$("luxConfirmPassword").value;

    if(next.length<8){
      return toast("Your new password must contain at least 8 characters.");
    }

    if(next!==confirmNext){
      return toast("The new passwords do not match.");
    }

    if(next===current){
      return toast("Choose a password different from your current one.");
    }

    const btn=$("luxPasswordForm").querySelector("button");
    btn.disabled=true;

    try{
      const {error:verifyError}=await sb.auth.signInWithPassword({
        email:currentUser.email,
        password:current
      });

      if(verifyError){
        throw new Error("Your current password is incorrect.");
      }

      const {error}=await sb.auth.updateUser({password:next});
      if(error)throw error;

      $("luxPasswordForm").reset();
      toast("Password updated successfully.");

    }catch(e){
      toast(e.message||"Password update failed.");

    }finally{
      btn.disabled=false;
    }
  }

  async function sendFeedback(event){
    event.preventDefault();

    if(!currentUser)return toast("Please sign in first.");

    const message=$("luxFeedbackMessage").value.trim();

    if(message.length<8){
      return toast("Please enter at least 8 characters.");
    }

    const btn=$("luxFeedbackForm").querySelector("button");
    btn.disabled=true;

    try{
      const {error}=await sb.from("user_feedback").insert({
        user_id:currentUser.id,
        category:$("luxFeedbackCategory").value,
        message
      });

      if(error)throw error;

      $("luxFeedbackForm").reset();
      toast("Your message has been saved to your account.");

    }catch(e){
      toast(e.message||"Could not save your message.");

    }finally{
      btn.disabled=false;
    }
  }

  function removeOldPasskeyNotice(){
    document.querySelectorAll("#overview .notice").forEach(el=>{
      const text=(el.textContent||"").toLowerCase();

      if(text.includes("secure your account with a passkey")){
        el.remove();
      }
    });
  }

  function showWelcome(){
    if(!$("app")||$("app").classList.contains("hide"))return;
    if(document.querySelector(".lux-splash"))return;

    const splash=document.createElement("div");
    splash.className="lux-splash";

    splash.innerHTML=`
      <div class="lux-splash-orbit"></div>
      <div class="lux-splash-brand">
        <span class="lux-splash-mark">V</span>
        <strong>VESTORA</strong>
        <small>MAKE YOUR NEXT MOVE MATTER.</small>
      </div>
    `;

    document.body.appendChild(splash);

    requestAnimationFrame(()=>splash.classList.add("visible"));

    setTimeout(()=>{
      splash.classList.add("leaving");
      setTimeout(()=>splash.remove(),750);
    },2400);
  }

  function observeApp(){
    const app=$("app");
    if(!app)return;

    let wasHidden=app.classList.contains("hide");

    new MutationObserver(()=>{
      const hidden=app.classList.contains("hide");

      if(wasHidden&&!hidden){
        showWelcome();
      }

      wasHidden=hidden;

      if(!hidden){
        removeOldPasskeyNotice();
        setBTCChartHeadings();
        loadBTCChart();
      }
    }).observe(app,{
      attributes:true,
      attributeFilter:["class"]
    });
  }

  // =====================================================
  // STARTUP
  // =====================================================

  addSettingsPage();
  observeApp();
  initBTCChart();

  sb.auth.getSession().then(({data})=>{
    currentUser=data?.session?.user||null;

    if(currentUser){
      removeOldPasskeyNotice();
      refreshPasskeys();
      setTimeout(loadBTCChart,350);
    }
  });

  sb.auth.onAuthStateChange((_event,session)=>{
    currentUser=session?.user||null;

    if(currentUser){
      setTimeout(()=>{
        removeOldPasskeyNotice();
        refreshPasskeys();
        loadBTCChart();
      },350);
    }
  });

})();
