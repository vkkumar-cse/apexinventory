import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { StockBadge } from "@/components/StockBadge";
import { toast } from "sonner";
import { Package, ArrowLeft, FolderTree, Plus, Trash2 } from "lucide-react";

type Cat = { id: string; name: string; parent_id: string | null };
type Sub = { id: string; name: string; product_count: number };
type Product = {
  id: string; code: number; part_no: string | null; name: string; type: string;
  stock: number; reorder_level: number; purchase_price: number; selling_price: number;
  labels: ("OPTO" | "NPD")[]; specifications: string | null;
};

export default function CategoryDetail() {
  const { id } = useParams<{ id: string }>();
  const { isAdmin } = useAuth();
  const [cat, setCat] = useState<Cat | null>(null);
  const [subs, setSubs] = useState<Sub[]>([]);
  const [labelProducts, setLabelProducts] = useState<Product[]>([]);
  const [subProducts, setSubProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [newSub, setNewSub] = useState("");

  async function load() {
    if (!id) return;
    setLoading(true);
    const { data: c } = await (supabase as any).from("categories").select("id,name,parent_id").eq("id", id).maybeSingle();
    setCat(c as Cat);
    document.title = c ? `${(c as any).name} · Apex Software` : "Category · Apex Software";

    if (c && !(c as any).parent_id) {
      // Top-level: list sub-categories + products labelled with this name
      const { data: ss } = await (supabase as any).from("categories").select("id,name, products(id)").eq("parent_id", id).order("name");
      setSubs(((ss as any[]) ?? []).map(s => ({ id: s.id, name: s.name, product_count: s.products?.length ?? 0 })));
      const { data: lp } = await supabase.from("products").select("id,code,part_no,name,type,stock,reorder_level,purchase_price,selling_price,labels,specifications").contains("labels", [(c as any).name]).order("code");
      setLabelProducts((lp as any) ?? []);
      setSubProducts([]);
    } else if (c) {
      // Sub-category: list its products
      const { data: p } = await supabase.from("products").select("id,code,part_no,name,type,stock,reorder_level,purchase_price,selling_price,labels,specifications").eq("category_id", id).order("code");
      setSubProducts((p as any) ?? []);
      setSubs([]);
      setLabelProducts([]);
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, [id]);

  async function addSub() {
    if (!newSub.trim() || !id) return;
    const { error } = await (supabase as any).from("categories").insert({ name: newSub.trim(), parent_id: id });
    if (error) { toast.error(error.message); return; }
    toast.success("Sub-category added");
    setNewSub(""); setOpen(false); load();
  }

  async function delSub(sid: string) {
    const { error } = await (supabase as any).from("categories").delete().eq("id", sid);
    if (error) { toast.error(error.message); return; }
    toast.success("Deleted"); load();
  }

  if (loading) return <p className="text-center text-muted-foreground py-12">Loading…</p>;
  if (!cat) return (
    <div className="text-center py-16">
      <h1 className="text-2xl font-bold">Category not found</h1>
      <Button asChild className="mt-4"><Link to="/inventory/categories">Back</Link></Button>
    </div>
  );

  const isTop = !cat.parent_id;
  const products = isTop ? labelProducts : subProducts;

  return (
    <div className="space-y-6">
      <div>
        <Link to="/inventory/categories" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"><ArrowLeft className="h-3 w-3" />All categories</Link>
        <div className="flex items-center justify-between flex-wrap gap-3 mt-1">
          <h1 className="text-3xl font-bold tracking-tight">{cat.name}</h1>
          {isTop && isAdmin && (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" />Sub-category</Button></DialogTrigger>
              <DialogContent className="max-w-sm">
                <DialogHeader><DialogTitle>Add sub-category under {cat.name}</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div className="space-y-2"><Label>Name</Label><Input value={newSub} onChange={e => setNewSub(e.target.value)} placeholder="Enter sub-category name" /></div>
                  <Button className="w-full" onClick={addSub}>Create</Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {isTop && (
        <div>
          <h2 className="text-sm font-semibold uppercase text-muted-foreground mb-3 tracking-wider">Sub-categories</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {subs.map(s => (
              <Card key={s.id} className="p-4 hover:border-primary/50 transition relative group">
                <Link to={`/inventory/categories/${s.id}`} className="flex items-center gap-2">
                  <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary grid place-items-center"><FolderTree className="h-4 w-4" /></div>
                  <div className="min-w-0">
                    <p className="font-medium truncate">{s.name}</p>
                    <p className="text-xs text-muted-foreground">{s.product_count} products</p>
                  </div>
                </Link>
                {isAdmin && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" className="absolute top-1 right-1 opacity-0 group-hover:opacity-100"><Trash2 className="h-3 w-3 text-destructive" /></Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete {s.name}?</AlertDialogTitle>
                        <AlertDialogDescription>Products in this sub-category will be uncategorised.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => delSub(s.id)} className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </Card>
            ))}
            {subs.length === 0 && <Card className="p-6 col-span-full text-center text-sm text-muted-foreground">No sub-categories yet.</Card>}
          </div>
        </div>
      )}

      <div>
        <h2 className="text-sm font-semibold uppercase text-muted-foreground mb-3 tracking-wider">
          {isTop ? `All products labelled ${cat.name}` : "Products"}
        </h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {products.map(p => (
            <Link key={p.id} to={`/inventory/product/${p.id}`}>
              <Card className="p-5 hover:border-primary/50 hover:shadow-glow transition h-full">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary grid place-items-center"><Package className="h-5 w-5" /></div>
                    <span className="text-xs font-mono px-2 py-1 rounded bg-primary/10 text-primary border border-primary/20">{p.part_no ?? `#${p.code}`}</span>
                  </div>
                  <StockBadge stock={p.stock} reorder={p.reorder_level} />
                </div>
                <p className="font-semibold truncate">{p.name}</p>
                {p.specifications && <p className="text-xs text-muted-foreground truncate">{p.specifications}</p>}
                <div className="flex gap-1 mt-2">{(p.labels ?? []).map(l => <Badge key={l} variant="outline" className="text-[10px]">{l}</Badge>)}</div>
                <div className="flex items-baseline gap-2 mt-2">
                  <span className="text-2xl font-bold font-mono">{p.stock}</span>
                  <span className="text-xs text-muted-foreground">in stock</span>
                </div>
              </Card>
            </Link>
          ))}
          {products.length === 0 && <Card className="p-12 col-span-full text-center text-muted-foreground">No products here.</Card>}
        </div>
      </div>
    </div>
  );
}
