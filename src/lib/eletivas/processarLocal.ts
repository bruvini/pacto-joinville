import * as XLSX from "xlsx";
import {supabase} from "@/integrations/supabase/client";
import {lerFontesEC, type ArquivoBrutoEC} from "../../../supabase/functions/_shared/eletivas-leitores";
import {conciliarEletivas} from "./motor";
import {validarEstruturaFonte} from "./validarEstruturaFonte";
import type {Json} from "@/integrations/supabase/types";
import {construirManifestoEC,MOTOR_BROWSER,type FonteEscolhida} from "./manifesto";
import {FONTES_ELETIVAS,type FonteId} from "./fontes";
export type {FonteEscolhida} from "./manifesto";
export class ErroPreConciliacao extends Error {
  constructor(public etapa:string,public arquivo:string|undefined,
    public detalhe:string,public orientacao:string){
    super(detalhe);this.name="ErroPreConciliacao";
  }
}
const descricao=(erro:unknown)=>erro instanceof Error?erro.message:String(erro);

const shaHex=(bytes:ArrayBuffer)=>crypto.subtle.digest("SHA-256",bytes).then(digest=>
 [...new Uint8Array(digest)].map(v=>v.toString(16).padStart(2,"0")).join(""));
const categoriaLegivel=(id:string)=>FONTES_ELETIVAS.find(x=>x.id===id)?.rotulo??id;

export async function executarPreConciliacaoLocal(args:{
 id:string;cnes:string;competencia:string;arquivos:FonteEscolhida[];
 progresso?:(msg:string)=>void;
}){
 const {fontes,manifesto,avisos}=construirManifestoEC(args.arquivos,args.competencia);
 const informacoes=[...avisos];
 const brutos:ArquivoBrutoEC[]=[];
 for(const arq of fontes){
   args.progresso?.("Baixando "+categoriaLegivel(arq.categoria)+"…");
   const {data,error}=await supabase.storage.from("eletivas-arquivos").download(arq.storage_path);
   if(error||!data)throw new ErroPreConciliacao("Download",arq.nome_original,
     error?.message??"Arquivo não encontrado.",
     "Confira se o arquivo ainda está na aba Fontes e se você tem permissão para acessá-lo.");
   if(data.size<=0||data.size>50*1024*1024||data.size!==arq.tamanho)
      throw new ErroPreConciliacao("Integridade",arq.nome_original,
        "Tamanho divergente, vazio ou superior a 50 MB.",
        "Reenvie o arquivo oficial sem alterar seu conteúdo.");
   const bytes=await data.arrayBuffer();
   const hash=await shaHex(bytes);
   if(hash!==arq.sha256)throw new ErroPreConciliacao("Integridade",arq.nome_original,
     "O SHA-256 não corresponde ao arquivo importado.",
     "Não modifique o arquivo após o upload; reenvie o original.");
   args.progresso?.("Validando "+categoriaLegivel(arq.categoria)+"…");
   try{
     const resultado=validarEstruturaFonte(
       arq.categoria as FonteId,bytes,args.cnes,arq.nome_original);
     for(const aviso of resultado.avisos??[])
       informacoes.push(arq.nome_original+": "+aviso);
     if(resultado.avisos?.length) {
       const fonte=manifesto.find(f=>f.id===arq.id);
       if(fonte)fonte.observacao="Prestador ausente em "+
         resultado.avisos.length+" aba(s) deste arquivo";
     }
   }catch(e){
     throw new ErroPreConciliacao("Validação do layout",arq.nome_original,
       descricao(e),
       "Confira se esta planilha pertence ao papel identificado. Arquivos de outros hospitais podem estar presentes como apoio, mas não geram valores para o HMSJ.");
   }
   brutos.push({categoria:arq.categoria,bytes});
 }
 let normalizados:ReturnType<typeof lerFontesEC>;
 try{
   args.progresso?.("Lendo matrizes oficiais e quantidades internas…");
   normalizados=lerFontesEC(brutos,args.cnes,
      XLSX as unknown as Parameters<typeof lerFontesEC>[2],args.competencia);
 }catch(e){throw new ErroPreConciliacao("Leitura dos arquivos",undefined,
     descricao(e),"A mensagem identifica o layout ou dado ausente. Confira o arquivo oficial, sem alterar valores para fazer o cálculo passar.");}
 args.progresso?.("Conciliando componentes financeiros no navegador…");
 // Publicação estadual declarada por AIH precisa de documento diferente
 // da planilha que gera a própria soma dos procedimentos-filhos.
 if(normalizados.mult_faec?.length){
   args.progresso?.("Buscando comprovantes independentes de publicação por AIH…");
   const {data:publicacoes,error:evidError}=await supabase
     .from("eletivas_publicacoes_aih").select("*")
     .eq("competencia_id",args.id)
     .order("registrado_em",{ascending:false});
   if(evidError)throw new ErroPreConciliacao("Comprovantes de AIH",undefined,
     evidError.message,
     "Execute a migration da Fase 3 para consultar os comprovantes cadastrados.");
   const docs=new Map<string,{valor_publicado:number;documento_sei:string}>();
   for(const evid of publicacoes??[])
     if(!docs.has(evid.aih))docs.set(evid.aih,evid);
   normalizados.mult_faec=normalizados.mult_faec.map(item=>{
     const comprovante=docs.get(item.aih);
     return comprovante?{...item,
       publicado_independente:Number(comprovante.valor_publicado),
       evidencia_publicacao:comprovante.documento_sei}:item;
   });
 }
 const r=conciliarEletivas(normalizados);
 if(r.impedimentos.length)throw new ErroPreConciliacao(
   "Conferência técnica",undefined,
   r.impedimentos.slice(0,8).join("\n")+
     (r.impedimentos.length>8?"\nMais "+(r.impedimentos.length-8)+" impedimentos.":""),
   "Nenhum resultado parcial foi registrado. Consulte os procedimentos apontados e a memória de múltiplas/sequenciais.");
 if(!r.itens.length)throw new ErroPreConciliacao("Cálculo",undefined,
   "Nenhum item de conciliação foi produzido.",
   "Confira as fontes obrigatórias SIH/SES e seus registros para o CNES "+args.cnes+".");
 args.progresso?.("Gravando pré-conciliação e manifesto com validação de perfil…");
 const {data,error}=await supabase.rpc("ec_importar_itens_local",{
   p_comp:args.id,p_evidencias:manifesto as unknown as Json,
   p_itens:r.itens as unknown as Json,p_motor_versao:MOTOR_BROWSER,
 });
 if(error)throw new ErroPreConciliacao("Gravação no banco",undefined,error.message,
   "Não houve registro parcial. Confira as permissões ou a existência de decisões fiscais anteriores.");
 return {itens:Number(data),totais:r.totais,manifesto,avisos:informacoes};
}
