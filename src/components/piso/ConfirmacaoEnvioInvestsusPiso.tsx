import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { ArquivosEvidencia, enviarArquivo, rollbackArquivoProcessavel } from "./ArquivosEvidencia";
import { ImportarArquivoPiso } from "./ImportarArquivoPiso";
import { OcorrenciasPiso } from "./OcorrenciasPiso";
import { processarEvidenciaPiso } from "@/lib/piso/processamento";

const ultimo = (arquivos:any[],categoria:string,participanteId?:string)=>
  arquivos.filter(a=>a.categoria===categoria &&
    (participanteId===undefined || a.participante_id===participanteId))
    .sort((a,b)=>b.enviado_em.localeCompare(a.enviado_em))[0];

/** Evidência do retorno do InvestSUS auditada no servidor, por instituição. */
export function ConfirmacaoEnvioInvestsusPiso({
  competenciaId, partes, arquivos, ocorrencias, canEdit, onChange,
}: {
  competenciaId:string; partes:any[]; arquivos:any[]; ocorrencias:any[];
  canEdit:boolean; onChange:()=>void;
}) {
  const [busy,setBusy]=useState(false);

  const conferir = async (arquivo:any) => {
    const resultado:any=await processarEvidenciaPiso(competenciaId,arquivo.id,"retorno_carga");
    toast.success(`Retorno conferido: ${resultado.audit?.incluidos_com_sucesso??0} inclusão(ões) confirmada(s).`);
    const invest=ultimo(arquivos,"investsus");
    if (invest) {
      try { await processarEvidenciaPiso(competenciaId,invest.id,"investsus"); }
      catch { toast.warning("Comprovante conferido. Reprocesse a planilha de complementos na Etapa 2."); }
    }
    onChange();
  };

  const importar = async (parte:any, file:File) => {
    if (!ultimo(arquivos,"planilha_carga",parte.id)) {
      toast.error("Anexe primeiro a carga original da instituição na parte 1A.");
      return;
    }
    setBusy(true);
    let arq:any=null,processado=false;
    try {
      arq=await enviarArquivo(file,competenciaId,"retorno_carga",parte.id,true);
      const resultado:any=await processarEvidenciaPiso(competenciaId,arq.id,"retorno_carga");
      processado=true;
      toast.success(`Comprovante conferido: ${resultado.audit?.incluidos_com_sucesso??0} de ${resultado.audit?.registros_carga??0} vínculo(s) incluído(s) com sucesso; ${resultado.audit?.criticas??0} divergência(s) crítica(s).`);
      const invest=ultimo(arquivos,"investsus");
      if (invest) {
        try { await processarEvidenciaPiso(competenciaId,invest.id,"investsus"); }
        catch { toast.warning("Comprovante salvo. Reprocesse o InvestSUS na Etapa 2 para atualizar a conciliação."); }
      }
      onChange();
    } catch(e) {
      if (arq && !arq.reutilizado && !processado)
        await rollbackArquivoProcessavel(arq);
      onChange();
      toast.error(e instanceof Error ? e.message : "Falha ao processar o comprovante de envio.");
    } finally {setBusy(false);}
  };

  const reprocessar=async (arquivo:any) => {
    setBusy(true);
    try { await conferir(arquivo); }
    catch(e) {toast.error(e instanceof Error ? e.message : "Falha ao reprocessar.");}
    finally {setBusy(false);}
  };

  return <div className="space-y-3 border-t pt-3">
    <h4 className="text-sm font-semibold">Comprovantes de processamento do envio</h4>
    <p className="text-xs text-muted-foreground">
      “Incluído com sucesso” confirma o processamento da carga, não a homologação de complemento.
      O PACTO compara CPF/CNES, CBO, jornada e valores do comprovante com a planilha recebida.
    </p>
    {partes.map(parte=>{
      const anexo=ultimo(arquivos,"retorno_carga",parte.id);
      const resumo=ocorrencias.find(o=>o.arquivo_id===anexo?.id &&
        o.categoria==="retorno_carga" && o.regra==="resumo_retorno_carga")?.dados;
      const divergencias=ocorrencias.filter(o=>o.arquivo_id===anexo?.id &&
        o.categoria==="retorno_carga" && o.regra!=="resumo_retorno_carga");
      const cargaAtual=ultimo(arquivos,"planilha_carga",parte.id);
      return <section key={parte.id} className="space-y-2 rounded-lg border bg-background p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <strong className="text-sm">{parte.prestadores?.nome_instituicao??"Instituição"}</strong>
          <Badge variant={resumo?"outline":"secondary"}>
            {resumo ? "Conferido" : "Comprovante pendente"}
          </Badge>
        </div>
        {canEdit && <ImportarArquivoPiso tipo="planilha" accept=".xlsx,.xls,.csv"
          busy={busy} label={anexo?"Anexar novo comprovante":"Anexar retorno do InvestSUS"}
          onSelect={file=>void importar(parte,file)} />}
        <ArquivosEvidencia arquivos={arquivos} competenciaId={competenciaId}
          categoria="retorno_carga" participanteId={parte.id}
          canEdit={false} onChange={onChange}
          canRetry={arquivo=>canEdit && !busy && arquivo.id===anexo?.id}
          onRetry={reprocessar} />
        {resumo && <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
          {[
            ["Registros da carga",resumo.registros_carga],
            ["Incluídos com sucesso",resumo.incluidos_com_sucesso],
            ["Sem confirmação",resumo.sem_confirmacao],
            ["Divergências / alertas",Number(resumo.criticas??0)+Number(resumo.alertas??0)],
          ].map(([titulo,valor])=><div key={String(titulo)} className="rounded bg-muted p-2">
            <b>{valor??0}</b><span className="block text-muted-foreground">{titulo}</span>
          </div>)}
        </div>}
        {resumo && resumo.arquivo_carga_id!==cargaAtual?.id &&
          <p className="text-xs text-amber-800">A carga institucional foi substituída.
            Reprocesse o comprovante para comparar os arquivos correspondentes.</p>}
        {divergencias.length>0 && <details className="rounded border p-2">
          <summary className="cursor-pointer text-xs font-medium">
            Ver {divergencias.length} ocorrência(s) da confirmação
          </summary>
          <OcorrenciasPiso lista={divergencias}/>
        </details>}
      </section>;
    })}
  </div>;
}
