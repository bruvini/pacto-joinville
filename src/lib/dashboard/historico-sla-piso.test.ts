import { describe, expect, it } from "vitest";
import { paginarEventosPiso } from "./historico-sla-piso";

describe("paginação do SLA Piso", () => {
  it("recupera também as etapas antigas mesmo com mais de mil logs", async () => {
    const origem=Array.from({length:1251},(_,i)=>i);
    const consultas: Array<[number,number]>=[];
    const resultado=await paginarEventosPiso(async(inicio,fim)=>{
      consultas.push([inicio,fim]);return origem.slice(inicio,fim+1);
    },500);
    expect(resultado).toHaveLength(1251);
    expect(resultado[0]).toBe(0);
    expect(resultado.at(-1)).toBe(1250);
    expect(consultas).toEqual([[0,499],[500,999],[1000,1499]]);
  });
  it("recusa histórico parcial caso o limite seja alcançado", async () => {
    await expect(paginarEventosPiso(async(a,b)=>
      Array.from({length:b-a+1},(_,i)=>a+i), 2, 2,
    )).rejects.toThrow(/incompleto/);
  });
  it("não converte erro de consulta em sequência vazia", async () => {
    await expect(paginarEventosPiso(async()=>{throw new Error("RLS negou acesso");}))
      .rejects.toThrow("RLS negou acesso");
  });
});
