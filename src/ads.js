/**
 * Cloudflare Worker - License Validator + CORS (Hardened)
 * Config dari env: LICENSE_DOMAIN, ADS_IMAGE, ADS_LINK
 * Endpoint: GET /check  |  GET /core.js  |  GET /license.js | GET /assets/core.min.js
 */

const ALLOWED_ORIGINS = [
  "https://www.blogger.com",
  "https://blogger.com",
  "https://*.blogspot.com",
  "https://daffadevhosting.github.io",
  "null",
];

function getConfig(env) {
  const domain = (env.LICENSE_DOMAIN || "").replace(/^https?:\/\//, "").replace(/\/$/, "");
  const url = `https://${domain}`;

  // Multi-iklan: ADS_LIST = JSON array [{image,link,title?}, ...]
  // Fallback: ADS_IMAGE + ADS_LINK (single)
  let ads = [];
  if (env.ADS_LIST) {
    try {
      const parsed = JSON.parse(env.ADS_LIST);
      if (Array.isArray(parsed)) {
        ads = parsed
          .filter((a) => a && a.image && a.link)
          .map((a) => ({
            image: String(a.image),
            link: String(a.link),
            title: String(a.title || "Promo Spesial!"),
          }));
      }
    } catch (e) {}
  }
  if (!ads.length && env.ADS_IMAGE && env.ADS_LINK) {
    ads = [{ image: env.ADS_IMAGE, link: env.ADS_LINK, title: "Promo Spesial!" }];
  }

  const bannerInterval = Math.max(5, parseInt(env.ADS_BANNER_INTERVAL || "20", 10) || 20);

  return {
    LICENSE_DOMAIN: domain,
    LICENSE_URL: url,
    LICENSE_B64: btoa(url),
    ADS_IMAGE: env.ADS_IMAGE || "",
    ADS_LINK: env.ADS_LINK || "",
    ADS_LIST: ads,
    ADS_BANNER_INTERVAL: bannerInterval,
  };
}

function corsHeaders(origin) {
  const allowOrigin = matchOrigin(origin) ? origin : "*";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function matchOrigin(origin) {
  if (!origin || origin === "null") return true;
  if (origin.endsWith(".blogspot.com") || origin.includes("blogger.com")) return true;
  return ALLOWED_ORIGINS.some(
    (o) => o === origin || (o.startsWith("https://*.") && origin.endsWith(o.slice(8)))
  );
}

function jsonResponse(data, status = 200, origin = null) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(origin),
    },
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";
    const cfg = getConfig(env);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(origin),
      });
    }

    // Root → 403 Forbidden (flat minimal page)
    if (url.pathname === "/" || url.pathname === "") {
      return handleForbidden(origin);
    }

    if (url.pathname === "/check") {
      return handleCheck(request, origin, cfg);
    }

    if (
      url.pathname === "/core.js" ||
      url.pathname === "/license.js" ||
      url.pathname === "/assets/core.min.js"
    ) {
      return handleProtectedScript(request, origin, cfg);
    }

    return jsonResponse({ error: "Not Found" }, 404, origin);
  },
};

/**
 * Flat minimalist 403 page — no gradient
 */
