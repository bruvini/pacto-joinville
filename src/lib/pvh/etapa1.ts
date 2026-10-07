export type DadosConclusaoEtapa1Pvh = {
  numeroPortaria: string;
  dataPortaria: string;
  linkOficial: string;
  valores: number[];
};

export function etapa1ProntaPvh(dados: DadosConclusaoEtapa1Pvh) {
  return Boolean(
    dados.numeroPortaria.trim() &&
      dados.dataPortaria &&
      dados.linkOficial.trim() &&
      dados.valores.length > 0 &&
      dados.valores.every((valor) => Number.isFinite(valor) && valor > 0),
  );
}
