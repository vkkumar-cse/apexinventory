import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
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
import { Plus, FolderTree, Trash2, Package } from "lucide-react";

const schema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(300).optional().nullable(),
});

type Category = { id: string; name: string; description: string | null; product_count: number };

export default function Categories() {
  const { isAdmin } = useAuth();
  const [items, setItems] = useState<Category[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", description: "" });

  useEffect(() => { document.title = "Categories · Forge Inventory"; load(); }, []);

  async function load() {
    const { data } = await (supabase as any)
      .from("categories")
      .select("id,name,description, products(id)")
      .order("name");
    setItems(((data as any[]) ?? []).map(c => ({ ...c, product_count: c.products?.length ?? 0 })));
  }

  async function save() {
    const parsed = schema.safeParse({ name: form.name, description: form.description || null });
    if (!parsed.success) { toast.error(parsed.error.errors[0].message); return; }
    const { error } = await (supabase as any).from("categories").insert(parsed.data);
    if (error) { toast.error(error.message); return; }
    toast.success("Category created");
    setOpen(false);
    setForm({ name: "", description: "" });
    load();
  }

  async function remove(id: string) {
    const { error } = await (supabase as any).from("categories").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Category deleted");
    load();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Categories</h1>
          <p className="text-muted-foreground mt-1">{items.length} categories</p>
        </div>
        {isAdmin && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />New category</Button></DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader><DialogTitle>Add category</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2"><Label>Name</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Optical Equipments" /></div>
                <div className="space-y-2"><Label>Description <span className="text-muted-foreground font-normal">(optional)</span></Label><Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
                <Button className="w-full" onClick={save}>Create</Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {items.map(c => (
          <Card key={c.id} className="p-5 hover:border-primary/50 transition">
            <div className="flex items-start justify-between mb-3">
              <Link to={`/categories/${c.id}`} className="flex items-center gap-2 min-w-0 flex-1">
                <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary grid place-items-center"><FolderTree className="h-5 w-5" /></div>
                <div className="min-w-0">
                  <p className="font-semibold truncate">{c.name}</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1"><Package className="h-3 w-3" />{c.product_count} products</p>
                </div>
              </Link>
              {isAdmin && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="icon"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete {c.name}?</AlertDialogTitle>
                      <AlertDialogDescription>Products in this category will keep their data but be uncategorised.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => remove(c.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
            {c.description && <p className="text-sm text-muted-foreground line-clamp-2">{c.description}</p>}
          </Card>
        ))}
        {items.length === 0 && <Card className="p-12 col-span-full text-center text-muted-foreground">No categories yet.</Card>}
      </div>
    </div>
  );
}
