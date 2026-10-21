import { describe, expect, it } from "vitest";
import { linhasPendentesPiso, linhasPendentesPvh, montarAtualizacaoPendente } from "./dotacao-fonte-lote";

describe("preenchimento financeiro em lote", () => {
  it("lista apenas obrigações existentes e incompletas em competências abertas do Piso", () => {
    const resultado=linhasPendentesPiso([
      { id:"p1", competencia:"10/2026", status:"em_andamento", tipo_parcela:"mensal",
        piso_participantes:[{ prestadores:{nome_instituicao:"Hospital A"},
          piso_obrigacoes:[
            {id:"o1",cr_dotacao:null,fonte:"100",origem_recurso:"federal"},
            {id:"o2",cr_dotacao:"123",fonte:"100"},
          ] }] },
      { id:"p2", status:"encerrada", piso_participantes:[{ piso_obrigacoes:[{id:"o3"}] }] },
    ]);
    expect(resultado).toHaveLength(1);
    expect(resultado[0]).toMatchObject({id:"o1",competencia:"10/2026",fonte:"100",dotacao:"",instituicao:"Hospital A"});
  });
  it("PVH ignora competências encerradas, solicitação enviada e NE emitida", () => {
    const e={solicitacao_competencia_id:"c1",pvh_competencias:{id:"c1",competencia:"10/2026",status:"em_andamento"},
      prestadores:{nome_instituicao:"Hospital A"},status:"solicitada"};
    expect(linhasPendentesPvh([
      {...e,id:"e1",cr_dotacao:"123",fonte_recurso:null},
      {...e,id:"e2",solicitacao_enviada_sefaz:true},
      {...e,id:"e3",numero_ne:"123/2026"},
      {...e,id:"e4",pvh_competencias:{id:"c1",status:"encerrada"}},
      {...e,id:"e5",solicitacao_competencia_id:null},
    ])).toMatchObject([{id:"e1",competencia:"10/2026"}]);
  });
  it("nunca sobrescreve valores anteriores e exige ambos preenchidos", () => {
    expect(montarAtualizacaoPendente({cr_dotacao:"123",fonte:null},{dotacao:"123",fonte:"999"},"piso"))
      .toEqual({cr_dotacao:"123",fonte:"999"});
    expect(montarAtualizacaoPendente({cr_dotacao:null,fonte_recurso:"200"},{dotacao:"111",fonte:"200"},"pvh"))
      .toEqual({cr_dotacao:"111",fonte_recurso:"200"});
    expect(()=>montarAtualizacaoPendente({cr_dotacao:"123",fonte:null},{dotacao:"456",fonte:"999"},"piso")).toThrow(/alterado/);
    expect(()=>montarAtualizacaoPendente({cr_dotacao:null,fonte:null},{dotacao:"",fonte:"999"},"piso")).toThrow(/Preencha/);
  });
});
