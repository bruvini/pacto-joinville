import { describe, expect, it } from "vitest";
import {
  formularioVazioEmenda, validarCadastroEmenda, normalizarCadastroEmenda,
  saldoCadastro, linkHttpsValido, nomeSituacao, normalizarLinkHttpsSei,
} from "./cadastro";

const preenchida=()=>({
  ...formularioVazioEmenda(2026),
  numero:"42510002/2026",modalidade:"Individual",autoria_parlamentar:"Parlamentar",
  origem_recurso:"Federal",objeto:"Aquisição de equipamentos hospitalares",
  prestador_id:"123",valor_autorizado_inicial:510000,competencia_inicial:"10/2026",
});
describe("Emendas — fundação cadastral",()=>{
  it("aceita a emenda de referência como dados de validação, sem persistir na produção",()=>{
    expect(validarCadastroEmenda(preenchida())).toEqual([]);
  });
  it("exige identificação, objeto, instituição e valor inicial válido",()=>{
    const f=formularioVazioEmenda();
    const erro=validarCadastroEmenda(f);
    expect(erro.length).toBeGreaterThan(5);
    expect(erro.some(x=>x.includes("instituição"))).toBe(true);
    expect(erro.some(x=>x.includes("valor"))).toBe(true);
  });
  it("normaliza entradas sem deslocar números ou exercícios",()=>{
    const a=normalizarCadastroEmenda({...preenchida(),numero:" 42510002/2026 ",numero_proposta:"   ",
      processo_sei_link:"  https://sei.joinville.sc.gov.br/sei/controlador.php?x=1&amp;y=2 "});
    expect(a.numero).toBe("42510002/2026");
    expect(a.numero_proposta).toBeNull();
    expect(a.processo_sei_link).toContain("?x=1&y=2");
  });
  it("bloqueia vínculos de termo sem convênio e competências inválidas",()=>{
    const e=validarCadastroEmenda({...preenchida(),termo_aditivo_id:"termo",convenio_id:null,competencia_inicial:"13/2026"});
    expect(e.some(x=>x.includes("termo aditivo"))).toBe(true);
    expect(e.some(x=>x.includes("MM/AAAA"))).toBe(true);
  });
  it("aceita somente HTTPS válido para links dos atos",()=>{
    expect(linkHttpsValido("https://sei.joinville.sc.gov.br/doc?x=1&y=2")).toBe(true);
    expect(linkHttpsValido("javascript:alert(1)")).toBe(false);
    expect(linkHttpsValido("http://sei.joinville.sc.gov.br/doc")).toBe(false);
    expect(linkHttpsValido("https://nome:senha@sei.joinville.sc.gov.br/doc")).toBe(false);
  });
  it("envia links SEI com https explícito para atender às constraints do PostgreSQL",()=>{
    expect(normalizarLinkHttpsSei("sei.joinville.sc.gov.br/sei/controlador.php?x=1&amp;y=2"))
      .toBe("https://sei.joinville.sc.gov.br/sei/controlador.php?x=1&y=2");
    const dados=normalizarCadastroEmenda({
      ...preenchida(),
      portaria_municipal_link_sei:"sei.joinville.sc.gov.br/sei/portaria?x=1&amp;y=2",
      processo_sei_link:"sei.joinville.sc.gov.br/sei/processo?id=4",
    });
    expect(dados.portaria_municipal_link_sei)
      .toBe("https://sei.joinville.sc.gov.br/sei/portaria?x=1&y=2");
    expect(dados.processo_sei_link)
      .toBe("https://sei.joinville.sc.gov.br/sei/processo?id=4");
    expect(linkHttpsValido(dados.processo_sei_link)).toBe(true);
    expect(linkHttpsValido("http://sei.joinville.sc.gov.br/doc")).toBe(false);
    expect(normalizarLinkHttpsSei("http://sei.joinville.sc.gov.br/doc"))
      .toBe("http://sei.joinville.sc.gov.br/doc");
  });
  it("valida limites de texto do banco antes de tentar cadastrar",()=>{
    const erros=validarCadastroEmenda({...preenchida(),objeto:"x".repeat(1001)});
    expect(erros.some(e=>e.includes("Objeto")&&e.includes("1000"))).toBe(true);
  });
  it("aplica somente ajustes formais para calcular o limite vigente, em centavos",()=>{
    expect(saldoCadastro(510000,[{variacao:25000},{variacao:-10000}])).toBe(525000);
    expect(saldoCadastro(0.1,[{variacao:0.2}])).toBe(0.3);
  });
  it("valor base não pode ser editado por meio do cadastro comum",()=>{
    const f={...preenchida(),valor_autorizado_inicial:0};
    expect(validarCadastroEmenda(f,true)).toEqual([]);
    expect(validarCadastroEmenda(f,false).some(x=>x.includes("valor"))).toBe(true);
  });
  it("apresenta estados sem inferir efetivação de pagamento",()=>{
    expect(nomeSituacao("cadastrada")).toBe("Cadastrada");
    expect(nomeSituacao("ativa")).toBe("Ativa");
    expect(nomeSituacao("encerrada")).toBe("Encerrada");
  });
});
