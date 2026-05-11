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
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StockBadge } from "@/components/StockBadge";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Download, Printer, Plus, Minus, DollarSign, Loader2, AlertTriangle, Trash2, Link2, PackageX } from "lucide-react";
import { stockStatus } from "@/lib/queries";

type Product = {
  id: string; code: number; part_no: string | null; name: string; type: string; stock: number; reorder_level: number;
  location: string | null; supplier_id: string | null;
  purchase_price: number; selling_price: number; specifications: string | null; description: string | null;
  labels: ("OPTO" | "NPD")[];
  suppliers: { name: string; contact: string | null; address: string | null } | null;
  categories: { id: string; name: string; parent_id: string | null } | null;
};

type Tx = { id: string; type: string; quantity: number; created_at: string; note: string | null; user_id: string | null };
type Related = { id: string; related_product_id: string; products: { id: string; code: number; part_no: string | null; name: string; stock: number; reorder_level: number } };

const qtySchema = z.coerce.number().int().positive().max(1000000);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function ProductDetail() {
  const { id: routeParam } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  const [product, setProduct] = useState<Product | null>(null);
  const [parentCat, setParentCat] = useState<{ id: string; name: string } | null>(null);
  const [txs, setTxs] = useState<Tx[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [related, setRelated] = useState<Related[]>([]);
  const [allProducts, setAllProducts] = useState<{ id: string; code: number; part_no: string | null; name: string }[]>([]);
  const [qty, setQty] = useState("1");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [qrUrl, setQrUrl] = useState("");
  const qrCanvasRef = useRef<HTMLCanvasElement>(null);

  const productIdentifier = product ? (product.part_no ?? String(product.code)) : "";
  const productUrl = product ? `${window.location.origin}/product/${productIdentifier}` : "";

  useEffect(() => { if (routeParam) { document.title = "Product · Forge Inventory"; load(); } }, [routeParam]);

  useEffect(() => {
    if (!productUrl) return;
    QRCode.toDataURL(productUrl, { width: 320, margin: 2, color: { dark: "#0f172a", light: "#ffffff" } }).then(setQrUrl);
    if (qrCanvasRef.current) QRCode.toCanvas(qrCanvasRef.current, productUrl, { width: 320, margin: 2 });
  }, [productUrl]);

  async function load() {
    if (!routeParam) return;
    setLoading(true);
    let query = supabase.from("products").select("*, suppliers(name,contact,address), categories(id,name,parent_id)");
    if (UUID_RE.test(routeParam)) query = query.eq("id", routeParam);
    else if (/^\d+$/.test(routeParam)) query = query.eq("code", parseInt(routeParam, 10));
    else query = query.ilike("part_no", routeParam);
    const { data: p } = await query.maybeSingle();

    if (!p) { setProduct(null); setLoading(false); return; }

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
    document.title = `${(p as any).part_no ?? "#" + (p as any).code} ${(p as any).name} · Forge Inventory`;
    setLoading(false);
  }

  async function action(type: "purchase" | "usage" | "sale") {
    const parsed = qtySchema.safeParse(qty);
    if (!parsed.success) { toast.error("Enter a positive quantity"); return; }
    if (!user || !product) return;
    if (!isAdmin && type !== "usage") { toast.error("Only admins can record purchases or sales"); return; }
    setBusy(true);
    const { error } = await supabase.from("transactions").insert({ product_id: product.id, type, quantity: parsed.data, user_id: user.id });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`${type === "purchase" ? "Stock added" : type === "usage" ? "Usage recorded" : "Sale recorded"}: ${parsed.data}`);
    setQty("1"); load();
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
    toast.success(`Deleted ${product.name}`); navigate("/products");
  }

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  if (!product) return (
    <div className="max-w-md mx-auto py-16 text-center">
      <div className="inline-flex h-16 w-16 rounded-2xl bg-destructive/10 text-destructive items-center justify-center mb-4">
        <PackageX className="h-8 w-8" />
      </div>
      <h1 className="text-2xl font-bold">Product not found</h1>
      <p className="text-muted-foreground mt-2">No product with ID <span className="font-mono">{routeParam}</span> exists.</p>
      <Button asChild className="mt-6"><Link to="/products">Back to products</Link></Button>
    </div>
  );

  const status = stockStatus(product.stock, product.reorder_level);
  const lowRelated = related.filter(r => r.products && r.products.stock <= r.products.reorder_level);

  // Structured fields
  const fields: { label: string; value: React.ReactNode }[] = [
    { label: "Name", value: product.name },
    { label: "Part No.", value: product.part_no ?? `#${product.code}` },
    { label: "Specifications", value: product.specifications ?? "—" },
    { label: "Description", value: product.description ?? "—" },
    { label: "Type", value: <span className="uppercase">{product.type}</span> },
    { label: "Category", value: parentCat ? <Link className="text-primary hover:underline" to={`/categories/${parentCat.id}`}>{parentCat.name}</Link> : "—" },
    { label: "Sub-category", value: product.categories ? <Link className="text-primary hover:underline" to={`/categories/${product.categories.id}`}>{product.categories.name}</Link> : "—" },
    { label: "Labels", value: <div className="flex gap-1">{(product.labels ?? []).map(l => <Badge key={l} variant="outline">{l}</Badge>)}{(product.labels ?? []).length === 0 && "—"}</div> },
    { label: "Supplier", value: product.suppliers?.name ?? "—" },
    ...(isAdmin ? [{ label: "Purchase price", value: `₹${Number(product.purchase_price).toFixed(2)}` }] : []),
    { label: "Selling price", value: <span className="text-success">₹{Number(product.selling_price).toFixed(2)}</span> },
    { label: "Current stock", value: <span className="font-bold">{product.stock}</span> },
    { label: "Reorder level", value: product.reorder_level },
    { label: "Location", value: product.location ?? "—" },
  ];

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex items-start justify-between flex-wrap gap-4 no-print">
        <div>
          <Link to="/products" className="text-xs text-muted-foreground hover:text-foreground">← All products</Link>
          <div className="flex items-baseline gap-3 mt-1 flex-wrap">
            <span className="text-xs font-mono px-2 py-1 rounded bg-primary/10 text-primary border border-primary/20">
              {product.part_no ?? `#${product.code}`}
            </span>
            <h1 className="text-3xl font-bold tracking-tight">{product.name}</h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StockBadge stock={product.stock} reorder={product.reorder_level} />
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
            <Button variant="outline" size="sm" className="flex-1" onClick={() => window.print()}><Printer className="h-3 w-3 mr-1" />Print</Button>
          </div>
        </Card>
      </div>

      <Card className="p-6 no-print">
        <h2 className="font-semibold mb-1">Stock operations</h2>
        <p className="text-xs text-muted-foreground mb-4">{isAdmin ? "Admins can purchase, sell, or record usage." : "Workers can record usage only."} All actions are logged.</p>
        <div className="flex items-end gap-3 flex-wrap">
          <div className="space-y-2 w-32">
            <Label>Quantity</Label>
            <Input type="number" min={1} value={qty} onChange={e => setQty(e.target.value)} />
          </div>
          <div className="flex gap-2 flex-wrap">
            {isAdmin && (
              <Button size="lg" onClick={() => action("purchase")} disabled={busy} className="bg-success hover:bg-success/90 text-success-foreground">
                <Plus className="h-4 w-4 mr-1" />Add stock
              </Button>
            )}
            <Button size="lg" variant="secondary" onClick={() => action("usage")} disabled={busy}>
              <Minus className="h-4 w-4 mr-1" />Use
            </Button>
            {isAdmin && (
              <Button size="lg" variant="secondary" onClick={() => action("sale")} disabled={busy}>
                <DollarSign className="h-4 w-4 mr-1" />Sell
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
                  <p className="text-[10px] text-muted-foreground">{new Date(t.created_at).toLocaleString()}</p>
                </div>
                <p className={`font-mono font-bold ${t.type === "purchase" ? "text-success" : "text-destructive"}`}>
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
                <Link to={`/product/${r.products.part_no ?? r.products.code}`} className="hover:text-primary">
                  <p className="text-sm font-medium"><span className="font-mono text-primary">{r.products.part_no ?? "#" + r.products.code}</span> {r.products.name}</p>
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
    </div>
  );
}
