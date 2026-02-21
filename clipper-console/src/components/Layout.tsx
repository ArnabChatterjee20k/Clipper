import { Link, Outlet, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { FolderOpen, Scissors, ListTodo, GitBranch, Braces } from "lucide-react";

const nav = [
  { to: "/buckets", label: "Buckets", icon: FolderOpen },
  { to: "/edit", label: "Edit", icon: Scissors },
  { to: "/edits", label: "Edits", icon: ListTodo },
  { to: "/workflows", label: "Workflows", icon: GitBranch },
  { to: "/api", label: "API", icon: Braces },
];

export function Layout() {
  const location = useLocation();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b bg-card">
        <nav className="container max-w-6xl mx-auto px-4 flex items-center gap-1 h-12">
          <Link
            to="/"
            className="text-sm font-semibold text-foreground mr-4 hover:opacity-80"
          >
            Clipper
          </Link>
          {nav.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                location.pathname === to
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              )}
            >
              <Icon className="size-4" />
              {label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}
