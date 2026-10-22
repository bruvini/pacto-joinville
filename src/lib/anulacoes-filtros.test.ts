import { describe, expect, it } from "vitest";
import {
  correspondeContratoAnulacao, filtrarAnulacoes,
  opcoesContratoAnulacoes, situacaoAnulacao,
} from "./anulacoes-filtros";

const registros = [
  { id:"p1", _origem:"piso", prestador_id:"boj", convenio_id:null, competencia:"10/2026",
    _anulado:0, link_anulacao_sei:null },
  { id:"p2", _origem:"piso", prestador_id:"bethesda", convenio_id:null, competencia:"10/2026",
    _anulado:648, link_anulacao_sei:"https://sei.joinville.sc.gov.br/sei/controlador.php?acao=documento&id_documento=1" },
  { id:"c1", prestador_id:"boj", convenio_id:"contrato-a", competencia:"10/2026", _anulado:100,
    link_anulacao_sei:null },
  { id:"c2", prestador_id:"bethesda", convenio_id:"contrato-b", competencia:"09/2026", _anulado:200,
    link_anulacao_sei:null },
];
const filtros = { prestador:"all", contrato:"all", mes:"", situacao:"all" };

describe("filtros cruzados da auditoria de anulações", () => {
  it("exibe só o Piso quando selecionado o programa, mesmo sem convenio_id", () => {
    expect(filtrarAnulacoes(registros,{...filtros,contrato:"piso"}).map(r=>r.id))
      .toEqual(["p1","p2"]);
    expect(correspondeContratoAnulacao(registros[0],"convenios")).toBe(false);
  });
  it("filtra um contrato específico e não mistura com anulação do Piso", () => {
    expect(filtrarAnulacoes(registros,{...filtros,contrato:"convenio:contrato-a"})
      .map(r=>r.id)).toEqual(["c1"]);
  });
  it("combina instituição, contrato/programa, competência e situação", () => {
    expect(filtrarAnulacoes(registros,{
      prestador:"bethesda",contrato:"piso",mes:"10/2026",situacao:"anulacao_concluida"
    }).map(r=>r.id)).toEqual(["p2"]);
  });
  it("mantém filtro de IDs de origem e o limpa sem perder as opções escolhidas", () => {
    expect(filtrarAnulacoes(registros,{...filtros,prestador:"boj"},["p1","c2"])
      .map(r=>r.id)).toEqual(["p1"]);
  });
  it("restringe os contratos às anulações da instituição sem duplicar rótulos", () => {
    const opcoes=opcoesContratoAnulacoes(registros,[
      {id:"contrato-a",prestador_id:"boj",objeto:"Assistência hospitalar",numero_processo_sei_mae:"123"},
      {id:"contrato-b",prestador_id:"bethesda",objeto:"Assistência hospitalar",numero_processo_sei_mae:"456"},
    ],"boj");
    expect(opcoes.map(x=>x.value)).toEqual(["all","piso","convenios","convenio:contrato-a"]);
    expect(opcoes.at(-1)?.label).toContain("SEI 123");
  });
  it("distingue previsão ainda não efetivada de anulação concluída", () => {
    expect(situacaoAnulacao(registros[0])).toBe("sem_link");
    expect(situacaoAnulacao(registros[1])).toBe("anulacao_concluida");
  });
});
