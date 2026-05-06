import { useEffect, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import QRCode from "qrcode";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StockBadge } from "@/components/StockBadge";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import { Download, Printer, Package, MapPin, Truck, Plus, Minus, DollarSign, Loader2, AlertTriangle, Trash2, Link2 } from "lucide-react";
import { stockStatus } from "@/lib/queries";

type Product = {
  id: string; name: string; type: string; stock: number; reorder_level: number;
  location: string | null; supplier_id: string | null;
  suppliers: { name: string; contact: string | null; address: string | null } | null;
};

type Tx = { id: string; type: string; quantity: number; created_at: string; note: string | null };
type Related = { id: string; related_product_id: string; products: { id: string; name: string; stock: number; reorder_level: number } };

const qtySchema = z.coerce.number().int().positive().max(1000000);

export default function ProductDetail() {
  const { id } = useParams<{ id: string }>();
  const { user, isAdmin } = useAuth();
  const [product, setProduct] = useState<Product | null>(null);
  const [txs, setTxs] = useState<Tx[]>([]);
  const [related, setRelated] = useState<Related[]>([]);
  const [allProducts, setAllProducts] = useState<{ id: string; name: string }[]>([]);
  const [qty, setQty] = useState("1");
  const [busy, setBusy] = useState(false);
  const [qrUrl, setQrUrl] = useState("");
  const qrCanvasRef = useRef<HTMLCanvasElement>(null);

  const productUrl = id ? `${window.location.origin}/product/${id}` : "";

  useEffect(() => {
    if (!id) return;
    document.title = "Product · Forge Inventory";
    load();
  }, [id]);

  useEffect(() => {
    if (!productUrl) return;
    QRCode.toDataURL(productUrl, { width: 320, margin: 2, color: { dark: "#0f172a", light: "#ffffff" } })
      .then(setQrUrl);
    if (qrCanvasRef.current) {
      QRCode.toCanvas(qrCanvasRef.current, productUrl, { width: 320, margin: 2 });
    }
  }, [productUrl]);

  async function load() {
    if (!id) return;
    const [p, t, r, all] = await Promise.all([
      supabase.from("products").select("*, suppliers(name,contact,address)").eq("id", id).maybeSingle(),
      supabase.from("transactions").select("*").eq("product_id", id).order("created_at", { ascending: false }).limit(10),
      supabase.from("related_items").select("id, related_product_id, products!related_items_related_product_id_fkey(id,name,stock,reorder_level)").eq("product_id", id),
      supabase.from("products").select("id,name").neq("id", id).order("name"),
    ]);
    setProduct(p.data as any);
    setTxs(t.data ?? []);
    setRelated((r.data as any) ?? []);
    setAllProducts(all.data ?? []);
    if (p.data) document.title = `${(p.data as any).name} · Forge Inventory`;
  }

  async function action(type: "purchase" | "usage" | "sale") {
    const parsed = qtySchema.safeParse(qty);
    if (!parsed.success) { toast.error("Enter a positive quantity"); return; }
    if (!user || !id) return;
    setBusy(true);
    const { error } = await supabase.from("transactions").insert({
      product_id: id, type, quantity: parsed.data, user_id: user.id,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`${type === "purchase" ? "Stock added" : type === "usage" ? "Usage recorded" : "Sale recorded"}: ${parsed.data}`);
    setQty("1");
    load();
  }

  async function downloadQR() {
    if (!qrUrl || !product) return;
    // Compose QR + label on a canvas
    const c = document.createElement("canvas");
    c.width = 400; c.height = 480;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 40, 20, 320, 320);
      ctx.fillStyle = "#0f172a";
      ctx.font = "bold 22px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(product.name.slice(0, 30), 200, 380);
      ctx.font = "13px monospace";
      ctx.fillStyle = "#475569";
      ctx.fillText(product.id.slice(0, 18) + "…", 200, 410);
      ctx.font = "11px sans-serif";
      ctx.fillText(`${product.type.toUpperCase()}${product.location ? " · " + product.location : ""}`, 200, 440);
      const a = document.createElement("a");
      a.download = `qr-${product.name.replace(/\s+/g, "-")}.png`;
      a.href = c.toDataURL("image/png");
      a.click();
    };
    img.src = qrUrl;
  }

  function printQR() { window.print(); }

  async function addRelated(rid: string) {
    if (!id) return;
    const { error } = await supabase.from("related_items").insert({ product_id: id, related_product_id: rid });
    if (error) { toast.error(error.message); return; }
    load();
  }
  async function removeRelated(rowId: string) {
    const { error } = await supabase.from("related_items").delete().eq("id", rowId);
    if (error) { toast.error(error.message); return; }
    load();
  }

  if (!product) {
    return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  const status = stockStatus(product.stock, product.reorder_level);
  const lowRelated = related.filter(r => r.products && r.products.stock <= r.products.reorder_level);

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex items-start justify-between flex-wrap gap-4 no-print">
        <div>
          <Link to="/products" className="text-xs text-muted-foreground hover:text-foreground">← All products</Link>
          <h1 className="text-3xl font-bold tracking-tight mt-1">{product.name}</h1>
          <div className="flex items-center gap-3 mt-2 text-sm text-muted-foreground flex-wrap">
            <span className="px-2 py-0.5 rounded bg-secondary uppercase tracking-wider text-xs">{product.type}</span>
            <span className="font-mono text-xs">ID: {product.id.slice(0, 8)}</span>
            {product.location && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{product.location}</span>}
            {product.suppliers && <span className="flex items-center gap-1"><Truck className="h-3 w-3" />{product.suppliers.name}</span>}
          </div>
        </div>
        <StockBadge stock={product.stock} reorder={product.reorder_level} />
      </div>

      {lowRelated.length > 0 && (
        <Alert variant="destructive" className="no-print border-warning/50 bg-warning/10 text-warning [&>svg]:text-warning">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Dependency warning</AlertTitle>
          <AlertDescription>
            {lowRelated.map(r => `${r.products.name} (${r.products.stock <= 0 ? "out of stock" : "low"})`).join(", ")} — required by {product.name}.
          </AlertDescription>
        </Alert>
      )}

      {status.tone === "destructive" && (
        <Alert variant="destructive" className="no-print">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Out of stock</AlertTitle>
          <AlertDescription>Reorder from {product.suppliers?.name ?? "supplier"}{product.suppliers?.contact && ` (${product.suppliers.contact})`}.</AlertDescription>
        </Alert>
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="p-6 lg:col-span-2 no-print">
          <h2 className="font-semibold mb-1">Stock operations</h2>
          <p className="text-xs text-muted-foreground mb-4">All actions are logged. Stock cannot go below zero.</p>
          <div className="flex items-end gap-3 flex-wrap">
            <div className="space-y-2">
              <Label>Current stock</Label>
              <div className="text-4xl font-bold font-mono text-gradient">{product.stock}</div>
            </div>
            <div className="space-y-2 w-32">
              <Label>Quantity</Label>
              <Input type="number" min={1} value={qty} onChange={e => setQty(e.target.value)} />
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button size="lg" onClick={() => action("purchase")} disabled={busy} className="bg-success hover:bg-success/90 text-success-foreground">
                <Plus className="h-4 w-4 mr-1" />Add stock
              </Button>
              <Button size="lg" variant="secondary" onClick={() => action("usage")} disabled={busy}>
                <Minus className="h-4 w-4 mr-1" />Use
              </Button>
              <Button size="lg" variant="secondary" onClick={() => action("sale")} disabled={busy}>
                <DollarSign className="h-4 w-4 mr-1" />Sell
              </Button>
            </div>
          </div>
        </Card>

        <Card className="p-6 text-center">
          <h2 className="font-semibold mb-3">QR Code</h2>
          <div className="bg-white rounded-lg p-4 inline-block">
            <canvas ref={qrCanvasRef} className="block" />
          </div>
          <p className="font-medium mt-3 text-sm">{product.name}</p>
          <p className="text-xs text-muted-foreground font-mono">{product.id.slice(0, 12)}</p>
          <div className="flex gap-2 mt-4 no-print">
            <Button variant="outline" size="sm" className="flex-1" onClick={downloadQR}><Download className="h-3 w-3 mr-1" />PNG</Button>
            <Button variant="outline" size="sm" className="flex-1" onClick={printQR}><Printer className="h-3 w-3 mr-1" />Print</Button>
          </div>
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-6 no-print">
        <Card className="p-6">
          <h2 className="font-semibold mb-4">Last 10 transactions</h2>
          <div className="space-y-2">
            {txs.map(t => (
              <div key={t.id} className="flex items-center justify-between p-3 rounded-lg bg-secondary/40">
                <div>
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">{t.type}</p>
                  <p className="text-xs text-muted-foreground">{new Date(t.created_at).toLocaleString()}</p>
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
                <Link to={`/product/${r.products.id}`} className="hover:text-primary">
                  <p className="text-sm font-medium">{r.products.name}</p>
                  <p className="text-xs text-muted-foreground">Stock: {r.products.stock}</p>
                </Link>
                <div className="flex items-center gap-2">
                  <StockBadge stock={r.products.stock} reorder={r.products.reorder_level} />
                  {isAdmin && (
                    <Button variant="ghost" size="icon" onClick={() => removeRelated(r.id)}><Trash2 className="h-3 w-3" /></Button>
                  )}
                </div>
              </div>
            ))}
            {related.length === 0 && <p className="text-sm text-muted-foreground py-3 text-center">No dependencies set.</p>}
            {isAdmin && allProducts.length > 0 && (
              <Select onValueChange={addRelated}>
                <SelectTrigger className="mt-2"><SelectValue placeholder="+ Link another product" /></SelectTrigger>
                <SelectContent>
                  {allProducts.filter(p => !related.find(r => r.related_product_id === p.id)).map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
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
