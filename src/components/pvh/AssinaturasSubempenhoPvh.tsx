import { CheckCircle2, X } from "lucide-react";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useHistoricoAssinaturasManuais } from "@/hooks/useHistoricoAssinaturasManuais";

type DocumentoSubempenho = "solicitacao" | "movimento_liquidacao";

export function AssinaturasSubempenhoPvh({
  subempenhoId,
  documentoTipo,
  assinaturas,
  pool,
  podeEditar,
  onChange,
}: {
  subempenhoId: string;
  documentoTipo: DocumentoSubempenho;
  assinaturas: any[];
  pool: any[];
  podeEditar: boolean;
  onChange: () => void;
}) {
  const [nomeComissao, setNomeComissao] = useState("");
  const qc = useQueryClient();
  const historicoManual = useHistoricoAssinaturasManuais();
  const ativas = assinaturas.filter(
    (item) =>
      item.subempenho_id === subempenhoId &&
      item.documento_tipo === documentoTipo &&
      !item.revogado_em,
  );
  const fiscal = ativas.find((item) => item.slot === "fiscal");
  const comissao = ativas.find((item) => item.slot === "comissao");
  const fiscais = pool.filter(
    (pessoa) =>
      pessoa.ativo !== false &&
      pessoa.cargo === "Fiscal" &&
      pessoa.nome_servidor !== comissao?.assinante_nome,
  );

  const registrar = useMutation({
    mutationFn: async ({
      slot,
      nome,
      cargo,
      codigoSei,
    }: {
      slot: "fiscal" | "comissao";
      nome: string;
      cargo: string;
      codigoSei?: string | null;
    }) => {
      const limpo = nome.trim();
      if (!limpo) throw new Error("Informe o nome do signatário.");

      const { data: auth } = await supabase.auth.getUser();
      const { data: profile } = await supabase
        .from("profiles")
        .select("nome")
        .eq("id", auth.user?.id ?? "")
        .maybeSingle();

      const { error } = await supabase
        .from("pvh_subempenho_assinaturas")
        .insert({
          subempenho_id: subempenhoId,
          documento_tipo: documentoTipo,
          slot,
          assinante_nome: limpo,
          cargo,
          codigo_sei: codigoSei ?? null,
          registrado_por: auth.user?.id ?? null,
          registrado_por_nome: profile?.nome ?? auth.user?.email ?? null,
        });
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      if (vars.slot === "comissao") setNomeComissao("");
      onChange();
      qc.invalidateQueries({ queryKey: ["assinaturas-historico-manual"] });
      toast.success("Assinatura registrada.");
    },
    onError: (error: any) => toast.error(error.message),
  });

  const revogar = useMutation({
    mutationFn: async (assinatura: any) => {
      const motivo = prompt(
        `Motivo para retirar a assinatura de ${assinatura.assinante_nome}:`,
      );
      if (!motivo?.trim()) return;

      const { data: auth } = await supabase.auth.getUser();
      const { data: profile } = await supabase
        .from("profiles")
        .select("nome")
        .eq("id", auth.user?.id ?? "")
        .maybeSingle();

      const { error } = await supabase
        .from("pvh_subempenho_assinaturas")
        .update({
          revogado_em: new Date().toISOString(),
          revogado_por: auth.user?.id ?? null,
          revogado_por_nome: profile?.nome ?? auth.user?.email ?? null,
          motivo_revogacao: motivo.trim(),
        })
        .eq("id", assinatura.id);
      if (error) throw error;
    },
    onSuccess: () => {
      onChange();
      toast.success("Assinatura retirada; o histórico foi preservado.");
    },
    onError: (error: any) => toast.error(error.message),
  });

  const Assinada = ({ assinatura }: { assinatura: any }) => (
    <div className="flex items-center gap-2 rounded-md border bg-background px-2.5 py-2">
      <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-success" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs font-medium">{assinatura.assinante_nome}</div>
        <div className="truncate text-[10px] text-muted-foreground">{assinatura.cargo}</div>
      </div>
      {podeEditar && (
        <button
          type="button"
          onClick={() => revogar.mutate(assinatura)}
          className="text-muted-foreground hover:text-destructive"
          title="Retirar assinatura"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );

  return (
    <div className="space-y-2 rounded-lg border bg-muted/10 p-3">
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Matriz de assinaturas
        </span>
        {comissao ? (
          <Badge className="bg-success text-success-foreground text-[9px]">
            Obrigatória completa
          </Badge>
        ) : (
          <Badge variant="outline" className="text-[9px]">
            Comissão pendente
          </Badge>
        )}
      </div>

      <div className="grid gap-2 md:grid-cols-[220px_1fr] md:items-center">
        <div>
          <div className="text-xs font-medium">Fiscal</div>
          <div className="text-[10px] text-muted-foreground">Assinatura opcional</div>
        </div>
        {fiscal ? (
          <Assinada assinatura={fiscal} />
        ) : podeEditar ? (
          fiscais.length ? (
            <Select
              value=""
              onValueChange={(id) => {
                const pessoa = fiscais.find((item) => item.id === id);
                if (!pessoa) return;
                registrar.mutate({
                  slot: "fiscal",
                  nome: pessoa.nome_servidor,
                  cargo: pessoa.cargo,
                  codigoSei: pessoa.codigo_sei ?? null,
                });
              }}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Selecionar fiscal, se houver" />
              </SelectTrigger>
              <SelectContent>
                {fiscais.map((pessoa) => (
                  <SelectItem key={pessoa.id} value={pessoa.id}>
                    {pessoa.nome_servidor}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <p className="text-[10px] text-muted-foreground">
              Nenhum Fiscal cadastrado; como é opcional, isso não bloqueia a etapa.
            </p>
          )
        ) : (
          <span className="text-xs text-muted-foreground">Não informado</span>
        )}
      </div>

      <div className="grid gap-2 md:grid-cols-[220px_1fr] md:items-center">
        <div>
          <div className="text-xs font-medium">
            Membro da Comissão de Gestão e Controle de Despesa
          </div>
          <div className="text-[10px] text-muted-foreground">
            Obrigatório · digite ou reutilize um nome já registrado
          </div>
        </div>
        {comissao ? (
          <Assinada assinatura={comissao} />
        ) : podeEditar ? (
          <>
            <Input
              className="h-8 text-xs"
              value={nomeComissao}
              placeholder="Digite ou selecione um nome já registrado"
              list={`pvh-sub-historico-${subempenhoId}-${documentoTipo}`}
              onChange={(e) => setNomeComissao(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (nomeComissao.trim()) {
                    registrar.mutate({
                      slot: "comissao",
                      nome: nomeComissao,
                      cargo: "Membro da Comissão de Gestão e Controle de Despesa",
                    });
                  }
                }
              }}
              onBlur={() => {
                if (nomeComissao.trim()) {
                  registrar.mutate({
                    slot: "comissao",
                    nome: nomeComissao,
                    cargo: "Membro da Comissão de Gestão e Controle de Despesa",
                  });
                }
              }}
            />
            <datalist
              id={`pvh-sub-historico-${subempenhoId}-${documentoTipo}`}
            >
              {(historicoManual.data ?? [])
                .filter((item) => item.slot === "comissao")
                .map((item) => (
                  <option key={item.nome} value={item.nome} />
                ))}
            </datalist>
          </>
        ) : (
          <span className="text-xs text-destructive">Pendente</span>
        )}
      </div>
    </div>
  );
}
