import { createRootRoute, Outlet } from "@tanstack/react-router";
import { BookOpen } from "lucide-react";

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  return (
    <div className="app">
      <nav className="topbar">
        <div className="topbar-brand">
          <BookOpen size={20} />
          <span>tagebook</span>
        </div>
      </nav>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
