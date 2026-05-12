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
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Plus, Truck, Trash2, Pencil, Mail, Phone } from "lucide-react";

const schema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email("Invalid email").max(255).optional().or(z.literal("")),
  phone: z.string().trim().max(40).optional(),
  contact: z.string().trim().max(120).optional(),
  address: z.string().trim().max(500).optional(),
});

type Supplier = { id: string; name: string; email: string | null; phone: string | null; contact: string | null; address: string | null };

const empty = { name: "", email: "", phone: "", contact: "", address: "" };

export default function Suppliers() {
  const { isAdmin } = useAuth();
  const [items, setItems] = useState<Supplier[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [form, setForm] = useState(empty);

  useEffect(() => { document.title = "Suppliers · Forge Inventory"; load(); }, []);

  async function load() {
    const { data } = await supabase.from("suppliers").select("*").order("name");
    setItems((data as any) ?? []);
  }

  function openNew() {
    setEditing(null); setForm(empty); setOpen(true);
  }
  function openEdit(s: Supplier) {
    setEditing(s);
    setForm({ name: s.name, email: s.email ?? "", phone: s.phone ?? "", contact: s.contact ?? "", address: s.address ?? "" });
    setOpen(true);
  }

  async function save() {
    const parsed = schema.safeParse(form);
    if (!parsed.success) { toast.error(parsed.error.errors[0].message); return; }
    const payload = {
      name: parsed.data.name,
      email: parsed.data.email || null,
      phone: parsed.data.phone || null,
      contact: parsed.data.contact || null,
      address: parsed.data.address || null,
    };
    const { error } = editing
      ? await supabase.from("suppliers").update(payload).eq("id", editing.id)
      : await supabase.from("suppliers").insert(payload);
    if (error) { toast.error(error.message); return; }
    toast.success(editing ? "Supplier updated" : "Supplier added");
    setForm(empty); setEditing(null); setOpen(false); load();
  }

  async function remove(s: Supplier) {
    const { error } = await supabase.from("suppliers").delete().eq("id", s.id);
    if (error) { toast.error(error.message); return; }
    toast.success(`Deleted ${s.name}`); load();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Suppliers</h1>
          <p className="text-muted-foreground mt-1">{items.length} registered</p>
        </div>
        {isAdmin && (
          <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setEditing(null); setForm(empty); } }}>
            <DialogTrigger asChild>
              <Button onClick={openNew}><Plus className="h-4 w-4 mr-2" />New supplier</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{editing ? `Edit ${editing.name}` : "Add supplier"}</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2"><Label>Name</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2"><Label>Email</Label><Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="orders@vendor.com" /></div>
                  <div className="space-y-2"><Label>Phone</Label><Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="+91 …" /></div>
                </div>
                <div className="space-y-2"><Label>Contact person</Label><Input value={form.contact} onChange={e => setForm({ ...form, contact: e.target.value })} placeholder="Sales rep, GST no., etc." /></div>
                <div className="space-y-2"><Label>Address</Label><Textarea value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} /></div>
                <Button className="w-full" onClick={save}>{editing ? "Save changes" : "Save"}</Button>
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
              <div className="min-w-0 flex-1">
                <p className="font-semibold truncate">{s.name}</p>
                {s.email && <p className="text-xs text-muted-foreground truncate flex items-center gap-1 mt-1"><Mail className="h-3 w-3" />{s.email}</p>}
                {s.phone && <p className="text-xs text-muted-foreground truncate flex items-center gap-1"><Phone className="h-3 w-3" />{s.phone}</p>}
                {s.contact && <p className="text-xs text-muted-foreground truncate mt-1">{s.contact}</p>}
                {s.address && <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{s.address}</p>}
              </div>
              {isAdmin && (
                <div className="flex flex-col gap-1 shrink-0">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(s)}><Pencil className="h-4 w-4" /></Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete {s.name}?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This permanently removes the supplier. Products linked will keep their other details but lose the supplier link.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => remove(s)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              )}
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
