import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { z } from "zod";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { SearchSelect } from "@/components/SearchSelect";
import { StockBadge } from "@/components/StockBadge";
import { toast } from "sonner";
import { Plus, Package, Search, FileSpreadsheet } from "lucide-react";

const schema = z.object({
  name: z.string().trim().min(1).max(120),
  type: z.string().trim().min(1).max(40),
  stock: z.number().int().min(0),
  reorder_level: z.number().int().min(0),
  location: z.string().trim().max(80).optional(),
  supplier_id: z.string().uuid().optional().nullable(),
  category_id: z.string().uuid().optional().nullable(),
  purchase_price: z.number().min(0),
  selling_price: z.number().min(0),
  specifications: z.string().trim().max(500).optional().nullable(),
  description: z.string().trim().max(1000).optional().nullable(),
  part_no: z.string().trim().max(40).optional().nullable(),
  labels: z.array(z.enum(["OPTO", "NPD"])).default([]),
});

type Product = {
  id: string; code: number; part_no: string | null; name: string; type: string;
  stock: number; reorder_level: number; location: string | null;
  purchase_price: number; selling_price: number; specifications: string | null;
  description: string | null; labels: ("OPTO" | "NPD")[];
  suppliers: { name: string } | null;
  categories: { id: string; name: string } | null;
};

const empty = { name: "", part_no: "", type: "spare", stock: "0", reorder_level: "0", location: "", supplier_ids: [] as string[], category_id: "", purchase_price: "0", selling_price: "0", specifications: "", description: "", labels: [] as ("OPTO" | "NPD")[] };

