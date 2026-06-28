"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import {
  Activity,
  Calendar,
  Heart,
  Home,
  LogOut,
  Settings,
  Sparkles,
  Tv,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PersistentPlayer } from "@/components/persistent-player";

const nav = [
  { href: "/app", label: "Accueil", icon: Home },
  { href: "/app/channels", label: "Chaînes", icon: Tv },
  { href: "/app/guide", label: "Guide TV", icon: Calendar },
  { href: "/app/favorites", label: "Favoris", icon: Heart },
  { href: "/app/settings", label: "Paramètres", icon: Settings },
  { href: "/app/admin", label: "Monitoring", icon: Activity },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;

      const currentIdx = nav.findIndex(
        (item) => pathname === item.href || (item.href !== "/app" && pathname.startsWith(item.href))
      );

      if (e.key === "ArrowLeft" && currentIdx > 0) {
        e.preventDefault();
        router.push(nav[currentIdx - 1].href);
      }
      if (e.key === "ArrowRight" && currentIdx < nav.length - 1) {
        e.preventDefault();
        router.push(nav[currentIdx + 1].href);
      }
      if (e.key === "Escape" && pathname !== "/app") {
        e.preventDefault();
        router.push("/app");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pathname, router]);

  return (
    <div className="bg-mesh flex min-h-dvh flex-col lg:flex-row">
      <aside className="glass fixed bottom-0 left-0 right-0 z-50 border-t border-border-subtle lg:static lg:w-72 lg:min-h-dvh lg:border-r lg:border-t-0">
        <div className="hidden lg:flex items-center gap-3 px-6 py-8">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
          <div>
            <span className="text-xl font-bold gradient-text">StreamTV</span>
            <p className="text-xs text-muted">Votre IPTV personnelle</p>
          </div>
        </div>

        <nav className="flex justify-around px-2 py-2.5 lg:flex-col lg:gap-1 lg:px-4 lg:py-2">
          {nav.map(({ href, label, icon: Icon }) => {
            const active =
              pathname === href || (href !== "/app" && pathname.startsWith(href));
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "tv-focus focus-ring relative flex flex-col items-center gap-1 rounded-xl px-3 py-2.5 text-[10px] font-medium transition-all lg:flex-row lg:gap-3 lg:px-4 lg:py-3 lg:text-sm",
                  active
                    ? "bg-primary/15 text-primary"
                    : "text-muted hover:bg-surface-hover hover:text-foreground"
                )}
              >
                {active && (
                  <span className="absolute inset-y-1 left-0 hidden w-1 rounded-full bg-primary lg:block" />
                )}
                <Icon className={cn("h-5 w-5 lg:h-5 lg:w-5", active && "text-primary")} />
                {label}
              </Link>
            );
          })}
          <button
            onClick={logout}
            className="tv-focus focus-ring hidden lg:flex items-center gap-3 rounded-xl px-4 py-3 text-sm text-muted transition-colors hover:bg-surface-hover hover:text-foreground mt-auto mb-4"
          >
            <LogOut className="h-5 w-5" />
            Déconnexion
          </button>
        </nav>
      </aside>

      <main className="flex-1 pb-24 lg:pb-0 lg:overflow-y-auto">{children}</main>

      <PersistentPlayer />
    </div>
  );
}
