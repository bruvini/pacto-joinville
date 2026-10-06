import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useAuth, hasRole } from "@/hooks/useAuth";
import { HelpTip } from "@/components/HelpTip";
import { Plus, Pencil, X } from "lucide-react";

export const Route = createFileRoute("/_authenticated/prestadores")({
  head: () => ({ meta: [{ title: "Prestadores" }] }),
  component: PrestadoresPage,
});

function PrestadoresPage() {
  const qc = useQueryClient();
  const { roles } = useAuth();
  const canEditar = hasRole(roles, "acp");
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ nome_instituicao: "", cnpj: "", cnes: [""] as string[] });
  const prestadoresQuery = useQuery({
    queryKey: ["prestadores"],
    queryFn: async () => {
      const { data, error } = await supabase.from("prestadores").select("*").order("nome_instituicao");
      if (error) throw error;
      return data ?? [];
    },
  });
  const cnesQuery = useQuery({
    queryKey: ["prestador_cnes"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("prestador_cnes").select("id,prestador_id,cnes,nome_estabelecimento").order("cnes");
      if (error) throw error;
      return data ?? [];
    },
  });
  const data = useMemo(() => {
    const porPrestador = new Map<string, any[]>();
    for (const item of cnesQuery.data ?? []) porPrestador.set(item.prestador_id, [...(porPrestador.get(item.prestador_id) ?? []), item]);
    return (prestadoresQuery.data ?? []).map((prestador: any) => ({ ...prestador, prestador_cnes: porPrestador.get(prestador.id) ?? [] }));
  }, [prestadoresQuery.data, cnesQuery.data]);

  const abrirNovo = () => { setEditId(null); setForm({ nome_instituicao: "", cnpj: "", cnes: [""] }); setOpen(true); };
  const abrirEdicao = (p: any) => { setEditId(p.id); setForm({ nome_instituicao: p.nome_instituicao ?? "", cnpj: p.cnpj ?? "", cnes: p.prestador_cnes?.length ? p.prestador_cnes.map((c: any) => c.cnes) : [""] }); setOpen(true); };

  const salvar = useMutation({
    mutationFn: async () => {
      const cnes = [...new Set(form.cnes.map((c) => c.replace(/\D/g, "")).filter(Boolean))];
      if (!cnes.length || cnes.some((c) => c.length !== 7)) throw new Error("Informe ao menos um CNES válido com 7 dígitos.");
      const payload = { nome_instituicao: form.nome_instituicao, cnpj: form.cnpj };
      let prestadorId = editId;
      if (editId) {
        const { error } = await supabase.from("prestadores").update(payload).eq("id", editId);
        if (error) throw error;
      } else {
        const { data: novo, error } = await supabase.from("prestadores").insert(payload).select("id").single();
        if (error) throw error;
        prestadorId = novo.id;
      }
      const { error: removerCnesError } = await (supabase as any).from("prestador_cnes").delete().eq("prestador_id", prestadorId);
      if (removerCnesError) throw removerCnesError;
      const { error: cnesError } = await (supabase as any).from("prestador_cnes").insert(cnes.map((cnes) => ({ prestador_id: prestadorId, cnes })));
      if (cnesError) throw cnesError;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["prestadores"] }); qc.invalidateQueries({ queryKey: ["prestador_cnes"] }); setOpen(false); toast.success(editId ? "Prestador atualizado" : "Prestador cadastrado"); },
    onError: (e: any) => toast.error(e.message),
  });
  const toggle = useMutation({
    mutationFn: async (p: any) => {
      const { error } = await supabase.from("prestadores").update({ status: p.status === "ativo" ? "inativo" : "ativo" }).eq("id", p.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["prestadores"] }),
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-primary">Prestadores</h1>
        {canEditar && (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button onClick={abrirNovo} disabled={cnesQuery.isError} title={cnesQuery.isError ? "A consulta de CNES precisa estar disponível para cadastrar" : undefined}><Plus className="h-4 w-4 mr-2" />Novo prestador</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editId ? "Editar prestador" : "Novo prestador"}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label className="flex items-center gap-1">Nome da instituição <HelpTip text="Razão social ou sigla do prestador/conveniado (ex.: HMSJ, BOJ, Instituição Bethesda)." /></Label><Input value={form.nome_instituicao} onChange={(e) => setForm({ ...form, nome_instituicao: e.target.value })} /></div>
              <div><Label className="flex items-center gap-1">CNPJ <HelpTip text="CNPJ do prestador (apenas números ou com pontuação). Dado usado nas notas de empenho." /></Label><Input value={form.cnpj} onChange={(e) => setForm({ ...form, cnpj: e.target.value })} /></div>
              <div className="space-y-2"><Label className="flex items-center gap-1">CNES <HelpTip text="Cadastre um ou mais códigos CNES de 7 dígitos vinculados à instituição." /></Label>{form.cnes.map((c, i) => <div key={i} className="flex gap-2"><Input inputMode="numeric" maxLength={7} placeholder="0000000" value={c} onChange={(e) => setForm({ ...form, cnes: form.cnes.map((x, j) => j === i ? e.target.value.replace(/\D/g, "").slice(0, 7) : x) })} />{form.cnes.length > 1 && <Button type="button" size="icon" variant="ghost" onClick={() => setForm({ ...form, cnes: form.cnes.filter((_, j) => j !== i) })}><X className="h-4 w-4" /></Button>}</div>)}<Button type="button" size="sm" variant="outline" onClick={() => setForm({ ...form, cnes: [...form.cnes, ""] })}><Plus className="mr-1 h-4 w-4" />Adicionar CNES</Button></div>
            </div>
            <DialogFooter><Button onClick={() => salvar.mutate()} disabled={!form.nome_instituicao || salvar.isPending}>{editId ? "Salvar" : "Cadastrar"}</Button></DialogFooter>
          </DialogContent>
        </Dialog>
        )}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">{data.length} prestadores cadastrados</CardTitle></CardHeader>
        <CardContent>
          {prestadoresQuery.isError && <div role="alert" className="mb-4 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">Não foi possível carregar os prestadores. {(prestadoresQuery.error as Error).message}</div>}
          {cnesQuery.isError && <div role="alert" className="mb-4 rounded-md border border-amber-500/40 bg-amber-50 p-3 text-sm text-amber-900">Os prestadores foram carregados, mas os CNES não puderam ser consultados. Verifique se a migração de CNES foi aplicada. {(cnesQuery.error as Error).message}</div>}
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted-foreground border-b">
              <tr><th className="py-2">Instituição</th><th>CNPJ</th><th>CNES</th><th>Status</th><th>Cadastro</th><th></th></tr>
            </thead>
            <tbody>
              {data.map((p: any) => (
                <tr key={p.id} className="border-b">
                  <td className="py-2 font-medium">{p.nome_instituicao}</td>
                  <td>{p.cnpj ?? "—"}</td>
                  <td>{p.prestador_cnes?.map((c: any) => c.cnes).join(", ") || "—"}</td>
                  <td><Badge className={p.status === "ativo" ? "bg-success text-success-foreground" : ""} variant={p.status === "ativo" ? "default" : "secondary"}>{p.status}</Badge></td>
                  <td>{new Date(p.data_cadastro).toLocaleDateString("pt-BR")}</td>
                  <td className="text-right">{canEditar && (
                    <span className="inline-flex gap-1">
                      <Button variant="ghost" size="sm" onClick={() => abrirEdicao(p)} disabled={cnesQuery.isError}><Pencil className="h-3.5 w-3.5 mr-1" />Editar</Button>
                      <Button variant="ghost" size="sm" onClick={() => toggle.mutate(p)}>{p.status === "ativo" ? "Inativar" : "Ativar"}</Button>
                    </span>
                  )}</td>
                </tr>
              ))}
              {!prestadoresQuery.isLoading && !prestadoresQuery.isError && data.length === 0 && <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">Nenhum prestador cadastrado.</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
