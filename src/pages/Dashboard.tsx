import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StockBadge } from "@/components/StockBadge";
import { Package, AlertTriangle, XCircle, Activity, ArrowRight } from "lucide-react";
import { stockStatus } from "@/lib/queries";

type Product = { id: string; code: number; name: string; stock: number; reorder_level: number; type: string };
type Tx = { id: string; type: string; quantity: number; created_at: string; products: { code: number; name: string } | null };

export default function Dashboard() {
  const [products, setProducts] = useState<Product[]>([]);
  const [txs, setTxs] = useState<Tx[]>([]);

  useEffect(() => {
    document.title = "Dashboard · Forge Inventory";
    (async () => {
      const [p, t] = await Promise.all([
        supabase.from("products").select("id,code,name,stock,reorder_level,type"),
        supabase.from("transactions").select("id,type,quantity,created_at, products(code,name)").order("created_at", { ascending: false }).limit(10),
      ]);
      setProducts((p.data as Product[]) ?? []);
      setTxs((t.data as any) ?? []);
    })();
  }, []);

  const total = products.length;
  const low = products.filter(p => stockStatus(p.stock, p.reorder_level).tone === "warning").length;
  const out = products.filter(p => p.stock <= 0).length;

  const stats = [
    { label: "Total Products", value: total, icon: Package, tone: "primary" },
    { label: "Low Stock", value: low, icon: AlertTriangle, tone: "warning" },
    { label: "Out of Stock", value: out, icon: XCircle, tone: "destructive" },
    { label: "Recent Activity", value: txs.length, icon: Activity, tone: "primary" },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Operations Overview</h1>
        <p className="text-muted-foreground mt-1">Real-time view of stock, alerts, and recent activity.</p>
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

      <div className="grid lg:grid-cols-2 gap-6">
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Stock alerts</h2>
            <Button variant="ghost" size="sm" asChild><Link to="/products">All <ArrowRight className="h-3 w-3 ml-1" /></Link></Button>
          </div>
          <div className="space-y-2">
            {products.filter(p => p.stock <= p.reorder_level).slice(0, 6).map(p => (
              <Link key={p.id} to={`/product/${p.code}`} className="flex items-center justify-between p-3 rounded-lg bg-secondary/40 hover:bg-secondary transition">
                <div>
                  <p className="font-medium text-sm"><span className="font-mono text-primary">#{p.code}</span> {p.name}</p>
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
                <div>
                  <p className="font-medium text-sm">{t.products ? <><span className="font-mono text-primary">#{t.products.code}</span> {t.products.name}</> : "—"}</p>
                  <p className="text-xs text-muted-foreground">{new Date(t.created_at).toLocaleString()}</p>
                </div>
                <div className="text-right">
                  <p className={`text-sm font-mono font-semibold ${t.type === "purchase" ? "text-success" : "text-destructive"}`}>
                    {t.type === "purchase" ? "+" : "−"}{t.quantity}
                  </p>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{t.type}</p>
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
