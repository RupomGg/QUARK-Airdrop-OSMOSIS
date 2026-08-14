import {
  createFileRoute,
  Outlet,
  Link,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { useEffect } from "react";
import {
  Vault,
  Coins,
  Ticket,
  Database,
  Gift,
  ScrollText,
  LogOut,
  Shield,
  ArrowLeft,
} from "lucide-react";
import { Logo } from "@/components/logo";
import Footer from "@/components/footer";
import { useStore } from "@/lib/store";
import { toast } from "sonner";

export const Route = createFileRoute("/admin")({
  component: AdminLayout,
});

const adminNav = [
  { to: "/admin/treasury", label: "Treasury & Audit", icon: Vault },
  { to: "/admin/mint", label: "Mint / Burn", icon: Coins },
  { to: "/admin/generator", label: "Token Generator", icon: Ticket },
  { to: "/admin/reserve", label: "Reserve", icon: Database },
  { to: "/admin/airdrop", label: "Airdrop", icon: Gift },
  { to: "/admin/audit", label: "Audit Logs", icon: ScrollText },
];

function AdminLayout() {
  const { user, logout } = useStore();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (!user.authenticated) {
      navigate({ to: "/admin-login" });
      return;
    }
    if (user.role !== "admin") {
      toast.error("Admin access required");
      navigate({ to: "/admin-login" });
    }
  }, [user.authenticated, user.role, navigate]);

  if (!user.authenticated || user.role !== "admin") return null;

  const handleLogout = () => {
    logout();
    toast.success("Logged out");
    navigate({ to: "/admin-login" });
  };

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar md:flex">
        <div className="flex h-16 items-center gap-2 border-b border-sidebar-border px-6">
          <Logo className="size-7" />
          <span className="font-bold tracking-wide">QUARK</span>
          <span className="ml-auto rounded bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-400">
            Admin
          </span>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 pb-4 pt-4 space-y-1">
          <div className="mb-2 flex items-center gap-2 px-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            <Shield className="size-3" /> Admin Console
          </div>
          {adminNav.map((item) => {
            const active = pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to as any}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
                  active
                    ? "bg-amber-500/15 text-amber-300"
                    : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
                }`}
              >
                <item.icon className="size-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-sidebar-border p-3 space-y-1">
          <Link
            to="/app"
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
          >
            <ArrowLeft className="size-4" /> Back to User App
          </Link>
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
          >
            <LogOut className="size-4" /> Logout
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-4 border-b border-amber-500/30 bg-background/80 px-6 backdrop-blur">
          <div className="flex items-center gap-2 text-sm">
            <Shield className="size-4 text-amber-400" />
            <span className="font-semibold text-amber-400">Admin Console</span>
            <span className="text-muted-foreground">— restricted area</span>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-card px-3 py-1.5">
            <div className="flex size-7 items-center justify-center rounded-full bg-amber-500/20 text-xs font-bold text-amber-400">
              <Shield className="size-3.5" />
            </div>
            <div className="hidden text-xs leading-tight sm:block">
              <div className="font-medium">{user.name}</div>
              <div className="text-amber-400/80">{user.email}</div>
            </div>
          </div>
        </header>

        <div className="flex gap-1 overflow-x-auto border-b border-border bg-sidebar p-2 md:hidden">
          {adminNav.map((item) => (
            <Link
              key={item.to}
              to={item.to as any}
              className="flex shrink-0 items-center gap-2 rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
            >
              <item.icon className="size-3.5" /> {item.label}
            </Link>
          ))}
        </div>

        <main className="flex-1 p-6">
          <Outlet />
        </main>
        <Footer />
      </div>
    </div>
  );
}
