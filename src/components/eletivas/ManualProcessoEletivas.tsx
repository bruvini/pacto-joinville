import {BookOpen,FileArchive,Scale,Mail,ShieldCheck,ArrowRight} from "lucide-react";
import {normaParaCompetencia} from "../../../supabase/functions/_shared/eletivas-normativas";
const passos=[
 ["Fontes da competência","Importe DBFs TabWin, planilhas SES SIH/SIA, múltiplas/sequenciais, workbook de AIHs, FPO e consolidados. O reconhecimento deve ser pela estrutura interna; os arquivos mantêm SHA-256 e armazenamento privado."],
 ["Painel","Confira FAEC, MAC, SIA, correções e consolidado financeiro. Pubicado, esperado, admitido, diferenças e controle FAEC faixa MAC são conceitos distintos."],
 ["Correções recebidas","Informe competência de origem, AIHs, referência da SES e SEI. O crédito só é incorporado após aprovação fiscal e não pode ser duplicado."],
 ["FPO · Art. 19","Confronte o arquivo oficial com os documentos de programação efetiva. FPO publicada não equivale a repasse nem a programação comprovada."],
 ["Auditor de faixa","Abra o dossiê da AIH, verifique faixa 1/5, principal, filhos, anexos da CIB e memória. Múltiplas com classificação mista não recebem crédito automático."],
 ["Comunicações","Central de Regulação esclarece a distribuição das faixas; GEMAS recebe revisões aptas; casos FPO sem produção aprovada permanecem internos."],
 ["Itens conciliados","Contém itens reconhecidos e conferidos. Não confundir compatibilidade aritmética com pagamento sem comprovação."],
 ["Fila de auditoria","Trate pendências e registre decisões motivadas. Reabertura de decisão preserva versões e autoria."],
 ["Atesto (SEI)","Prepare o Relatório Técnico de Monitoramento, a Análise e o parecer. O vínculo ao lançamento e as assinaturas institucionais são verificados separadamente."],
 ["Exportar","Gere os relatórios e a memória analítica, evitando exposição de CPF/pacientes. Homologue cada total contra o HTML original antes do encerramento."],
 ["Manual do processo","Utilize este fluxo como roteiro de operação, segurança e rastreabilidade. Registros de auditoria permanecem imutáveis."]
] as const;
export function ManualProcessoEletivas({competencia,onNavigate}:{
 competencia:string;onNavigate:(aba:string)=>void;
}){
 const norma=normaParaCompetencia(competencia);
 return <div className="ec-sections space-y-4">
  <div className="rounded-2xl bg-[#17372e] p-6 text-white md:p-9 relative overflow-hidden">
   <div className="absolute right-0 top-8 h-4 w-44 rotate-[-15deg] bg-[#ef202c]"/>
   <div className="absolute right-0 top-16 h-4 w-44 rotate-[-15deg] bg-[#a6ce2e]"/>
   <p className="text-[10px] tracking-[.16em] uppercase font-bold text-[#c6dbcd]">Manual do processo · v2.42.2</p>
   <h3 className="font-serif text-3xl font-bold mt-2 max-w-lg">Uma trilha verificável da fonte ao atesto.</h3>
   <p className="mt-3 max-w-2xl text-sm text-[#d5e2da]">Conferência do Hospital Municipal São José
    pela Área de Convênios e Parcerias. Nada é automaticamente reconhecido
    como crédito por estar previsto em planilha, FPO ou minuta.</p>
  </div>
  <section className="ec-paper">
   <h3>Contexto normativo · {competencia}</h3>
   <p className="text-sm">Deliberação: <strong>{norma?.rotulo??"fora do período das matrizes congeladas"}</strong>.
    {norma&&<> Vigência {String(norma.inicio).slice(4)}/{String(norma.inicio).slice(0,4)}
      {" a "}{String(norma.fim).slice(4)}/{String(norma.fim).slice(0,4)}.
      Anexos I/II: {norma.anexoI.size} / {norma.anexoII.size} procedimentos.</>}</p>
   <p className="ec-footnote">Regra documental e decisão fiscal exigem comprovação
    da competência e memória individual. Consulte o verificador normativo na lateral.</p>
  </section>
  <section className="ec-ledger">
   <div className="ec-ledger-head">
    <div><h3><BookOpen className="mr-2 inline h-4 w-4"/>Roteiro de trabalho</h3>
     <p>Onze seções em ordem correspondente à referência HTML.</p></div>
   </div>
   <div className="grid gap-3 p-4 md:grid-cols-2">
    {passos.map(([titulo,descricao],i)=><article key={titulo}
     className="rounded-xl border bg-white p-4">
     <span className="text-xs font-mono font-bold text-[#b41d27]">
      {String(i+1).padStart(2,"0")}</span>
     <h4 className="mt-1 font-semibold">{titulo}</h4>
     <p className="ec-footnote">{descricao}</p>
     <button type="button" className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-[#245c42]"
      onClick={()=>onNavigate(["arquivos","painel","correcoes","fpo","faixas",
       "comunicacoes","pagos","fila","atesto","exportar","manual"][i])}>
      {titulo==="Manual do processo"?"Você está aqui":"Abrir seção"}
      <ArrowRight className="h-3 w-3"/></button>
    </article>)}
   </div>
  </section>
  <div className="grid gap-3 md:grid-cols-3">
   {[
    {Icon:FileArchive,title:"Origem verificável",desc:"Fonte, aba, SHA-256, competência, CNES e memória de cada AIH/procedimento."},
    {Icon:Scale,title:"Decisão versionada",desc:"Conferência do fiscal, justificativa e registro de revisões, sem sobrescrever a fonte."},
    {Icon:Mail,title:"Envio com comprovante",desc:"Minuta não é envio. Só registre e-mail realmente enviado com protocolo institucional."}
   ].map(({Icon,title,desc})=><div key={title} className="ec-paper">
    <Icon className="h-5 w-5 text-[#36745a]"/><strong className="mt-2 block text-sm">{title}</strong>
    <p className="ec-footnote">{desc}</p>
   </div>)}
  </div>
  <div className="ec-paper"><h3 className="flex items-center gap-2">
   <ShieldCheck className="h-4 w-4"/>Preservação institucional</h3>
   <p className="text-sm">A reabertura formal, o histórico de decisões,
    a autorização ACP/Admin e o vínculo ao lançamento original permanecem
    separados da apresentação visual. Consulte o histórico abaixo.</p>
  </div>
 </div>;
}
