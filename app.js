(()=>{
  const c=window.VESTORA_CONFIG;
  const sb=window.supabase.createClient(
    c.SUPABASE_URL,
    c.SUPABASE_ANON_KEY
  );
  const $=id=>document.getElementById(id);

  let user=null,role="customer";

  function toast(s){
    const t=$("toast");
    t.textContent=s;
    t.classList.add("show");
    setTimeout(()=>t.classList.remove("show"),4000);
  }

  function auth(tab){
    ["login","signup","reset"].forEach(x=>
      $(x).classList.toggle("hide",x!==tab)
    );
    document.querySelectorAll("[data-tab]").forEach(b=>
      b.classList.toggle("selected",b.dataset.tab===tab)
    );
  }

  function app(){
    $("auth").classList.add("hide");
    $("app").classList.remove("hide");
  }

  function safe(s){
    return String(s??"").replace(/[&<>"]/g,x=>({
      "&":"&amp;",
      "<":"&lt;",
      ">":"&gt;",
      '"':"&quot;"
    }[x]));
  }

  async function enter(u){
    user=u;
    app();

    const [
      {data:p},
      {data:r},
      {data:w},
      {data:plans},
      {data:coins},
      {data:tx}
    ]=await Promise.all([
      sb.from("profiles")
        .select("full_name")
        .eq("id",u.id)
        .maybeSingle(),

      sb.from("user_roles")
        .select("role")
        .eq("user_id",u.id)
        .maybeSingle(),

      sb.from("wallets")
        .select("balance,currency")
        .eq("user_id",u.id)
        .maybeSingle(),

      sb.from("investment_plans")
        .select("*")
        .eq("is_active",true)
        .order("minimum_amount"),

      sb.from("crypto_assets")
        .select("*")
        .eq("is_active",true),

      sb.from("transactions")
        .select("*")
        .eq("user_id",u.id)
        .order("created_at",{ascending:false})
        .limit(15)
    ]);

    role=r?.role||"customer";

    const n=p?.full_name||u.email.split("@")[0];

    $("name").textContent=n.split(" ")[0];
    $("avatar").textContent=n[0].toUpperCase();

    $("adminNav").classList.toggle("hide",role!=="admin");

    const money=new Intl.NumberFormat("en-US",{
      style:"currency",
      currency:w?.currency||"USD"
    }).format(Number(w?.balance||0));

    $("balance").textContent=money;
    $("balance2").textContent=money;
    $("cryptoCount").textContent=(coins||[]).length;

    $("plans").innerHTML=(plans||[]).map((p,i)=>`
      <article>
        <span class="pill">DEMO ONLY</span>
        <h2>${safe(p.name)}</h2>
        <p>${safe(p.description||"Illustrative demo plan")}</p>
        <hr>
        <small>Example minimum</small>
        <b>$${Number(p.minimum_amount).toLocaleString()}</b>
        <hr>
        <small>Example duration</small>
        <b>${p.duration_days} days</b>
        <p class="warning">
          Illustrative figures only — not an offer or expected return.
        </p>
      </article>
    `).join("")||"No demo plans available.";

    $("coins").innerHTML=(coins||[]).map(a=>`
      <tr>
        <td>${safe(a.name)}</td>
        <td>${safe(a.symbol)}</td>
        <td>—</td>
        <td>Catalogue</td>
      </tr>
    `).join("")||'<tr><td colspan="4">No assets</td></tr>';

    $("activityRows").innerHTML=(tx||[]).map(t=>`
      <tr>
        <td>${safe(t.type)}</td>
        <td>${safe(t.description||"Account activity")}</td>
        <td>${safe(t.currency||"USD")} ${Number(t.amount).toFixed(2)}</td>
        <td>${safe(t.status)}</td>
      </tr>
    `).join("")||'<tr><td colspan="4">No activity yet.</td></tr>';

    $("adminPlans").innerHTML=role==="admin"
      ?(plans||[]).map(p=>
        `<p>${safe(p.name)} — $${Number(p.minimum_amount).toLocaleString()} minimum</p>`
      ).join("")
      :"";
  }

  document.querySelectorAll("[data-tab]").forEach(b=>
    b.onclick=()=>auth(b.dataset.tab)
  );

  $("forgot").onclick=()=>auth("reset");
  $("back").onclick=()=>auth("login");

  $("loginBtn").onclick=async()=>{
    const {data,error}=await sb.auth.signInWithPassword({
      email:$("liEmail").value.trim(),
      password:$("liPass").value
    });

    if(error)toast(error.message);
    else enter(data.user);
  };

  $("signupBtn").onclick=async()=>{
    const name=$("suName").value.trim();
    const username=$("suUser").value.trim();
    const email=$("suEmail").value.trim();
    const password=$("suPass").value;

    if(!name||!username||!email||password.length<8)
      return toast("Complete all fields. Password must be at least 8 characters.");

    const {data,error}=await sb.auth.signUp({
      email,
      password,
      options:{
        data:{
          full_name:name,
          username
        }
      }
    });

    if(error)toast(error.message);
    else if(data.session)enter(data.user);
    else toast("Registration received. Check your email to confirm your account.");
  };

  $("resetBtn").onclick=async()=>{
    const {error}=await sb.auth.resetPasswordForEmail(
      $("reEmail").value.trim(),
      {redirectTo:location.origin}
    );

    toast(error
      ?error.message
      :"If the account exists, a reset email has been sent."
    );
  };

  $("logout").onclick=async()=>{
    await sb.auth.signOut();
    user=null;
    $("app").classList.add("hide");
    $("auth").classList.remove("hide");
    auth("login");
  };

  function go(page){
    document.querySelectorAll(".page").forEach(x=>
      x.classList.toggle("hide",x.id!==page)
    );

    document.querySelectorAll("[data-page]").forEach(x=>
      x.classList.toggle("active",x.dataset.page===page)
    );

    $("title").textContent=({
      overview:"Overview",
      investments:"Investments",
      markets:"Crypto markets",
      wallet:"Wallet",
      activity:"Activity",
      admin:"Admin panel"
    })[page];
  }

  document.querySelectorAll("[data-page]").forEach(b=>
    b.onclick=()=>go(b.dataset.page)
  );

  document.querySelectorAll("[data-go]").forEach(b=>
    b.onclick=()=>go(b.dataset.go)
  );

  $("date").textContent=new Date().toLocaleDateString(
    undefined,
    {
      month:"short",
      day:"numeric",
      year:"numeric"
    }
  );

  sb.auth.getSession().then(({data})=>
    data.session
      ?enter(data.session.user)
      :auth("login")
  );

  sb.auth.onAuthStateChange((_e,s)=>{
    if(s?.user&&!user)enter(s.user);

    if(!s&&user){
      user=null;
      $("app").classList.add("hide");
      $("auth").classList.remove("hide");
      auth("login");
    }
  });

})();
