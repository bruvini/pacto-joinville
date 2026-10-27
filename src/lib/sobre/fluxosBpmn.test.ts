import { describe, expect, it } from "vitest";
import { CACON_ETAPAS } from "@/lib/cacon/etapas";
import { PISO_ETAPAS, ETAPA_ANULACAO_PISO, etapasVisiveisPiso, numeroVisualEtapaPiso } from "@/lib/piso/etapas";
import { PVH_ETAPAS, prerequisitosEtapaPvh } from "@/lib/pvh/etapas";
import { modeloBpmn, modeloBpmnPiso, errosModeloBpmn } from "./fluxosBpmn";

describe("Mapas BPMN dos módulos", () => {
  const modelos = [
    modeloBpmn("piso","mensal"),
    modeloBpmn("piso","decimo_terceiro"),
    modeloBpmn("pvh"),
    modeloBpmn("cacon"),
  ];
  it.each(modelos.map(m=>[m.titulo,m] as const))("%s tem nós, conexões e coordenadas válidas",(_,m)=>{
    expect(errosModeloBpmn(m)).toEqual([]);
    expect(m.conexoes.length).toBeGreaterThan(4);
    expect(m.nos.some(n=>n.tipo==="inicio")).toBe(true);
    expect(m.nos.some(n=>n.tipo==="fim")).toBe(true);
    expect(m.nos.some(n=>n.tipo==="documento")).toBe(true);
  });
  it("o Piso mensal reflete as nove etapas e a 7A condicional",()=>{
    const m=modeloBpmnPiso("mensal");
    for (const e of PISO_ETAPAS) {
      expect(m.nos).toContainEqual(expect.objectContaining({id:"p"+e.n,titulo:e.titulo,etapa:String(e.n)}));
    }
    expect(m.nos).toContainEqual(expect.objectContaining({id:"p10",titulo:ETAPA_ANULACAO_PISO.titulo,etapa:"7A"}));
    expect(m.nos.filter(n=>n.tipo==="paralelo").length).toBeGreaterThanOrEqual(3);
    expect(m.nos.some(n=>n.id==="saldo" && n.tipo==="exclusivo")).toBe(true);
    expect(m.conexoes.some(e=>e.de==="paralelo-78"&&e.para==="p8")).toBe(true);
    expect(m.conexoes.some(e=>e.de==="p4"&&e.para==="p5"&&e.referenciaInformativa)).toBe(true);
    expect(m.conexoes.some(e=>e.de==="p4"&&e.para==="uniao")).toBe(false);
  });
  it("o Piso 13º começa na etapa interna 2, exibida como etapa 1",()=>{
    const m=modeloBpmnPiso("decimo_terceiro");
    expect(m.nos.some(n=>n.id==="p1")).toBe(false);
    expect(m.nos.find(n=>n.id==="p2")?.etapa).toBe("1");
    expect(numeroVisualEtapaPiso(10,"decimo_terceiro")).toBe("7A");
    expect(etapasVisiveisPiso("decimo_terceiro",true).some(e=>e.n===10)).toBe(true);
    expect(m.conexoes.some(e=>e.de==="ramifica"&&e.para==="p2")).toBe(true);
    expect(m.conexoes.some(e=>e.de==="p4"&&e.para==="p5"&&e.referenciaInformativa)).toBe(true);
    expect(m.conexoes.some(e=>e.de==="p4"&&e.para==="uniao")).toBe(false);
  });
  it("PVH contém sete etapas do domínio e ramos iniciais / finais paralelos",()=>{
    const m=modeloBpmn("pvh");
    for(const e of PVH_ETAPAS) {
      expect(m.nos).toContainEqual(expect.objectContaining({id:"v"+e.n,titulo:e.titulo}));
      for(const anterior of prerequisitosEtapaPvh(e.n)) {
        expect(m.nos.find(n=>n.id==="v"+anterior)).toBeTruthy();
      }
    }
    expect(prerequisitosEtapaPvh(3)).toEqual([]);
    expect(prerequisitosEtapaPvh(6)).toEqual([4]);
    expect(m.conexoes).toEqual(expect.arrayContaining([
      expect.objectContaining({de:"div",para:"v1"}),
      expect.objectContaining({de:"div",para:"v3"}),
      expect.objectContaining({de:"div2",para:"v5"}),
      expect.objectContaining({de:"div2",para:"v6"}),
      expect.objectContaining({de:"v2",para:"v3",referenciaInformativa:true}),
    ]));
    expect(m.conexoes.some(e=>e.de==="v2"&&e.para==="join")).toBe(false);
  });
  it("CACON contempla três etapas, revisão de auditoria e envio",()=>{
    const m=modeloBpmn("cacon");
    for(const e of CACON_ETAPAS) expect(m.nos).toContainEqual(expect.objectContaining({
      id:"c"+e.n,titulo:e.titulo
    }));
    expect(m.conexoes.some(e=>e.de==="ok"&&e.para==="c2"&&e.rotulo?.includes("corrigir"))).toBe(true);
    expect(m.conexoes.some(e=>e.de==="c3"&&e.para==="enviar")).toBe(true);
  });
});
