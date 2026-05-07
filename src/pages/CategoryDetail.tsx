import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StockBadge } from "@/components/StockBadge";
import { Package, ArrowLeft } from "lucide-react";

type Cat = { id: string; name: string; description: string | null };
type Product = {
  id: string; code: number; sku: string | null; name: string; type: string;
  stock: number; reorder_level: number; purchase_price: number; selling_price: number;
};

export default function CategoryDetail() {
  const { id } = useParams<{ id: string }>();
  const [cat, setCat] = useState<Cat | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      if (!id) return;
      const [{ data: c }, { data: p }] = await Promise.all([
        (supabase as any).from("categories").select("*").eq("id", id).maybeSingle(),
        (supabase as any).from("products").select("id,code,sku,name,type,stock,reorder_level,purchase_price,selling_price").eq("category_id", id).order("code"),
      ]);
      setCat(c as any);
      setProducts((p as any) ?? []);
      setLoading(false);
      document.title = c ? `${(c as any).name} · Forge Inventory` : "Category · Forge Inventory";
    })();
  }, [id]);

  if (loading) return <p className="text-center text-muted-foreground py-12">Loading…</p>;
  if (!cat) return (
    <div className="text-center py-16">
      <h1 className="text-2xl font-bold">Category not found</h1>
      <Button asChild className="mt-4"><Link to="/categories">Back to categories</Link></Button>
    </div>
  );

  const totalPurchase = products.reduce((s, p) => s + p.purchase_price * p.stock, 0);
  const totalSelling = products.reduce((s, p) => s + p.selling_price * p.stock, 0);

  return (
    <div className="space-y-6">
      <div>
        <Link to="/categories" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"><ArrowLeft className="h-3 w-3" />All categories</Link>
        <h1 className="text-3xl font-bold tracking-tight mt-1">{cat.name}</h1>
        {cat.description && <p className="text-muted-foreground mt-1">{cat.description}</p>}
        <div className="flex flex-wrap gap-3 mt-3 text-sm">
          <span className="px-2 py-1 rounded bg-secondary">{products.length} products</span>
          <span className="px-2 py-1 rounded bg-secondary">Inventory cost: <b className="font-mono">₹{totalPurchase.toFixed(2)}</b></span>
          <span className="px-2 py-1 rounded bg-secondary">Potential revenue: <b className="font-mono">₹{totalSelling.toFixed(2)}</b></span>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {products.map(p => (
          <Link key={p.id} to={`/product/${p.sku ?? p.code}`}>
            <Card className="p-5 hover:border-primary/50 hover:shadow-glow transition h-full">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary grid place-items-center"><Package className="h-5 w-5" /></div>
                  <span className="text-xs font-mono px-2 py-1 rounded bg-primary/10 text-primary border border-primary/20">{p.sku ?? `#${p.code}`}</span>
                </div>
                <StockBadge stock={p.stock} reorder={p.reorder_level} />
              </div>
              <p className="font-semibold truncate">{p.name}</p>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-2xl font-bold font-mono">{p.stock}</span>
                <span className="text-xs text-muted-foreground">in stock</span>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
                <div className="px-2 py-1 rounded bg-secondary/50">
                  <p className="text-muted-foreground">Buy</p>
                  <p className="font-mono font-semibold">₹{Number(p.purchase_price).toFixed(2)}</p>
                </div>
                <div className="px-2 py-1 rounded bg-secondary/50">
                  <p className="text-muted-foreground">Sell</p>
                  <p className="font-mono font-semibold text-success">₹{Number(p.selling_price).toFixed(2)}</p>
                </div>
              </div>
            </Card>
          </Link>
        ))}
        {products.length === 0 && <Card className="p-12 col-span-full text-center text-muted-foreground">No products in this category.</Card>}
      </div>
    </div>
  );
}
