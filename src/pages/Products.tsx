import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { StockBadge } from "@/components/StockBadge";
import { toast } from "sonner";
import { Plus, Package, Search } from "lucide-react";

const schema = z.object({
  name: z.string().trim().min(1).max(120),
  type: z.enum(["raw", "spare", "finished"]),
  stock: z.number().int().min(0),
  reorder_level: z.number().int().min(0),
  location: z.string().trim().max(80).optional(),
  supplier_id: z.string().uuid().optional().nullable(),
});

type Product = {
  id: string; name: string; type: "raw" | "spare" | "finished";
  stock: number; reorder_level: number; location: string | null;
  suppliers: { name: string } | null;
};

export default function Products() {
  const { isAdmin } = useAuth();
  const [items, setItems] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<{ id: string; name: string }[]>([]);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", type: "raw" as const, stock: "0", reorder_level: "0", location: "", supplier_id: "" });

  useEffect(() => { document.title = "Products · Forge Inventory"; load(); }, []);

  async function load() {
    const [p, s] = await Promise.all([
      supabase.from("products").select("id,name,type,stock,reorder_level,location, suppliers(name)").order("name"),
      supabase.from("suppliers").select("id,name").order("name"),
    ]);
    setItems((p.data as any) ?? []);
    setSuppliers(s.data ?? []);
  }

  async function save() {
    const parsed = schema.safeParse({
      name: form.name,
      type: form.type,
      stock: parseInt(form.stock || "0", 10),
      reorder_level: parseInt(form.reorder_level || "0", 10),
      location: form.type === "spare" ? form.location : undefined,
      supplier_id: form.supplier_id || null,
    });
    if (!parsed.success) { toast.error(parsed.error.errors[0].message); return; }
    const { error } = await supabase.from("products").insert(parsed.data as any);
    if (error) { toast.error(error.message); return; }
    toast.success("Product created");
    setOpen(false);
    setForm({ name: "", type: "raw", stock: "0", reorder_level: "0", location: "", supplier_id: "" });
    load();
  }

  const filtered = items.filter(p => p.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Products</h1>
          <p className="text-muted-foreground mt-1">{items.length} items in inventory</p>
        </div>
        {isAdmin && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />New product</Button></DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>Add product</DialogTitle></DialogHeader>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 space-y-2"><Label>Name</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select value={form.type} onValueChange={(v: any) => setForm({ ...form, type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="raw">Raw material</SelectItem>
                      <SelectItem value="spare">Spare part</SelectItem>
                      <SelectItem value="finished">Finished good</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Supplier</Label>
                  <Select value={form.supplier_id} onValueChange={v => setForm({ ...form, supplier_id: v })}>
                    <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                    <SelectContent>{suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2"><Label>Initial stock</Label><Input type="number" min={0} value={form.stock} onChange={e => setForm({ ...form, stock: e.target.value })} /></div>
                <div className="space-y-2"><Label>Reorder level</Label><Input type="number" min={0} value={form.reorder_level} onChange={e => setForm({ ...form, reorder_level: e.target.value })} /></div>
                {form.type === "spare" && (
                  <div className="col-span-2 space-y-2"><Label>Location</Label><Input value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} placeholder="e.g. Rack-1, Bero-2" /></div>
                )}
                <Button className="col-span-2" onClick={save}>Create</Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Search products…" value={q} onChange={e => setQ(e.target.value)} />
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map(p => (
          <Link key={p.id} to={`/product/${p.id}`}>
            <Card className="p-5 hover:border-primary/50 hover:shadow-glow transition h-full">
              <div className="flex items-start justify-between mb-3">
                <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary grid place-items-center"><Package className="h-5 w-5" /></div>
                <StockBadge stock={p.stock} reorder={p.reorder_level} />
              </div>
              <p className="font-semibold truncate">{p.name}</p>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-2xl font-bold font-mono">{p.stock}</span>
                <span className="text-xs text-muted-foreground">in stock · reorder {p.reorder_level}</span>
              </div>
              <div className="flex items-center gap-2 mt-3 text-xs text-muted-foreground">
                <span className="px-1.5 py-0.5 rounded bg-secondary uppercase tracking-wider">{p.type}</span>
                {p.location && <span>📍 {p.location}</span>}
                {p.suppliers?.name && <span className="truncate">· {p.suppliers.name}</span>}
              </div>
            </Card>
          </Link>
        ))}
        {filtered.length === 0 && <Card className="p-12 col-span-full text-center text-muted-foreground">No products found.</Card>}
      </div>
    </div>
  );
}
