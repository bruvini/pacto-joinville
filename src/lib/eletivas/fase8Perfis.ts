export const PERFIS_FASE8=[
 {id:"abril_2026",label:"Abril/2026",desc:"Modelo SES anterior; sem exigência de MAC mult/sequenciais de julho"},
 {id:"julho_2026",label:"Julho/2026",desc:"Layout SES atualizado, múltiplas/sequenciais e deliberação 727"},
 {id:"agosto_ou_posterior",label:"Agosto/2026 ou posterior",desc:"Deliberação 399 e Nota Informativa FPO nº 05/2026"},
] as const;
export const TESTES_FASE8=[
 ["importacao","Fontes oficiais, layouts históricos, negativos e SHA-256"],
 ["permissoes","RLS: leitura, ACP/Admin, anonimato e escrita indevida"],
 ["reprocessamento","Reprocessamento e idempotência sem conciliação parcial"],
 ["decisoes","Decisão/revisão fiscal, justificativas e auditoria"],
 ["fechamento","Checklist documental e bloqueios de encerramento"],
 ["integracao","Conferência de convênio, parcela e origem sem aplicar valor automaticamente"],
 ["relatorios","RTMA e seis seções de Análise conferidos com o HTML"],
 ["exportacoes","Dez abas XLSX e CSV de divergências confrontados com o HTML"],
 ["manifesto_sha","Arquivos congelados e hashes idênticos entre motores"],
 ["confronto_golden","Zero diferenças financeiras e funcionais sem justificativa"],
] as const;
export const perfilDaCompetencia=(c:string)=>{
 if(c==="04/2026")return "abril_2026";
 if(c==="07/2026")return "julho_2026";
 const [mm,yyyy]=c.split("/").map(Number);
 return yyyy*100+mm>=202608?"agosto_ou_posterior":null;
};
