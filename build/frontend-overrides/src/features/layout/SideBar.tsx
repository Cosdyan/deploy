import { useTranslation } from "react-i18next";
import { NavLink } from "react-router-dom";
import { useAuthReducer } from "@/atoms/auth";
import { cn } from "@/lib/utils";
import { routes, type RouteConfig } from "@/routes";

interface SideBarProps {
  onNavigate?: () => void;
}

export function SideBar({ onNavigate }: SideBarProps) {
  const { t } = useTranslation();
  const { auth } = useAuthReducer();
  const role = auth.permissions && (auth.permissions.is_superuser ? "admin" : auth.permissions.is_ops ? "ops" : "user");
  const sidebarRoutes = routes.filter(
    (route): route is RouteConfig & { nav: true; icon: NonNullable<RouteConfig["icon"]>; labelKey: string; fullPath: string } =>
      !!route.nav && (!route.permissions || route.permissions.includes(role || "user"))
  );

  return (
    <div className="aurora-sidebar flex h-full flex-col">
      <div className="px-6 py-5">
        <div className="flex items-center gap-3"><span className="aurora-brand">A</span><div><span className="text-lg font-bold tracking-tight">Aurora</span><p className="mt-0.5 text-xs text-muted-foreground">{t("Control workspace")}</p></div></div>
      </div>

      <nav aria-label={t("Main navigation")} className="flex-1 px-3 py-2"><p className="aurora-eyebrow px-3 mb-3">{t("Workspace")}</p>
        <ul className="space-y-0.5">
          {sidebarRoutes.map((route) => {
            const Icon = route.icon;
            return (
              <li key={route.key}>
                <NavLink
                  to={route.fullPath}
                  end={route.end}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                      isActive
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )
                  }
                >
                  <Icon className="size-[18px]" aria-hidden="true" />
                  <span>{t(route.labelKey)}</span>
                </NavLink>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}

export default SideBar;
