import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { isShellRouteActive, menuIcon, mobilePrimaryItems, shellNavGroups } from "./nav-model";

const MenuIcon = menuIcon;

export function MobileNavigation() {
  const [location] = useLocation();
  const [open, setOpen] = useState(false);

  return (
    <>
      <nav
        data-testid="mobile-navigation"
        className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-sidebar md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)", touchAction: "manipulation" }}
        aria-label="Navigation mobile globale"
      >
        <div className="grid grid-cols-6 items-center gap-0.5 px-1 py-2">
          {mobilePrimaryItems.map((item) => {
            const Icon = item.icon;
            const active = isShellRouteActive(location, item);
            return (
              <Link key={item.href} href={item.href}>
                <button
                  onClick={() => setOpen(false)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative flex min-h-[44px] min-w-[44px] flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1.5 transition-colors",
                    active ? "text-primary" : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
                  )}
                >
                  <Icon className={cn("h-5 w-5", active && "scale-110")} />
                  <span className="max-w-full truncate text-[9px] font-medium">{item.label}</span>
                  {active ? <span className="absolute bottom-0 h-0.5 w-4 rounded-full bg-primary" /> : null}
                </button>
              </Link>
            );
          })}
          <button
            type="button"
            aria-expanded={open}
            aria-controls="mobile-global-menu"
            onClick={() => setOpen((value) => !value)}
            className={cn(
              "flex min-h-[44px] min-w-[44px] flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1.5 transition-colors",
              open ? "bg-sidebar-accent text-primary" : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
            )}
          >
            <MenuIcon className="h-5 w-5" />
            <span className="text-[9px] font-medium">Menu</span>
          </button>
        </div>
      </nav>

      {open ? (
        <div className="fixed inset-0 z-40 md:hidden">
          <button className="absolute inset-0 h-full w-full bg-black/40" aria-label="Fermer le menu" onClick={() => setOpen(false)} />
          <div
            id="mobile-global-menu"
            className="absolute bottom-16 left-3 right-3 max-h-[70vh] overflow-y-auto rounded-3xl border border-border bg-card p-4 shadow-2xl"
          >
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">TAMS</p>
                <h2 className="text-base font-semibold">Toutes les sections</h2>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary text-muted-foreground"
                aria-label="Fermer le menu global"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-4">
              {shellNavGroups.map((group) => (
                <section key={group.label}>
                  <h3 className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">{group.label}</h3>
                  <div className="grid grid-cols-1 gap-1">
                    {group.items.map((item) => {
                      const Icon = item.icon;
                      const active = isShellRouteActive(location, item);
                      return (
                        <Link key={item.href} href={item.href}>
                          <button
                            onClick={() => setOpen(false)}
                            className={cn(
                              "flex min-h-[44px] items-center gap-3 rounded-2xl px-3 py-2 text-left text-sm",
                              active ? "bg-primary/15 text-primary" : "bg-secondary/60 text-foreground",
                            )}
                          >
                            <Icon className="h-4 w-4" />
                            {item.label}
                          </button>
                        </Link>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

