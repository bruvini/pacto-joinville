import { describe, expect, it } from "vitest";
import { conciliarConfirmacaoCarga, statusRetornoPorChave } from "./retorno-carga";

const carga=(cpf:string, cnes="7728557", salario=2500)=>({
  "CPF PROFISSIONAL":cpf, "CNES EMPREGADOR":cnes,"CBO":"322205",
  "JORNADA SEMANAL (CARGA HORARIA)":44,
  "SALÁRIO BASE (MENSAL)":salario,
  "INSALUBRIDADE":"","ADICIONAL NOTURNO":"",
  "ENCARGO PATRONAL":"","ENCARGO TRABALHISTA":"",
  "VANTAGEM FIXA (VFPG)":"","VANTAGEM VARIÁVEL (VPVT)":"",
});
const resposta=(cpf:string,extras:Record<string,unknown>={})=>({
  ...carga(cpf), Resultado:"Incluído com sucesso.",...extras,
});
describe("Piso · comprovante da carga enviada ao InvestSUS",()=>{
  it("confere retorno aceito sem interpretá-lo como homologação",()=>{
    const r=conciliarConfirmacaoCarga(
      [carga("11122233344"),carga("55566677788")],
      [resposta("11122233344"),resposta("55566677788")],
    );
    expect(r.resumo).toMatchObject({
      registros_carga:2, registros_retorno:2, correspondentes:2,
      incluidos_com_sucesso:2, sem_confirmacao:0, nao_incluidos:0,
      divergencias_campos:0, criticas:0, alertas:0,
    });
    expect(statusRetornoPorChave(r.registros).get("11122233344|7728557")?.incluido).toBe(true);
  });
  it("identifica registro não enviado, registro extra e situação de processamento",()=>{
    const r=conciliarConfirmacaoCarga(
      [carga("11122233344"),carga("55566677788")],
      [
        resposta("11122233344",{Resultado:"Pendente de validação"}),
        resposta("99988877766"),
      ],
    );
    expect(r.resumo).toMatchObject({
      sem_confirmacao:1,extras_retorno:1,nao_incluidos:1,
    });
    expect(r.ocorrencias.map(o=>o.regra)).toEqual(expect.arrayContaining([
      "retorno_nao_confirmou_inclusao","somente_no_retorno","carga_sem_confirmacao",
    ]));
    expect(JSON.stringify(r.ocorrencias)).not.toContain("11122233344");
  });
  it("confere salário, jornada, CBO e atributos declarados sem expor CPF integral",()=>{
    const r=conciliarConfirmacaoCarga(
      [carga("11122233344")],
      [resposta("11122233344",{
        "SALÁRIO BASE (MENSAL)":2750,
        "JORNADA SEMANAL (CARGA HORARIA)":40,
        "CBO":"223505",
      })],
    );
    expect(r.resumo.divergencias_campos).toBe(1);
    expect(r.ocorrencias[0].descricao).toContain("Salário-base");
    expect(r.ocorrencias[0].descricao).toContain("Jornada semanal");
    expect(r.ocorrencias[0].descricao).toContain("CBO");
  });
  it("preserva status e observação se forem fornecidos pela resposta oficial",()=>{
    const r=conciliarConfirmacaoCarga(
      [carga("11122233344")],
      [resposta("11122233344",{
        "Resultado":"CPF de profissional classificado como novo cadastramento de entidades privadas",
        "Observação":"Conferência necessária",
      })],
    );
    expect(r.resumo.nao_incluidos).toBe(1);
    expect(r.registros[0].observacao).toBe("Conferência necessária");
  });
  it("recusa resultado de arquivo que não seja comprovante de envio",()=>{
    expect(()=>conciliarConfirmacaoCarga(
      [carga("11122233344")],[carga("11122233344")],
    )).toThrow(/RESULTADO/);
  });
  it("não duplica valores quando o CPF/CNES é repetido no comprovante",()=>{
    const r=conciliarConfirmacaoCarga(
      [carga("11122233344")],[resposta("11122233344"),resposta("11122233344")],
    );
    expect(r.resumo.duplicidades).toBe(1);
    expect(r.ocorrencias.some(o=>o.regra==="duplicidade_retorno_carga")).toBe(true);
  });
});
