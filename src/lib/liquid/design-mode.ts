/**
 * Script injecté dans l'aperçu de l'éditeur (mode conception, comme l'éditeur de thème Shopify) :
 * contour et étiquette au survol d'une section, clic pour l'ouvrir, boutons « + » entre les sections,
 * liens désactivés. Dialogue avec l'éditeur par postMessage.
 */
export function designModeScript(names: Record<string, string>) {
  return `<style>
[data-section-id]{position:relative}
.rv-outline{outline:2px solid #005bd3!important;outline-offset:-2px!important}
.rv-selected{outline:2px solid #005bd3!important;outline-offset:-2px!important}
.rv-label{position:absolute;top:0;left:0;z-index:2147483000;background:#005bd3;color:#fff;font:12px/1.4 -apple-system,system-ui,sans-serif;padding:2px 8px;border-radius:0 0 6px 0;pointer-events:none;white-space:nowrap}
.rv-add{position:absolute;left:50%;transform:translate(-50%,-50%);z-index:2147483000;width:26px;height:26px;border-radius:50%;background:#005bd3;color:#fff;border:2px solid #fff;font:700 18px/22px sans-serif;text-align:center;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.25);display:none}
[data-section-id]:hover>.rv-add{display:block}
.rv-add-line{position:absolute;left:0;right:0;height:2px;background:#005bd3;opacity:0;pointer-events:none}
</style>
<script>(function(){
var names=${JSON.stringify(names)};
function post(m){try{parent.postMessage(Object.assign({rv:1},m),"*")}catch(e){}}
function label(s){var t=s.getAttribute("data-section-type")||"";return names[s.getAttribute("data-section-id")]||names[t]||t}
document.addEventListener("click",function(e){var a=e.target.closest&&e.target.closest("a[href]");if(a){e.preventDefault()}var b=e.target.closest&&e.target.closest("[data-shopify-editor-block]");var s=e.target.closest&&e.target.closest("[data-section-id]");if(!s)return;if(e.target.classList.contains("rv-add")){e.preventDefault();e.stopPropagation();post({type:"add",after:s.getAttribute("data-section-id")});return}var blockId=null;if(b){try{blockId=JSON.parse(b.getAttribute("data-shopify-editor-block")).id}catch(x){}}post({type:"select",id:s.getAttribute("data-section-id"),blockId:blockId});e.preventDefault();e.stopPropagation()},true);
document.addEventListener("submit",function(e){e.preventDefault()},true);
var cur=null,lab=null;
document.addEventListener("mouseover",function(e){var s=e.target.closest&&e.target.closest("[data-section-id]");if(s===cur)return;if(cur){cur.classList.remove("rv-outline");if(lab){lab.remove();lab=null}}cur=s;if(!s)return;s.classList.add("rv-outline");lab=document.createElement("div");lab.className="rv-label";lab.textContent=label(s);s.appendChild(lab);post({type:"hover",id:s.getAttribute("data-section-id")})});
function addButtons(){document.querySelectorAll("[data-section-id]").forEach(function(s){if(s.querySelector(":scope>.rv-add"))return;var btn=document.createElement("button");btn.type="button";btn.className="rv-add";btn.textContent="+";btn.title="Ajouter une section ici";btn.style.bottom="0";btn.style.top="auto";btn.style.transform="translate(-50%,50%)";s.appendChild(btn)})}
// Le script est injecté dans <head> : les sections n'existent qu'une fois le document chargé.
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",function(){addButtons();post({type:"ready",y:window.scrollY})});else{addButtons();post({type:"ready",y:window.scrollY})}
window.addEventListener("message",function(e){var m=e.data||{};if(!m.rv)return;if(m.type==="select"){document.querySelectorAll(".rv-selected").forEach(function(x){x.classList.remove("rv-selected")});var s=m.id&&document.querySelector('[data-section-id="'+CSS.escape(m.id)+'"]');if(s){s.classList.add("rv-selected");if(!m.quiet)s.scrollIntoView({behavior:"smooth",block:"start"})}}if(m.type==="scroll"){window.scrollTo(0,m.y)}});
window.addEventListener("scroll",function(){post({type:"scrolled",y:window.scrollY})},{passive:true});
})();</script>`;
}
