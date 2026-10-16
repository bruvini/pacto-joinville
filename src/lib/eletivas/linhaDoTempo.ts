import {sanitizarEvidenciaEC} from "./privacidade";
const rotulos:Record<string,string>={
 encontro_criado_via_lancamento:"Encontro criado a partir do lançamento",
 encontro_restaurado:"Encontro restaurado",
 encontro_arquivado:"Encontro arquivado",
 eletivas_competencias_insert:"Competência criada",
 eletivas_competencias_update:"Competência atualizada",
 eletivas_itens_insert:"Item registrado",
 eletivas_itens_update:"Item atualizado",
 eletivas_itens_delete:"Item excluído",
 eletivas_arquivos_insert:"Arquivo importado",
 eletivas_arquivos_delete:"Arquivo removido",
 eletivas_correcoes_insert:"Correção registrada",
 eletivas_decisoes_revisoes_insert:"Decisão fiscal revisada",
 eletivas_fechamentos_insert:"Fechamento registrado",
 eletivas_integracoes_insert:"Integração financeira registrada"
};
const campos:Record<string,string>={
 competencia:"Competência",cnes:"CNES",status_anterior:"Situação anterior",
 status_novo:"Nova situação",status:"Situação",operacao:"Operação",
 tabela:"Tabela",quantidade:"Quantidade",itens:"Itens",arquivos:"Arquivos",
 categoria:"Componente",chave:"Chave",situacao:"Classificação",
 decisao_anterior:"Decisão anterior",decisao_nova:"Nova decisão",
 decisao:"Decisão",motivo:"Justificativa",justificativa:"Justificativa",
 correcao_anterior:"Correção anterior",correcoes_atuais:"Correções atuais"
};
const valores:Record<string,string>={preparacao:"Preparação",auditoria:"Auditoria",
 encerrada:"Encerrado",pendente:"Pendente",aceito:"Aceito",erro:"Erro confirmado",
 oficio:"Ofício",analise:"Em análise",ok:"Compatível",div:"Divergente"};
const legivel=(v:unknown)=>typeof v==="string"?(valores[v]??v.replace(/_/g," ")):
 typeof v==="boolean"?(v?"Sim":"Não"):String(v);
export function descreverEventoEletivas(tipo:string,dados:unknown){
 const origem=dados&&typeof dados==="object"&&!Array.isArray(dados)?
  dados as Record<string,unknown>:{};
 const detalhes=sanitizarEvidenciaEC(origem);
 const conteudo=detalhes as Record<string,unknown>;
 const lista=Object.entries(conteudo).filter(([k,v])=>
  k!=="tabela"&&Object.hasOwn(campos,k)&&v!==null&&v!==undefined&&
  (typeof v==="string"||typeof v==="number"||typeof v==="boolean"))
  .slice(0,12).map(([k,v])=>({rotulo:campos[k],valor:legivel(v)}));
 const titulo=rotulos[tipo]??tipo.replace(/_/g," ");
 const resumo=lista.slice(0,3).map(x=>x.rotulo+": "+x.valor).join(" · ")||
  (typeof conteudo.tabela==="string"?"Registro: "+conteudo.tabela:"Ação registrada na auditoria");
 return {titulo,resumo,campos:lista,detalhes};
}
