import { CircleHelp } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const PASSOS = [
  "Na página inicial do e-Pública, selecione “Empenho em Liquidação”.",
  "Clique no sinal de “+” à direita para iniciar um novo registro.",
  "Informe a data, o valor e o número do empenho. Depois, clique em “Próximo”.",
  "Na etapa “Relacionar”, pressione Enter para carregar os documentos. Em “Documentos fiscais”, selecione “Novo” e depois “Diversos”. Confirme.",
  "Adicione o nº SEI da Solicitação de Subempenho, a data do dia do aviso e a emissão. Confirme.",
  "Confira se o registro correto está selecionado, verificando número, emissão, emitente e valor. Confirme.",
  "Clique em “Gerar”.",
  "Acesse “Dados complementares”.",
  "Clique em “Aviso de movimento”.",
  "Clique em “Transmitir” e selecione o subitem “SEI”.",
  "Preencha a unidade SES.UCP.ACP, o número SEI do processo e o tipo de documento “Aviso de Movimento - Empenho em Liquidação”.",
  "Depois da assinatura obrigatória no Aviso de Movimento - Empenho em Liquidação, encaminhe o documento para SEFAZ.UAF.ADE. Quando o encaminhamento estiver registrado no sistema, a subetapa “Aviso de Movimento — Subempenho” será liberada para Nº SEI, Link SEI e data.",
];

export function TutorialAvisoMovimentoPvh() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 gap-1.5"
        >
          <CircleHelp className="h-3.5 w-3.5" />
          Como emitir no e-Pública
        </Button>
      </DialogTrigger>

      <DialogContent className="max-h-[88vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Aviso de Movimento — Empenho em Liquidação no e-Pública
          </DialogTitle>
          <DialogDescription>
            Roteiro operacional da Etapa 4 do PVH. Execute o procedimento no
            e-Pública e registre no sistema somente as evidências efetivamente
            geradas.
          </DialogDescription>
        </DialogHeader>

        <ol className="space-y-2.5">
          {PASSOS.map((passo, index) => (
            <li
              key={passo}
              className="grid grid-cols-[28px_1fr] gap-2 rounded-lg border bg-muted/10 p-2.5 text-sm"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                {index + 1}
              </span>
              <span className="pt-1 leading-relaxed">{passo}</span>
            </li>
          ))}
        </ol>

        <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground">
          <strong className="text-foreground">Critério de liberação:</strong>{" "}
          a próxima subetapa só é habilitada depois de existir Nº SEI, Link SEI
          válido, assinatura obrigatória da Comissão e confirmação do
          encaminhamento à SEFAZ.UAF.ADE.
        </div>
      </DialogContent>
    </Dialog>
  );
}
