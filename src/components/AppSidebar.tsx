import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  FileSpreadsheet,
  Building2,
  FileText,
  Settings,
  LogOut,
  Info,
  ShieldCheck,
  ClipboardCheck,
  Users,
  History,
  BicepsFlexed,
  PanelLeftClose,
  PanelLeftOpen,
  UtensilsCrossed,
  DollarSign,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import logoAsset from "@/assets/joinville-logo.png.asset.json";
import { supabase } from "@/integrations/supabase/client";
import { registrarAcesso } from "@/lib/acesso";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";

type NavItem = {
  title: string;
  url: string;
  icon: typeof LayoutDashboard;
  adminOnly?: boolean;
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

const groups: NavGroup[] = [
  {
    label: "Visão geral",
    items: [{ title: "Dashboard", url: "/dashboard", icon: LayoutDashboard }],
  },
  {
    label: "Execução financeira",
    items: [
      { title: "Empenhos de Contratos", url: "/lancamentos", icon: FileSpreadsheet },
      { title: "Piso da Enfermagem", url: "/piso", icon: BicepsFlexed },
      { title: "PVH", url: "/pvh", icon: DollarSign },
      { title: "Dieta CACON", url: "/cacon", icon: UtensilsCrossed },
    ],
  },
  {
    label: "Controle e acompanhamento",
    items: [
      { title: "Prestação de Contas", url: "/prestacao-contas", icon: ClipboardCheck },
      { title: "Auditoria de Anulações", url: "/auditoria", icon: ShieldCheck },
    ],
  },
  {
    label: "Cadastros",
    items: [
      { title: "Convênios", url: "/convenios", icon: FileText },
      { title: "Prestadores", url: "/prestadores", icon: Building2 },
    ],
  },
  {
    label: "Administração",
    items: [
      { title: "Usuários", url: "/usuarios", icon: Users, adminOnly: true },
      { title: "Logs de Acesso", url: "/logs-acesso", icon: History, adminOnly: true },
      { title: "Configurações", url: "/configuracoes", icon: Settings, adminOnly: true },
    ],
  },
  {
    label: "Sistema",
    items: [{ title: "Sobre", url: "/sobre", icon: Info }],
  },
];

export function AppSidebar() {
  const { state, toggleSidebar } = useSidebar();
  const collapsed = state === "collapsed";
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { profile, roles } = useAuth();
  const isAdmin = roles.includes("admin");
  const role = isAdmin ? "Admin" : roles.includes("aco") ? "UFI" : "ACP";

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border">
        <div
          className={`flex items-center gap-2 ${
            collapsed ? "flex-col justify-center px-1 py-2" : "px-2 py-2"
          }`}
        >
          <div className={`shrink-0 rounded-md bg-white ${collapsed ? "p-0.5" : "p-1"}`}>
            <img
              src={logoAsset.url}
              alt="Prefeitura de Joinville"
              className={`object-contain ${collapsed ? "h-7 w-7" : "h-9 w-9"}`}
            />
          </div>

          {!collapsed && (
            <div className="min-w-0 flex-1">
              <div className="text-xs uppercase tracking-wider text-sidebar-foreground/70">
                Prefeitura de
              </div>
              <div className="text-sm font-bold leading-tight text-sidebar-foreground">
                Joinville · SMS
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={toggleSidebar}
            title={collapsed ? "Expandir menu" : "Recolher menu"}
            aria-label={collapsed ? "Expandir menu lateral" : "Recolher menu lateral"}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-sidebar-foreground/75 transition hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
          >
            {collapsed ? (
              <PanelLeftOpen className="h-4 w-4" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
          </button>
        </div>
      </SidebarHeader>

      <SidebarContent className="py-1">
        {groups.map((group) => {
          const visibleItems = group.items.filter((item) => !item.adminOnly || isAdmin);
          if (visibleItems.length === 0) return null;

          return (
            <SidebarGroup key={group.label} className="py-1">
              <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {visibleItems.map((item) => {
                    const active =
                      pathname === item.url || pathname.startsWith(item.url + "/");
                    return (
                      <SidebarMenuItem key={item.url}>
                        <SidebarMenuButton asChild isActive={active} tooltip={item.title}>
                          <Link to={item.url} className="flex items-center gap-2">
                            <item.icon className="h-4 w-4" />
                            <span>{item.title}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          );
        })}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        {!collapsed && profile && (
          <div className="px-2 py-1 text-xs">
            <div className="truncate font-medium text-sidebar-foreground">{profile.nome}</div>
            <div className="truncate text-sidebar-foreground/60">{profile.email}</div>
            <Badge className="mt-1 bg-sidebar-primary text-sidebar-primary-foreground">
              {role}
            </Badge>
          </div>
        )}
        <SidebarMenuButton
          tooltip="Sair"
          onClick={async () => {
            await registrarAcesso("logout");
            await supabase.auth.signOut();
            window.location.href = "/auth";
          }}
        >
          <LogOut className="h-4 w-4" />
          <span>Sair</span>
        </SidebarMenuButton>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
