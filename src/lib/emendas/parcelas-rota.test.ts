import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
import {formatarParcelas} from "./lancamentos";
describe("Intervalos de parcelas",()=>{
 it("mensal exibe só número",()=>expect(formatarParcelas([57])).toBe("57"));
 it("trimestral mostra faixa legível",()=>expect(formatarParcelas([59,57,58])).toBe("57 a 59"));
 it("anual não duplica extremos",()=>expect(formatarParcelas(Array.from({length:12},(_,i)=>57+i))).toBe("57 a 68"));
 it("não inventa números onde há lacuna",()=>expect(formatarParcelas([57,59])).toBe("57, 59"));
 it("sem parcelas não cria faixa fictícia",()=>expect(formatarParcelas([])).toBe("—"));
});
describe("Rota independente do lançamento",()=>{
 it("não exige Outlet na capa da emenda",()=>{
 const file=readFileSync(new URL("../../routes/_authenticated/emendas.$id_.lancamentos.$lancamentoId.tsx",import.meta.url),"utf8");
 expect(file).toContain('createFileRoute("/_authenticated/emendas/$id_/lancamentos/$lancamentoId")');
 });
});
