import { Eraser } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CampoBlur } from "@/components/piso/campos";
import { brl } from "@/lib/format";
import { transferenciaFederalEsperada, urlDouValida } from "@/lib/piso/regras";

/** Dados da portaria federal: UI desacoplada do orquestrador de etapas. */
export function DadosPortariaGmPiso({
  c, canEdit, busy, limparPortaria, saveComp, totalInvestsus,
}: {
  c: any;
  canEdit: boolean;
  busy: string | null;
  limparPortaria: () => Promise<void>;
  saveComp: (campo: string, valor: any) => Promise<boolean>;
  totalInvestsus: number;
}) {
  const dis = !canEdit;
  return (
    <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold">3. Portaria GM/MS e Diário Oficial</h3>
            {canEdit && (
              <Button type="button" size="sm" variant="outline"
                disabled={Boolean(busy)}
                onClick={() => void limparPortaria()}
                className="text-destructive hover:text-destructive">
                <Eraser className="mr-1.5 h-4 w-4" />
                {busy === "portaria-limpar" ? "Limpando…" : "Limpar dados da Portaria"}
              </Button>
            )}
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <CampoBlur label="Número da Portaria" value={c.portaria_gm_numero} disabled={dis} onSave={(v) => saveComp("portaria_gm_numero", v)} />
            <CampoBlur label="Data do ato" type="date" value={c.portaria_gm_data_ato} disabled={dis} onSave={(v) => saveComp("portaria_gm_data_ato", v)} />
            <CampoBlur label="Data da publicação" type="date" value={c.portaria_gm_data_publicacao} disabled={dis} onSave={(v) => saveComp("portaria_gm_data_publicacao", v)} />
            <CampoBlur label="Edição" value={c.portaria_gm_edicao} disabled={dis} onSave={(v) => saveComp("portaria_gm_edicao", v)} />
            <CampoBlur label="Seção" value={c.portaria_gm_secao} disabled={dis} onSave={(v) => saveComp("portaria_gm_secao", v)} />
            <CampoBlur label="Página" value={c.portaria_gm_pagina} disabled={dis} onSave={(v) => saveComp("portaria_gm_pagina", v)} />
            <CampoBlur
              className="sm:col-span-3"
              label="Link oficial no DOU"
              value={c.portaria_gm_url_dou}
              disabled={dis}
              invalid={Boolean(c.portaria_gm_url_dou && !urlDouValida(c.portaria_gm_url_dou))}
              hint={
                urlDouValida(c.portaria_gm_url_dou)
                  ? "Origem do endereço validada: publicação oficial no domínio in.gov.br"
                  : "Obrigatório: https://www.in.gov.br/web/dou/..."
              }
              onSave={(v) => saveComp("portaria_gm_url_dou", v)}
            />
          </div>
          {urlDouValida(c.portaria_gm_url_dou) && (
            <a className="text-sm text-primary underline" href={c.portaria_gm_url_dou} target="_blank" rel="noreferrer">
              Abrir publicação
            </a>
          )}
          <p className="text-xs text-muted-foreground">
            Os valores são extraídos automaticamente do PDF, mas podem ser informados ou corrigidos
            manualmente por administradores/ACP. Informe antes o número da Portaria e o link oficial
            do DOU. Cada alteração manual fica registrada no histórico.
          </p>
          <div className="grid gap-2 sm:grid-cols-4">
            {([
              ["valor_homologado", "Valor homologado"],
              ["desconto_saldo", "Desconto de saldo"],
              ["acerto_contas", "Acerto de contas"],
              ["valor_transferido", "Valor transferido"],
            ] as const).map(([campo, label]) => (
              <CampoBlur key={campo} label={label} type="moeda" value={c[campo]}
                disabled={dis || busy !== null}
                onSave={(v) => saveComp(campo, v)} />
            ))}
          </div>
          {Math.abs(Number(c.desconto_saldo ?? 0)) > 0.005 && (
            <CampoBlur multiline label="Identificação do saldo descontado (opcional)" value={c.desconto_identificacao} disabled={dis} hint="Se não for informada, a minuta manterá os valores financeiros e omitirá esta identificação." onSave={(v) => saveComp("desconto_identificacao", v)} />
          )}
          {Math.abs(Number(c.acerto_contas ?? 0)) > 0.005 && (
            <CampoBlur multiline label="Identificação do acerto de contas" value={c.acerto_identificacao} disabled={dis} onSave={(v) => saveComp("acerto_identificacao", v)} />
          )}
          <div className="rounded bg-muted p-3 text-sm">
            Total InvestSUS: <b>{brl(totalInvestsus)}</b> · Homologado: <b>{brl(c.valor_homologado)}</b> · Transferido calculado:{" "}
            <b>{brl(transferenciaFederalEsperada(c.valor_homologado, c.desconto_saldo, c.acerto_contas))}</b>
          </div>

    </>
  );
}