function handleForbidden(origin) {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>403 Forbidden</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { height: 100%; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: #0a0a0a;
      color: #e8e8e8;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 1.5rem;
    }
    .box {
      text-align: center;
      max-width: 360px;
      width: 100%;
    }
    .code {
      font-size: 4.5rem;
      font-weight: 700;
      letter-spacing: -0.04em;
      line-height: 1;
      color: #fff;
      margin-bottom: 0.75rem;
    }
    .title {
      font-size: 1.125rem;
      font-weight: 600;
      color: #fff;
      margin-bottom: 0.5rem;
    }
    .desc {
      font-size: 0.875rem;
      color: #888;
      line-height: 1.55;
      margin-bottom: 1.75rem;
    }
    .rule {
      width: 40px;
      height: 1px;
      background: #2a2a2a;
      margin: 0 auto 1.75rem;
    }
    .hint {
      font-size: 0.75rem;
      color: #555;
      letter-spacing: 0.02em;
    }
  </style>
</head>
<body>
  <div class="box">
    <div class="code">403</div>
    <div class="title">Forbidden</div>
    <div class="rule"></div>
    <p class="desc">You don't have permission to access this resource.</p>
    <p class="hint">app-core</p>
  </div>
</body>
</html>`;

  return new Response(html, {
    status: 403,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=300",
      "X-Content-Type-Options": "nosniff",
      ...corsHeaders(origin),
    },
  });
}

async function handleCheck(request, origin, cfg) {
  const url = new URL(request.url);
  const meta = url.searchParams.get("meta") || "";
  const footer = url.searchParams.get("footer") || "";

  let isValid = false;
  let reason = "";

  if (meta) {
    if (meta === cfg.LICENSE_URL || meta === cfg.LICENSE_B64) {
      isValid = true;
    } else {
      try {
        if (atob(meta) === cfg.LICENSE_URL) isValid = true;
      } catch (e) {}
    }
  }

  if (isValid && footer) {
    if (!footer.includes(cfg.LICENSE_DOMAIN) && !footer.includes(cfg.LICENSE_URL)) {
      isValid = false;
      reason = "Footer credit missing or modified";
    }
  }

  if (!isValid && !reason) reason = "Invalid or missing license meta";

  return jsonResponse(
    {
      valid: isValid,
      reason: isValid ? null : reason,
      license: cfg.LICENSE_B64,
      message: isValid
        ? "License valid. Template unlocked."
        : "Template locked. Please restore license & credit.",
    },
    200,
    origin
  );
}

/**
 * Script digabung + obfuscate + anti-adblock + anti-tamper.
 * Ads image/link dari env dipakai sebagai fallback jika meta kosong.
 */
function handleProtectedScript(request, origin, cfg) {
  const workerOrigin = new URL(request.url).origin;

  const js = `(function(w,d){
"use strict";
var _0x=${JSON.stringify({
  a: cfg.LICENSE_URL,
  b: cfg.LICENSE_B64,
  c: cfg.LICENSE_DOMAIN,
  d: workerOrigin,
  e: "license",
  f: "footer",
  g: "ads-image",
  h: "ads-link",
  i: cfg.ADS_IMAGE,
  j: cfg.ADS_LINK,
  k: cfg.ADS_LIST,
  n: cfg.ADS_BANNER_INTERVAL,
})};

/* ===== Utility helpers ===== */
function _q(s){return d.querySelector(s)}
function _id(i){return d.getElementById(i)}
function _on(el,ev,fn){el&&el.addEventListener(ev,fn)}
function _ready(fn){if(d.readyState!=="loading")fn();else d.addEventListener("DOMContentLoaded",fn)}
function _attr(el,n){return el?el.getAttribute(n):""}
function _txt(el){return el?(el.textContent||el.innerText||""):""}
function _b64d(s){try{return atob(s)}catch(e){return""}}
function _rnd(a,b){return Math.floor(Math.random()*(b-a+1))+a}

/* ===== 1. ANTI-ADBLOCK DETECTION ===== */
function _detectAdblock(){
  var bait=d.createElement("div");
  bait.innerHTML="&nbsp;";
  bait.className="adsbox ad-banner ad-placement pub_300x250 adsbygoogle";
  bait.style.cssText="position:absolute;left:-9999px;width:1px;height:1px;pointer-events:none";
  d.body.appendChild(bait);
  var style=w.getComputedStyle?w.getComputedStyle(bait):bait.currentStyle;
  var isBlocked=(bait.offsetHeight===0||bait.offsetWidth===0||(style&&(style.display==="none"||style.visibility==="hidden"||style.opacity==="0")));
  try{d.body.removeChild(bait)}catch(e){}
  return !!isBlocked;
}

/* ===== 2. ANTI-TAMPER (MUTATION OBSERVER) ===== */
function _protectElements(){
  var target=d.body||d.documentElement;
  if(!target||!w.MutationObserver)return;
  var observer=new MutationObserver(function(mutations){
    for(var i=0;i<mutations.length;i++){
      var m=mutations[i];
      if(m.type!=="childList")continue;
      var meta=_q('meta[name="'+_0x.e+'"]');
      var foot=_id(_0x.f)||_q("."+_0x.f);
      var footOk=foot?(_txt(foot).indexOf(_0x.c)>=0||_txt(foot).indexOf(_0x.a)>=0):false;
      if(!meta||!foot||!footOk){
        observer.disconnect();
        _lk("License or credit was tampered/removed.");
        return;
      }
    }
  });
  observer.observe(target,{childList:true,subtree:true});
}

/* ===== Core validation ===== */
function _v(){
  var m=_attr(_q('meta[name="'+_0x.e+'"]'),"content")||"";
  var fEl=_id(_0x.f)||_q("."+_0x.f);
  var ft=_txt(fEl).slice(0,600);
  var p=new URLSearchParams({meta:m,footer:ft,domain:location.hostname,ts:Date.now()});

  fetch(_0x.d+"/check?"+p.toString(),{method:"GET",credentials:"omit",mode:"cors"})
  .then(function(r){return r.json()})
  .then(function(data){
    if(!data||!data.valid){_lk(data&&data.message?data.message:"License invalid");return}
    w.__VOK=1;
    _protectElements();
    _ad();
  })
  .catch(function(){
    var ok=false;
    if(m===_0x.a||m===_0x.b)ok=true;
    if(_b64d(m)===_0x.a)ok=true;
    if(fEl){if(ft.indexOf(_0x.c)<0&&ft.indexOf(_0x.a)<0)ok=false}else{ok=false}
    if(!ok)_lk("License check failed (blocked or invalid).");
    else{w.__VOK=1;_protectElements();_ad()}
  });
}

function _lk(msg){
  var s=10;
  var h='<style>body{background:#000000b3!important;overflow:hidden!important}#prngt{z-index:2147483647;position:fixed;top:0;right:0;left:0;height:100%;padding:16% 0;text-align:center;background:#000000f2;color:#fff;font-family:sans-serif}#prngt h4{margin-bottom:35px;font-size:32px}#prngt p{margin-top:20px;font-size:18px;letter-spacing:2px;line-height:30px}#aktv{font-size:50px;display:block;margin-top:20px;color:#ff4444}@media(max-width:680px){#prngt{padding:60% 0}#prngt h4{font-size:20px!important}}</style><div id="prngt"><h4>🔒 Akses Ditolak</h4><p>'+msg+'<br>Mohon jangan menghapus license, credit, atau menggunakan AdBlocker.</p><span id="aktv">'+s+'</span></div>';
  d.body.insertAdjacentHTML("beforeend",h);
  var el=_id("aktv");
  var iv=setInterval(function(){
    s--;if(el)el.textContent=s;
    if(s<=0){clearInterval(iv);location.href="https://"+_0x.c+"/blog/"}
  },1000);
}

/* Build ads pool: meta (single) + env list */
function _adsPool(){
  var list=(_0x.k&&_0x.k.length)?_0x.k.slice():[];
  var mi=_attr(_q('meta[name="'+_0x.g+'"]'),"content")||"";
  var ml=_attr(_q('meta[name="'+_0x.h+'"]'),"content")||"";
  if(mi&&ml&&ml!=="#")list.unshift({image:mi,link:ml,title:"Promo Spesial!"});
  if(!list.length&&_0x.i&&_0x.j)list.push({image:_0x.i,link:_0x.j,title:"Promo Spesial!"});
  return list;
}
function _pick(list){
  if(!list||!list.length)return null;
  return list[_rnd(0,list.length-1)];
}

/* Modal: random ad each page load */
function _ad(){
  var pool=_adsPool();
  var ad=_pick(pool);
  if(!ad)return;
  var img=ad.image,lnk=ad.link,ttl=ad.title||"Promo Spesial!";
  var h='<style>.mdl-ad{position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,.7);display:flex;justify-content:center;align-items:center;z-index:2147483646;opacity:0;pointer-events:none;transition:opacity .3s}.mdl-ad.show{opacity:1;pointer-events:auto}.mdl-ad.hide{display:none;visibility:hidden;}.mdl-ct{background:#fff;padding:20px;border-radius:8px;max-width:450px;width:90%;position:relative;box-shadow:0 4px 15px rgba(0,0,0,.3);text-align:center}.cls-ad{position:absolute;top:10px;right:15px;font-size:24px;font-weight:bold;color:#333;cursor:pointer;border:none;background:none}.cls-ad:hover{color:#f00}.ad-img{width:100%;height:auto;border-radius:4px;margin-top:15px;display:block}.ad-btn{display:inline-block;margin-top:15px;padding:10px 20px;background:#111;color:#fff;text-decoration:none;border-radius:5px;font-weight:bold}.ad-btn:hover{background:#333}</style><div class="mdl-ad" id="adM"><div class="mdl-ct"><button class="cls-ad" id="clsAd">&times;</button><h3>'+ttl+'</h3><a href="'+lnk+'" target="_blank" rel="noopener sponsored"><img src="'+img+'" alt="Ad" class="ad-img"></a><a href="'+lnk+'" target="_blank" rel="noopener sponsored" class="ad-btn">Cek Sekarang!</a></div></div>';
  d.body.insertAdjacentHTML("beforeend",h);
  var m=_id("adM"),c=_id("clsAd");
  setTimeout(function(){m&&m.classList.add("show")},2000);
  _on(c,"click",function(){m&&m.classList.remove("show");m.classList.add("hide")}});
  _on(m,"click",function(e){if(e.target===m)m.classList.remove("show");m.classList.add("hide")});
  _bannerRotate(pool);
}

/* Floating banner: rotate every N seconds (default 20) */
function _bannerRotate(pool){
  if(!pool||pool.length<1)return;
  var style=d.createElement("style");
  style.textContent=".vbnr{position:fixed;bottom:16px;right:16px;z-index:2147483640;width:300px;max-width:calc(100vw - 32px);background:#111;border:1px solid #2a2a2a;border-radius:10px;overflow:hidden;box-shadow:0 8px 24px rgba(0,0,0,.45);font-family:sans-serif;opacity:0;transform:translateY(12px);transition:opacity .35s,transform .35s}.vbnr.show{opacity:1;transform:translateY(0)}.vbnr.hide{display:none;visibility:hidden;}.vbnr a{display:block;text-decoration:none;color:inherit}.vbnr img{width:100%;height:auto;display:block;max-height:160px;object-fit:cover}.vbnr .vb-bd{padding:10px 12px}.vbnr .vb-t{font-size:13px;font-weight:600;color:#fff;margin:0 0 4px}.vbnr .vb-c{position:absolute;top:6px;right:8px;width:24px;height:24px;border:none;background:rgba(0,0,0,.55);color:#fff;border-radius:50%;cursor:pointer;font-size:14px;line-height:1}.vbnr .vb-c:hover{background:#c00}";
  d.head.appendChild(style);

  var wrap=d.createElement("div");
  wrap.className="vbnr";
  wrap.id="vbnr";
  wrap.innerHTML='<button class="vb-c" id="vbClose" type="button" aria-label="Close">&times;</button><a id="vbLink" href="#" target="_blank" rel="noopener sponsored"><img id="vbImg" src="" alt="Ad"/><div class="vb-bd"><p class="vb-t" id="vbTitle"></p></div></a>';
  d.body.appendChild(wrap);

  var closed=false;
  _on(_id("vbClose"),"click",function(){closed=true;wrap.classList.remove("show");wrap.classList.add("hide");});

  var idx=_rnd(0,pool.length-1);
  function showNext(){
    if(closed)return;
    var ad=pool[idx%pool.length];
    idx++;
    var imgEl=_id("vbImg"),lnkEl=_id("vbLink"),ttlEl=_id("vbTitle");
    if(!ad||!imgEl)return;
    wrap.classList.remove("show");
    setTimeout(function(){
      imgEl.src=ad.image;
      lnkEl.href=ad.link;
      if(ttlEl)ttlEl.textContent=ad.title||"Sponsored";
      wrap.classList.add("show");
    },320);
  }
  setTimeout(showNext,4000);
  setInterval(showNext,(_0x.n||20)*1000);
}

/* Hard gate:
   - __licGate()  → hanya cek module ada (tidak throw saat boot async)
   - __licReady() → cek sudah valid (__VOK===1), untuk fungsi setelah boot
   Jika script dihapus → ReferenceError di requireLicense()
*/
w.__VOK=0;
w.__licGate=function(){return true;};
w.__licReady=function(){
  if(!w.__VOK){throw new Error("License not ready or invalid");}
  return true;
};

_ready(function(){
  setTimeout(function(){
    _v();
    // Anti-tamper setelah validasi lolos (hindari false-positive saat boot)
  },_rnd(80,280));
});
})(window,document);`;

  return new Response(js, {
    status: 200,
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=600",
      "X-Content-Type-Options": "nosniff",
      ...corsHeaders(origin),
    },
  });
}
