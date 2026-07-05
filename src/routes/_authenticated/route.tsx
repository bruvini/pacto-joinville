import { createFileRoute, Outlet, redirect, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { NotificationBell } from "@/components/NotificationBell";
import { registrarNavegacao } from "@/lib/acesso";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    // Acesso por aprovação: sem papel atribuído => pendente.
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", data.user.id);
    if (!roles || roles.length === 0) throw redirect({ to: "/pendente" });
    return { user: data.user };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const carregando = useRouterState({ select: (s) => s.isLoading || s.status === "pending" });
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  // Trilha de acessos (LGPD): registra cada página visitada.
  useEffect(() => { registrarNavegacao(pathname); }, [pathname]);
  // Rede de segurança (caso o pg_cron não exista): RPCs idempotentes 1x por sessão —
  // verificação de prazos de prestação de contas + política de retenção de logs.
  useEffect(() => {
    void supabase.rpc("verificar_prazos_prestacao" as any).then(() => {}, () => {});
    void supabase.rpc("aplicar_retencao_logs" as any).then(() => {}, () => {});
  }, []);
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          {carregando && (
            <div className="fixed top-0 left-0 right-0 z-50 h-0.5 overflow-hidden bg-primary/15">
              <div className="h-full w-1/3 bg-primary" style={{ animation: "barra-loading 1.1s ease-in-out infinite" }} />
            </div>
          )}
          <header className="h-14 flex items-center border-b bg-card px-3 sticky top-0 z-10">
            <SidebarTrigger />
            <div className="ml-3 text-sm font-semibold text-primary">
              Gestão de Convênios e Parcerias · SMS Joinville
            </div>
            <div className="ml-auto">
              <NotificationBell />
            </div>
          </header>
          <main className="flex-1 p-6 overflow-x-auto">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
