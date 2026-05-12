import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
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
import { toast } from "sonner";
import { Plus, Check, X, Clock, ClipboardList } from "lucide-react";

type Req = {
  id: string; name: string; part_no: string | null; type: "raw" | "spare" | "finished";
  category_id: string | null; supplier_id: string | null; labels: ("OPTO" | "NPD")[];
  specifications: string | null; description: string | null;
  stock: number; reorder_level: number; purchase_price: number; selling_price: number;
  location: string | null; note: string | null;
  status: "pending" | "approved" | "rejected"; requested_by: string | null; created_at: string;
};

export default function Requests() {
  const { user, isAdmin } = useAuth();
  const [items, setItems] = useState<Req[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [open, setOpen] = useState(false);
  const [cats, setCats] = useState<{ id: string; name: string; parent: string | null }[]>([]);
  const [sups, setSups] = useState<{ id: string; name: string }[]>([]);
  const [, setSearch] = useSearchParams();

  const empty = { name: "", part_no: "", type: "spare" as const, category_id: "", supplier_id: "", labels: [] as ("OPTO" | "NPD")[], specifications: "", description: "", stock: "0", reorder_level: "0", purchase_price: "0", selling_price: "0", location: "", note: "" };
  const [form, setForm] = useState<typeof empty>(empty);

  useEffect(() => { document.title = "Requests · Apex Inventory"; load(); }, []);

  async function load() {
    const [{ data: r }, { data: p }, { data: c }, { data: s }] = await Promise.all([
      supabase.from("product_requests" as any).select("*").order("created_at", { ascending: false }),
      supabase.from("profiles").select("id,display_name,email"),
      (supabase as any).from("categories").select("id,name,parent_id").not("parent_id", "is", null).order("name"),
      supabase.from("suppliers").select("id,name").order("name"),
    ]);
    setItems((r as any) ?? []);
    const m: Record<string, string> = {};
    (p ?? []).forEach((x: any) => { m[x.id] = x.display_name ?? x.email ?? "—"; });
    setProfiles(m);
    setCats(((c as any) ?? []).map((x: any) => ({ id: x.id, name: x.name, parent: x.parent_id })));
    setSups((s as any) ?? []);
  }

  async function submit() {
    if (!user) return;
    if (!form.name.trim()) { toast.error("Name required"); return; }
    const payload: any = {
      requested_by: user.id,
      name: form.name.trim(),
      part_no: form.part_no.trim() || null,
      type: form.type,
      category_id: form.category_id || null,
      supplier_id: form.supplier_id || null,
      labels: form.labels,
      specifications: form.specifications.trim() || null,
      description: form.description.trim() || null,
      stock: parseInt(form.stock || "0", 10),
      reorder_level: parseInt(form.reorder_level || "0", 10),
      purchase_price: parseFloat(form.purchase_price || "0"),
      selling_price: parseFloat(form.selling_price || "0"),
      location: form.location.trim() || null,
      note: form.note.trim() || null,
    };
    const { error } = await supabase.from("product_requests" as any).insert(payload);
    if (error) { toast.error(error.message); return; }
    toast.success("Request submitted to admin");
    setOpen(false); setForm(empty); load();
  }

  function approve(r: Req) {
    // Send admin to Products page with prefill query so the Add Product dialog opens prefilled.
    const params = new URLSearchParams({
      prefill: "1", request_id: r.id,
      name: r.name, part_no: r.part_no ?? "", type: r.type,
      category_id: r.category_id ?? "", supplier_id: r.supplier_id ?? "",
      labels: (r.labels ?? []).join(","),
      specifications: r.specifications ?? "", description: r.description ?? "",
      stock: String(r.stock), reorder_level: String(r.reorder_level),
      purchase_price: String(r.purchase_price), selling_price: String(r.selling_price),
      location: r.location ?? "",
    });
    window.location.href = `/products?${params.toString()}`;
  }

  async function reject(r: Req) {
    const { error } = await supabase.from("product_requests" as any).update({ status: "rejected", reviewed_by: user?.id, reviewed_at: new Date().toISOString() }).eq("id", r.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Request rejected");
    load();
  }

  function toggleLabel(l: "OPTO" | "NPD") {
    setForm(f => ({ ...f, labels: f.labels.includes(l) ? f.labels.filter(x => x !== l) : [...f.labels, l] }));
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Product Requests</h1>
          <p className="text-muted-foreground mt-1">{isAdmin ? "Review and approve worker requests." : "Request a new product to be added by an admin."}</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />New request</Button></DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Request a product</DialogTitle></DialogHeader>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-2"><Label>Name</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
              <div className="col-span-2 space-y-2"><Label>Part No.</Label><Input value={form.part_no} onChange={e => setForm({ ...form, part_no: e.target.value })} placeholder="e.g. opt01" /></div>
              <div className="col-span-2 space-y-2">
                <Label>Labels</Label>
                <div className="flex gap-2">
                  {(["OPTO", "NPD"] as const).map(l => (
                    <Button key={l} type="button" size="sm" variant={form.labels.includes(l) ? "default" : "outline"} onClick={() => toggleLabel(l)}>{l}</Button>
                  ))}
                </div>
              </div>
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
                <Label>Sub-category</Label>
                <SearchSelect placeholder="Search sub-category…" value={form.category_id} onChange={v => setForm({ ...form, category_id: v })} options={cats.map(c => ({ value: c.id, label: c.name }))} />
              </div>
              <div className="col-span-2 space-y-2">
                <Label>Supplier</Label>
                <SearchSelect placeholder="Search supplier…" value={form.supplier_id} onChange={v => setForm({ ...form, supplier_id: v })} options={sups.map(s => ({ value: s.id, label: s.name }))} />
              </div>
              <div className="col-span-2 space-y-2"><Label>Specifications</Label><Textarea rows={2} value={form.specifications} onChange={e => setForm({ ...form, specifications: e.target.value })} /></div>
              <div className="col-span-2 space-y-2"><Label>Description</Label><Textarea rows={2} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
              <div className="space-y-2"><Label>Initial stock</Label><Input type="number" value={form.stock} onChange={e => setForm({ ...form, stock: e.target.value })} /></div>
              <div className="space-y-2"><Label>Reorder level</Label><Input type="number" value={form.reorder_level} onChange={e => setForm({ ...form, reorder_level: e.target.value })} /></div>
              <div className="space-y-2"><Label>Purchase ₹</Label><Input type="number" step="0.01" value={form.purchase_price} onChange={e => setForm({ ...form, purchase_price: e.target.value })} /></div>
              <div className="space-y-2"><Label>Selling ₹</Label><Input type="number" step="0.01" value={form.selling_price} onChange={e => setForm({ ...form, selling_price: e.target.value })} /></div>
              <div className="col-span-2 space-y-2"><Label>Location</Label><Input value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} /></div>
              <div className="col-span-2 space-y-2"><Label>Note for admin</Label><Textarea rows={2} value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} /></div>
              <Button className="col-span-2" onClick={submit}>Submit request</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4">
        {items.map(r => (
          <Card key={r.id} className="p-5">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <ClipboardList className="h-4 w-4 text-primary" />
                  <p className="font-semibold">{r.name}</p>
                  {r.part_no && <span className="text-xs font-mono px-2 py-0.5 rounded bg-primary/10 text-primary">{r.part_no}</span>}
                  {(r.labels ?? []).map(l => <Badge key={l} variant="outline" className="text-[10px]">{l}</Badge>)}
                  <Badge variant={r.status === "pending" ? "secondary" : r.status === "approved" ? "default" : "destructive"} className="text-[10px]">
                    {r.status === "pending" && <Clock className="h-3 w-3 mr-1" />}{r.status.toUpperCase()}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-1">By {profiles[r.requested_by ?? ""] ?? "—"} · {new Date(r.created_at).toLocaleString()}</p>
                {r.specifications && <p className="text-sm mt-2"><span className="text-muted-foreground text-xs uppercase mr-1">Specs:</span>{r.specifications}</p>}
                {r.description && <p className="text-sm mt-1 text-muted-foreground">{r.description}</p>}
                <div className="text-xs text-muted-foreground mt-2 flex flex-wrap gap-3">
                  <span>Type: <b>{r.type}</b></span>
                  <span>Stock: <b>{r.stock}</b></span>
                  <span>Reorder: <b>{r.reorder_level}</b></span>
                  <span>Sell: <b>₹{Number(r.selling_price).toFixed(2)}</b></span>
                  {isAdmin && <span>Buy: <b>₹{Number(r.purchase_price).toFixed(2)}</b></span>}
                </div>
                {r.note && <p className="text-xs italic mt-2 bg-secondary/40 px-2 py-1 rounded">"{r.note}"</p>}
              </div>
              {isAdmin && r.status === "pending" && (
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => approve(r)}><Check className="h-4 w-4 mr-1" />Approve</Button>
                  <Button size="sm" variant="outline" onClick={() => reject(r)}><X className="h-4 w-4 mr-1" />Reject</Button>
                </div>
              )}
            </div>
          </Card>
        ))}
        {items.length === 0 && <Card className="p-12 text-center text-muted-foreground">No requests yet.</Card>}
      </div>
    </div>
  );
}
