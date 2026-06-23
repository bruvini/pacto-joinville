import { createFileRoute, Outlet, redirect, useRouterState } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { NotificationBell } from "@/components/NotificationBell";

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
  const carregando = useRouterState({ select: (s) => s.status === "pending" });
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