export default function Products() {
  const { isAdmin } = useAuth();
  const [params, setParams] = useSearchParams();
  const [items, setItems] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<{ id: string; name: string }[]>([]);
  const [subcats, setSubcats] = useState<{ id: string; name: string; parent_name: string }[]>([]);
  const [q, setQ] = useState("");
  const [labelFilter, setLabelFilter] = useState<"all" | "OPTO" | "NPD">("all");
  const [open, setOpen] = useState(false);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [form, setForm] = useState<typeof empty>(empty);
  const [supplierSearch, setSupplierSearch] = useState("");

  useEffect(() => { document.title = "Products · Apex Inventory"; load(); }, []);

  // Prefill from approved request
  useEffect(() => {
    if (params.get("prefill") === "1" && isAdmin) {
      setForm({
        name: params.get("name") ?? "",
        part_no: params.get("part_no") ?? "",
        type: ((params.get("type") as any) || "spare"),
        stock: params.get("stock") ?? "0",
        reorder_level: params.get("reorder_level") ?? "0",
        location: params.get("location") ?? "",
        supplier_ids: (params.get("supplier_id") ?? "").split(",").filter(Boolean),
        category_id: params.get("category_id") ?? "",
        purchase_price: params.get("purchase_price") ?? "0",
        selling_price: params.get("selling_price") ?? "0",
        specifications: params.get("specifications") ?? "",
        description: params.get("description") ?? "",
        labels: (params.get("labels") ?? "").split(",").filter(Boolean) as ("OPTO" | "NPD")[],
      });
      setRequestId(params.get("request_id"));
      setOpen(true);
    }
  }, [params, isAdmin]);

  async function load() {
    const [p, s, c] = await Promise.all([
      supabase.from("products").select("id,code,part_no,name,type,stock,reorder_level,location,purchase_price,selling_price,specifications,description,labels, suppliers(name), categories(id,name)").order("code"),
      supabase.from("suppliers").select("id,name").order("name"),
      (supabase as any).from("categories").select("id,name,parent:parent_id(name)").not("parent_id", "is", null).order("name"),
    ]);
    setItems((p.data as any) ?? []);
    setSuppliers(s.data ?? []);
    setSubcats(((c.data as any) ?? []).map((x: any) => ({ id: x.id, name: x.name, parent_name: x.parent?.name ?? "" })));
  }

  async function save() {
    const part_no = form.part_no.trim() || null;
    const primarySupplier = form.supplier_ids[0] || null;
    const parsed = schema.safeParse({
      name: form.name, type: form.type,
      stock: parseInt(form.stock || "0", 10),
      reorder_level: parseInt(form.reorder_level || "0", 10),
      location: form.location || undefined,
      supplier_id: primarySupplier,
      category_id: form.category_id || null,
      purchase_price: parseFloat(form.purchase_price || "0"),
      selling_price: parseFloat(form.selling_price || "0"),
      specifications: form.specifications.trim() || null,
      description: form.description.trim() || null,
      part_no, labels: form.labels,
    });
    if (!parsed.success) { toast.error(parsed.error.errors[0].message); return; }
    const { data: created, error } = await supabase.from("products").insert(parsed.data as any).select("id").single();
    if (error) { toast.error(error.message); return; }

    if (created && form.supplier_ids.length > 0) {
      await (supabase as any).from("product_suppliers").insert(
        form.supplier_ids.map(sid => ({ product_id: created.id, supplier_id: sid }))
      );
    }

    if (requestId) {
      await supabase.from("product_requests" as any).update({ status: "approved", reviewed_at: new Date().toISOString() }).eq("id", requestId);
    }
    toast.success("Product created");
setForm(empty);
setSupplierSearch("");
setOpen(false);
setRequestId(null);    setParams({});
    load();
  }

  function toggleSupplier(id: string) {
    setForm(f => ({ ...f, supplier_ids: f.supplier_ids.includes(id) ? f.supplier_ids.filter(x => x !== id) : [...f.supplier_ids, id] }));
  }

  function toggleLabel(l: "OPTO" | "NPD") {
    setForm(f => ({ ...f, labels: f.labels.includes(l) ? f.labels.filter(x => x !== l) : [...f.labels, l] }));
  }

  function exportExcel() {
    const rows = items.map(p => ({
      "Part No.": p.part_no ?? `#${p.code}`,
      "Name": p.name,
      "Specifications": p.specifications ?? "",
      "Labels": (p.labels ?? []).join(", "),
      "Type": p.type,
      "Sub-category": p.categories?.name ?? "",
      "Supplier": p.suppliers?.name ?? "",
      "Location": p.location ?? "",
      "Stock": p.stock,
      "Reorder level": p.reorder_level,
      ...(isAdmin ? { "Purchase ₹": Number(p.purchase_price ?? 0) } : {}),
      "Selling ₹": Number(p.selling_price ?? 0),
      ...(isAdmin ? { "Margin ₹": Number(p.selling_price ?? 0) - Number(p.purchase_price ?? 0) } : {}),
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Inventory");
    XLSX.writeFile(wb, `inventory-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  const filteredSuppliers =
  supplierSearch.trim().length === 0
    ? []
    : suppliers.filter((s) =>
        s.name.toLowerCase().includes(supplierSearch.toLowerCase())
      );

  const filtered = items.filter(p => {
    if (labelFilter !== "all" && !(p.labels ?? []).includes(labelFilter)) return false;
    const needle = q.toLowerCase();
    return p.name.toLowerCase().includes(needle)
      || String(p.code).includes(needle)
      || (p.part_no ?? "").toLowerCase().includes(needle)
      || (p.specifications ?? "").toLowerCase().includes(needle);
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Products</h1>
          <p className="text-muted-foreground mt-1">{items.length} items in inventory</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={exportExcel} disabled={items.length === 0}>
            <FileSpreadsheet className="h-4 w-4 mr-2" />Export
          </Button>
          {isAdmin && (
            <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) {
  setRequestId(null);
  setParams({});
  setForm(empty);
  setSupplierSearch("");
} }}>
              <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />New product</Button></DialogTrigger>
<DialogContent
  className="max-w-lg max-h-[90vh] overflow-y-auto"
  onInteractOutside={(e) => e.preventDefault()}
>                <DialogHeader><DialogTitle>{requestId ? "Approve & create product" : "Add product"}</DialogTitle></DialogHeader>
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2 space-y-2"><Label>Name</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
                  <div className="col-span-2 space-y-2">
                    <Label>Part No. <span className="text-muted-foreground font-normal">(e.g. opt01)</span></Label>
                    <Input value={form.part_no} onChange={e => setForm({ ...form, part_no: e.target.value })} placeholder="Optional manufacturer / shop part number" />
                  </div>
                  <div className="col-span-2 space-y-2">
                    <Label>Labels <span className="text-muted-foreground font-normal">(can be both)</span></Label>
                    <div className="flex gap-2">
                      {(["OPTO", "NPD"] as const).map(l => (
                        <Button key={l} type="button" size="sm" variant={form.labels.includes(l) ? "default" : "outline"} onClick={() => toggleLabel(l)}>{l}</Button>
                      ))}
                    </div>
                  </div>
                  <div className="col-span-2 space-y-2">
                    <Label>Specifications</Label>
                    <Textarea rows={2} value={form.specifications} onChange={e => setForm({ ...form, specifications: e.target.value })} placeholder="e.g. 25 watt, M6 × 20mm" />
                  </div>
                  <div className="col-span-2 space-y-2">
                    <Label>Description</Label>
                    <Textarea rows={2} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
                  </div>
                  <div className="col-span-2 space-y-2">
                    <Label>Type <span className="text-muted-foreground font-normal">(custom allowed)</span></Label>
                    <Input list="product-types" value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} placeholder="spare, lens, instrument…" />
                    <datalist id="product-types">
                      {Array.from(new Set(["raw", "spare", "finished", ...items.map(i => i.type).filter(Boolean)])).map(t => (
                        <option key={t} value={t} />
                      ))}
                    </datalist>
                  </div>
                  <div className="col-span-2 space-y-2">
                    <Label>Sub-category</Label>
                    <SearchSelect
                      placeholder="Search sub-category…"
                      value={form.category_id}
                      onChange={(v) => setForm({ ...form, category_id: v })}
                      options={subcats.map(c => ({ value: c.id, label: `${c.parent_name} › ${c.name}` }))}
                    />
                  </div>
                  <div className="col-span-2 space-y-2">
  <Label>
    Suppliers{" "}
    <span className="text-muted-foreground font-normal">
      (search and select)
    </span>
  </Label>

  <Input
    placeholder="Search supplier..."
    value={supplierSearch}
    onChange={(e) => setSupplierSearch(e.target.value)}
  />

  <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto p-2 rounded border border-border/60">
    {supplierSearch.trim().length === 0 && (
      <p className="text-xs text-muted-foreground">
        Type to search suppliers.
      </p>
    )}

    {supplierSearch.trim().length > 0 &&
      filteredSuppliers.length === 0 && (
        <p className="text-xs text-muted-foreground">
          No supplier found.
        </p>
      )}

    {filteredSuppliers.map((s) => (
      <Button
        key={s.id}
        type="button"
        size="sm"
        variant={
          form.supplier_ids.includes(s.id)
            ? "default"
            : "outline"
        }
        onClick={() => toggleSupplier(s.id)}
      >
        {s.name}
      </Button>
    ))}
  </div>
</div>
                  <div className="space-y-2"><Label>Purchase price (₹)</Label><Input type="number" min={0} step="0.01" value={form.purchase_price} onChange={e => setForm({ ...form, purchase_price: e.target.value })} /></div>
                  <div className="space-y-2"><Label>Selling price (₹)</Label><Input type="number" min={0} step="0.01" value={form.selling_price} onChange={e => setForm({ ...form, selling_price: e.target.value })} /></div>
                  <div className="space-y-2"><Label>Initial stock</Label><Input type="number" min={0} value={form.stock} onChange={e => setForm({ ...form, stock: e.target.value })} /></div>
                  <div className="space-y-2"><Label>Reorder level</Label><Input type="number" min={0} value={form.reorder_level} onChange={e => setForm({ ...form, reorder_level: e.target.value })} /></div>
                  <div className="col-span-2 space-y-2"><Label>Location</Label><Input value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} placeholder="Rack-1, Loft-2" /></div>
                  <Button className="col-span-2" onClick={save}>{requestId ? "Approve & create" : "Create"}</Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search by name, Part No., or specs…" value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <div className="flex gap-1 bg-secondary/40 p-1 rounded-md">
          {(["all", "OPTO", "NPD"] as const).map(l => (
            <Button key={l} size="sm" variant={labelFilter === l ? "default" : "ghost"} className="h-7 px-3" onClick={() => setLabelFilter(l)}>{l === "all" ? "All" : l}</Button>
          ))}
        </div>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map(p => (
          <Link key={p.id} to={`/product/${p.id}`}>
            <Card className="p-5 hover:border-primary/50 hover:shadow-glow transition h-full">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary grid place-items-center"><Package className="h-5 w-5" /></div>
                  <span className="text-xs font-mono px-2 py-1 rounded bg-primary/10 text-primary border border-primary/20">{p.part_no ?? `#${p.code}`}</span>
                </div>
                <StockBadge stock={p.stock} reorder={p.reorder_level} />
              </div>
              <p className="font-semibold truncate">{p.name}</p>
              {p.specifications && <p className="text-xs text-muted-foreground truncate mt-0.5">{p.specifications}</p>}
              <div className="flex gap-1 mt-1">{(p.labels ?? []).map(l => <Badge key={l} variant="outline" className="text-[10px]">{l}</Badge>)}</div>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-2xl font-bold font-mono">{p.stock}</span>
                <span className="text-xs text-muted-foreground">in stock · reorder {p.reorder_level}</span>
              </div>
              <div className={`grid ${isAdmin ? "grid-cols-2" : "grid-cols-1"} gap-2 mt-3 text-xs`}>
                {isAdmin && (
                  <div className="px-2 py-1 rounded bg-secondary/50"><p className="text-muted-foreground">Buy</p><p className="font-mono font-semibold">₹{Number(p.purchase_price ?? 0).toFixed(2)}</p></div>
                )}
                <div className="px-2 py-1 rounded bg-secondary/50"><p className="text-muted-foreground">Sell</p><p className="font-mono font-semibold text-success">₹{Number(p.selling_price ?? 0).toFixed(2)}</p></div>
              </div>
              <div className="flex items-center gap-2 mt-3 text-xs text-muted-foreground flex-wrap">
                <span className="px-1.5 py-0.5 rounded bg-secondary uppercase tracking-wider">{p.type}</span>
                {p.categories?.name && <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary">{p.categories.name}</span>}
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
