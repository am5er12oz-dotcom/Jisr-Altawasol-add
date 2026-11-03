const mottos=[
  "موقع يجمع الأصم والناطق في محادثة واحدة.",
  "صوتك مهم، بأي لغة تتحدث.",
  "كل إشارة تبني جسراً بين عالمين.",
  "ابدأ/ي أول محادثة، والباقي أسهل."
];
const root=document.documentElement;
const m=document.getElementById("motto");let mi=0;m.textContent=mottos[0];
const still=matchMedia("(prefers-reduced-motion: reduce)").matches;
setInterval(()=>{mi=(mi+1)%mottos.length;
  if(still){m.textContent=mottos[mi];return}
  m.classList.add("fade");setTimeout(()=>{m.textContent=mottos[mi];m.classList.remove("fade")},500)},4500);

const form=document.getElementById("form"),btn=document.getElementById("btn"),msg=document.getElementById("msg");
function show(t,c){msg.textContent=t;msg.className="msg "+c}
function saveAndGo(d){
  localStorage.setItem("token",d.token);
  localStorage.setItem("user",JSON.stringify(d.user));
  location.href="/index.html";
}

// القوائم المخصصة
const dds=[];
function closeAll(except){
  dds.forEach(d=>{
    if(d!==except){
      d.classList.remove("open");
      d.querySelector(".dd-btn").setAttribute("aria-expanded","false");
    }
  });
}
function makeDD(id,iconId){
  const el=document.getElementById(id),
        b=el.querySelector(".dd-btn"),
        val=el.querySelector(".val"),
        ic=document.getElementById(iconId),
        o={value:""};
  b.onclick=e=>{
    e.stopPropagation();
    closeAll(el);
    const open=el.classList.toggle("open");
    b.setAttribute("aria-expanded",open?"true":"false");
  };
  el.querySelectorAll(".dd-item").forEach(it=>{
    it.onclick=e=>{
      e.stopPropagation();
      o.value=it.dataset.v;
      val.textContent=it.dataset.label||it.textContent.trim();
      val.classList.remove("ph");
      ic.querySelector("use").setAttribute("href","#"+it.dataset.ic);
      el.querySelectorAll(".dd-item").forEach(x=>x.classList.remove("sel"));
      it.classList.add("sel");
      el.classList.remove("open");
      b.setAttribute("aria-expanded","false");
      el.closest(".field").classList.remove("invalid");
    };
  });
  dds.push(el);
  return o;
}
const gender=makeDD("ddGender","gIc");
const utype=makeDD("ddType","tIc");
document.addEventListener("click",()=>closeAll());
document.addEventListener("keydown",e=>{if(e.key==="Escape")closeAll()});

const pw=document.getElementById("password"),pw2=document.getElementById("password2");
document.getElementById("toggle").onclick=()=>{
  const t=pw.type==="password"?"text":"password";pw.type=t;pw2.type=t;
};

// فك بيانات جوجل للعرض فقط (التحقق الحقيقي يتم في الخادم)
function decodeJwt(t){
  const b=t.split(".")[1].replace(/-/g,"+").replace(/_/g,"/");
  const bytes=Uint8Array.from(atob(b),c=>c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

let credential=null;
let gClientId=null;

function onGoogle(res){
  credential=res.credential;
  const p=decodeJwt(credential);
  const nm=document.getElementById("name"); if(!nm.value) nm.value=p.name||"";
  document.getElementById("gname").textContent=p.name||"";
  document.getElementById("gmail").textContent=p.email||"";
  if(p.picture)document.getElementById("gpic").src=p.picture;
  document.getElementById("gchip").style.display="flex";
  document.getElementById("gbtn").style.display="none";
  document.getElementById("f-google").classList.remove("invalid");
  show("","");
}

// تغيير حساب جوجل
document.getElementById("gchange").onclick=()=>{
  credential=null;
  document.getElementById("gchip").style.display="none";
  document.getElementById("gbtn").style.display="flex";
  try{google.accounts.id.disableAutoSelect()}catch(e){}
};

function drawGoogleBtn(){
  if(!(window.google&&google.accounts&&gClientId))return;
  const box=document.getElementById("gbtn");
  box.innerHTML="";
  const w=Math.max(200,Math.min(320,box.parentElement.clientWidth-8));
  google.accounts.id.renderButton(box,
    {theme:"outline",size:"large",text:"signup_with",shape:"pill",locale:"ar",width:w});
}

async function initGoogle(){
  try{
    const c=await (await fetch("/api/auth/config")).json();
    if(!c.googleClientId){show("التسجيل بحساب جوجل غير متاح حاليًا، يرجى المحاولة لاحقًا.","err");return}
    gClientId=c.googleClientId;
    const wait=setInterval(()=>{
      if(window.google&&google.accounts){
        clearInterval(wait);
        google.accounts.id.initialize({client_id:gClientId,callback:onGoogle});
        drawGoogleBtn();
      }
    },200);
  }catch{show("تعذّر الاتصال حاليًا، يرجى المحاولة بعد قليل.","err")}
}
initGoogle();

// إعادة رسم الزر عند تغيّر عرض الشاشة
let rz;
window.addEventListener("resize",()=>{
  clearTimeout(rz);
  rz=setTimeout(()=>{if(!credential)drawGoogleBtn()},250);
});

function mark(id,bad){document.getElementById(id).classList.toggle("invalid",bad);return bad}

form.addEventListener("submit",async e=>{
  e.preventDefault();
  const name=document.getElementById("name").value.trim();
  const password=pw.value, confirm=pw2.value;

  const bad=[
    mark("f-google",!credential),
    mark("f-name",!name),
    mark("f-gender",!gender.value),
    mark("f-type",!utype.value),
    mark("f-pw",password.length<6),
    mark("f-pw2",!confirm||password!==confirm)
  ];
  if(bad.some(Boolean)){
    show("يرجى استكمال جميع البيانات المطلوبة (*) قبل إنشاء الحساب.","err");
    const first=document.querySelector(".field.invalid");
    if(first)first.scrollIntoView({behavior:"smooth",block:"center"});
    return;
  }

  btn.disabled=true;btn.textContent="جارٍ إنشاء الحساب...";show("","");
  try{
    const r=await fetch("/api/auth/google/register",{method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({credential,name,gender:gender.value,userType:utype.value,password})});
    const d=await r.json();
    if(!r.ok){
      show(d.message||"حدث خطأ، يرجى المحاولة مرة أخرى.","err");
      if(d.exists) setTimeout(()=>location.href="/login.html",2500);
      return;
    }
    show("تم إنشاء الحساب 🎉 جارٍ التحويل...","ok");
    setTimeout(()=>saveAndGo(d),700);
  }catch{show("تعذّر الاتصال حاليًا، يرجى المحاولة بعد قليل.","err")}
  finally{btn.disabled=false;btn.textContent="إنشاء الحساب"}
});

["name","password","password2"].forEach(id=>
  document.getElementById(id).addEventListener("input",e=>
    e.target.closest(".field").classList.remove("invalid")));

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js");
}
