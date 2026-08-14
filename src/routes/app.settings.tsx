import { createFileRoute } from "@tanstack/react-router";
import { useStore } from "@/lib/store";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

export const Route = createFileRoute("/app/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const { user, updateProfile } = useStore();
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-muted-foreground">Profile and protocol preferences.</p>
      </div>

      <form
        className="max-w-xl space-y-4 rounded-xl border border-border bg-card p-6"
        onSubmit={(e) => { e.preventDefault(); updateProfile({ name, email }); toast.success("Profile updated"); }}
      >
        <h2 className="font-semibold">Profile</h2>
        <div className="space-y-2">
          <Label>Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Email</Label>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Wallet Address</Label>
          <Input value={user.address} readOnly className="font-mono" />
        </div>
        <Button type="submit" className="bg-primary text-primary-foreground hover:opacity-90">Save changes</Button>
      </form>

      <div className="max-w-xl space-y-4 rounded-xl border border-border bg-card p-6">
        <h2 className="font-semibold">Notifications</h2>
        {[
          { k: "Transaction alerts", d: "Get notified about every on-chain action." },
          { k: "Voucher events", d: "When vouchers are redeemed or transferred." },
          { k: "Treasury reports", d: "Weekly treasury health summary." },
        ].map((row) => (
          <div key={row.k} className="flex items-center justify-between rounded-lg border border-border bg-background p-3">
            <div>
              <div className="text-sm font-medium">{row.k}</div>
              <div className="text-xs text-muted-foreground">{row.d}</div>
            </div>
            <Switch defaultChecked />
          </div>
        ))}
      </div>
    </div>
  );
}
