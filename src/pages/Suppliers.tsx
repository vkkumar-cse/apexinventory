import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Truck } from "lucide-react";

const schema = z.object({
  name: z.string().trim().min(1).max(120),
  contact: z.string().trim().max(120).optional(),
  address: z.string().trim().max(500).optional(),
});

type Supplier = { id: string; name: string; contact: string | null; address: string | null };

export default function Suppliers() {
  const { isAdmin } = useAuth();
  const [items, setItems] = useState<Supplier[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", contact: "", address: "" });

  useEffect(() => { document.title = "Suppliers · Forge Inventory"; load(); }, []);

  async function load() {
    const { data } = await supabase.from("suppliers").select("*").order("name");
    setItems(data ?? []);
  }

  async function save() {
    const parsed = schema.safeParse(form);
    if (!parsed.success) { toast.error(parsed.error.errors[0].message); return; }
    const { error } = await supabase.from("suppliers").insert(parsed.data);
    if (error) { toast.error(error.message); return; }
    toast.success("Supplier added");
    setForm({ name: "", contact: "", address: "" });
    setOpen(false);
    load();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Suppliers</h1>
          <p className="text-muted-foreground mt-1">{items.length} registered</p>
        </div>
        {isAdmin && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" />New supplier</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add supplier</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2"><Label>Name</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
                <div className="space-y-2"><Label>Contact</Label><Input value={form.contact} onChange={e => setForm({ ...form, contact: e.target.value })} placeholder="phone or email" /></div>
                <div className="space-y-2"><Label>Address</Label><Textarea value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} /></div>
                <Button className="w-full" onClick={save}>Save</Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {items.map(s => (
          <Card key={s.id} className="p-5">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary grid place-items-center"><Truck className="h-5 w-5" /></div>
              <div className="min-w-0">
                <p className="font-semibold truncate">{s.name}</p>
                {s.contact && <p className="text-sm text-muted-foreground truncate">{s.contact}</p>}
                {s.address && <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{s.address}</p>}
              </div>
            </div>
          </Card>
        ))}
        {items.length === 0 && (
          <Card className="p-12 col-span-full text-center text-muted-foreground">No suppliers yet.</Card>
        )}
      </div>
    </div>
  );
}
