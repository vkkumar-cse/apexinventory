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
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { SearchSelect } from "@/components/SearchSelect";
import { StockBadge } from "@/components/StockBadge";
import { toast } from "sonner";
import { Plus, Package, Search, FileSpreadsheet, Loader2 } from "lucide-react";
import { uploadProductImage, deleteProductImage } from "@/lib/storage";
import { ProductImage } from "@/components/ProductImage";

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
  product_image_url: z.string().trim().optional().nullable(),
});

type Product = {
  id: string; code: number; part_no: string | null; name: string; type: string;
  stock: number; reorder_level: number; location: string | null;
  purchase_price: number; selling_price: number; specifications: string | null;
  description: string | null; labels: ("OPTO" | "NPD")[];
  suppliers: { name: string } | null;
  categories: { id: string; name: string } | null;
  product_image_url: string | null;
};

const empty = { name: "", part_no: "", type: "spare", stock: "0", reorder_level: "0", location: "", supplier_ids: [] as string[], category_id: "", purchase_price: "0", selling_price: "0", specifications: "", description: "", labels: [] as ("OPTO" | "NPD")[], product_image_url: "" };

export default function Products() {
  const { isAdmin ,user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [items, setItems] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<{ id: string; name: string }[]>([]);
  const [productSupplierMap, setProductSupplierMap] = useState<Record<string, string[]>>({});
  const [subcats, setSubcats] = useState<{ id: string; name: string; parent_name: string }[]>([]);
  const [q, setQ] = useState("");
  const [labelFilter, setLabelFilter] = useState<"all" | "OPTO" | "NPD">("all");
  const [open, setOpen] = useState(false);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [form, setForm] = useState<typeof empty>(empty);
  const [supplierSearch, setSupplierSearch] = useState("");
  const [uploadingImage, setUploadingImage] = useState(false);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const validTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
    if (!validTypes.includes(file.type)) {
      toast.error("Unsupported format. Use PNG, JPG, JPEG, or WEBP.");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error("File is too large. Maximum size is 5MB.");
      return;
    }

    try {
      setUploadingImage(true);
      if (form.product_image_url) {
        await deleteProductImage(form.product_image_url);
      }
      const path = await uploadProductImage(file);
      setForm(f => ({ ...f, product_image_url: path }));
      toast.success("Product image updated successfully.");
    } catch (err: any) {
      toast.error("Unable to upload image.");
    } finally {
      setUploadingImage(false);
    }
  }

  async function handleRemoveImage() {
    if (!form.product_image_url) return;
    try {
      setUploadingImage(true);
      await deleteProductImage(form.product_image_url);
      setForm(f => ({ ...f, product_image_url: "" }));
      toast.success("Product image removed successfully.");
    } catch (err: any) {
      toast.error("Unable to remove image.");
    } finally {
      setUploadingImage(false);
    }
  }

  const [uploadingId, setUploadingId] = useState<string | null>(null);

  async function handleDirectUpload(productId: string, existingPath: string | null, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const validTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
    if (!validTypes.includes(file.type)) {
      toast.error("Unsupported format. Use PNG, JPG, JPEG, or WEBP.");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error("File is too large. Maximum size is 5MB.");
      return;
    }

    try {
      setUploadingId(productId);
      if (existingPath) {
        await deleteProductImage(existingPath);
      }
      const path = await uploadProductImage(file);
      const { error } = await supabase
        .from("products")
        .update({ product_image_url: path })
        .eq("id", productId);
      if (error) throw error;

      setItems(prev => prev.map(item => item.id === productId ? { ...item, product_image_url: path } : item));
      toast.success("Product image updated successfully.");
    } catch (err: any) {
      toast.error("Unable to upload image.");
    } finally {
      setUploadingId(null);
    }
  }

  const [deleteTarget, setDeleteTarget] = useState<{ productId: string; imagePath: string } | null>(null);

  function triggerDirectRemove(productId: string, existingPath: string) {
    setDeleteTarget({ productId, imagePath: existingPath });
  }

  async function handleDirectRemove() {
    if (!deleteTarget) return;
    const { productId, imagePath } = deleteTarget;
    setDeleteTarget(null);

    try {
      setUploadingId(productId);
      await deleteProductImage(imagePath);
      const { error } = await supabase
        .from("products")
        .update({ product_image_url: null })
        .eq("id", productId);
      if (error) throw error;

      setItems(prev => prev.map(item => item.id === productId ? { ...item, product_image_url: null } : item));
      toast.success("Product image removed successfully.");
    } catch (err: any) {
      toast.error("Unable to remove image.");
    } finally {
      setUploadingId(null);
    }
  }

  useEffect(() => { document.title = "Products · Apex Software"; load(); }, []);

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
        product_image_url: params.get("product_image_url") ?? "",
      });
      setRequestId(params.get("request_id"));
      setOpen(true);
    }
  }, [params, isAdmin]);

