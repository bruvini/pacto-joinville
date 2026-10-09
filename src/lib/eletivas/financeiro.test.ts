import { describe,expect,it } from "vitest";
import {resumoEncontro,valorConciliadoCentavos,type ItemEC} from "./financeiro";
const make=(over:Partial<ItemEC>):ItemEC=>({
  chave:"chave",categoria:"faec_compl",descricao:"Procedimento",
  valor_publicado:100,valor_esperado:120,situacao:"div",...over,
});
describe("Encontro de Contas — base original do atesto",()=>{
  it("preserva a parcela incontroversa com divergência aberta",()=>{
    expect(valorConciliadoCentavos(make({valor_publicado:150,valor_esperado:120}))).toBe(12000);
    expect(valorConciliadoCentavos(make({valor_publicado:80,valor_esperado:120}))).toBe(8000);
  });
  it("decisão de erro zera e aceita confirma o publicado",()=>{
    expect(valorConciliadoCentavos(make({decisao:"erro"}))).toBe(0);
    expect(valorConciliadoCentavos(make({decisao:"aceito"}))).toBe(10000);
  });
  it("FAEC faixa MAC é recorte informativo e não dobra total",()=>{
    const resumo=resumoEncontro([
      make({chave:"a",categoria:"faec_compl",situacao:"ok"}),
      make({chave:"b",categoria:"faec_fxmac",situacao:"ok",valor_publicado:50}),
    ]);
    expect(resumo.total).toBe(10000);
    expect(resumo.componentes.faec_fxmac).toBe(0);
  });
  it("só considera correções anteriores uma vez",()=>{
    const resumo=resumoEncontro([make({situacao:"ok"})],[{
      competencia_origem:"08/2026",valor:20.35,documento_sei:"SEI-123",motivo:"Acerto oficial",
    }]);
    expect(resumo.total).toBe(12035);
  });
  it("pendência só desaparece com decisão expressa",()=>{
    expect(resumoEncontro([make({})]).pendencias).toHaveLength(1);
    expect(resumoEncontro([make({decisao:"oficio",justificativa:"Aguardando SES"})]).pendencias).toHaveLength(0);
  });
});
