import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Bell, CheckCheck, CircleDot } from "lucide-react";
import { toast } from "sonner";

function tempoRelativo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "agora";
  if (s < 3600) return `há ${Math.floor(s / 60)} min`;
  if (s < 86400) return `há ${Math.floor(s / 3600)} h`;
  return `há ${Math.floor(s / 86400)} d`;
}

export function NotificationBell() {
  const { user } = useAuth();
  const uid = user?.id;
  const qc = useQueryClient();
  const nav = useNavigate();

  const { data: notifs = [] } = useQuery({
    queryKey: ["notificacoes", uid],
    enabled: !!uid,
    queryFn: async () =>
      (await supabase.from("notificacoes").select("*").eq("user_id", uid!).order("created_at", { ascending: false }).limit(40)).data ?? [],
  });

  const naoLidas = (notifs as any[]).filter((n) => !n.lida).length;

  // Realtime: entrega instantânea + toast em novas notificações.
  useEffect(() => {
    if (!uid) return;
    const ch = supabase
      .channel(`notif-${uid}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notificacoes", filter: `user_id=eq.${uid}` }, (payload: any) => {
        toast.info(payload.new?.titulo ?? "Nova notificação", { description: payload.new?.mensagem ?? undefined });
        qc.invalidateQueries({ queryKey: ["notificacoes", uid] });
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "notificacoes", filter: `user_id=eq.${uid}` }, () => {
        qc.invalidateQueries({ queryKey: ["notificacoes", uid] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [uid, qc]);

  const marcarLida = useMutation({
    mutationFn: async (id: string) => { await supabase.from("notificacoes").update({ lida: true }).eq("id", id); },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notificacoes", uid] }),
  });
  const marcarTodas = useMutation({
    mutationFn: async () => { await supabase.from("notificacoes").update({ lida: true }).eq("user_id", uid!).eq("lida", false); },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notificacoes", uid] }),
  });

  const abrir = (n: any) => {
    if (!n.lida) marcarLida.mutate(n.id);
    if (n.lancamento_id) nav({ to: "/lancamentos/$id", params: { id: n.lancamento_id } });
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notificações">
          <Bell className="h-5 w-5" />
          {naoLidas > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground ring-2 ring-card">
              {naoLidas > 9 ? "9+" : naoLidas}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-sm font-semibold">Notificações {naoLidas > 0 && <span className="text-muted-foreground font-normal">({naoLidas} novas)</span>}</span>
          {naoLidas > 0 && (
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => marcarTodas.mutate()}>
              <CheckCheck className="h-3.5 w-3.5 mr-1" />Marcar todas
            </Button>
          )}
        </div>
        <ScrollArea className="max-h-96">
          {notifs.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              <Bell className="mx-auto mb-2 h-6 w-6 opacity-40" />
              Nenhuma notificação por aqui.
            </div>
          ) : (
            <ul className="divide-y">
              {(notifs as any[]).map((n) => (
                <li key={n.id}>
                  <button onClick={() => abrir(n)} className={`flex w-full gap-2 px-3 py-2.5 text-left hover:bg-accent/50 transition-colors ${!n.lida ? "bg-primary/5" : ""}`}>
                    <span className="mt-1 shrink-0">
                      {n.lida ? <span className="block h-2 w-2" /> : <CircleDot className="h-3.5 w-3.5 text-primary" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium leading-snug">{n.titulo}</span>
                      {n.mensagem && <span className="block text-xs text-muted-foreground leading-snug">{n.mensagem}</span>}
                      <span className="block text-[10px] text-muted-foreground mt-0.5">{tempoRelativo(n.created_at)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
