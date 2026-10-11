import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useAtom } from "jotai";
import {
  Check,
  CircleUserRound,
  Languages,
  LogOut,
  Menu,
  Palette,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuthReducer } from "@/atoms/auth";
import { drawerOpenAtom } from "@/atoms/layout";
import { useTheme } from "@/components/theme-provider";
import { THEMES } from "@/atoms/theme";

const THEME_OPTIONS = [
  { name: "auto" as const, label: "Auto" },
  ...THEMES.map((t) => ({ name: t.name, label: t.label })),
];

const LANGUAGES = [
  { code: "en", labelKey: "English" },
  { code: "zh", labelKey: "\u4E2D\u6587" },
];

export function NavBar() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [, setDrawerOpen] = useAtom(drawerOpenAtom);
  const { logout: logoutAction } = useAuthReducer();
  const { theme: currentTheme, setTheme } = useTheme();

  const logout = () => {
    logoutAction();
    navigate("/login");
  };

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b border-border bg-background px-4 lg:px-6">
      {/* Mobile hamburger */}
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        onClick={() => setDrawerOpen(true)}
        aria-label={t("Open navigation")}
      >
        <Menu className="size-5" />
      </Button>

      <div className="flex-1 text-sm font-medium text-muted-foreground">{t("Control workspace")}</div>

      {/* Right side: account dropdown with theme, language, logout */}
      <div className="flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label={t("Account menu")}
            >
              <CircleUserRound className="size-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Palette className="mr-2 size-4" />
                {t("Theme")}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="max-h-96 overflow-y-auto">
                {THEME_OPTIONS.map(({ name, label }) => (
                  <DropdownMenuItem
                    key={name}
                    onClick={() => setTheme(name)}
                  >
                    <span className="flex-1 truncate">{label}</span>
                    {currentTheme === name && (
                      <Check className="ml-auto size-4 shrink-0" aria-hidden="true" />
                    )}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>

            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Languages className="mr-2 size-4" />
                {t("Language")}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {LANGUAGES.map((language) => {
                  const isActive =
                    i18n.resolvedLanguage === language.code ||
                    i18n.language?.startsWith(`${language.code}-`);
                  return (
                    <DropdownMenuItem
                      key={language.code}
                      onClick={() => i18n.changeLanguage(language.code)}
                    >
                      <span className="flex-1">{t(language.labelKey)}</span>
                      {isActive && (
                        <Check className="ml-auto size-4 shrink-0" aria-hidden="true" />
                      )}
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuSubContent>
            </DropdownMenuSub>

            <DropdownMenuSeparator />

            <DropdownMenuItem onClick={logout}>
              <LogOut className="mr-2 size-4" />
              {t("Logout")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

export default NavBar;
