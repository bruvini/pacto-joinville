/* Referência congelada: Auditoria - Cirurgias Eletivas - 102026.html · v2.42.2.
 * Executar como script clássico APÓS o script inline do HTML de referência.
 * Exporta ec-golden-v1 sem nomes/CPF/CNS de pacientes, para comparação fiscal.
 * NÃO modifica estado, decisões, lançamentos ou cálculos do HTML.
 * A autenticidade do HTML é conferida fora do navegador, pelo inventário SHA-256.
 */
(function(){
  "use strict";
  const categorias=["faec_prod","faec_compl","faec_mult","faec_fxmac",
    "mac_compl","mac_mult","mac_fxfaec","mac_prod","mac_fxfed","sia_faec","sia_mac"];
  const catSet=new Set(categorias);
  const cent=v=>Math.round(Number(v??0)*100);
  const soDigitos=x=>String(x??"").replace(/\D/g,"");
  const sha=async buffer=>{
    const dig=await crypto.subtle.digest("SHA-256",buffer);
    return [...new Uint8Array(dig)].map(b=>b.toString(16).padStart(2,"0")).join("");
  };
  function bytesExatos(raw){
    if(raw instanceof ArrayBuffer)return raw;
    if(ArrayBuffer.isView(raw))return raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength);
    throw Error("Formato de bytes não verificável no HTML.");
  }
  function pronto(){
    if(typeof R==="undefined"||!R||!Array.isArray(R.items)||!R.items.length||
      typeof aggregates!=="function"||typeof countedPayValue!=="function"||
      typeof expectedPayValue!=="function"||typeof payValue!=="function"||
      typeof correctionTotal!=="function"||typeof decisionOf!=="function"||
      typeof compKey!=="function"||typeof FILES==="undefined")
      throw Error("Execute a conciliação do HTML v2.42.2 antes de exportar.");
  }
  async function exportar(){
    pronto();
    const competencia=String(compKey());
    const cnes=String(CNES);
    if(!/^\d{2}\/20\d{2}$/.test(competencia)||!/^\d{7}$/.test(cnes))
      throw Error("Competência/CNES institucional inválido.");
    const fontes=[];
    for(const [categoria,arquivo] of Object.entries(FILES)){
      if(!arquivo)continue;
      if(!arquivo.buffer)throw Error("Fonte sem conteúdo para hash: "+categoria);
      fontes.push({categoria,sha256:await sha(bytesExatos(arquivo.buffer))});
    }
    if(!fontes.length)throw Error("Nenhuma fonte original disponível.");
    const componentes=Object.fromEntries(categorias.map(c=>[c,0]));
    const chaves=new Set();
    const itens=R.items.map(item=>{
      if(!catSet.has(item.cat))throw Error("Categoria não reconhecida na auditoria.");
      const chave=String(item.id??"");
      if(!chave.startsWith(item.cat+"|")||!/^[a-z_]+\|[0-9]+$/.test(chave)||chaves.has(chave))
        throw Error("Chave técnica duplicada ou não padronizada; revise a origem.");
      chaves.add(chave);
      // O recorte FAEC faixa MAC integra a memória, mas não o total financeiro.
      const admitidoCent=item.cat==="faec_fxmac"?0:cent(countedPayValue(item));
      componentes[item.cat]+=admitidoCent;
      const aih=soDigitos(item.aih),proc=soDigitos(item.proc);
      const qts=Array.isArray(item.aihs)?item.aihs:[];
      const qtInterna=Number.isInteger(item.qtProc)?item.qtProc:
        qts.length&&qts.every(a=>Number.isInteger(a.qt))?
          qts.reduce((n,a)=>n+a.qt,0):
          Number.isInteger(item.qtMine)?item.qtMine:null;
      return {chave,categoria:item.cat,aih,
        procedimento:typeof p9==="function"?soDigitos(p9(proc)):proc.slice(0,9),
        qtAIH:Number.isInteger(item.qtMine)?item.qtMine:null,
        qtInterna,publicadoCent:cent(payValue(item)),
        esperadoCent:cent(expectedPayValue(item)),admitidoCent,
        situacao:String(item.status||""),decisao:String(decisionOf(item.id)?.dec||"")};
    }).sort((a,b)=>a.chave.localeCompare(b.chave,"pt-BR"));
    const a=aggregates();
    const correcoesCent=cent(correctionTotal());
    const subtotalCent=Object.values(componentes).reduce((x,y)=>x+y,0);
    if(subtotalCent!==cent(a.recEC))
      throw Error("Subtotais não fecham com aggregates().recEC; não exportar dados inconsistentes.");
    if(correcoesCent!==cent(a.correcoes)||
       cent(a.totalAtesto)!==subtotalCent+correcoesCent)
      throw Error("Correções/total do atesto não fecham com aggregates().totalAtesto.");
    const golden={schema:"ec-golden-v1",origem:"html",competencia,cnes,
      versaoMotor:"HTML-v2.42.2",versaoReferencia:"HTML 2.42.2 · SHA-256 documental 75494e80",
      fontes:fontes.sort((a,b)=>a.categoria.localeCompare(b.categoria)),
      itens,componentes,totalCent:cent(a.totalAtesto),correcoesCent,status:"capturado"};
    const blob=new Blob([JSON.stringify(golden,null,2)],{type:"application/json"});
    const url=URL.createObjectURL(blob);
    const link=document.createElement("a");
    link.href=url;link.download="EC_golden_HTML_2422_"+competencia.replace("/","-")+".json";
    document.body.appendChild(link);link.click();link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),2000);
  }
  const botao=document.createElement("button");
  botao.type="button";botao.id="ec-golden-export-102026";
  botao.textContent="Exportar golden master · HTML 2.42.2";
  Object.assign(botao.style,{position:"fixed",right:"12px",bottom:"12px",zIndex:"2147483646",
    padding:"11px",borderRadius:"7px",background:"#123b61",color:"#fff",cursor:"pointer"});
  botao.addEventListener("click",()=>{
    botao.disabled=true;
    exportar().catch(e=>alert("Golden master não gerado: "+String(e?.message||e)))
      .finally(()=>{botao.disabled=false;});
  });
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",()=>document.body.appendChild(botao));
  else document.body.appendChild(botao);
})();
