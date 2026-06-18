import { useEffect, useRef, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import QRCode from "qrcode";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SearchSelect } from "@/components/SearchSelect";
import { StockBadge } from "@/components/StockBadge";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Download, Printer, Plus, Minus, DollarSign, Loader2, AlertTriangle, Trash2, Link2, PackageX, Pencil } from "lucide-react";
import { stockStatus } from "@/lib/queries";

type Product = {
  id: string; code: number; part_no: string | null; name: string; type: string; stock: number; reorder_level: number;
  location: string | null; supplier_id: string | null;
  purchase_price: number; selling_price: number; specifications: string | null; description: string | null;
  labels: ("OPTO" | "NPD")[];
  suppliers: { name: string; contact: string | null; address: string | null } | null;
  categories: { id: string; name: string; parent_id: string | null } | null;
};

type Tx = { id: string; type: string; quantity: number; created_at: string; note: string | null; description: string | null; user_id: string | null };
type Related = { id: string; related_product_id: string; products: { id: string; code: number; part_no: string | null; name: string; stock: number; reorder_level: number } };

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const qtySchema = z.coerce.number().int().positive().max(1000000);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function ProductDetail() {
  const { id: routeParam } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  const [product, setProduct] = useState<Product | null>(null);
  const [productSuppliers, setProductSuppliers] = useState<string[]>([]);
  const [parentCat, setParentCat] = useState<{ id: string; name: string } | null>(null);
  const [txs, setTxs] = useState<Tx[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [related, setRelated] = useState<Related[]>([]);
  const [allProducts, setAllProducts] = useState<{ id: string; code: number; part_no: string | null; name: string }[]>([]);
  const [qty, setQty] = useState("1");
  const [transactionReason, setTransactionReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [qrUrl, setQrUrl] = useState("");
  const [labelQrUrl, setLabelQrUrl] = useState("");
  const [qrLabelPreviewOpen, setQrLabelPreviewOpen] = useState(false);
  const qrCanvasRef = useRef<HTMLCanvasElement>(null);

  // Edit state
  const [editOpen, setEditOpen] = useState(false);
  const [suppliers, setSuppliers] = useState<{ id: string; name: string }[]>([]);
  const [subcats, setSubcats] = useState<{ id: string; name: string; parent_name: string }[]>([]);
  const [edit, setEdit] = useState({
    name: "", part_no: "", type: "spare",
    stock: "0", reorder_level: "0", location: "",
    supplier_id: "", category_id: "",
    purchase_price: "0", selling_price: "0",
    specifications: "", description: "",
    labels: [] as ("OPTO" | "NPD")[],
  });

  const productIdentifier = product ? (product.part_no ?? `#${product.code}`) : "";
  const productQrValue = product ? (product.part_no || String(product.code)) : "";
  const productUrl = product ? `${window.location.origin}/product/${product.part_no || product.code}` : "";
  useEffect(() => { if (routeParam) { document.title = "Product · Apex Software"; load(); } }, [routeParam]);

  useEffect(() => {
    if (!productUrl) return;
    QRCode.toDataURL(productUrl, { width: 320, margin: 2, color: { dark: "#0f172a", light: "#ffffff" } }).then(setQrUrl);
    if (qrCanvasRef.current) QRCode.toCanvas(qrCanvasRef.current, productUrl, { width: 320, margin: 2 });
  }, [productUrl]);

  useEffect(() => {
    if (!productQrValue) {
      setLabelQrUrl("");
      return;
    }

    QRCode.toDataURL(productQrValue, {
      width: 120,
      margin: 0,
      color: { dark: "#000000", light: "#ffffff" },
    }).then(setLabelQrUrl);
  }, [productQrValue]);

  async function load() {
    if (!routeParam) return;
    setLoading(true);
    let query = supabase.from("products").select("*, suppliers(name,contact,address), categories(id,name,parent_id)");
    if (UUID_RE.test(routeParam)) query = query.eq("id", routeParam);
    else if (/^\d+$/.test(routeParam)) query = query.eq("code", parseInt(routeParam, 10));
    else query = query.ilike("part_no", routeParam);
    const { data: p } = await query.maybeSingle();

    if (!p) { setProduct(null); setLoading(false); return; }
    const { data: ps } = await supabase
      .from("product_suppliers" as any)
      .select("suppliers(name)")
      .eq("product_id", p.id);

    setProductSuppliers(
      ((ps as any) ?? [])
        .map((x: any) => x.suppliers?.name)
        .filter(Boolean)
    );

    let parent: any = null;
    if ((p as any).categories?.parent_id) {
      const { data } = await (supabase as any).from("categories").select("id,name").eq("id", (p as any).categories.parent_id).maybeSingle();
      parent = data;
    }

    const [t, r, all] = await Promise.all([
      supabase.from("transactions").select("*").eq("product_id", p.id).order("created_at", { ascending: false }).limit(15),
      supabase.from("related_items").select("id, related_product_id, products!related_items_related_product_id_fkey(id,code,part_no,name,stock,reorder_level)").eq("product_id", p.id),
      supabase.from("products").select("id,code,part_no,name").neq("id", p.id).order("code"),
    ]);

    const userIds = Array.from(new Set((t.data ?? []).map((x: any) => x.user_id).filter(Boolean)));
    const profMap: Record<string, string> = {};
    if (userIds.length) {
      const { data: ps } = await supabase.from("profiles").select("id,display_name,email").in("id", userIds);
      (ps ?? []).forEach((u: any) => { profMap[u.id] = u.display_name ?? u.email ?? "—"; });
    }

    setProduct(p as any);
    setParentCat(parent);
    setTxs((t.data ?? []) as any);
    setProfiles(profMap);
    setRelated((r.data as any) ?? []);
    setAllProducts((all.data as any) ?? []);
    document.title = `${(p as any).part_no ?? "#" + (p as any).code} ${(p as any).name} · Apex Software`;
    setLoading(false);
  }

  async function action(type: "purchase" | "usage" | "sale" | "adjustment" | "damage" | "return") {
    const parsed = qtySchema.safeParse(qty);
    if (!parsed.success) { toast.error("Enter a positive quantity"); return; }
    const reason = transactionReason.trim();
    if (!reason) { toast.error("Reason / Description is required"); return; }
    if (!user || !product) return;
    if (!isAdmin && type !== "usage") { toast.error("Only admins can record purchases or sales"); return; }
    setBusy(true);
    const { error } = await supabase.from("transactions").insert({ product_id: product.id, type, quantity: parsed.data, user_id: user.id, description: reason });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    const actionLabel: Record<typeof type, string> = {
      purchase: "Stock added",
      usage: "Usage recorded",
      sale: "Sale recorded",
      adjustment: "Stock adjustment recorded",
      damage: "Damage recorded",
      return: "Return recorded",
    };
    toast.success(`${actionLabel[type]}: ${parsed.data}`);
    setQty("1"); setTransactionReason(""); load();
  }

  async function downloadQR() {
    if (!qrUrl || !product) return;
    const c = document.createElement("canvas");
    c.width = 400; c.height = 480;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 40, 20, 320, 320);
      ctx.fillStyle = "#0f172a"; ctx.font = "bold 22px sans-serif"; ctx.textAlign = "center";
      ctx.fillText(product.name.slice(0, 30), 200, 380);
      ctx.font = "bold 18px monospace"; ctx.fillStyle = "#1e40af";
      ctx.fillText(productIdentifier, 200, 410);
      ctx.font = "11px sans-serif"; ctx.fillStyle = "#475569";
      ctx.fillText(`${product.type.toUpperCase()}${product.location ? " · " + product.location : ""}`, 200, 440);
      const a = document.createElement("a");
      a.download = `qr-${productIdentifier}-${product.name.replace(/\s+/g, "-")}.png`;
      a.href = c.toDataURL("image/png"); a.click();
    };
    img.src = qrUrl;
  }

  const buildQrLabelHtml = (qrImageUrl: string) => {
    if (!product) return "";
    const category = [parentCat?.name, product.categories?.name].filter(Boolean).join(" / ") || product.type;
    const partNumber = product.part_no ?? `#${product.code}`;
    return `
      <!doctype html>
      <html>
        <head>
          <title>QR Label - ${escapeHtml(partNumber)}</title>
          <style>
            @page {
              size: 50mm 30mm;
              margin: 0;
            }
            * {
              box-sizing: border-box;
            }
            html,
            body {
              margin: 0;
              padding: 0;
              width: 50mm;
              height: 30mm;
              background: #fff;
              color: #000;
              font-family: Arial, Helvetica, sans-serif;
            }
            .qr-label {
              width: 50mm;
              height: 30mm;
              display: flex;
              align-items: flex-start;
              gap: 2mm;
              padding: 2mm;
              overflow: hidden;
              page-break-inside: avoid;
              break-inside: avoid;
            }
            .qr-label img {
              width: 10mm;
              height: 10mm;
              flex: 0 0 10mm;
              display: block;
            }
            .qr-label__text {
              min-width: 0;
              flex: 1;
              line-height: 1.05;
              padding-top: 0.2mm;
            }
            .qr-label__name {
              display: -webkit-box;
              -webkit-line-clamp: 2;
              -webkit-box-orient: vertical;
              overflow: hidden;
              font-size: 11.5pt;
              font-weight: 700;
              text-transform: uppercase;
              word-break: break-word;
            }
            .qr-label__part,
            .qr-label__category {
              margin-top: 1mm;
              overflow: hidden;
              white-space: nowrap;
              text-overflow: ellipsis;
            }
            .qr-label__part {
              margin-top: 1.2mm;
              font-size: 10.5pt;
              font-weight: 700;
            }
            .qr-label__category {
              margin-top: 0.8mm;
              text-transform: uppercase;
              font-size: 7pt;
            }
            @media print {
              html,
              body,
              .qr-label {
                width: 50mm;
                height: 30mm;
              }
            }
          </style>
        </head>
        <body>
          <div class="qr-label">
            <img src="${qrImageUrl}" alt="Product QR" />
            <div class="qr-label__text">
              <div class="qr-label__name">${escapeHtml(product.name)}</div>
              <div class="qr-label__part">Part No: ${escapeHtml(partNumber)}</div>
              ${category ? `<div class="qr-label__category">${escapeHtml(category)}</div>` : ""}
            </div>
          </div>
        </body>
      </html>
    `;
  };

  async function printQrLabel() {
    if (!product || !productQrValue) return;

    const qrImageUrl = labelQrUrl || await QRCode.toDataURL(productQrValue, {
      width: 120,
      margin: 0,
      color: { dark: "#000000", light: "#ffffff" },
    });
    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    iframe.setAttribute("aria-hidden", "true");
    iframe.srcdoc = buildQrLabelHtml(qrImageUrl);
    iframe.onload = () => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      window.setTimeout(() => iframe.remove(), 1000);
    };
    document.body.appendChild(iframe);
  }

  function openQrLabelPreview() {
    if (!product || !productQrValue) {
      toast.error("QR label is not ready");
      return;
    }
    setQrLabelPreviewOpen(true);
  }

  async function addRelated(rid: string) {
    if (!product) return;
    const { error } = await supabase.from("related_items").insert({ product_id: product.id, related_product_id: rid });
    if (error) { toast.error(error.message); return; }
    load();
  }
  async function removeRelated(rowId: string) {
    const { error } = await supabase.from("related_items").delete().eq("id", rowId);
    if (error) { toast.error(error.message); return; }
    load();
  }
  async function deleteProduct() {
    if (!product) return;
    const { error } = await supabase.from("products").delete().eq("id", product.id);
    if (error) { toast.error(error.message); return; }
    toast.success(`Deleted ${product.name}`); navigate("/inventory/products");
  }

  async function openEdit() {
    if (!product) return;
    const [s, c] = await Promise.all([
      supabase.from("suppliers").select("id,name").order("name"),
      (supabase as any).from("categories").select("id,name,parent:parent_id(name)").not("parent_id", "is", null).order("name"),
    ]);
    setSuppliers(s.data ?? []);
    setSubcats(((c.data as any) ?? []).map((x: any) => ({ id: x.id, name: x.name, parent_name: x.parent?.name ?? "" })));
    setEdit({
      name: product.name,
      part_no: product.part_no ?? "",
      type: product.type as any,
      stock: String(product.stock),
      reorder_level: String(product.reorder_level),
      location: product.location ?? "",
      supplier_id: product.supplier_id ?? "",
      category_id: product.categories?.id ?? "",
      purchase_price: String(product.purchase_price ?? 0),
      selling_price: String(product.selling_price ?? 0),
      specifications: product.specifications ?? "",
      description: product.description ?? "",
      labels: product.labels ?? [],
    });
    setEditOpen(true);
  }

  function toggleEditLabel(l: "OPTO" | "NPD") {
    setEdit(e => ({ ...e, labels: e.labels.includes(l) ? e.labels.filter(x => x !== l) : [...e.labels, l] }));
  }

  async function saveEdit() {
    if (!product) return;
    const editSchema = z.object({
      name: z.string().trim().min(1).max(120),
      type: z.string().trim().min(1).max(40),
      stock: z.number().int().min(0),
      reorder_level: z.number().int().min(0),
      purchase_price: z.number().min(0),
      selling_price: z.number().min(0),
    });
    const parsed = editSchema.safeParse({
      name: edit.name, type: edit.type,
      stock: parseInt(edit.stock || "0", 10),
      reorder_level: parseInt(edit.reorder_level || "0", 10),
      purchase_price: parseFloat(edit.purchase_price || "0"),
      selling_price: parseFloat(edit.selling_price || "0"),
    });
    if (!parsed.success) { toast.error(parsed.error.errors[0].message); return; }
    const { error } = await supabase.from("products").update({
      name: parsed.data.name,
      part_no: edit.part_no.trim() || null,
      type: parsed.data.type,
      stock: parsed.data.stock,
      reorder_level: parsed.data.reorder_level,
      location: edit.location.trim() || null,
      supplier_id: edit.supplier_id || null,
      category_id: edit.category_id || null,
      purchase_price: parsed.data.purchase_price,
      selling_price: parsed.data.selling_price,
      specifications: edit.specifications.trim() || null,
      description: edit.description.trim() || null,
      labels: edit.labels,
    } as any).eq("id", product.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Product updated");
    setEditOpen(false); load();
  }

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  if (!product) return (
    <div className="max-w-md mx-auto py-16 text-center">
      <div className="inline-flex h-16 w-16 rounded-2xl bg-destructive/10 text-destructive items-center justify-center mb-4">
        <PackageX className="h-8 w-8" />
      </div>
      <h1 className="text-2xl font-bold">Product not found</h1>
      <p className="text-muted-foreground mt-2">No product with ID <span className="font-mono">{routeParam}</span> exists.</p>
      <Button asChild className="mt-6"><Link to="/inventory/products">Back to products</Link></Button>
    </div>
  );

  const status = stockStatus(product.stock, product.reorder_level);
  const lowRelated = related.filter(r => r.products && r.products.stock <= r.products.reorder_level);
  const qrLabelCategory = [parentCat?.name, product.categories?.name].filter(Boolean).join(" / ") || product.type;
  const qrLabelPartNumber = product.part_no ?? `#${product.code}`;

  // Structured fields
  const fields: { label: string; value: React.ReactNode }[] = [
    { label: "Name", value: product.name },
    { label: "Part No.", value: product.part_no ?? `#${product.code}` },
    { label: "Specifications", value: product.specifications ?? "—" },
    { label: "Description", value: product.description ?? "—" },
    { label: "Type", value: <span className="uppercase">{product.type}</span> },
    { label: "Category", value: parentCat ? <Link className="text-primary hover:underline" to={`/inventory/categories/${parentCat.id}`}>{parentCat.name}</Link> : "—" },
    { label: "Sub-category", value: product.categories ? <Link className="text-primary hover:underline" to={`/inventory/categories/${product.categories.id}`}>{product.categories.name}</Link> : "—" },
    { label: "Labels", value: <div className="flex gap-1">{(product.labels ?? []).map(l => <Badge key={l} variant="outline">{l}</Badge>)}{(product.labels ?? []).length === 0 && "—"}</div> },
    {
      label: "Suppliers",
      value: productSuppliers.length > 0 ? productSuppliers.join(", ") : "—",
    }, ...(isAdmin ? [{ label: "Purchase price", value: `₹${Number(product.purchase_price).toFixed(2)}` }] : []),
    { label: "Selling price", value: <span className="text-success">₹{Number(product.selling_price).toFixed(2)}</span> },
    { label: "Current stock", value: <span className="font-bold">{product.stock}</span> },
    { label: "Reorder level", value: product.reorder_level },
    { label: "Location", value: product.location ?? "—" },
  ];

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex items-start justify-between flex-wrap gap-4 no-print">
        <div>
          <Link to="/inventory/products" className="text-xs text-muted-foreground hover:text-foreground">← All products</Link>
          <div className="flex items-baseline gap-3 mt-1 flex-wrap">
            <span className="text-xs font-mono px-2 py-1 rounded bg-primary/10 text-primary border border-primary/20">
              {product.part_no ?? `#${product.code}`}
            </span>
            <h1 className="text-3xl font-bold tracking-tight">{product.name}</h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => window.print()}><Printer className="h-4 w-4 mr-1" />Print Product Details</Button>
          <Button variant="outline" size="sm" onClick={openQrLabelPreview}><Printer className="h-4 w-4 mr-1" />Preview Label</Button>
          <Button variant="outline" size="sm" onClick={printQrLabel}><Printer className="h-4 w-4 mr-1" />Print Label</Button>
          <StockBadge stock={product.stock} reorder={product.reorder_level} />
          {isAdmin && (
            <Button variant="outline" size="sm" onClick={openEdit}><Pencil className="h-4 w-4 mr-1" />Edit</Button>
          )}
          {isAdmin && (
            <AlertDialog>
              <AlertDialogTrigger asChild><Button variant="destructive" size="sm"><Trash2 className="h-4 w-4 mr-1" />Delete</Button></AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete {product.name}?</AlertDialogTitle>
                  <AlertDialogDescription>This permanently removes the product and all its transactions and related links.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={deleteProduct} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      {lowRelated.length > 0 && (
        <Alert variant="destructive" className="no-print border-warning/50 bg-warning/10 text-warning [&>svg]:text-warning">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Dependency warning</AlertTitle>
          <AlertDescription>
            {lowRelated.map(r => `${r.products.part_no ?? "#" + r.products.code} ${r.products.name} (${r.products.stock <= 0 ? "out" : "low"})`).join(", ")} — required by {product.name}.
          </AlertDescription>
        </Alert>
      )}

      {status.tone === "destructive" && (
        <Alert variant="destructive" className="no-print">
          <AlertTriangle className="h-4 w-4" /><AlertTitle>Out of stock</AlertTitle>
          <AlertDescription>Reorder from {product.suppliers?.name ?? "supplier"}{product.suppliers?.contact && ` (${product.suppliers.contact})`}.</AlertDescription>
        </Alert>
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="p-6 lg:col-span-2">
          <h2 className="font-semibold mb-4">Product details</h2>
          <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
            {fields.map(f => (
              <div key={f.label} className="flex flex-col border-b border-border/30 pb-2">
                <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">{f.label}</dt>
                <dd className="mt-0.5 font-medium">{f.value}</dd>
              </div>
            ))}
          </dl>
        </Card>

        <Card className="p-6 text-center">
          <h2 className="font-semibold mb-3">QR Code</h2>
          <div className="bg-white rounded-lg p-4 inline-block">
            <canvas ref={qrCanvasRef} className="block" />
          </div>
          <p className="font-medium mt-3 text-sm">{product.name}</p>
          <p className="text-xs text-primary font-mono font-bold">{productIdentifier}</p>
          <p className="text-[10px] text-muted-foreground font-mono break-all mt-1">{productUrl}</p>
          <div className="flex gap-2 mt-4 no-print">
            <Button variant="outline" size="sm" className="flex-1" onClick={downloadQR}><Download className="h-3 w-3 mr-1" />PNG</Button>
            <Button variant="outline" size="sm" className="flex-1" onClick={openQrLabelPreview}><Printer className="h-3 w-3 mr-1" />Preview Label</Button>
            <Button variant="outline" size="sm" className="flex-1" onClick={printQrLabel}><Printer className="h-3 w-3 mr-1" />Print Label</Button>
          </div>
        </Card>
      </div>

      <Card className="p-6 no-print">
        <h2 className="font-semibold mb-1">Stock operations</h2>
        <p className="text-xs text-muted-foreground mb-4">{isAdmin ? "Admins can purchase, sell, or record usage." : "Workers can record usage only."} All actions are logged.</p>
        <div className="grid gap-3 md:grid-cols-[8rem_minmax(0,1fr)] md:items-end">
          <div className="space-y-2 md:w-32">
            <Label>Quantity</Label>
            <Input type="number" min={1} value={qty} onChange={e => setQty(e.target.value)} />
          </div>
          <div className="min-w-0 space-y-2">
            <Label>Reason / Description *</Label>
            <Textarea
              className="min-h-20"
              rows={3}
              value={transactionReason}
              onChange={(e) => setTransactionReason(e.target.value)}
              placeholder="Purchased from supplier ABC, used during calibration service..."
            />
          </div>
          <div className="grid gap-2 md:col-span-2 md:grid-cols-3 lg:grid-cols-6">
            {isAdmin && (
              <Button size="lg" onClick={() => action("purchase")} disabled={busy} className="w-full bg-success hover:bg-success/90 text-success-foreground">
                <Plus className="h-4 w-4 mr-1" />Add Stock
              </Button>
            )}
            <Button size="lg" variant="secondary" onClick={() => action("usage")} disabled={busy} className="w-full">
              <Minus className="h-4 w-4 mr-1" />Use
            </Button>
            {isAdmin && (
              <Button size="lg" variant="secondary" onClick={() => action("sale")} disabled={busy} className="w-full">
                <DollarSign className="h-4 w-4 mr-1" />Sell
              </Button>
            )}
            {isAdmin && (
              <Button size="lg" variant="secondary" onClick={() => action("return")} disabled={busy} className="w-full">
                <Plus className="h-4 w-4 mr-1" />Return
              </Button>
            )}
            {isAdmin && (
              <Button size="lg" variant="secondary" onClick={() => action("adjustment")} disabled={busy} className="w-full">
                <Plus className="h-4 w-4 mr-1" />Adjustment
              </Button>
            )}
            {isAdmin && (
              <Button size="lg" variant="secondary" onClick={() => action("damage")} disabled={busy} className="w-full">
                <Minus className="h-4 w-4 mr-1" />Damage
              </Button>
            )}
          </div>
        </div>
      </Card>

      <div className="grid lg:grid-cols-2 gap-6 no-print">
        <Card className="p-6">
          <h2 className="font-semibold mb-4">Transaction history</h2>
          <div className="space-y-2">
            {txs.map(t => (
              <div key={t.id} className="flex items-center justify-between p-3 rounded-lg bg-secondary/40">
                <div>
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">{t.type}</p>
                  <p className="text-xs">By <b>{profiles[t.user_id ?? ""] ?? "—"}</b></p>
                  <p className="text-xs text-muted-foreground">Reason: <span className="text-foreground">{t.description || t.note || "—"}</span></p>
                  <p className="text-[10px] text-muted-foreground">{new Date(t.created_at).toLocaleString()}</p>
                </div>
                <p className={`font-mono font-bold ${["purchase", "return", "adjustment"].includes(t.type) ? "text-success" : "text-destructive"}`}>
                  {t.type === "purchase" ? "+" : "−"}{t.quantity}
                </p>
              </div>
            ))}
            {txs.length === 0 && <p className="text-sm text-muted-foreground py-6 text-center">No transactions yet.</p>}
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold flex items-center gap-2"><Link2 className="h-4 w-4" />Related items</h2>
          </div>
          <div className="space-y-2">
            {related.map(r => (
              <div key={r.id} className="flex items-center justify-between p-3 rounded-lg bg-secondary/40">
                <Link to={`/inventory/product/${r.products.id}`}>                  <p className="text-sm font-medium"><span className="font-mono text-primary">{r.products.part_no ?? "#" + r.products.code}</span> {r.products.name}</p>
                  <p className="text-xs text-muted-foreground">Stock: {r.products.stock}</p>
                </Link>
                <div className="flex items-center gap-2">
                  <StockBadge stock={r.products.stock} reorder={r.products.reorder_level} />
                  {isAdmin && <Button variant="ghost" size="icon" onClick={() => removeRelated(r.id)}><Trash2 className="h-3 w-3" /></Button>}
                </div>
              </div>
            ))}
            {related.length === 0 && <p className="text-sm text-muted-foreground py-3 text-center">No dependencies set.</p>}
            {isAdmin && allProducts.length > 0 && (
              <Select onValueChange={addRelated}>
                <SelectTrigger className="mt-2"><SelectValue placeholder="+ Link another product" /></SelectTrigger>
                <SelectContent>
                  {allProducts.filter(p => !related.find(r => r.related_product_id === p.id)).map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.part_no ?? "#" + p.code} — {p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </Card>
      </div>

      <Dialog open={qrLabelPreviewOpen} onOpenChange={setQrLabelPreviewOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Preview Label</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-xl border bg-slate-100 p-5 flex justify-center">
              <div
                className="bg-white text-black shadow-sm border border-slate-300 flex items-start overflow-hidden"
                style={{ width: "50mm", height: "30mm", gap: "2mm", padding: "2mm" }}
              >
                {labelQrUrl ? (
                  <img
                    src={labelQrUrl}
                    alt="Product QR"
                    className="block shrink-0"
                    style={{ width: "10mm", height: "10mm", flexBasis: "10mm" }}
                  />
                ) : (
                  <div className="shrink-0 bg-slate-200" style={{ width: "10mm", height: "10mm", flexBasis: "10mm" }} />
                )}
                <div className="min-w-0 flex-1 leading-tight" style={{ paddingTop: "0.2mm", lineHeight: 1.05 }}>
                  <div
                    className="font-bold uppercase overflow-hidden"
                    style={{
                      fontSize: "11.5pt",
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                      wordBreak: "break-word",
                    }}
                  >
                    {product.name}
                  </div>
                  <div className="truncate font-bold" style={{ marginTop: "1.2mm", fontSize: "10.5pt" }}>
                    Part No: {qrLabelPartNumber}
                  </div>
                  {qrLabelCategory && (
                    <div className="truncate uppercase" style={{ marginTop: "0.8mm", fontSize: "7pt" }}>
                      {qrLabelCategory}
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="grid gap-2 sm:flex sm:justify-end">
              <Button variant="outline" className="min-h-11 w-full sm:w-auto" onClick={() => setQrLabelPreviewOpen(false)}>Close</Button>
              <Button className="min-h-11 w-full sm:w-auto" onClick={printQrLabel}><Printer className="h-4 w-4 mr-2" />Print Label</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Edit product</DialogTitle></DialogHeader>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2"><Label>Name</Label><Input value={edit.name} onChange={e => setEdit({ ...edit, name: e.target.value })} /></div>
            <div className="space-y-2 sm:col-span-2"><Label>Part No.</Label><Input value={edit.part_no} onChange={e => setEdit({ ...edit, part_no: e.target.value })} /></div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Labels</Label>
              <div className="flex gap-2">
                {(["OPTO", "NPD"] as const).map(l => (
                  <Button key={l} type="button" size="sm" variant={edit.labels.includes(l) ? "default" : "outline"} onClick={() => toggleEditLabel(l)}>{l}</Button>
                ))}
              </div>
            </div>
            <div className="space-y-2 sm:col-span-2"><Label>Specifications</Label><Textarea rows={2} value={edit.specifications} onChange={e => setEdit({ ...edit, specifications: e.target.value })} /></div>
            <div className="space-y-2 sm:col-span-2"><Label>Description</Label><Textarea rows={2} value={edit.description} onChange={e => setEdit({ ...edit, description: e.target.value })} /></div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Type <span className="text-muted-foreground font-normal">(custom allowed)</span></Label>
              <Input value={edit.type} onChange={e => setEdit({ ...edit, type: e.target.value })} placeholder="spare, lens, instrument…" />
            </div>
            <div className="space-y-2">
              <Label>Sub-category</Label>
              <SearchSelect placeholder="Search sub-category…" value={edit.category_id} onChange={(v) => setEdit({ ...edit, category_id: v })}
                options={subcats.map(c => ({ value: c.id, label: `${c.parent_name} › ${c.name}` }))} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Supplier</Label>
              <SearchSelect placeholder="Search supplier…" value={edit.supplier_id} onChange={(v) => setEdit({ ...edit, supplier_id: v })}
                options={suppliers.map(s => ({ value: s.id, label: s.name }))} />
            </div>
            <div className="space-y-2"><Label>Purchase ₹</Label><Input type="number" min={0} step="0.01" value={edit.purchase_price} onChange={e => setEdit({ ...edit, purchase_price: e.target.value })} /></div>
            <div className="space-y-2"><Label>Selling ₹</Label><Input type="number" min={0} step="0.01" value={edit.selling_price} onChange={e => setEdit({ ...edit, selling_price: e.target.value })} /></div>
            <div className="space-y-2"><Label>Stock</Label><Input type="number" min={0} value={edit.stock} onChange={e => setEdit({ ...edit, stock: e.target.value })} /></div>
            <div className="space-y-2"><Label>Reorder level</Label><Input type="number" min={0} value={edit.reorder_level} onChange={e => setEdit({ ...edit, reorder_level: e.target.value })} /></div>
            <div className="space-y-2 sm:col-span-2"><Label>Location</Label><Input value={edit.location} onChange={e => setEdit({ ...edit, location: e.target.value })} /></div>
            <Button className="min-h-11 sm:col-span-2" onClick={saveEdit}>Save changes</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
