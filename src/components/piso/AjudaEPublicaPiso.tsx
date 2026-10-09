import { CircleHelp } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";

/** Orientação operacional do e-Pública; sem acoplamento aos dados financeiros. */
export function AjudaEPublicaPiso() {
  return (
          <Dialog>
            <DialogTrigger asChild>
              <Button type="button" variant="outline" size="sm">
                <CircleHelp className="mr-2 h-4 w-4" />
                Ver passo a passo do e-Pública
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Como emitir o Aviso de Movimento no e-Pública</DialogTitle>
              </DialogHeader>
              <ol className="space-y-3 text-sm">
                {[
                  "Selecionar “Empenho em Liquidação” na página inicial do e-Pública.",
                  "Clicar no sinal de “+” à direita.",
                  "Inserir a data, o valor e o número do empenho. Dar seguimento clicando em “Próximo”.",
                  "Na etapa “Relacionar”, pressionar Enter para carregar os documentos. Em “Documentos fiscais”, selecionar “Novo” e, em seguida, “Diversos”. Confirmar.",
                  "Adicionar o nº SEI da solicitação de subempenho, a data do dia do aviso e a emissão. Confirmar.",
                  "Conferir se o registro está selecionado, atentando para número, emissão, emitente e valor. Confirmar.",
                  "Clicar em “Gerar”.",
                  "Clicar em “Dados complementares”.",
                  "Clicar em “Aviso de movimento”.",
                  "Clicar em “Transmitir” e, no subitem, selecionar “SEI”.",
                  "Preencher a unidade SES.UCP.ACP, o número SEI do processo e o tipo de documento “Aviso de Movimento - Empenho em Liquidação”.",
                  "Após a assinatura obrigatória no Aviso de Movimento - Empenho em Liquidação, encaminhar o documento para SEFAZ.UAF.ADE. Com o encaminhamento registrado, o sistema libera o Aviso de Movimento - Subempenho para registrar Nº SEI, link SEI e data.",
                ].map((passo, i) => (
                  <li key={passo} className="grid grid-cols-[2rem_1fr] gap-2">
                    <span className="grid h-7 w-7 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                      {i + 1}
                    </span>
                    <p className="pt-1">{passo}</p>
                  </li>
                ))}
              </ol>
            </DialogContent>
          </Dialog>
  );
}
