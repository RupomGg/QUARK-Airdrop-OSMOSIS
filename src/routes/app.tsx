import {
  createFileRoute,
  Outlet,
  Link,
  useNavigate,
  useRouterState,
  
} from "@tanstack/react-router";
import { useEffect } from "react";

import {
  LayoutDashboard,
  Repeat,
  Wallet,
  Settings,
  LogOut,
  Bell,
  Search,
  ListOrdered,
  Droplets,
  Landmark,
  Send,
  Shield,
  User as UserIcon,
} from "lucide-react";
import { Logo } from "@/components/logo";
import Footer from "@/components/footer";
import { useStore } from "@/lib/store";
import { toast } from "sonner";


export const Route = createFileRoute("/app")({
  component: AppLayout,
});

type NavItem = { to: string; label: string; icon: any; exact?: boolean };

const userNav: NavItem[] = [
  { to: "/app", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/app/wallet", label: "My Wallet", icon: Wallet },
  { to: "/app/swap", label: "Swap & Redeem", icon: Repeat },
  { to: "/app/lending", label: "Lending / Escrow", icon: Landmark },
  { to: "/app/liquidity", label: "Liquidity Pools", icon: Droplets },
  { to: "/app/send", label: "Send / Redeem", icon: Send },
  { to: "/app/transactions", label: "Transactions", icon: ListOrdered },
  { to: "/app/settings", label: "Settings", icon: Settings },
];

function AppLayout() {
  const { user, logout } = useStore();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  // Admins reach /app/* pages (e.g. Liquidity Pools, where "Create Pool"
  // lives) straight from their admin login — every other admin action
  // (Mint, Airdrop, Generator, Reserve) works the same way, via the
  // treasury's own signer, with no personal wallet involved. Requiring a
  // wallet connection here would be actively counterproductive: connecting
  // one logs into a brand-new, separate "user"-role account (see
  // loginWithWallet), silently swapping away the admin session underneath
  // even though the UI might still look like it preserved "admin".
  const requiresWallet = user.role !== "admin";

  useEffect(() => {
    if (!user.authenticated) {
      navigate({ to: "/login" });
      return;
    }
    if (requiresWallet && !user.connected) {
      navigate({ to: "/login" });
    }
  }, [user.authenticated, user.connected, requiresWallet, navigate]);

  if (!user.authenticated) return null;
  if (requiresWallet && !user.connected) return null;



  const handleLogout = () => {
    logout();
    toast.success("Logged out");
    navigate({ to: "/login" });
  };

  const renderGroup = (label: string, items: NavItem[], icon: any) => {
    const Icon = icon;
    return (
      <div className="mt-4">
        <div className="mb-2 flex items-center gap-2 px-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          <Icon className="size-3" /> {label}
        </div>
        <div className="space-y-1">
          {items.map((item) => {
            const active = item.exact ? pathname === item.to : pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to as any}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
                  active
                    ? "bg-primary/15 text-foreground"
                    : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
                }`}
              >
                <item.icon className="size-4" />
                {item.label}
              </Link>
            );
          })}
        </div>
      </div>
    );
  };

  const visibleNav = userNav;

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar md:flex">
        <div className="flex h-16 items-center gap-2 border-b border-sidebar-border px-6">
          <Logo className="size-7" />
          <span className="font-bold tracking-wide">QUARK</span>
          <span className="ml-auto rounded bg-primary/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-primary-foreground">
            User
          </span>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 pb-4">
          {renderGroup("User Panel", userNav, UserIcon)}
          {user.role === "admin" && (
            <div className="mt-6 px-3">
              <Link
                to="/admin"
                className="flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-300 hover:bg-amber-500/20"
              >
                <Shield className="size-3.5" /> Open Admin Console
              </Link>
            </div>
          )}
        </nav>

        <div className="border-t border-sidebar-border p-3 space-y-1">
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
          >
            <LogOut className="size-4" /> Logout
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-4 border-b border-border bg-background/80 px-6 backdrop-blur">
          <div className="relative w-full max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              placeholder="Search transactions, vouchers, or tokens..."
              className="w-full rounded-lg border border-border bg-card py-2 pl-9 pr-3 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-3">
            <button className="rounded-lg border border-border bg-card p-2 hover:bg-accent">
              <Bell className="size-4" />
            </button>
            <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5">
              <div className="flex size-7 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary-foreground">
                {user.name[0]?.toUpperCase()}
              </div>

              <div className="hidden text-xs leading-tight sm:block">
                <div className="font-medium">{user.name}</div>
                <div className="font-mono text-muted-foreground">{user.address}</div>
              </div>
            </div>
          </div>
        </header>

        <div className="flex gap-1 overflow-x-auto border-b border-border bg-sidebar p-2 md:hidden">
          {visibleNav.map((item) => (
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
