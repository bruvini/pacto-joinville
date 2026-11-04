import {beforeEach,describe,expect,it,vi} from "vitest";
const mocks=vi.hoisted(()=>({
  carga:vi.fn(async()=>({tipo:"planilha_carga"})),
  invest:vi.fn(async()=>({tipo:"investsus"})),
  portaria:vi.fn(async()=>({tipo:"portaria_gm",dados:{numero:"12.295"}})),
  memoria13:vi.fn(async()=>({tipo:"afc13_cnes",audit:{linhas:2}})),
}));
vi.mock("@/lib/piso/processar-carga",()=>({processarCargaPisoServidor:mocks.carga}));
vi.mock("@/lib/piso/processar-investsus",()=>({processarInvestsusPisoServidor:mocks.invest}));
vi.mock("@/lib/piso/processar-evidencias-oficiais",()=>({
  processarPortariaPisoServidor:mocks.portaria,
  processarMemoria13PisoServidor:mocks.memoria13,
}));
import {processarEvidenciaPiso} from "./processamento";
describe("roteamento das evidências do Piso",()=>{
  beforeEach(()=>vi.clearAllMocks());
  it("processa Planilha de Carga e InvestSUS nas rotas próprias",async()=>{
    await processarEvidenciaPiso("comp","c","planilha_carga");
    await processarEvidenciaPiso("comp","i","investsus");
    expect(mocks.carga).toHaveBeenCalledWith({data:{competenciaId:"comp",arquivoId:"c"}});
    expect(mocks.invest).toHaveBeenCalledWith({data:{competenciaId:"comp",arquivoId:"i"}});
  });
  it("reprocessa o PDF preservado sem chamar Edge Function legada",async()=>{
    const resultado=await processarEvidenciaPiso("comp","arquivo-do-storage","portaria_gm");
    expect(resultado.tipo).toBe("portaria_gm");
    expect(mocks.portaria).toHaveBeenCalledWith({
      data:{competenciaId:"comp",arquivoId:"arquivo-do-storage"},
    });
  });
  it("mantém a memória oficial da 13ª separada da conciliação mensal",async()=>{
    const resultado=await processarEvidenciaPiso("comp","a13","afc13_cnes");
    expect(resultado.tipo).toBe("afc13_cnes");
    expect(mocks.memoria13).toHaveBeenCalledOnce();
    expect(mocks.invest).not.toHaveBeenCalled();
  });
  it("não tenta processar categorias desconhecidas",async()=>{
    await expect(processarEvidenciaPiso("c","a")).rejects.toThrow(/categoria/i);
  });
});
