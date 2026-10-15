/* Fase 7 — instalar como SCRIPT CLÁSSICO após o script principal do HTML.
 * Uso isolado/offline: só exporta após a conciliação real. Não lê pacientes.
 * Exemplo: <script src="ec-golden-html.js"></script> antes de </body>.
 * O arquivo NÃO é executado por importação no app React. */
(function(){
 "use strict";
 const catSet=new Set(["faec_prod","faec_compl","faec_mult","faec_fxmac",
  "mac_compl","mac_mult","mac_fxfaec","mac_prod","mac_fxfed","sia_faec","sia_mac"]);
 const categorias=[...catSet], cents=v=>Math.round(Number(v||0)*100);
 const empty=()=>Object.fromEntries(categorias.map(c=>[c,0]));
 const ref=()=>typeof R!=="undefined"&&R&&Array.isArray(R.items)?R:null;
 function ready(){
  if(!ref()||typeof aggregates!=="function"||typeof countedPayValue!=="function"
    ||typeof payValue!=="function"||typeof expectedPayValue!=="function")
    throw Error("Execute o motor original e concilie as fontes antes de exportar.");
 }
 const sha=async buf=>{
  const h=await crypto.subtle.digest("SHA-256",buf);
  return [...new Uint8Array(h)].map(b=>b.toString(16).padStart(2,"0")).join("");
 };
 async function exportar(){
  ready();
  const fontes=[];
  for(const [categoria,arquivo] of Object.entries(FILES)){
   if(!arquivo||!arquivo.buffer||!categoria)continue;
   const bytes=arquivo.buffer instanceof ArrayBuffer?arquivo.buffer:
     arquivo.buffer.buffer instanceof ArrayBuffer?arquivo.buffer.buffer:null;
   if(!bytes)throw Error("Fonte sem bytes verificáveis: "+categoria);
   fontes.push({categoria,sha256:await sha(bytes)});
  }
  if(!fontes.length)throw Error("Não há evidências importadas com hash para este encontro.");
  const subtotais=empty();
  const itens=R.items.map(item=>{
   if(!catSet.has(item.cat))throw Error("Categoria não reconhecida; não exportar parcial.");
   const decisao=typeof decisionOf==="function"?decisionOf(item.id)?.dec||"":"";
   const admitidoCent=cents(countedPayValue(item));
   if(item.cat!=="faec_fxmac")subtotais[item.cat]+=admitidoCent;
   return {
    chave:String(item.id),categoria:item.cat,aih:String(item.aih||""),
    procedimento:String(typeof p9==="function"?p9(item.proc):item.proc||""),
    qtAIH:Number.isInteger(item.qtMine)?item.qtMine:null,
    qtInterna:Number.isInteger(item.qtProc)?item.qtProc:
      Number.isInteger(item.qtInterna)?item.qtInterna:null,
    publicadoCent:cents(payValue(item)),esperadoCent:cents(expectedPayValue(item)),
    admitidoCent:item.cat==="faec_fxmac"?0:admitidoCent,
    situacao:String(item.status||""),decisao,
   };
  }).sort((a,b)=>a.chave.localeCompare(b.chave,"pt-BR"));
  const a=aggregates(),totalCent=cents(a.totalAtesto),correcoesCent=cents(a.correcoes);
  const soma=Object.values(subtotais).reduce((x,y)=>x+y,0);
  if(soma+correcoesCent!==totalCent)
   throw Error("Golden master inconsistente com aggregates(): "+
    "subtotais/correções não amarram com o total. Verifique o HTML e as decisões.");
  const g={schema:"ec-golden-v1",origem:"html",
   competencia:typeof compKey==="function"?compKey():"",
   cnes:String(CNES),versaoMotor:"legado-HTML",
   versaoReferencia:document.title||"HTML de referência",
   fontes:fontes.sort((a,b)=>a.categoria.localeCompare(b.categoria)),
   itens,componentes:subtotais,totalCent,correcoesCent,status:"capturado"};
  const json=JSON.stringify(g,null,2);
  // Diagnóstico defensivo; nunca inclui nomes, CPF/CNS ou texto da fonte.
  const blob=new Blob([json],{type:"application/json"});
  const url=URL.createObjectURL(blob);
  const el=document.createElement("a");el.href=url;
  el.download="EC_golden_HTML_"+g.competencia.replace("/","-")+".json";
  document.body.appendChild(el);el.click();el.remove();
  setTimeout(()=>URL.revokeObjectURL(url),2000);
 }
 const btn=document.createElement("button");
 btn.textContent="Exportar golden master (sem dados nominativos)";
 btn.type="button";btn.id="ec-golden-export";
 Object.assign(btn.style,{position:"fixed",right:"12px",bottom:"12px",zIndex:"2147483646",
   padding:"11px",borderRadius:"7px",background:"#123b61",color:"#fff",
   fontFamily:"Arial,sans-serif",cursor:"pointer",boxShadow:"0 2px 8px #777"});
 btn.addEventListener("click",()=>{
  btn.disabled=true;btn.textContent="Verificando hashes...";
  exportar().catch(e=>alert("Golden master não gerado: "+String(e?.message||"erro técnico")))
   .finally(()=>{btn.disabled=false;btn.textContent="Exportar golden master (sem dados nominativos)";});
 });
 if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",()=>document.body.appendChild(btn));
 else document.body.appendChild(btn);
})();
