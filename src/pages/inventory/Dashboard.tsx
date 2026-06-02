import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StockBadge } from "@/components/StockBadge";
import { Package, AlertTriangle, XCircle, Activity, ArrowRight, ClipboardList, ScanLine, Plus } from "lucide-react";
import { stockStatus } from "@/lib/queries";

type Product = { id: string; code: number; part_no: string | null; name: string; stock: number; reorder_level: number; type: string };
type Tx = { id: string; type: string; quantity: number; created_at: string; user_id: string | null; products: { code: number; part_no: string | null; name: string } | null };

export default function Dashboard() {
  const { user, role, isAdmin } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [txs, setTxs] = useState<Tx[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [pendingReqs, setPendingReqs] = useState(0);
  const [myName, setMyName] = useState("");

  useEffect(() => {
    document.title = "Dashboard · Apex Software";
    (async () => {
      const txQuery = isAdmin
        ? supabase.from("transactions").select("id,type,quantity,created_at,user_id, products(code,part_no,name)").order("created_at", { ascending: false }).limit(15)
        : supabase.from("transactions").select("id,type,quantity,created_at,user_id, products(code,part_no,name)").eq("user_id", user?.id ?? "").order("created_at", { ascending: false }).limit(15);

      const [p, t, r, me] = await Promise.all([
        supabase.from("products").select("id,code,part_no,name,stock,reorder_level,type"),
        txQuery,
        supabase.from("product_requests" as any).select("id", { count: "exact", head: true }).eq("status", "pending"),
        user ? supabase.from("profiles").select("display_name,email").eq("id", user.id).maybeSingle() : Promise.resolve({ data: null } as any),
      ]);
      setProducts((p.data as Product[]) ?? []);
      setTxs((t.data as any) ?? []);
      setPendingReqs((r as any).count ?? 0);
      setMyName((me as any)?.data?.display_name ?? (me as any)?.data?.email ?? "");

      const ids = Array.from(new Set(((t.data ?? []) as any[]).map(x => x.user_id).filter(Boolean)));
      if (ids.length) {
        const { data: ps } = await supabase.from("profiles").select("id,display_name,email").in("id", ids);
        const m: Record<string, string> = {};
        (ps ?? []).forEach((u: any) => { m[u.id] = u.display_name ?? u.email ?? "—"; });
        setProfiles(m);
      }
    })();
  }, [user, isAdmin]);

  const total = products.length;
  const low = products.filter(p => stockStatus(p.stock, p.reorder_level).tone === "warning").length;
  const out = products.filter(p => p.stock <= 0).length;

  // === WORKER VIEW ===
  if (!isAdmin) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Hi {myName || "worker"} 👋</h1>
          <p className="text-muted-foreground mt-1">Record usage, scan items, and request new products.</p>
        </div>

        <div className="grid sm:grid-cols-3 gap-4">
          <Link to="/inventory/scan"><Card className="p-6 hover:border-primary/50 transition cursor-pointer">
            <ScanLine className="h-6 w-6 text-primary mb-2" />
            <p className="font-semibold">Scan QR</p>
            <p className="text-xs text-muted-foreground">Open the camera to scan a product.</p>
          </Card></Link>
          <Link to="/inventory/products"><Card className="p-6 hover:border-primary/50 transition cursor-pointer">
            <Package className="h-6 w-6 text-primary mb-2" />
            <p className="font-semibold">Browse products</p>
            <p className="text-xs text-muted-foreground">Find an item to record usage.</p>
          </Card></Link>
          <Link to="/inventory/requests"><Card className="p-6 hover:border-primary/50 transition cursor-pointer">
            <ClipboardList className="h-6 w-6 text-primary mb-2" />
            <p className="font-semibold">Request a product</p>
            <p className="text-xs text-muted-foreground">Ask admin to add a new item.</p>
          </Card></Link>
        </div>

        <Card className="p-6">
          <h2 className="font-semibold mb-4">My recent activity</h2>
          <div className="space-y-2">
            {txs.map(t => (
              <div key={t.id} className="flex items-center justify-between p-3 rounded-lg bg-secondary/40">
                <div>
                  <p className="font-medium text-sm">{t.products ? <><span className="font-mono text-primary">{t.products.part_no ?? "#" + t.products.code}</span> {t.products.name}</> : "—"}</p>
                  <p className="text-[10px] text-muted-foreground">{new Date(t.created_at).toLocaleString()}</p>
                </div>
                <p className="text-sm font-mono font-semibold text-destructive">−{t.quantity}</p>
              </div>
            ))}
            {txs.length === 0 && <p className="text-sm text-muted-foreground py-6 text-center">No activity yet.</p>}
          </div>
        </Card>
      </div>
    );
  }

  // === ADMIN VIEW ===
  const stats = [
    { label: "Total Products", value: total, icon: Package, tone: "primary" },
    { label: "Low Stock", value: low, icon: AlertTriangle, tone: "warning" },
    { label: "Out of Stock", value: out, icon: XCircle, tone: "destructive" },
    { label: "Pending Requests", value: pendingReqs, icon: ClipboardList, tone: "primary" as const },
  ];

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Operations Overview</h1>
          <p className="text-muted-foreground mt-1">Welcome back, {myName || "admin"}.</p>
        </div>
        <Button asChild><Link to="/inventory/products"><Plus className="h-4 w-4 mr-2" />Add product</Link></Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(({ label, value, icon: Icon, tone }) => (
          <Card key={label} className="p-5 gradient-surface border-border/60">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
                <p className="text-3xl font-bold mt-2">{value}</p>
              </div>
              <div className={`h-10 w-10 rounded-lg grid place-items-center ${
                tone === "warning" ? "bg-warning/10 text-warning" :
                tone === "destructive" ? "bg-destructive/10 text-destructive" :
                "bg-primary/10 text-primary"
              }`}>
                <Icon className="h-5 w-5" />
              </div>
            </div>
          </Card>
        ))}
      </div>

      {pendingReqs > 0 && (
        <Card className="p-5 border-primary/40 bg-primary/5 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <ClipboardList className="h-5 w-5 text-primary" />
            <div>
              <p className="font-semibold">{pendingReqs} pending product request{pendingReqs === 1 ? "" : "s"}</p>
              <p className="text-xs text-muted-foreground">Workers are waiting for your approval.</p>
            </div>
          </div>
          <Button asChild size="sm"><Link to="/inventory/requests">Review <ArrowRight className="h-3 w-3 ml-1" /></Link></Button>
        </Card>
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Stock alerts</h2>
            <Button variant="ghost" size="sm" asChild><Link to="/inventory/products">All <ArrowRight className="h-3 w-3 ml-1" /></Link></Button>
          </div>
          <div className="space-y-2">
            {products.filter(p => p.stock <= p.reorder_level).slice(0, 6).map(p => (
              <Link key={p.id} to={`/inventory/product/${p.id}`} className="flex items-center justify-between p-3 rounded-lg bg-secondary/40 hover:bg-secondary transition">
                <div>
                  <p className="font-medium text-sm"><span className="font-mono text-primary">{p.part_no ?? "#" + p.code}</span> {p.name}</p>
                  <p className="text-xs text-muted-foreground">Stock: {p.stock} / Reorder at: {p.reorder_level}</p>
                </div>
                <StockBadge stock={p.stock} reorder={p.reorder_level} />
              </Link>
            ))}
            {products.filter(p => p.stock <= p.reorder_level).length === 0 && (
              <p className="text-sm text-muted-foreground py-6 text-center">All stock levels healthy ✓</p>
            )}
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="font-semibold mb-4">Recent transactions</h2>
          <div className="space-y-2">
            {txs.map(t => (
              <div key={t.id} className="flex items-center justify-between p-3 rounded-lg bg-secondary/40">
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">{t.products ? <><span className="font-mono text-primary">{t.products.part_no ?? "#" + t.products.code}</span> {t.products.name}</> : "—"}</p>
                  <p className="text-[10px] text-muted-foreground">By <b>{profiles[t.user_id ?? ""] ?? "—"}</b> · {new Date(t.created_at).toLocaleString()}</p>
                </div>
                <div className="text-right">
                  <p className={`text-sm font-mono font-semibold ${t.type === "purchase" ? "text-success" : "text-destructive"}`}>
                    {t.type === "purchase" ? "+" : "−"}{t.quantity}
                  </p>
                  <Badge variant="outline" className="text-[9px]">{t.type}</Badge>
                </div>
              </div>
            ))}
            {txs.length === 0 && <p className="text-sm text-muted-foreground py-6 text-center">No activity yet.</p>}
          </div>
        </Card>
      </div>
    </div>
  );
}
