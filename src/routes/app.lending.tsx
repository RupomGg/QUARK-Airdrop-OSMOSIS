import { createFileRoute } from "@tanstack/react-router";
import { Clock } from "lucide-react";

export const Route = createFileRoute("/app/lending")({
  component: LendingPage,
});

function LendingPage() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="max-w-md rounded-xl border border-border bg-card p-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <Clock className="h-6 w-6 text-muted-foreground" />
        </div>
        <h1 className="mb-2 text-xl font-semibold">Lending — Coming Soon</h1>
        <p className="text-sm text-muted-foreground">
          On-chain lending markets are not yet wired. This page will integrate with a live
          money-market protocol (e.g. Mars on Osmosis) once available. No simulated APYs or
          positions are shown.
        </p>
      </div>
    </div>
  );
}
