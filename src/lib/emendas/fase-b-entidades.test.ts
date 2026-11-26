import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { saldoDisponivelNeEmenda,totalComprometidoSubempenhosEmenda } from "./subempenhos-financeiro";
const b1=readFileSync(new URL("../../../supabase/migrations/20261126100000_emendas_fase_b1_subempenhos_relacoes.sql",import.meta.url),"utf8");
const b2=readFileSync(new URL("../../../supabase/migrations/20261126101500_emendas_fase_b2_integridade_rpc.sql",import.meta.url),"utf8");
const b3=readFileSync(new URL("../../../supabase/migrations/20261126103000_emendas_fase_b3_resumo_ne.sql",import.meta.url),"utf8");

describe("Emendas · Fase B · cálculos financeiros", () => {
  it("NE multicompetência separa solicitação de aviso efetivo", () => {
    const subs = [
      {status:"subempenhado" as const,valor_solicitado:30000,valor_subempenhado:28000},
      {status:"solicitado" as const,valor_solicitado:40000},
    ];
    expect(totalComprometidoSubempenhosEmenda(subs)).toBe(68000);
    expect(saldoDisponivelNeEmenda({valorNe:120000,totalAnulado:0,liberadoLegado:0,subempenhos:subs}))
      .toEqual({saldo:52000,origem:"subempenho"});
  });
  it("cancelamento de rascunho libera reserva, sem apagar registros", () => {
    expect(totalComprometidoSubempenhosEmenda([
      {status:"cancelado",valor_solicitado:30000},
      {status:"rascunho",valor_solicitado:25000},
    ])).toBe(25000);
  });
  it("impede dupla contagem ao detectar coexistência dos modelos", () => {
    expect(saldoDisponivelNeEmenda({
      valorNe:120000,totalAnulado:0,liberadoLegado:10000,
      subempenhos:[{status:"solicitado",valor_solicitado:30000}],
    })).toEqual({saldo:null,origem:"conflito"});
  });
  it("observa anulação e centavos sem mascarar saldo negativo", () => {
    expect(saldoDisponivelNeEmenda({
      valorNe:100.03,totalAnulado:20.01,liberadoLegado:0,
      subempenhos:[{status:"subempenhado",valor_solicitado:70.01,valor_subempenhado:75.01}],
    }).saldo).toBe(5.01);
  });
});

describe("Emendas · Fase B · contratos estáticos de banco",()=>{
  it("faz três migrations transacionais aditivas sem modificar dados históricos",()=>{
    for(const m of [b1,b2,b3]){
      expect(m).toMatch(/^BEGIN;/m);
      expect(m).toMatch(/^COMMIT;/m);
      expect(m).not.toMatch(/\b(?:DROP\s+TABLE|TRUNCATE\s+TABLE|DELETE\s+FROM\s+public\.emenda_|UPDATE\s+public\.emenda_solicitacoes)\b/i);
    }
  });
  it("mantém NE original, vínculo triplo do subempenho e idempotência",()=>{
    expect(b1).toContain("CREATE TABLE public.emenda_subempenhos");
    expect(b1).toContain("FOREIGN KEY (solicitacao_id,emenda_id)");
    expect(b1).toContain("FOREIGN KEY (lancamento_id,competencia_id)");
    expect(b1).toContain("UNIQUE (emenda_id,chave_idempotencia)");
    expect(b1).not.toMatch(/ALTER TABLE public\.emenda_solicitacoes\s+DROP/i);
  });
  it("não converte pagamentos históricos e prepara programação",()=>{
    expect(b1).toContain("ADD COLUMN subempenho_id uuid");
    expect(b1).toContain("ADD COLUMN data_programacao date");
    expect(b1).toContain("ADD COLUMN valor_programado numeric(16,2)");
    expect(b1).toContain("FOREIGN KEY(subempenho_id,emenda_id,lancamento_id,competencia_id)");
    expect(b1).not.toMatch(/UPDATE\s+public\.emenda_blocos_pagamento/i);
  });
  it("registra valor solicitado separado do valor do aviso",()=>{
    expect(b1).toContain("valor_solicitado numeric(16,2) NOT NULL");
    expect(b1).toContain("valor_subempenhado numeric(16,2)");
    expect(b1).toContain("valor_documentado numeric(16,2)");
    expect(b2).toContain("valor_subempenhado=CASE WHEN proximo='subempenhado'");
    expect(b2).toContain("d.valor_documentado=NEW.valor_subempenhado");
  });
  it("protege saldo, anulação, NEs, pagamentos e o fluxo legado",()=>{
    for(const guard of ["guard_emenda_subempenhos","guard_emenda_anulacao_subempenhos",
      "guard_emenda_liberacao_legada","guard_emenda_pagamento_subempenho",
      "guard_emenda_ne_subempenhada"]) expect(b2).toContain(guard);
    expect(b2).toContain("FOR UPDATE");
    expect(b2).toContain("IF (anulado+outros+reserva)>nota.valor_ne THEN");
    expect(b2).toContain("IF soma+NEW.valor>valor_liquido THEN");
  });
  it("não permite DML direto pelas credenciais autenticadas",()=>{
    expect(b1).toContain("ENABLE ROW LEVEL SECURITY");
    expect(b1).toContain("REVOKE ALL ON public.emenda_subempenhos");
    expect(b1).toContain("GRANT SELECT ON public.emenda_subempenhos");
    expect(b2).toContain("public.has_any_role");
    expect(b2).toContain("FROM PUBLIC,anon");
    expect(b2).toContain("TO authenticated");
  });
  it("mantém histórico e documentos imutáveis depois de registrados",()=>{
    expect(b1).toContain("AFTER INSERT OR UPDATE OR DELETE ON public.emenda_subempenhos");
    expect(b1).toContain("AFTER INSERT OR UPDATE OR DELETE ON public.emenda_subempenho_documentos");
    expect(b2).toContain("Documento já registrado: retificação requer procedimento formal.");
    expect(b2).toContain("Subempenho cancelado ou confirmado não admite alteração direta.");
  });
  it("distingue livros legados e novo livro sem multiplicação de joins",()=>{
    expect(b3).toContain("security_invoker=true");
    expect(b3).toContain("'conflito_entre_modelos'");
    expect(b3).toContain("THEN leg.total_liberado ELSE coalesce(sub.total_reservado,0) END");
  });
});
