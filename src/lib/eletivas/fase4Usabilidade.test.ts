import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {descreverEventoEletivas} from "./linhaDoTempo";
import {agruparAvisosPublicacao} from "./avisosImportacao";
import {classificacaoCIB,normaParaCompetencia} from "../../../supabase/functions/_shared/eletivas-normativas";
const source=(p:string)=>readFileSync(fileURLToPath(
 new URL("../../../"+p,import.meta.url)),"utf8");
describe("Fase 4 — homologação utilizável em tela",()=>{
 it("deliberação visível no resumo e verificador independente dos itens importados",()=>{
  const route=source("src/routes/_authenticated/eletivas.$id.tsx");
  const view=source("src/components/eletivas/ConferenciaNormativaEletivas.tsx");
  expect(route).toContain("<ConferenciaNormativaEletivas competencia={c.competencia}/>");
  expect(view).toContain("Conferir procedimento nos anexos");
  expect(view).toContain("07/2026 · 727/CIB/2025");
  expect(view).toContain("08/2026 · 399/CIB/2026");
  expect(view).not.toContain(".from(");
  expect(normaParaCompetencia("07/2026")?.id).toBe("727");
  expect(normaParaCompetencia("08/2026")?.id).toBe("399");
  expect(classificacaoCIB("030907001","07/2026").classificacao).toBe("Não localizado");
  expect(classificacaoCIB("030907001","08/2026").classificacao).toBe("Estadual");
  expect(classificacaoCIB("040905008","07/2026").classificacao).toBe("Ambos");
 });
 it("linha do tempo legível e evidência técnica preservada",()=>{
  const r=descreverEventoEletivas("encontro_criado_via_lancamento",{
   competencia:"07/2026",cnes:"2436469",lancamento_id:"id-origem",
   nome_paciente:"NOME PROTEGIDO",cpf:"111.222.333-44"
  });
  expect(r.titulo).toContain("Encontro criado");
  expect(r.resumo).toContain("07/2026");
  expect(r.resumo).toContain("2436469");
  expect(r.resumo).not.toContain("id-origem");
  expect(JSON.stringify(r.detalhes)).toContain("id-origem");
  expect(JSON.stringify(r.detalhes)).not.toContain("NOME PROTEGIDO");
  expect(JSON.stringify(r.detalhes)).not.toContain("111.222.333-44");
  const evento=descreverEventoEletivas("eletivas_competencias_insert",{
   tabela:"eletivas_competencias",operacao:"INSERT",
   status_anterior:null,status_novo:"preparacao"});
  expect(evento.titulo).toBe("Competência criada");
  expect(evento.resumo).toContain("Preparação");
  const route=source("src/routes/_authenticated/eletivas.$id.tsx");
  expect(route).toContain("Ver registro técnico completo");
  expect(route).not.toContain("JSON.stringify(evento.dados,null,2)");
 });
 it("mensagens de CNES ausente agrupadas em arquivo/aba, sem descartar outras falhas",()=>{
  const msgs=[
   "SIH FAEC com Faixa Estadual Julho 2026.xlsx: Aba Físico: CNES 2436469 não aparece entre os prestadores publicados; nenhum valor de outro hospital será utilizado.",
   "SIH FAEC com Faixa Estadual Julho 2026.xlsx: Aba Complemento: CNES 2436469 não aparece entre os prestadores publicados; nenhum valor de outro hospital será utilizado.",
   "Erro real: fonte inadequada"
  ];
  const x=agruparAvisosPublicacao(msgs);
  expect(x.ausencias).toHaveLength(1);
  expect(x.ausencias[0].abas).toEqual(["Físico","Complemento"]);
  expect(x.outros).toEqual(["Erro real: fonte inadequada"]);
  const tela=source("src/components/eletivas/AuditoriaEletivas.tsx");
  expect(tela).toContain("agruparAvisosPublicacao(avisosFontes)");
  expect(tela).toContain("Isso não invalida a pré-conciliação.");
  expect(tela).toContain("Ver mensagens originais");
 });
 it("não simula uma AIH inexistente nem chama SIA de múltipla",()=>{
  const dossie=source("src/components/eletivas/DossieFiscalEletivas.tsx");
  expect(dossie).toContain('["faec_mult","mac_mult"].includes(item.categoria)');
  expect(dossie).toContain("Este item não possui auditoria individual");
  expect(source("src/components/eletivas/PainelInvestigacaoEletivas.tsx"))
   .toContain("Nenhum item da produção importada corresponde");
 });
});
