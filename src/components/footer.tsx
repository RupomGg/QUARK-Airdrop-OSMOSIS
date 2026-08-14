import { Link } from "@tanstack/react-router";
import { Logo } from "./logo";
import { Github, Twitter, Mail } from "lucide-react";

export function Footer() {
  return (
    <footer className="bg-card border-t border-border">
      <div className="mx-auto max-w-7xl px-6 py-10">
        <div className="grid gap-8 md:grid-cols-4">
          <div>
            <div className="flex items-center gap-2">
              <Logo />
              <div>
                <div className="font-bold">QUARK</div>
                <div className="text-xs text-muted-foreground">Infrastructure for Vouchered Liquidity</div>
              </div>
            </div>
            <p className="mt-4 text-sm text-muted-foreground">© 2026 QUARK Protocol. All rights reserved.</p>
          </div>

          <div>
            <h4 className="mb-2 font-semibold">Products</h4>
            <ul className="space-y-1 text-sm text-muted-foreground">
              <li><a href="#" className="hover:text-foreground">Docs</a></li>
              <li><Link to="/app" className="hover:text-foreground">Dashboard</Link></li>
              <li><a href="#" className="hover:text-foreground">Ecosystem</a></li>
            </ul>
          </div>

          <div>
            <h4 className="mb-2 font-semibold">Company</h4>
            <ul className="space-y-1 text-sm text-muted-foreground">
              <li><a href="#" className="hover:text-foreground">About</a></li>
              <li><a href="#" className="hover:text-foreground">Security</a></li>
              <li><a href="#" className="hover:text-foreground">Contact</a></li>
            </ul>
          </div>

          <div>
            <h4 className="mb-2 font-semibold">Legal & Social</h4>
            <ul className="space-y-1 text-sm text-muted-foreground">
              <li><a href="#" className="hover:text-foreground">Terms</a></li>
              <li><a href="#" className="hover:text-foreground">Privacy Policy</a></li>
              <li className="flex items-center gap-3 pt-2">
                <a href="#" aria-label="Twitter" className="text-muted-foreground hover:text-foreground"><Twitter className="size-4" /></a>
                <a href="#" aria-label="GitHub" className="text-muted-foreground hover:text-foreground"><Github className="size-4" /></a>
                <a href="mailto:hello@quark.io" aria-label="Email" className="text-muted-foreground hover:text-foreground"><Mail className="size-4" /></a>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </footer>
  );
}

export default Footer;
