import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, HeartPulse, Timer, Activity, Gauge, FlaskConical, Lightbulb, BookOpen, Cog } from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarFooter, useSidebar,
} from "@/components/ui/sidebar";

const items = [
  { title: "Overview", url: "/", icon: LayoutDashboard },
  { title: "Engine Health", url: "/engine-health", icon: HeartPulse },
  { title: "RUL Prediction", url: "/rul-prediction", icon: Timer },
  { title: "Sensor Analysis", url: "/sensor-analysis", icon: Activity },
  { title: "Model Performance", url: "/model-performance", icon: Gauge },
  { title: "Research & Validation", url: "/research", icon: FlaskConical },
  { title: "Explainability", url: "/explainability", icon: Lightbulb },
  { title: "About Project", url: "/about", icon: BookOpen },
] as const;

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const path = useRouterState({ select: (s) => s.location.pathname });
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border">
        <div className="flex items-center gap-2 px-1 py-2">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
            <Cog className="size-4" />
          </div>
          {!collapsed && (
            <div className="leading-tight">
              <div className="font-serif text-sm font-semibold text-sidebar-accent-foreground">PdM Intelligence</div>
              <div className="text-[10px] uppercase tracking-widest text-sidebar-foreground/60">C-MAPSS · FD001</div>
            </div>
          )}
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-sidebar-foreground/50">Workspace</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((it) => (
                <SidebarMenuItem key={it.url}>
                  <SidebarMenuButton asChild isActive={path === it.url} tooltip={it.title}>
                    <Link to={it.url}>
                      <it.icon className="size-4" />
                      <span>{it.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      {!collapsed && (
        <SidebarFooter className="border-t border-sidebar-border text-[11px] text-sidebar-foreground/60">
          <div className="px-2 py-1">Research build · v1.0</div>
        </SidebarFooter>
      )}
    </Sidebar>
  );
}
