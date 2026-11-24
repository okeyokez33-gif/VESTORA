(()=>{
const c=window.VESTORA_CONFIG;
const $=id=>document.getElementById(id);

if(!window.supabase || !c?.SUPABASE_URL || !c?.SUPABASE_ANON_KEY){
  alert("VESTORA could not connect to Supabase. Check your configuration.");
  return;
}

const sb=window.supabase.createClient(
  c.SUPABASE_URL,
  c.SUPABASE_ANON_KEY
);

let user=null,role="customer";

function toast(s){
  const t=$("toast");
  t.textContent=s;
  t.classList.add("show");
  setTimeout(()=>t.classList.remove("show"),4000);
}

// Passkey / biometric sign-in
$("passkeyLoginBtn").onclick=async()=>{
  if(!window.isSecureContext ||
     typeof window.PublicKeyCredential==="undefined")
    return toast("Passkeys require HTTPS and a supported browser.");

  const b=$("passkeyLoginBtn");
  b.disabled=true;

  try{
    const {error}=await sb.auth.signInWithPasskey();
    if(error) toast(error.message);
  }catch(e){
    toast(e.message||"Passkey sign-in failed.");
  }finally{
    b.disabled=false;
  }
};

$("registerPasskeyBtn").onclick=async()=>{
  if(!window.isSecureContext ||
     typeof window.PublicKeyCredential==="undefined")
    return toast("Passkeys require HTTPS and a supported browser.");

  if(!user) return toast("Please sign in first.");

  const b=$("registerPasskeyBtn");
  b.disabled=true;

  try{
    const {error}=await sb.auth.registerPasskey();
    if(error) toast(error.message);
    else toast("Passkey registered successfully.");
  }catch(e){
    toast(e.message||"Passkey setup failed.");
  }finally{
    b.disabled=false;
  }
};

function auth(tab){
