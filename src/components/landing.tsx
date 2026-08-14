import { Link } from "@tanstack/react-router";
import {
  Shield,
  Layers,
  Repeat,
  Lock,
  ArrowRight,
  CircleCheck,
  Github,
  Twitter,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useStore } from "@/lib/store";
import { useState } from "react";
import { WalletConnectModal } from "@/components/wallet-connect";
import { Logo } from "@/components/logo";
import Footer from "@/components/footer";

export { Logo };


export function Landing() {
  const { user } = useStore();
  const [walletOpen, setWalletOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <header className="sticky top-0 z-30 border-b border-border bg-background/70 backdrop-blur-lg">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <Link to="/" className="flex items-center gap-2">
            <Logo />
            <span className="text-lg font-bold tracking-wide">QUARK</span>
          </Link>
          <nav className="hidden items-center gap-8 md:flex">
            <a href="#features" className="text-sm text-muted-foreground hover:text-foreground">Features</a>
            <a href="#ecosystem" className="text-sm text-muted-foreground hover:text-foreground">Ecosystem</a>
            <a href="#docs" className="text-sm text-muted-foreground hover:text-foreground">Docs</a>
            <a href="#security" className="text-sm text-muted-foreground hover:text-foreground">Security</a>
            <Link to="/app" className="text-sm text-muted-foreground hover:text-foreground">Dashboard</Link>
          </nav>
          <div className="flex items-center gap-3">
            <nav className="hidden gap-2 md:flex">
              <Link to="/login" className="text-sm text-muted-foreground hover:text-foreground">Sign In</Link>
              <Link to="/signup" className="ml-2 rounded-md border border-border bg-card px-3 py-1 text-sm hover:bg-accent">Sign Up</Link>
              <Link to="/admin-login" className="ml-2 text-sm text-amber-400 hover:underline">Admin</Link>
            </nav>
            <Button onClick={() => setWalletOpen(true)} className="bg-primary text-primary-foreground hover:opacity-90">
              {user.connected ? user.address : "Connect Wallet"}
            </Button>
          </div>
          <WalletConnectModal open={walletOpen} onClose={() => setWalletOpen(false)} />
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border">
        <div className="absolute inset-0 bg-grid opacity-40" />
        <div className="absolute left-1/2 top-0 -z-10 h-[500px] w-[900px] -translate-x-1/2 rounded-full bg-primary/20 blur-3xl" />
        <div className="relative mx-auto grid max-w-7xl gap-12 px-6 py-24 lg:grid-cols-2 lg:items-center">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
              <span className="size-2 rounded-full bg-success" /> Cosmos IBC Compatible
            </span>
            <h1 className="mt-6 text-5xl font-bold tracking-tight md:text-6xl">
              The Infrastructure Layer for <br />
              <span className="text-gradient">Vouchered Liquidity</span> on Cosmos
            </h1>
            <p className="mt-6 max-w-xl text-lg text-muted-foreground">
              QUARK enables institutions and protocols to issue, manage, and exchange
              transferable voucher tokens against real assets across the Cosmos ecosystem.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg" className="bg-primary text-primary-foreground hover:opacity-90 glow-primary">
                <Link to="/app">Launch App <ArrowRight className="ml-2 size-4" /></Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <a href="#docs">Documentation</a>
              </Button>
            </div>
            <dl className="mt-12 grid grid-cols-3 gap-6 border-t border-border pt-8">
              {[
                { k: "TVL", v: "$18.42M" },
                { k: "Vouchers", v: "12,486" },
                { k: "Volume 24h", v: "$2.31M" },
              ].map((s) => (
                <div key={s.k}>
                  <dt className="text-xs uppercase tracking-wider text-muted-foreground">{s.k}</dt>
                  <dd className="mt-1 text-2xl font-semibold">{s.v}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="relative">
            <HeroArt />
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="mx-auto max-w-7xl px-6 py-24">
        <div className="grid gap-6 md:grid-cols-4">
          {[
            { icon: Layers, t: "IBC Compatible", d: "Seamless cross-chain interoperability." },
            { icon: Repeat, t: "Voucherization", d: "Turn any asset into transferable vouchers." },
            { icon: Shield, t: "Liquidity Control", d: "Full control over supply and liquidity." },
            { icon: Lock, t: "Secure & Audited", d: "Built with security at the core." },
          ].map((f) => (
            <div key={f.t} className="rounded-2xl border border-border bg-card p-6 transition hover:border-primary/50">
              <div className="inline-flex size-11 items-center justify-center rounded-xl bg-primary/15 text-primary">
                <f.icon className="size-5" />
              </div>
              <h3 className="mt-4 font-semibold">{f.t}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Ecosystem */}
      <section id="ecosystem" className="border-y border-border bg-card/40 py-24">
        <div className="mx-auto max-w-7xl px-6">
          <div className="grid gap-12 lg:grid-cols-2">
            <div>
              <h2 className="text-3xl font-bold">Built for the Cosmos Ecosystem</h2>
              <p className="mt-4 text-muted-foreground">
                Issue vouchers backed by your assets, deploy liquidity, and let users
                redeem on any IBC-connected chain. QUARK abstracts away the complexity.
              </p>
              <ul className="mt-6 space-y-3 text-sm">
                {[
                  "Permissionless voucher generation",
                  "On-chain redemption with cryptographic proofs",
                  "Real-time treasury and audit logs",
                  "DEX-native swaps between vouchers and base tokens",
                ].map((i) => (
                  <li key={i} className="flex items-start gap-2">
                    <CircleCheck className="mt-0.5 size-4 text-success" />
                    <span className="text-muted-foreground">{i}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl border border-border bg-card p-8">
              <div className="grid grid-cols-3 gap-4 text-center">
                {["BTC", "ETH", "USDC", "ATOM", "OSMO", "EVMOS"].map((t) => (
                  <div key={t} className="rounded-xl border border-border bg-background py-6 font-semibold tracking-wider text-muted-foreground">
                    {t}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section id="security" className="mx-auto max-w-7xl px-6 py-24 text-center">
        <h2 className="text-4xl font-bold">Ready to issue your first voucher?</h2>
        <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
          Launch the QUARK dashboard and explore minting, swap execution, and treasury controls in a secure environment.
        </p>
        <Button asChild size="lg" className="mt-8 bg-primary text-primary-foreground hover:opacity-90 glow-primary">
          <Link to="/app">Launch Dashboard <ArrowRight className="ml-2 size-4" /></Link>
        </Button>
      </section>

      <Footer />
    </div>
  );
}


function HeroArt() {
  return (
    <div className="relative mx-auto aspect-square w-full max-w-md">
      <div className="absolute inset-0 animate-pulse rounded-full bg-primary/20 blur-3xl" />
      <svg viewBox="0 0 400 400" className="relative">
        <defs>
          <linearGradient id="g1" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="oklch(0.75 0.20 280)" />
            <stop offset="100%" stopColor="oklch(0.65 0.22 320)" />
          </linearGradient>
        </defs>
        <g transform="translate(200 200)">
          {[0, 60, 120, 180, 240, 300].map((a) => (
            <g key={a} transform={`rotate(${a})`}>
              <rect x="-50" y="-130" width="100" height="50" rx="10" fill="url(#g1)" opacity="0.85" />
            </g>
          ))}
          <circle r="60" fill="oklch(0.30 0.08 280)" stroke="url(#g1)" strokeWidth="2" />
          <text textAnchor="middle" dy="8" fontSize="28" fontWeight="900" fill="white">Q</text>
        </g>
      </svg>
    </div>
  );
}
