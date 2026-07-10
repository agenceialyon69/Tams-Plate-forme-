import type { ReactNode } from "react";
import { GlobalSidebar } from "./GlobalSidebar";
import { MobileNavigation } from "./MobileNavigation";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex overflow-hidden bg-background" style={{ height: "100dvh" }}>
      <GlobalSidebar />
      <main
        className="flex min-w-0 flex-1 flex-col overflow-hidden"
        style={{
          paddingTop: "env(safe-area-inset-top)",
          paddingRight: "env(safe-area-inset-right)",
          paddingBottom: "env(safe-area-inset-bottom)",
          paddingLeft: "env(safe-area-inset-left)",
        }}
      >
        {children}
      </main>
      <MobileNavigation />
    </div>
  );
}
