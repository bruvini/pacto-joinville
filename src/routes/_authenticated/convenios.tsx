import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { useState } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/convenios")({
  head: () => ({ meta: [{ title: "Convênios" }] }),
  component: ConveniosPage,
});

function ConveniosPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ prestador_id: "", numero_processo_sei_mae: "", objeto: "" });
  const { data: prestadores = [] } = useQuery({
    queryKey: ["prestadores"],
    queryFn: async () => (await supabase.from("prestadores").select("*").order("nome_instituicao")).data ?? [],
  });
  const { data = [] } = useQuery({
    queryKey: ["convenios"],
    queryFn: async () => (await supabase.from("convenios").select("*, prestadores(nome_instituicao)").order("created_at", { ascending: false })).data ?? [],
  });

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("convenios").insert(form);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["convenios"] }); setOpen(false); setForm({ prestador_id: "", numero_processo_sei_mae: "", objeto: "" }); toast.success("Convênio criado"); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-primary">Convênios</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />Novo convênio</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Novo convênio</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Prestador</Label>
                <Select value={form.prestador_id} onValueChange={(v) => setForm({ ...form, prestador_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>{prestadores.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.nome_instituicao}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Nº Processo SEI Mãe</Label><Input value={form.numero_processo_sei_mae} onChange={(e) => setForm({ ...form, numero_processo_sei_mae: e.target.value })} /></div>
              <div><Label>Objeto</Label><Input value={form.objeto} onChange={(e) => setForm({ ...form, objeto: e.target.value })} /></div>
            </div>
            <DialogFooter><Button onClick={() => create.mutate()} disabled={!form.prestador_id}>Cadastrar</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">{data.length} convênios cadastrados</CardTitle></CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted-foreground border-b">
              <tr><th className="py-2">Prestador</th><th>Processo SEI Mãe</th><th>Objeto</th><th>Status</th></tr>
            </thead>
            <tbody>
              {data.map((c: any) => (
                <tr key={c.id} className="border-b">
                  <td className="py-2 font-medium">{c.prestadores?.nome_instituicao ?? "—"}</td>
                  <td>{c.numero_processo_sei_mae ?? "—"}</td>
                  <td>{c.objeto ?? "—"}</td>
                  <td><Badge variant="outline">{c.status_convenio}</Badge></td>
                </tr>
              ))}
              {data.length === 0 && <tr><td colSpan={4} className="py-8 text-center text-muted-foreground">Nenhum convênio.</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
