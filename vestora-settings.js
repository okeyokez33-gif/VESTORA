(()=>{
  "use strict";
  const cfg=window.VESTORA_CONFIG;
  if(!cfg||!window.supabase)return;
  const sb=window.supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY,{
    auth:{experimental:{passkey:true}}
  });
  const $=id=>document.getElementById(id);
  const toast=msg=>{
    let t=$("toast");
    if(!t){t=document.createElement("div");t.id="toast";document.body.appendChild(t);}
    t.textContent=msg;t.classList.add("show");setTimeout(()=>t.classList.remove("show"),3800);
  };
  let currentUser=null;
  let passkeyBusy=false;

  function addSettingsPage(){
    const nav=document.querySelector(".app aside nav");
    const content=document.querySelector(".content");
    if(!nav||!content||$("settings"))return;
    const button=document.createElement("button");
    button.type="button";button.dataset.page="settings";button.id="settingsNav";
    button.innerHTML="⚙　Settings";
    nav.appendChild(button);

    const page=document.createElement("section");
    page.id="settings";page.className="page hide";
    page.innerHTML=`
      <div class="lux-page-heading"><small>PERSONALISE YOUR EXPERIENCE</small><h1>Settings</h1><p>Manage your VESTORA account, appearance and security.</p></div>
      <div class="lux-settings-grid">
        <article class="lux-setting-card">
          <div class="lux-card-icon">◐</div><div><h3>Appearance</h3><p>Choose the look that feels right for you.</p></div>
          <div class="lux-setting-row"><div><b>Theme</b><small>Switch between dark and light mode</small></div><button id="luxThemeToggle" class="lux-action">Switch to light mode</button></div>
        </article>
        <article class="lux-setting-card">
          <div class="lux-card-icon">⌑</div><div><h3>Passkey security</h3><p>Use your device's supported passkey authentication. Face ID availability is controlled by your device.</p></div>
          <div class="lux-passkey-status" id="luxPasskeyStatus">Checking your registered passkeys…</div>
          <div class="lux-actions"><button id="luxAddPasskey" class="lux-action primary">Set up a passkey</button><button id="luxRemovePasskey" class="lux-action danger">Remove a passkey</button></div>
        </article>
        <article class="lux-setting-card">
          <div class="lux-card-icon">✳</div><div><h3>Change password</h3><p>Confirm your current password before choosing a new one.</p></div>
          <form id="luxPasswordForm" class="lux-form">
            <label>Current password<input id="luxCurrentPassword" type="password" autocomplete="current-password" required></label>
            <label>New password<input id="luxNewPassword" type="password" autocomplete="new-password" minlength="8" required></label>
            <label>Confirm new password<input id="luxConfirmPassword" type="password" autocomplete="new-password" minlength="8" required></label>
            <button class="lux-action primary" type="submit">Update password</button>
          </form>
        </article>
        <article class="lux-setting-card">
          <div class="lux-card-icon">✉</div><div><h3>Help & feedback</h3><p>Send a report, account question, security concern or suggestion.</p></div>
          <form id="luxFeedbackForm" class="lux-form">
            <label>Category<select id="luxFeedbackCategory"><option>Feedback</option><option>Report</option><option>Security</option><option>Account</option></select></label>
            <label>Your message<textarea id="luxFeedbackMessage" minlength="8" maxlength="5000" rows="4" required placeholder="Tell us how we can help…"></textarea></label>
            <button class="lux-action primary" type="submit">Send message</button>
            <small class="lux-note">Your message is saved securely to your account. Support inbox delivery is not configured yet.</small>
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
    document.querySelectorAll(".page").forEach(el=>el.classList.toggle("hide",el.id!=="settings"));
    document.querySelectorAll("[data-page]").forEach(el=>el.classList.toggle("active",el.dataset.page==="settings"));
    const title=$("title");if(title)title.textContent="Settings";
    refreshPasskeys();
  }
  function applyTheme(theme){
    document.documentElement.dataset.vestoraTheme=theme;
    localStorage.setItem("vestora-theme",theme);
    const b=$("luxThemeToggle");
    if(b)b.textContent=theme==="dark"?"Switch to light mode":"Switch to dark mode";
  }
  function toggleTheme(){applyTheme(document.documentElement.dataset.vestoraTheme==="dark"?"light":"dark");}
  async function refreshPasskeys(){
    const status=$("luxPasskeyStatus");
    if(!status)return;
    if(!currentUser){status.textContent="Sign in to manage passkeys.";return;}
    try{
      const {data,error}=await sb.auth.passkey.list();
      if(error)throw error;
      const keys=Array.isArray(data)?data:(data?.passkeys||[]);
      status.textContent=keys.length?`${keys.length} passkey${keys.length===1?"":"s"} registered on this account.`:"No passkeys registered yet.";
    }catch(e){status.textContent=e.message||"Passkey status is unavailable right now.";}
  }
  async function addPasskey(){
    if(passkeyBusy)return;
    if(!currentUser)return toast("Please sign in first.");
    if(!window.isSecureContext||!window.PublicKeyCredential)return toast("Passkeys are not supported in this browser.");
    passkeyBusy=true;$("luxAddPasskey").disabled=true;
    try{
      const {error}=await sb.auth.registerPasskey();
      if(error)throw error;
      toast("Passkey registered successfully.");
      await refreshPasskeys();
    }catch(e){toast(e.message||"Passkey setup failed.");}
    finally{passkeyBusy=false;$("luxAddPasskey").disabled=false;}
  }
  async function removePasskey(){
    if(!currentUser)return toast("Please sign in first.");
    try{
      const {data,error}=await sb.auth.passkey.list();
      if(error)throw error;
      const keys=Array.isArray(data)?data:(data?.passkeys||[]);
      if(!keys.length)return toast("There are no registered passkeys to remove.");
      let selected=keys[0];
      if(keys.length>1){
        const choices=keys.map((k,i)=>`${i+1}. ${k.friendlyName||k.name||"Passkey"}${k.createdAt?" — "+new Date(k.createdAt).toLocaleDateString():""}`).join("\n");
        const answer=prompt("Choose the passkey number to remove:\n"+choices,"1");
        if(answer===null)return;
        const n=Number(answer);
        if(!Number.isInteger(n)||n<1||n>keys.length)return toast("Invalid passkey selection.");
        selected=keys[n-1];
      }
      if(!selected.id)return toast("Could not identify that passkey.");
      if(!confirm("Remove this passkey from your VESTORA account?"))return;
      const result=await sb.auth.passkey.delete({passkeyId:selected.id});
      if(result.error)throw result.error;
      toast("Passkey removed.");
      await refreshPasskeys();
    }catch(e){toast(e.message||"Could not remove passkey.");}
  }
  async function changePassword(event){
    event.preventDefault();
    if(!currentUser?.email)return toast("Your account email could not be confirmed. Sign in again.");
    const current=$("luxCurrentPassword").value;
    const next=$("luxNewPassword").value;
    const confirmNext=$("luxConfirmPassword").value;
    if(next.length<8)return toast("Your new password must contain at least 8 characters.");
    if(next!==confirmNext)return toast("The new passwords do not match.");
    if(next===current)return toast("Choose a password different from your current one.");
    const btn=$("luxPasswordForm").querySelector("button");btn.disabled=true;
    try{
      const {error:verifyError}=await sb.auth.signInWithPassword({email:currentUser.email,password:current});
      if(verifyError)throw new Error("Your current password is incorrect.");
      const {error}=await sb.auth.updateUser({password:next});
      if(error)throw error;
      $("luxPasswordForm").reset();toast("Password updated successfully.");
    }catch(e){toast(e.message||"Password update failed.");}
    finally{btn.disabled=false;}
  }
  async function sendFeedback(event){
    event.preventDefault();
    if(!currentUser)return toast("Please sign in first.");
    const message=$("luxFeedbackMessage").value.trim();
    if(message.length<8)return toast("Please enter at least 8 characters.");
    const btn=$("luxFeedbackForm").querySelector("button");btn.disabled=true;
    try{
      const {error}=await sb.from("user_feedback").insert({
        user_id:currentUser.id,
        category:$("luxFeedbackCategory").value,
        message
      });
      if(error)throw error;
      $("luxFeedbackForm").reset();
      toast("Your message has been saved to your account.");
    }catch(e){toast(e.message||"Could not save your message.");}
    finally{btn.disabled=false;}
  }

  function removeOldPasskeyNotice(){
    document.querySelectorAll("#overview .notice").forEach(el=>{
      const text=(el.textContent||"").toLowerCase();
      if(text.includes("secure your account with a passkey"))el.remove();
    });
  }
  function showWelcome(){
    if(!$("app")||$("app").classList.contains("hide"))return;
    if(document.querySelector(".lux-splash"))return;
    const splash=document.createElement("div");splash.className="lux-splash";
    splash.innerHTML=`<div class="lux-splash-orbit"></div><div class="lux-splash-brand"><span class="lux-splash-mark">V</span><strong>VESTORA</strong><small>MAKE YOUR NEXT MOVE MATTER.</small></div>`;
    document.body.appendChild(splash);
    requestAnimationFrame(()=>splash.classList.add("visible"));
    setTimeout(()=>{splash.classList.add("leaving");setTimeout(()=>splash.remove(),750);},2400);
  }
  function observeApp(){
    const app=$("app");
    if(!app)return;
    let wasHidden=app.classList.contains("hide");
    new MutationObserver(()=>{
      const hidden=app.classList.contains("hide");
      if(wasHidden&&!hidden)showWelcome();
      wasHidden=hidden;
      if(!hidden)removeOldPasskeyNotice();
    }).observe(app,{attributes:true,attributeFilter:["class"]});
  }

  addSettingsPage();
  observeApp();
  sb.auth.getSession().then(({data})=>{
    currentUser=data?.session?.user||null;
    if(currentUser){removeOldPasskeyNotice();refreshPasskeys();}
  });
  sb.auth.onAuthStateChange((_event,session)=>{
    currentUser=session?.user||null;
    if(currentUser){setTimeout(()=>{removeOldPasskeyNotice();refreshPasskeys();},0);}
  });
})();