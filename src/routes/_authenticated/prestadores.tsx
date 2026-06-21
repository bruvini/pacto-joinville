import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { useState } from "react";
import { toast } from "sonner";
import { useAuth, hasRole } from "@/hooks/useAuth";
import { Plus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/prestadores")({
  head: () => ({ meta: [{ title: "Prestadores" }] }),
  component: PrestadoresPage,
});

function PrestadoresPage() {
  const qc = useQueryClient();
  const { roles } = useAuth();
  const canEditar = hasRole(roles, "acp");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ nome_instituicao: "", cnpj: "" });
  const { data = [] } = useQuery({
    queryKey: ["prestadores"],
    queryFn: async () => (await supabase.from("prestadores").select("*").order("nome_instituicao")).data ?? [],
  });

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("prestadores").insert(form);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["prestadores"] }); setOpen(false); setForm({ nome_instituicao: "", cnpj: "" }); toast.success("Prestador cadastrado"); },
    onError: (e: any) => toast.error(e.message),
  });
  const toggle = useMutation({
    mutationFn: async (p: any) => {
      await supabase.from("prestadores").update({ status: p.status === "ativo" ? "inativo" : "ativo" }).eq("id", p.id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["prestadores"] }),
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-primary">Prestadores</h1>
        {canEditar && (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />Novo prestador</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Novo prestador</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Nome da instituição</Label><Input value={form.nome_instituicao} onChange={(e) => setForm({ ...form, nome_instituicao: e.target.value })} /></div>
              <div><Label>CNPJ</Label><Input value={form.cnpj} onChange={(e) => setForm({ ...form, cnpj: e.target.value })} /></div>
            </div>
            <DialogFooter><Button onClick={() => create.mutate()} disabled={!form.nome_instituicao}>Cadastrar</Button></DialogFooter>
          </DialogContent>
        </Dialog>
        )}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">{data.length} prestadores cadastrados</CardTitle></CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted-foreground border-b">
              <tr><th className="py-2">Instituição</th><th>CNPJ</th><th>Status</th><th>Cadastro</th><th></th></tr>
            </thead>
            <tbody>
              {data.map((p: any) => (
                <tr key={p.id} className="border-b">
                  <td className="py-2 font-medium">{p.nome_instituicao}</td>
                  <td>{p.cnpj ?? "—"}</td>
                  <td><Badge className={p.status === "ativo" ? "bg-success text-success-foreground" : ""} variant={p.status === "ativo" ? "default" : "secondary"}>{p.status}</Badge></td>
                  <td>{new Date(p.data_cadastro).toLocaleDateString("pt-BR")}</td>
                  <td>{canEditar && <Button variant="ghost" size="sm" onClick={() => toggle.mutate(p)}>{p.status === "ativo" ? "Inativar" : "Ativar"}</Button>}</td>
                </tr>
              ))}
              {data.length === 0 && <tr><td colSpan={5} className="py-8 text-center text-muted-foreground">Nenhum prestador.</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
