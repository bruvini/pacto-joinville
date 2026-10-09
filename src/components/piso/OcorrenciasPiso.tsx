/** Exibição sem efeitos colaterais das ocorrências auditáveis de uma planilha. */
export function OcorrenciasPiso({ lista }: { lista: any[] }) {
  return =>
    lista.length ? (
      <div className="space-y-1">
        {lista.slice(0, 50).map((o) => (
          <div
            key={o.id ?? `${o.regra}-${o.linha}`}
            className={`rounded border p-2 text-xs ${o.severidade === "erro" ? "border-destructive/40 bg-destructive/5 text-destructive" : o.severidade === "alerta" ? "border-amber-400/50 bg-amber-50 text-amber-900" : "bg-muted"}`}
          >
            <b>{o.regra?.replaceAll("_", " ")}</b>
            {o.cpf_mascarado ? ` · ${o.cpf_mascarado}` : ""}
            {o.cnes ? ` · CNES ${o.cnes}` : ""}
            <span className="block">{o.descricao}</span>
          </div>
        ))}
      </div>
    ) : (
      <p className="text-xs text-muted-foreground">Nenhuma ocorrência registrada.</p>
    );
}
