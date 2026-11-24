(()=>{
  const c=window.VESTORA_CONFIG;
  const sb=window.supabase.createClient(c.SUPABASE_URL,c.SUPABASE_ANON_KEY,{
    auth:{experimental:{passkey:true}}
  });
  const $=id=>document.getElementById(id);
  let user=null,role="customer";
  const safe=s=>String(s??"").replace(/[&<>"]/g,x=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[x]));
  function toast(s){const t=$("toast");t.textContent=s;t.classList.add("show");setTimeout(()=>t.classList.remove("show"),4000);}
  function auth(tab){["login","signup","reset"].forEach(x=>$(x).classList.toggle("hide",x!==tab));document.querySelectorAll("[data-tab]").forEach(b=>b.classList.toggle("selected",b.dataset.tab===tab));}
  function showApp(){ $("auth").classList.add("hide");$("app").classList.remove("hide"); }
  function go(page){
    if(page==="admin"&&role!=="admin")return toast("Administrator access required.");
    document.querySelectorAll(".page").forEach(x=>x.classList.toggle("hide",x.id!==page));
    document.querySelectorAll("[data-page]").forEach(x=>x.classList.toggle("active",x.dataset.page===page));
    $("title").textContent=({overview:"Overview",markets:"Crypto markets",wallet:"Wallet & deposits",activity:"Activity",admin:"Admin panel"})[page];
    if(page==="markets"&&window.VestoraMarkets)window.VestoraMarkets.load();
    if(page==="wallet")loadDeposits();
    if(page==="admin"&&role==="admin")loadAdminDeposits();
  }
  async function enter(u){
    user=u;showApp();
    const [{data:p},{data:r},{data:w},{data:tx}]=await Promise.all([
      sb.from("profiles").select("full_name").eq("id",u.id).maybeSingle(),
      sb.from("user_roles").select("role").eq("user_id",u.id).maybeSingle(),
      sb.from("wallets").select("balance,currency").eq("user_id",u.id).maybeSingle(),
      sb.from("transactions").select("*").eq("user_id",u.id).order("created_at",{ascending:false}).limit(20)
    ]);
    role=r?.role||"customer";
    const n=p?.full_name||(u.email||"VESTORA user").split("@")[0];
    $("name").textContent=n.split(" ")[0];$("avatar").textContent=(n[0]||"V").toUpperCase();
    $("adminNav").classList.toggle("hide",role!=="admin");
    const money=new Intl.NumberFormat("en-US",{style:"currency",currency:w?.currency||"USD"}).format(Number(w?.balance||0));
    $("balance").textContent=money;$("balance2").textContent=money;
    $("activityRows").innerHTML=(tx||[]).map(t=>`<tr><td>${safe(t.type)}</td><td>${safe(t.description||"Account activity")}</td><td>${safe(t.currency||"USD")} ${Number(t.amount).toFixed(2)}</td><td>${safe(t.status)}</td></tr>`).join("")||'<tr><td colspan="4">No activity yet.</td></tr>';
    $("date").textContent=new Date().toLocaleDateString(undefined,{month:"short",day:"numeric",year:"numeric"});
  }
  document.querySelectorAll("[data-tab]").forEach(b=>b.onclick=()=>auth(b.dataset.tab));
  $("forgot").onclick=()=>auth("reset");$("back").onclick=()=>auth("login");
  $("loginBtn").onclick=async()=>{
    const {data,error}=await sb.auth.signInWithPassword({email:$("liEmail").value.trim(),password:$("liPass").value});
    if(error)toast(error.message);else enter(data.user);
  };
  $("registerPasskeyBtn").onclick=async()=>{
    if(!window.isSecureContext||!window.PublicKeyCredential)return toast("Passkeys are not supported in this browser.");
    if(!user)return toast("Please sign in first.");
    const b=$("registerPasskeyBtn");b.disabled=true;
    try{const {error}=await sb.auth.registerPasskey();if(error)toast(error.message);else toast("Passkey registered successfully.");}
    catch(e){toast(e.message||"Passkey setup failed.");}finally{b.disabled=false;}
  };
  $("passkeyLoginBtn").onclick=async()=>{
    if(!window.isSecureContext||!window.PublicKeyCredential)return toast("Passkeys are not supported in this browser.");
    const b=$("passkeyLoginBtn");b.disabled=true;
    try{const {error}=await sb.auth.signInWithPasskey();if(error)toast(error.message);}
    catch(e){toast(e.message||"Passkey sign-in failed.");}finally{b.disabled=false;}
  };
  $("signupBtn").onclick=async()=>{
    const name=$("suName").value.trim(),username=$("suUser").value.trim(),email=$("suEmail").value.trim(),password=$("suPass").value;
    if(!name||!username||!email||password.length<8)return toast("Complete all fields. Password must be at least 8 characters.");
    const {data,error}=await sb.auth.signUp({email,password,options:{data:{full_name:name,username}}});
    if(error)toast(error.message);else if(data.session)enter(data.user);else toast("Registration received. Check your email to confirm your account.");
  };
  $("resetBtn").onclick=async()=>{const {error}=await sb.auth.resetPasswordForEmail($("reEmail").value.trim(),{redirectTo:location.origin});toast(error?error.message:"If the account exists, a reset email has been sent.");};
  $("logout").onclick=async()=>{await sb.auth.signOut();user=null;role="customer";$("app").classList.add("hide");$("auth").classList.remove("hide");auth("login");};
  document.querySelectorAll("[data-page]").forEach(b=>b.onclick=()=>go(b.dataset.page));
  document.querySelectorAll("[data-go]").forEach(b=>b.onclick=()=>go(b.dataset.go));
  document.querySelectorAll("[data-copy]").forEach(b=>b.onclick=async()=>{try{await navigator.clipboard.writeText(b.dataset.copy);toast("Address copied.");}catch{toast("Copy is unavailable in this browser.");}});
  $("submitDeposit").onclick=async()=>{
    if(!user)return toast("Please sign in first.");
    const network=$("depositNetwork").value,asset=network==="BTC_MAINNET"?"BTC":"BNB";
    const amount=Number($("depositAmount").value),hash=$("depositHash").value.trim();
    if(!(amount>0)||!hash)return toast("Enter the amount and transaction hash.");
    const {error}=await sb.rpc("submit_deposit_request",{p_network:network,p_asset_symbol:asset,p_tx_hash:hash,p_amount_crypto:amount});
    if(error)toast(error.message);else{$("depositAmount").value="";$("depositHash").value="";toast("Deposit request submitted for review.");loadDeposits();}
  };
  async function loadDeposits(){
    if(!user)return;
    const {data,error}=await sb.from("deposit_requests").select("id,asset_symbol,amount_crypto,status,created_at").eq("user_id",user.id).order("created_at",{ascending:false});
    if(error){$("depositRows").innerHTML=`<tr><td colspan="4">${safe(error.message)}</td></tr>`;return;}
    $("depositRows").innerHTML=(data||[]).map(d=>`<tr><td>${safe(d.asset_symbol)}</td><td>${Number(d.amount_crypto)}</td><td>${safe(d.status)}</td><td>${new Date(d.created_at).toLocaleString()}</td></tr>`).join("")||'<tr><td colspan="4">No deposit requests.</td></tr>';
  }
  async function loadAdminDeposits(){
    const {data,error}=await sb.from("deposit_requests").select("id,user_id,network,asset_symbol,amount_crypto,tx_hash,created_at").eq("status","pending").order("created_at",{ascending:true});
    if(error){$("adminDeposits").innerHTML=`<tr><td colspan="5">${safe(error.message)}</td></tr>`;return;}
    $("adminDeposits").innerHTML=(data||[]).map(d=>`<tr><td>${safe(d.user_id.slice(0,8))}…</td><td>${safe(d.network)} / ${safe(d.asset_symbol)}</td><td>${Number(d.amount_crypto)}</td><td><code>${safe(d.tx_hash)}</code></td><td><button class="approve" data-id="${safe(d.id)}">Approve</button><button class="reject" data-id="${safe(d.id)}">Reject</button></td></tr>`).join("")||'<tr><td colspan="5">No pending requests.</td></tr>';
    document.querySelectorAll(".approve").forEach(b=>b.onclick=async()=>{
      const amount=prompt("Enter the independently verified USD credit amount. Only proceed after checking the blockchain transaction.");
      if(amount===null)return;if(!(Number(amount)>0))return toast("Enter a valid USD amount.");
      if(!confirm("Have you verified the correct network, receiving address, amount, confirmations and duplicate status on the blockchain?"))return;
      const {error}=await sb.rpc("approve_deposit",{p_deposit_id:b.dataset.id,p_amount_usd:Number(amount)});
      if(error)toast(error.message);else{toast("Deposit approved.");loadAdminDeposits();}
    });
    document.querySelectorAll(".reject").forEach(b=>b.onclick=async()=>{
      const note=prompt("Optional reason for rejection:")||null;
      const {error}=await sb.rpc("reject_deposit",{p_deposit_id:b.dataset.id,p_admin_note:note});
      if(error)toast(error.message);else{toast("Deposit rejected.");loadAdminDeposits();}
    });
  }
  $("date").textContent=new Date().toLocaleDateString();
  sb.auth.getSession().then(({data})=>data.session?enter(data.session.user):auth("login"));
  sb.auth.onAuthStateChange((_e,s)=>{if(s?.user&&!user)enter(s.user);if(!s&&user){user=null;role="customer";$("app").classList.add("hide");$("auth").classList.remove("hide");auth("login");}});
})();
