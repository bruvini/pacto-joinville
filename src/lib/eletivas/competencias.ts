/** A classificação evita ambiguidade na interface.
 * A autoridade para vincular/criar é sempre a RPC no banco. */
export type ParcelaVinculo={lancamento_id:string;encontro_id:string|null;
 encontro_lancamento_id:string|null;encontro_status:string|null};
export type DestinoEncontro={acao:"criar"}|{acao:"abrir";id:string}
 |{acao:"vincular";id:string}|{acao:"bloquear";motivo:string};
export function resolverDestinoEncontro(p:ParcelaVinculo):DestinoEncontro{
 if(!p.encontro_id)return {acao:"criar"};
 if(p.encontro_status==="arquivada")return {acao:"bloquear",
  motivo:"Encontro arquivado de teste. Marque 'Mostrar arquivadas' e use 'Apagar definitivamente' para liberar instituição e competência."};
 if(p.encontro_lancamento_id===p.lancamento_id)return {acao:"abrir",id:p.encontro_id};
 if(p.encontro_lancamento_id)return {acao:"bloquear",
  motivo:"Encontro já vinculado a outra parcela: o vínculo de origem não pode ser substituído."};
 if(p.encontro_status==="encerrada")return {acao:"bloquear",
  motivo:"Encontro encerrado. Solicite reabertura formal antes de vincular."};
 if(!["preparacao","auditoria","pendente_validacao"].includes(p.encontro_status??""))
  return {acao:"bloquear",motivo:"Situação não reconhecida. Atualize a seleção."};
 return {acao:"vincular",id:p.encontro_id};
}
