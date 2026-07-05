import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, FileSpreadsheet, Building2, FileText, Settings, LogOut, Info, ShieldCheck, ClipboardCheck, Users, History } from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader, SidebarFooter, useSidebar,
} from "@/components/ui/sidebar";
import logoAsset from "@/assets/joinville-logo.png.asset.json";
import { supabase } from "@/integrations/supabase/client";
import { registrarAcesso } from "@/lib/acesso";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";

type NavItem = { title: string; url: string; icon: typeof LayoutDashboard; adminOnly?: boolean };
const items: NavItem[] = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Lançamentos", url: "/lancamentos", icon: FileSpreadsheet },
  { title: "Prestação de Contas", url: "/prestacao-contas", icon: ClipboardCheck },
  { title: "Auditoria de Anulações", url: "/auditoria", icon: ShieldCheck },
  { title: "Convênios", url: "/convenios", icon: FileText },
  { title: "Prestadores", url: "/prestadores", icon: Building2 },
  { title: "Usuários", url: "/usuarios", icon: Users, adminOnly: true },
  { title: "Logs de Acesso", url: "/logs-acesso", icon: History, adminOnly: true },
  { title: "Configurações", url: "/configuracoes", icon: Settings, adminOnly: true },
  { title: "Sobre", url: "/sobre", icon: Info },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { profile, roles } = useAuth();
  const isAdmin = roles.includes("admin");
  const role = isAdmin ? "Admin" : roles.includes("aco") ? "ACO" : "ACP";
  const visibleItems = items.filter((it) => !it.adminOnly || isAdmin);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border">
        <div className={`flex items-center gap-3 ${collapsed ? "p-1 justify-center" : "p-2"}`}>
          <div className={`bg-white rounded-md shrink-0 ${collapsed ? "p-0.5" : "p-1"}`}>
            <img src={logoAsset.url} alt="Prefeitura de Joinville" className={`object-contain ${collapsed ? "h-7 w-7" : "h-9 w-9"}`} />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <div className="text-xs uppercase tracking-wider text-sidebar-foreground/70">Prefeitura de</div>
              <div className="text-sm font-bold text-sidebar-foreground leading-tight">Joinville · SMS</div>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          {!collapsed && <SidebarGroupLabel>Gestão de Convênios</SidebarGroupLabel>}
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleItems.map((it) => {
                const active = pathname === it.url || pathname.startsWith(it.url + "/");
                return (
                  <SidebarMenuItem key={it.url}>
                    <SidebarMenuButton asChild isActive={active} tooltip={it.title}>
                      <Link to={it.url} className="flex items-center gap-2">
                        <it.icon className="h-4 w-4" />
                        {!collapsed && <span>{it.title}</span>}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        {!collapsed && profile && (
          <div className="px-2 py-1 text-xs">
            <div className="font-medium text-sidebar-foreground truncate">{profile.nome}</div>
            <div className="text-sidebar-foreground/60 truncate">{profile.email}</div>
            <Badge className="mt-1 bg-sidebar-primary text-sidebar-primary-foreground">{role}</Badge>
          </div>
        )}
        <SidebarMenuButton
          onClick={async () => {
            await registrarAcesso("logout");
            await supabase.auth.signOut();
            window.location.href = "/auth";
          }}
        >
          <LogOut className="h-4 w-4" />
          {!collapsed && <span>Sair</span>}
        </SidebarMenuButton>
      </SidebarFooter>
    </Sidebar>
  );
}
