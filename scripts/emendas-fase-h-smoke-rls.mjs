#!/usr/bin/env node
/**
 * Homologação H · contratos RLS e RPCs com usuários REAIS do ambiente isolado.
 * Não executa nenhuma escrita: todas as tentativas de RPC usam valor inválido.
 * Executar apenas depois de H1 e restauração validada na homologação.
 *
 * ENV obrigatórias:
 * HOMO_SUPABASE_URL, HOMO_SUPABASE_ANON_KEY,
 * PROD_SUPABASE_URL (para vedar a mesma instância),
 * HOMO_TOKEN_ADMIN, HOMO_TOKEN_ACP, HOMO_TOKEN_ACO,
 * HOMO_ASSERT_ISOLATED="SIM_AMBIENTE_SEGREGADO"
 */
import {createClient} from "@supabase/supabase-js";
const required=[
 "HOMO_SUPABASE_URL","HOMO_SUPABASE_ANON_KEY","PROD_SUPABASE_URL",
 "HOMO_TOKEN_ADMIN","HOMO_TOKEN_ACP","HOMO_TOKEN_ACO","HOMO_ASSERT_ISOLATED"
];
const missing=required.filter(k=>!process.env[k]);
if(missing.length){console.error("Faltam variáveis necessárias: "+missing.join(", "));process.exit(2);}
if(process.env.HOMO_ASSERT_ISOLATED!=="SIM_AMBIENTE_SEGREGADO"){
 console.error("ABORTADO: homologação isolada não foi confirmada.");process.exit(2);
}
const url=new URL(process.env.HOMO_SUPABASE_URL);
const prod=new URL(process.env.PROD_SUPABASE_URL);
if(url.protocol!=="https:"||url.origin===prod.origin){
 console.error("ABORTADO: URL de homologação insegura ou igual à produção.");process.exit(2);
}
const client=(jwt)=>createClient(url.origin,process.env.HOMO_SUPABASE_ANON_KEY,{
 auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
 global:{headers:jwt?{Authorization:"Bearer "+jwt}:{}}
});
const users=[
 {papel:"admin",jwt:process.env.HOMO_TOKEN_ADMIN,edit:true},
 {papel:"acp",jwt:process.env.HOMO_TOKEN_ACP,edit:true},
 {papel:"aco",jwt:process.env.HOMO_TOKEN_ACO,edit:false},
 {papel:"anon",jwt:null,edit:false}
];
const resultados=[];let falhas=0;
function check(papel,nome,ok,detalhe){
 resultados.push({papel,teste:nome,resultado:ok?"APROVADO":"FALHOU",detalhe});
 if(!ok)falhas++;
}
for(const user of users){
 const db=client(user.jwt);
 const emendas=await db.from("emendas").select("id").limit(1);
 const esperado=user.papel==="anon"?(emendas.error!==null||emendas.data?.length===0):!emendas.error;
 check(user.papel,"RLS leitura emendas",esperado,
  emendas.error?.code??"consulta finalizada");
 if(user.papel!=="anon"){
  const legado=await db.from("emenda_h_legado_conferencia").select("origem_id").limit(1);
  check(user.papel,"view do legado com security_invoker",!legado.error,
   legado.error?.code??"consulta finalizada");
 }
 // Valor zero e ausência de IDs garantem rejeição pré-escrita mesmo com ACP/Admin.
 const args={p_lancamento:null,p_competencia:null,p_valor_solicitado:0,p_chave:null};
 const sub=await db.rpc("emenda_subempenho_criar",args);
 const esperadoCodigo=user.edit?"23514":"42501";
 check(user.papel,"RPC criar subempenho, sem gravar",!!sub.error&&sub.error.code===esperadoCodigo,
  sub.error?.code??"RPC aceitou parâmetros inválidos");
 const conc=await db.rpc("emenda_conciliar_encerrar_ne",{
  p_lancamento:null,p_numero_sei:"",p_link_sei:""
 });
 check(user.papel,"RPC conciliar NE, sem gravar",!!conc.error&&conc.error.code===esperadoCodigo,
  conc.error?.code??"RPC aceitou parâmetros inválidos");
}
console.log(JSON.stringify({
 aplicacao:"PACTO Joinville · Fase H",
 url_homologacao:url.origin,
 coleta:new Date().toISOString(),
 regras:"somente SELECT e RPCs com argumentos invalidados",
 verificacoes:resultados.length,falhas,resultados
},null,2));
if(falhas)process.exitCode=1;
