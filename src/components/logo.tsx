import logoUrl from "@/assets/quark-logo.png";

export function Logo({ className = "size-8" }: { className?: string }) {
  return <img src={logoUrl} alt="QUARK" className={className} width={32} height={32} loading="lazy" />;
}
