import type {Tables} from "@/integrations/supabase/types";
import {sanitizarEvidenciaEC} from "@/lib/eletivas/privacidade";
import {CATEGORIAS_ELETIVAS,reais} from "@/lib/eletivas/financeiro";

type Item=Tables<"eletivas_itens">;
type Dados=Record<string,unknown>;
const objeto=(v:unknown):Dados=>v&&typeof v==="object"&&!Array.isArray(v)?v as Dados:{};
const lista=(v:unknown):Dados[]=>Array.isArray(v)?v.map(objeto):[];
const numero=(v:unknown):number|null=>{
  if(v===null||v===undefined||v==="")return null;
  const n=Number(v);return Number.isFinite(n)?n:null;
};
const dinheiro=(v:unknown)=>numero(v)===null?"Não informado":
  reais(Math.round(numero(v)!*100));
const texto=(v:unknown)=>String(v??"").trim()||"Não informado";
const qtd=(v:unknown)=>numero(v)===null?"Não informado":String(numero(v));
const nomeCategoria=(c:string)=>CATEGORIAS_ELETIVAS.find(a=>a[0]===c)?.[1]??c;
const labelStatus:Record<string,string>={
  ok:"Valores compatíveis — conferir evidências",
  info:"Informação publicada — verificar origem",
  div:"Divergência encontrada",
  nc:"Não contemplado na publicação",
  fora:"Fora do rol de referência",
  pendente:"Pendente de comprovação",
};
const passos=(item:Item,d:Dados)=>{
  const all:string[]=[];
  if(item.categoria==="faec_mult"||item.categoria==="mac_mult"){
    all.push("Confirme a AIH e o procedimento principal na tabulação e no workbook.");
    all.push("Confronte cada filho, sua quantidade (QT), natureza de financiamento e unitário da CIB.");
    all.push("Compare o valor estadual realmente publicado com a memória independente. A soma dos próprios filhos não comprova pagamento.");
    if(d.exige_programacao_fpo)all.push(
      "Faixa federal: solicite comprovante da programação FPO efetiva e identifique a responsabilidade antes de propor cobrança estadual.");
  }else if(item.categoria==="faec_fxmac"){
    all.push("Este é um recorte de controle: confira a classificação da faixa, mas NÃO acrescente o valor novamente ao atesto.");
  }else{
    all.push("Confira o procedimento e a quantidade nas fontes do SIH/SIA e da SES.");
    all.push("Compare o financeiro estadual, o esperado pela Delib e o complemento, sem somar produção em duplicidade.");
  }
  if(item.situacao==="div")all.push("Explique a diferença, identifique quem deve corrigi-la e anexe a referência SEI antes da decisão.");
  if(item.situacao==="nc")all.push("Ausência na publicação não comprova dívida: verifique vigência, enquadramento e competência.");
  if(item.situacao==="fora")all.push("Confirme se existe previsão normativa; sem ela, não gere cobrança automática.");
  if(item.situacao==="info")all.push("Verifique se a publicação corresponde a competência anterior ou arquivo complementar.");
  if(item.situacao==="ok")all.push("Se as evidências sustentarem os valores, confirme a conferência. Não é necessário escolher decisão para item conciliado.");
  return all;
};
/** Mantém a orientação fiscal separada da regra financeira: não atribui decisões. */
export function requerRevisaoDocumental(item:Pick<Item,"categoria"|"situacao"|"detalhe">){
 const d=objeto(item.detalhe);
 const perfil=objeto(d.perfil);
 return item.situacao==="pendente"||
  (["faec_mult","mac_mult"].includes(item.categoria)&&
    (d.publicacao_independente!==true||d.base_independente_comprovada!==true))||
  d.exige_programacao_fpo===true||d.ato_especial_pendente===true||
  perfil.natureza==="Federal";
}
const celula=(o:Dados)=>[o.aba,o.celula].filter(Boolean).join(" · ");
function Campo({nome,valor}:{nome:string;valor:string}){
 return <div className="rounded-md bg-background border p-2">
  <dt className="text-xs text-muted-foreground">{nome}</dt>
  <dd className="text-sm font-semibold break-words">{valor}</dd>
 </div>;
}
function GradeFilhos({filhos,titulo}:{filhos:Dados[];titulo:string}){
 if(!filhos.length)return null;
 return <div className="space-y-2">
  <h5 className="font-medium text-xs">{titulo} ({filhos.length})</h5>
  <div className="overflow-auto rounded-md border">
   <table className="min-w-[580px] w-full text-xs text-left">
    <thead className="bg-muted/50"><tr>
      <th className="p-2">Procedimento filho</th><th className="p-2">QT</th>
      <th className="p-2">Unitário / CIB</th><th className="p-2">Valor</th>
      <th className="p-2">Natureza</th>
    </tr></thead>
    <tbody>{filhos.map((f,i)=>{
      const unit=f.unitario??f.unitario_cib??f.unit;
      return <tr key={i} className="border-t">
        <td className="p-2 font-mono">{texto(f.proc)}</td>
        <td className="p-2">{qtd(f.qt)}</td>
        <td className="p-2">{dinheiro(unit)}</td>
        <td className="p-2">{dinheiro(f.valor??(
          numero(f.qt)!==null&&numero(unit)!==null?
          numero(f.qt)!*numero(unit)!:null))}</td>
        <td className="p-2">{texto(f.natureza??f.natureza_cib??"—")}</td>
      </tr>;
    })}</tbody>
   </table>
  </div>
 </div>;
}
export function DossieFiscalEletivas({item}:{item:Item}){
 const d=objeto(item.detalhe),p=objeto(d.perfil),f=objeto(d.financeiro);
 const publicado=f.estadual_publicado??item.valor_publicado;
 const esperado=f.esperado??item.valor_esperado;
 const inseguro=requerRevisaoDocumental(item);
 const individual=lista(d.aihs),filhos=lista(d.filhos);
 const origem=objeto(d.origem_ses);
 const fonte=Object.entries(origem).filter(([,v])=>Object.keys(objeto(v)).length);
 return <div className="mt-3 space-y-3 text-xs">
  <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
   <div className="flex flex-wrap items-center justify-between gap-2">
    <strong className="text-sm">{labelStatus[item.situacao]??item.situacao}</strong>
    <span className="text-muted-foreground">{nomeCategoria(item.categoria)}</span>
   </div>
   {d.justificativa&&<p className="leading-relaxed">{texto(d.justificativa)}</p>}
   {inseguro&&<p className="rounded-md border border-amber-300 bg-amber-50 p-2 text-amber-900">
     <strong>Exige comprovação adicional.</strong> Não se deve considerar este item
     automaticamente conciliado, ainda que valores anteriores pareçam iguais.
     {item.situacao==="ok"?" Este registro pode ter sido gerado por uma versão anterior do motor.":""}
   </p>}
   <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
    <Campo nome="Estado publicou" valor={dinheiro(publicado)}/>
    <Campo nome="Esperado / memória" valor={dinheiro(esperado)}/>
    <Campo nome="Admitido provisoriamente" valor={
       inseguro?"A confirmar":dinheiro(f.fiscalmente_admitido_provisorio??0)}/>
    <Campo nome="Diferença" valor={dinheiro(
      (numero(esperado)??0)-(numero(publicado)??0))}/>
   </div>
   {d.financeiro&&<p className="text-muted-foreground">
     {texto(f.observacao)} {f.controle_nao_somar?"Este recorte NÃO soma no atesto.":""}
   </p>}
  </div>
  {(item.aih||p.faixa||d.principal)&&<div className="grid grid-cols-2 gap-2 md:grid-cols-4">
   <Campo nome="AIH" valor={texto(item.aih??d.aih_origem)}/>
   <Campo nome="Principal" valor={texto(p.principal??d.principal??item.procedimento)}/>
   <Campo nome="Faixa" valor={texto(p.faixa)} />
   <Campo nome="Financiamento" valor={texto(p.natureza)}/>
  </div>}
  <GradeFilhos filhos={filhos} titulo="Procedimentos-filhos informados pela SES"/>
  <GradeFilhos filhos={lista(p.filhos)} titulo="Composição independente do workbook / CIB"/>
  {individual.length>0&&<details className="rounded-md border bg-muted/10 p-3" open={individual.length<=5}>
   <summary className="cursor-pointer font-semibold">AIHs incluídas no consolidado ({individual.length})</summary>
   <div className="mt-3 space-y-2">{individual.map((a,i)=><div key={i} className="rounded-md border p-2 space-y-2">
     <strong>AIH {texto(a.aih)} · faixa {texto(a.faixa)} · {texto(a.natureza)}</strong>
     <p>Principal: {texto(a.principal)} · Elegível: {a.elegivel===true?"Sim":a.elegivel===false?"Não":"Não comprovado"}</p>
     {a.motivo&&<p className="text-amber-800">{texto(a.motivo)}</p>}
     <GradeFilhos filhos={lista(a.filhos)} titulo="QT e unitários dos filhos"/>
   </div>)}</div>
  </details>}
  {(d.qt_aihs!==undefined||d.qt_procedimentos!==undefined||d.qt_ses!==undefined)&&
   <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
     <Campo nome="AIHs na tabulação" valor={qtd(d.qt_aihs??d.qt_local)}/>
     <Campo nome="Procedimentos (QT)" valor={qtd(d.qt_procedimentos??d.qt_elegiveis)}/>
     <Campo nome="Físico SES" valor={qtd(d.qt_ses)}/>
   </div>}
  {fonte.length>0&&<div className="rounded-md border p-3 space-y-1">
   <strong>Onde conferir na planilha SES</strong>
   {fonte.map(([tipo,dado])=><p key={tipo}>{tipo}: {celula(objeto(dado))||
     "Consulte a origem do registro"} · código original {texto(objeto(dado).codigo_original)}</p>)}
  </div>}
  {(d.fpo_oficial||d.exige_programacao_fpo)&&<div className="rounded-md border p-3 space-y-1">
   <strong>FPO / Art. 19 / Nota Informativa 05/2026</strong>
   {d.fpo_oficial?<p>Parâmetro de referência disponível: {dinheiro(objeto(d.fpo_oficial).federal)}
     {" "}federal por unidade. Isso não é comprovante da programação efetiva do prestador.</p>:
     <p>É necessário obter e anexar o comprovante de programação efetiva antes de atribuir responsabilidade financeira.</p>}
  </div>}
  <div className="rounded-lg border p-3 space-y-2">
   <strong className="text-sm">O que o fiscal precisa verificar?</strong>
   <ol className="list-decimal space-y-1 pl-5">
    {passos(item,d).map((passo,i)=><li key={i}>{passo}</li>)}
   </ol>
   <p className="text-muted-foreground">Conferir não é aceitar automaticamente. A decisão deve refletir as evidências e a justificativa registrada no processo.</p>
  </div>
  <details className="rounded-md border p-2">
   <summary className="cursor-pointer text-muted-foreground">Dados técnicos completos (para suporte e rastreabilidade)</summary>
   <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/20 p-3 text-[11px]">{JSON.stringify(sanitizarEvidenciaEC(d),null,2)}</pre>
  </details>
 </div>;
}
