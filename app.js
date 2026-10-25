const grid=document.getElementById("movieGrid");
const search=document.getElementById("search");
const filters=document.getElementById("filters");
let activeGenre="All";
const moneyNumber="0763827011";
function safeText(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function renderMovies(){
 const q=search.value.trim().toLowerCase();
 const list=MOVIES.filter(m=>(activeGenre==="All"||m.genre===activeGenre)&&`${m.title} ${m.genre} ${m.year}`.toLowerCase().includes(q));
 if(!list.length){grid.innerHTML='<div class="empty">No movies match your search. Try another title or category.</div>';return;}
 grid.innerHTML=list.map((m,i)=>`<article class="movie-card" style="animation-delay:${i*45}ms">
   <div class="movie-poster" style="--poster-bg:${safeText(m.poster||"linear-gradient(145deg,#3b345f,#111522)")}">
    ${m.isNew?'<span class="new-tag">JUST ADDED</span>':""}<span class="poster-word">${safeText(m.title)}</span>
   </div><div class="movie-info"><h3 title="${safeText(m.title)}">${safeText(m.title)}</h3>
   <div class="meta"><span>${safeText(m.genre)}</span><span class="dot">•</span><span>${safeText(m.year)}</span><span class="dot">•</span><span>${safeText(m.rating||"HD")}</span></div>
   <div class="movie-bottom"><span class="price">UGX 1,000 <small>/ movie</small></span><button class="unlock-btn" data-movie="${safeText(m.id)}">Pay & unlock ↗</button></div></div></article>`).join("");
}
function showToast(msg){const t=document.getElementById("toast");t.textContent=msg;t.classList.add("show");clearTimeout(window.toastTimeout);window.toastTimeout=setTimeout(()=>t.classList.remove("show"),3800);}
async function startPayment(movieId){
 const movie=MOVIES.find(x=>x.id===movieId); if(!movie)return;
 const email=prompt(`Enter your email to pay UGX 1,000 for "${movie.title}":`); if(!email)return;
 const phone=prompt("Enter the mobile-money number you will pay from (example: 0771234567):"); if(!phone)return;
 const networkRaw=prompt("Type your network: MTN or AIRTEL"); if(!networkRaw)return;
 const network=networkRaw.trim().toUpperCase();
 if(!["MTN","AIRTEL"].includes(network)){showToast("Network must be MTN or AIRTEL.");return;}
 showToast("Starting secure payment request…");
 try{
   const r=await fetch("/api/create-payment",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({movieId,phone,network,email})});
   const data=await r.json();
   if(!r.ok)throw new Error(data.error||"Payment request failed.");
   // Keep the access token on this device; server checks payment status before granting access.
   localStorage.setItem("nenafilms_access_"+movieId,data.accessToken);
   localStorage.setItem("nenafilms_pending_movie",movieId);
   window.location.href=data.redirectUrl;
 }catch(e){showToast(e.message||"Could not start payment. Try again.");}
}
async function checkPurchaseReturn(){
 const params=new URLSearchParams(window.location.search);
 if(params.get("payment")!=="return")return;
 history.replaceState({},document.title,window.location.pathname);
 const movieId=localStorage.getItem("nenafilms_pending_movie");
 if(!movieId){showToast("Returned from payment. Find your movie and check access.");return;}
 const token=localStorage.getItem("nenafilms_access_"+movieId);
 if(!token){showToast("Purchase token missing on this device.");return;}
 showToast("Checking payment confirmation…");
 // Webhooks may arrive a little later. Do not treat a browser redirect as proof of payment.
 for(let attempt=0;attempt<5;attempt++){
   try{
     const r=await fetch("/api/access",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({accessToken:token,movieId})});
     const data=await r.json();
     if(r.ok&&data.status==="paid"&&data.downloadUrl){
       showToast("Payment confirmed. Your download link is ready.");
       const a=document.createElement("a");a.href=data.downloadUrl;a.target="_blank";a.rel="noopener noreferrer";a.textContent="Open your secure download";
       a.style.cssText="position:fixed;z-index:20;bottom:75px;left:50%;transform:translateX(-50%);background:#b8ff65;color:#10140c;padding:14px 18px;border-radius:9px;font-weight:800;font-size:12px;box-shadow:0 8px 30px #0008";
       document.body.appendChild(a);localStorage.removeItem("nenafilms_pending_movie");return;
     }
     if(r.status===202){await new Promise(resolve=>setTimeout(resolve,3000));continue;}
     showToast(data.error||"Payment is not confirmed yet. Try again in a moment.");return;
   }catch{await new Promise(resolve=>setTimeout(resolve,2500));}
 }
 showToast("Payment may still be processing. Refresh later to check again.");
}
grid.addEventListener("click",e=>{const b=e.target.closest("[data-movie]");if(b)startPayment(b.dataset.movie);});
search.addEventListener("input",renderMovies);
filters.addEventListener("click",e=>{const b=e.target.closest("[data-genre]");if(!b)return;activeGenre=b.dataset.genre;filters.querySelectorAll("button").forEach(x=>x.classList.toggle("active",x===b));renderMovies();});
document.getElementById("copyNumber").addEventListener("click",async()=>{try{await navigator.clipboard.writeText(moneyNumber);showToast("Payment number copied.");}catch{showToast("Payment number: "+moneyNumber);}});
document.getElementById("year").textContent=new Date().getFullYear();
renderMovies();checkPurchaseReturn();