async function load() {
  const [p, s, c] = await Promise.all([
    supabase
      .from("products")
      .select(
        "id,code,part_no,name,type,stock,reorder_level,location,purchase_price,selling_price,specifications,description,labels,product_image_url, suppliers(name), categories(id,name)"
      )
      .order("code"),

    supabase.from("suppliers").select("id,name").order("name"),

    (supabase as any)
      .from("categories")
      .select("id,name,parent:parent_id(name)")
      .not("parent_id", "is", null)
      .order("name"),
  ]);

  setItems((p.data as any) ?? []);
  setSuppliers(s.data ?? []);

  setSubcats(
    ((c.data as any) ?? []).map((x: any) => ({
      id: x.id,
      name: x.name,
      parent_name: x.parent?.name ?? "",
    }))
  );

  // MULTIPLE SUPPLIER FETCH
  const productIds = ((p.data as any) ?? []).map((item: any) => item.id);

  if (productIds.length > 0) {
    const { data: ps } = await supabase
      .from("product_suppliers" as any)
      .select("product_id, suppliers(name)")
      .in("product_id", productIds);

    const map: Record<string, string[]> = {};

    ((ps as any) ?? []).forEach((row: any) => {
      if (!map[row.product_id]) {
        map[row.product_id] = [];
      }

      if (row.suppliers?.name) {
        map[row.product_id].push(row.suppliers.name);
      }
    });

    setProductSupplierMap(map);
  }
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
      product_image_url: form.product_image_url || null,
    });
    if (!parsed.success) { toast.error(parsed.error.errors[0].message); return; }
    const { data: created, error } = await supabase.from("products").insert(parsed.data as any).select("id").single();
    if (error) { toast.error(error.message); return; }

    if (created && form.supplier_ids.length > 0) {
  const supplierRows = form.supplier_ids.map((sid) => ({
    product_id: created.id,
    supplier_id: sid,
  }));

  await supabase
    .from("product_suppliers")
    .insert(supplierRows);
}

    if (created && form.supplier_ids.length > 0) {
      await (supabase as any).from("product_suppliers").insert(
        form.supplier_ids.map(sid => ({ product_id: created.id, supplier_id: sid }))
      );
    }

    if (requestId) {
  const { error: reqError } = await supabase
    .from("product_requests" as any)
    .update({
      status: "approved",
      reviewed_by: user?.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", requestId);

  if (reqError) {
    toast.error(reqError.message);
    return;
  }
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

  async function importExcel(e: React.ChangeEvent<HTMLInputElement>) {
  const file = e.target.files?.[0];
  if (!file) return;

  try {
    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows: any[] = XLSX.utils.sheet_to_json(sheet);

    let imported = 0;
    let skipped = 0;

    for (const row of rows) {
      const name = String(row["Name"] ?? "").trim();
      if (!name) {
        skipped++;
        continue;
      }

      const labels = String(row["Labels"] ?? "")
        .split(",")
        .map((x) => x.trim())
        .filter((x) => x === "OPTO" || x === "NPD");

      const supplierName = String(row["Supplier"] ?? "").trim();
      const supplier = suppliers.find(
        (s) => s.name.toLowerCase() === supplierName.toLowerCase()
      );

      const subCategoryName = String(row["Sub-category"] ?? "").trim();
      const subcat = subcats.find(
        (c) => c.name.toLowerCase() === subCategoryName.toLowerCase()
      );

      const { error } = await supabase.from("products").insert({
        part_no: String(row["Part No."] ?? "").trim() || null,
        name,
        specifications: String(row["Specifications"] ?? "").trim() || null,
        labels,
        type: String(row["Type"] ?? "spare").trim() || "spare",
        category_id: subcat?.id ?? null,
        supplier_id: supplier?.id ?? null,
        location: String(row["Location"] ?? "").trim() || null,
        stock: Number(row["Stock"] ?? 0),
        reorder_level: Number(row["Reorder level"] ?? 0),
        purchase_price: Number(row["Purchase ₹"] ?? 0),
        selling_price: Number(row["Selling ₹"] ?? 0),
      } as any);

      if (error) skipped++;
      else imported++;
    }

    toast.success(`Imported ${imported} products. Skipped ${skipped}.`);
    await load();
  } catch (err: any) {
    toast.error(err.message || "Failed to import Excel");
  } finally {
    e.target.value = "";
  }
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
    <div className="max-w-full space-y-6 overflow-x-hidden">
      <div className="flex flex-col items-stretch gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="break-words text-2xl font-bold tracking-tight sm:text-3xl">Products</h1>
          <p className="text-muted-foreground mt-1">{items.length} items in inventory</p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
          <Button variant="outline" className="w-full sm:w-auto" onClick={exportExcel} disabled={items.length === 0}>
            <FileSpreadsheet className="h-4 w-4 mr-2" />Export
          </Button>
          {isAdmin && (
  <>
    <input
      id="excel-import"
      type="file"
      accept=".xlsx,.xls"
      className="hidden"
      onChange={importExcel}
    />
    <Button
      className="w-full sm:w-auto"
      variant="outline"
      onClick={() => document.getElementById("excel-import")?.click()}
    >
      <FileSpreadsheet className="h-4 w-4 mr-2" />
      Import
    </Button>
  </>
)}
          {isAdmin && (
            <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) {
  setRequestId(null);
  setParams({});
  setForm(empty);
  setSupplierSearch("");
} }}>
              <DialogTrigger asChild><Button className="col-span-2 w-full sm:col-span-1 sm:w-auto"><Plus className="h-4 w-4 mr-2" />New product</Button></DialogTrigger>
<DialogContent
  className="max-w-lg max-h-[90vh] overflow-y-auto"
  onInteractOutside={(e) => e.preventDefault()}
>                <DialogHeader><DialogTitle>{requestId ? "Approve & create product" : "Add product"}</DialogTitle></DialogHeader>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2 sm:col-span-2"><Label>Name</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label>Part No. <span className="text-muted-foreground font-normal">(e.g. opt01)</span></Label>
                    <Input value={form.part_no} onChange={e => setForm({ ...form, part_no: e.target.value })} placeholder="Optional manufacturer / shop part number" />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label>Labels <span className="text-muted-foreground font-normal">(can be both)</span></Label>
                    <div className="flex gap-2">
                      {(["OPTO", "NPD"] as const).map(l => (
                        <Button key={l} type="button" size="sm" variant={form.labels.includes(l) ? "default" : "outline"} onClick={() => toggleLabel(l)}>{l}</Button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label>Specifications</Label>
                    <Textarea rows={2} value={form.specifications} onChange={e => setForm({ ...form, specifications: e.target.value })} placeholder="e.g. 25 watt, M6 × 20mm" />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label>Description</Label>
                    <Textarea rows={2} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label>Product Image</Label>
                    {uploadingImage ? (
                      <div className="flex items-center justify-center border border-dashed rounded-lg p-6 bg-muted/20">
                        <Loader2 className="h-6 w-6 animate-spin text-primary mr-2" />
                        <span className="text-sm text-muted-foreground">Uploading image...</span>
                      </div>
                    ) : form.product_image_url ? (
                      <div className="flex items-center gap-4 border rounded-lg p-3 bg-muted/10">
                        <ProductImage
                          url={form.product_image_url}
                          name={form.name || "Product preview"}
                          className="h-16 w-16 object-cover rounded-md border"
                          fallback={
                            <div className="grid h-16 w-16 place-items-center rounded-md bg-primary/10 text-primary">
                              <Package className="h-8 w-8" />
                            </div>
                          }
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-muted-foreground">Product Image Selected</p>
                          <p className="text-xs truncate text-muted-foreground/60">Image uploaded successfully</p>
                        </div>
                        <div className="flex gap-2">
                          <Button type="button" variant="outline" size="sm" className="relative">
                            <input
                              type="file"
                              accept="image/png, image/jpeg, image/jpg, image/webp"
                              className="absolute inset-0 opacity-0 cursor-pointer"
                              onChange={handleFileChange}
                            />
                            Replace
                          </Button>
                          <Button type="button" variant="destructive" size="sm" onClick={handleRemoveImage}>
                            Remove
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center border-2 border-dashed border-border rounded-lg p-6 bg-muted/20 hover:bg-muted/30 transition cursor-pointer relative">
                        <input
                          type="file"
                          accept="image/png, image/jpeg, image/jpg, image/webp"
                          className="absolute inset-0 opacity-0 cursor-pointer"
                          onChange={handleFileChange}
                        />
                        <Plus className="h-6 w-6 text-muted-foreground mb-2" />
                        <span className="text-sm font-medium">Upload Product Image</span>
                        <span className="text-xs text-muted-foreground mt-1">PNG, JPG, JPEG, WEBP up to 5MB</span>
                      </div>
                    )}
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label>Type <span className="text-muted-foreground font-normal">(custom allowed)</span></Label>
                    <Input list="product-types" value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} placeholder="spare, lens, instrument…" />
                    <datalist id="product-types">
                      {Array.from(new Set(["raw", "spare", "finished", ...items.map(i => i.type).filter(Boolean)])).map(t => (
                        <option key={t} value={t} />
                      ))}
                    </datalist>
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label>Sub-category</Label>
                    <SearchSelect
                      placeholder="Search sub-category…"
                      value={form.category_id}
                      onChange={(v) => setForm({ ...form, category_id: v })}
                      options={subcats.map(c => ({ value: c.id, label: `${c.parent_name} › ${c.name}` }))}
                    />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
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
    : "secondary"
}
        onClick={() => toggleSupplier(s.id)}
      >
        {s.name}
        {form.supplier_ids.includes(s.id) && " ✓"}
      </Button>
    ))}
  </div>
</div>
                  <div className="space-y-2"><Label>Purchase price (₹)</Label><Input type="number" min={0} step="0.01" value={form.purchase_price} onChange={e => setForm({ ...form, purchase_price: e.target.value })} /></div>
                  <div className="space-y-2"><Label>Selling price (₹)</Label><Input type="number" min={0} step="0.01" value={form.selling_price} onChange={e => setForm({ ...form, selling_price: e.target.value })} /></div>
                  <div className="space-y-2"><Label>Initial stock</Label><Input type="number" min={0} value={form.stock} onChange={e => setForm({ ...form, stock: e.target.value })} /></div>
                  <div className="space-y-2"><Label>Reorder level</Label><Input type="number" min={0} value={form.reorder_level} onChange={e => setForm({ ...form, reorder_level: e.target.value })} /></div>
                  <div className="space-y-2 sm:col-span-2"><Label>Location</Label><Input value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} placeholder="Rack-1, Loft-2" /></div>
                  <Button className="sm:col-span-2" onClick={save}>{requestId ? "Approve & create" : "Create"}</Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative w-full min-w-0 sm:max-w-md sm:flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search by name, Part No., or specs…" value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <div className="flex w-full gap-1 rounded-md bg-secondary/40 p-1 sm:w-auto">
          {(["all", "OPTO", "NPD"] as const).map(l => (
            <Button key={l} size="sm" variant={labelFilter === l ? "default" : "ghost"} className="h-8 flex-1 px-3 sm:flex-none" onClick={() => setLabelFilter(l)}>{l === "all" ? "All" : l}</Button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filtered.map(p => (
          <Link key={p.id} to={`/inventory/product/${p.id}`} className="min-w-0">
            <Card className="h-full min-w-0 p-4 transition hover:border-primary/50 hover:shadow-glow sm:p-5 flex flex-col md:flex-row gap-4 overflow-hidden">
              {/* Left side: Product Image */}
              <div className="relative group shrink-0 w-full h-[200px] max-h-[220px] md:w-[120px] md:h-[120px] lg:w-[140px] lg:h-[140px] bg-slate-950/80 dark:bg-slate-950/40 border border-border/60 rounded-lg overflow-hidden flex items-center justify-center">
                <ProductImage
                  url={p.product_image_url}
                  name={p.name}
                  objectFit="contain"
                  className="w-full h-full animate-fade-in"
                  fallback={
                    <div className="flex flex-col items-center justify-center text-muted-foreground p-4">
                      <Package className="h-10 w-10 md:h-8 md:w-8 lg:h-10 lg:w-10" />
                    </div>
                  }
                />

                {/* Direct Image Upload Overlay (Admins Only) */}
                {isAdmin && (
                  <div
                    onClick={(e) => { e.stopPropagation(); }}
                    className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-1.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-200 p-2 text-[10px] text-white"
                  >
                    {uploadingId === p.id ? (
                      <div className="flex flex-col items-center gap-1">
                        <Loader2 className="h-4 w-4 animate-spin text-primary" />
                        <span className="text-[9px] text-muted-foreground">Uploading...</span>
                      </div>
                    ) : (
                      <>
                        <label className="cursor-pointer flex items-center gap-1 px-2.5 py-1 rounded bg-primary text-primary-foreground font-semibold hover:bg-primary/90 text-center w-full justify-center">
                          <input
                            type="file"
                            accept="image/png, image/jpeg, image/jpg, image/webp"
                            className="hidden"
                            disabled={uploadingId !== null}
                            onChange={(e) => handleDirectUpload(p.id, p.product_image_url, e)}
                          />
                          {p.product_image_url ? "✏️ Replace" : "📷 Upload"}
                        </label>
                        {p.product_image_url && (
                          <button
                            type="button"
                            disabled={uploadingId !== null}
                            onClick={() => triggerDirectRemove(p.id, p.product_image_url!)}
                            className="flex items-center gap-1 px-2.5 py-1 rounded bg-destructive text-destructive-foreground font-semibold hover:bg-destructive/90 text-center w-full justify-center"
                          >
                            🗑 Remove
                          </button>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Right side: Product details */}
              <div className="flex-1 min-w-0 flex flex-col justify-between">
                <div className="space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h3 className="font-bold text-base md:text-lg text-foreground tracking-tight leading-tight line-clamp-2">
                      {p.name}
                    </h3>
                    <StockBadge stock={p.stock} reorder={p.reorder_level} />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs text-muted-foreground">
                    <div>
                      <span className="font-semibold text-foreground/70">Part #:</span>{" "}
                      <span className="font-mono bg-muted px-1.5 py-0.5 rounded text-[11px] text-foreground">
                        {p.part_no ?? "—"}
                      </span>
                    </div>
                    <div>
                      <span className="font-semibold text-foreground/70">Stock:</span>{" "}
                      <span className="font-semibold font-mono text-foreground text-sm">{p.stock}</span>
                    </div>
                    {isAdmin && (
                      <div>
                        <span className="font-semibold text-foreground/70">Buy:</span>{" "}
                        <span className="font-mono text-foreground">₹{Number(p.purchase_price ?? 0).toFixed(2)}</span>
                      </div>
                    )}
                    <div>
                      <span className="font-semibold text-foreground/70">Sell:</span>{" "}
                      <span className="font-mono text-success font-semibold">₹{Number(p.selling_price ?? 0).toFixed(2)}</span>
                    </div>
                    {p.categories?.name && (
                      <div className="col-span-2">
                        <span className="font-semibold text-foreground/70">Category:</span>{" "}
                        <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium text-[11px]">
                          {p.categories.name}
                        </span>
                      </div>
                    )}
                    {p.location && (
                      <div className="col-span-2">
                        <span className="font-semibold text-foreground/70">Location:</span>{" "}
                        <span className="text-foreground">📍 {p.location}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px]">
                    <span className="px-1.5 py-0.5 rounded bg-muted uppercase tracking-wider text-[10px]">
                      {p.type}
                    </span>
                    {(p.labels ?? []).map(l => (
                      <Badge key={l} variant="outline" className="text-[9px] px-1 py-0 h-4 leading-none">
                        {l}
                      </Badge>
                    ))}
                  </div>
                </div>

                {productSupplierMap[p.id]?.length > 0 && (
                  <div className="mt-3 text-[11px] text-muted-foreground border-t border-border/30 pt-2 truncate">
                    <span className="font-medium text-foreground/60">Supplier:</span>{" "}
                    <span className="text-foreground">{productSupplierMap[p.id].join(", ")}</span>
                  </div>
                )}
              </div>
            </Card>
          </Link>
        ))}
        {filtered.length === 0 && <Card className="col-span-full p-8 text-center text-muted-foreground sm:p-12">No products found.</Card>}
      </div>

      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove product image?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to permanently delete this product image? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDirectRemove} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
