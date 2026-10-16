#!/usr/bin/env node
/** Inventário verificável do HTML oficial, sem publicar arquivo-fonte ou dados de pacientes. */
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';

export const REFERENCIA={
  nome:'Auditoria - Cirurgias Eletivas - 102026.html',
  versao:'2.42.2',
  sha256:'75494e80e28fc59596e43a2ba0fb7a0caf9a50bafbd3a5f4c94dd95a22fe7186',
  linhas:8883,
  funcoesDeclaradas:313,
  telas:['arquivos','painel','correcoes','fpo','faixas','comunicacoes','pagos','fila','atesto','exportar','manual'],
};
const grupos={
  leitura:['parseDBF','parseConsolidadoSES','parseMultSeq','parseMacMultSeq','parseAihWb','parseFpoOfficial','reconcile'],
  normativa:['normativeRuleFor','normativeProcedure','normativeMatchesAih','auditProfiles','auditSummary'],
  financeiro:['expectedPayValue','payValue','countedPayValue','isCounted','oficioValue','aggregates','correctionTotal'],
  fiscal:['loadDecisions','saveDecision','decisionOf','loadCorrections','saveCorrections','renderCorrections','renderFaixas','renderFila'],
  comunicacoes:['loadCommunications','saveCommunications','queueRegularizationCommunication','markCommunicationsSent','buildConsolidatedCommunication','renderCommunications'],
  documentos:['renderAtesto','reportCriticalDataIssues','renderExport'],
  ui:['goView','renderPainel','renderFpo','renderPagos','renderDossierAihList','renderProcedurePanorama','renderPatientResults'],
};
export function inventariar(html){
  const sha256=createHash('sha256').update(html).digest('hex');
  const linhas=html.replace(/\r?\n$/, "").split(/\r?\n/).length;
  const funcoes=[...html.matchAll(/^[ \t]*(?:async[ \t]+)?function[ \t]+([\w$]+)[ \t]*\(/gm)]
    .map(m=>({nome:m[1],linha:html.slice(0,m.index).split('\n').length}));
  const telas=[...html.matchAll(/<button\b[^>]*\bdata-view="([\w-]+)"[^>]*>/gm)]
    .map(m=>m[1]);
  const indice=new Map(funcoes.map(f=>[f.nome,f.linha]));
  const gruposMap=Object.fromEntries(Object.entries(grupos).map(([grupo,nomes])=>
    [grupo,nomes.map(nome=>({nome,linha:indice.get(nome)??null}))]));
  const problemas=[];
  if(sha256!==REFERENCIA.sha256)problemas.push('SHA-256 divergente');
  if(linhas!==REFERENCIA.linhas)problemas.push('quantidade de linhas divergente');
  if(funcoes.length!==REFERENCIA.funcoesDeclaradas)problemas.push('quantidade de funções divergente');
  if(JSON.stringify(telas)!==JSON.stringify(REFERENCIA.telas))problemas.push('ordem/número das 11 telas divergente');
  for(const [grupo,nomes] of Object.entries(gruposMap))for(const f of nomes)
    if(f.linha===null)problemas.push('função ausente em '+grupo+': '+f.nome);
  if(!html.includes('v2.42.2'))problemas.push('versão 2.42.2 não localizada');
  return {schema:'ec-referencia-inventario-v1',referencia:REFERENCIA.nome,
    versao:REFERENCIA.versao,sha256,linhas,totalFuncoes:funcoes.length,
    telas,grupos:gruposMap,funcoes,problemas,congelado:problemas.length===0};
}
const executado=process.argv[1]&&resolve(process.argv[1])===resolve(new URL(import.meta.url).pathname);
if(executado){
  const arquivo=process.argv[2];
  if(!arquivo){console.error('Uso: node scripts/eletivas-fase0-inventario.mjs "/caminho/HTML oficial.html"');process.exitCode=2;}
  else {
    try{
      const resultado=inventariar(readFileSync(arquivo,"utf8"));
      console.log(JSON.stringify(resultado,null,2));
      if(!resultado.congelado)process.exitCode=1;
    }catch(e){console.error('Falha ao ler referência: '+e.message);process.exitCode=2;}
  }
}
