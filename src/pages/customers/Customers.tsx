import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Plus, Building, Trash2, Pencil, Mail, Phone, MapPin, Search, CheckCircle2, XCircle } from "lucide-react";
import CustomerForm from "./CustomerForm";

type Customer = {
  id: string;
  customer_code: string;
  name: string;
  email: string | null;
  phone: string | null;
  contact_person: string | null;
  address: string | null;
  gst_number: string | null;
  is_active: boolean;
};

export default function Customers() {
  const { isAdmin } = useAuth();
  const [items, setItems] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);

  useEffect(() => {
    document.title = "Customers · Apex Software";
    load();
  }, []);

  async function load() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("customers" as any)
        .select("*")
        .order("name");
      if (error) throw error;
      setItems((data as any[]) ?? []);
    } catch (err: any) {
      toast.error(err.message || "Failed to load customers");
    } finally {
      setLoading(false);
    }
  }

  async function handleSave(payload: any) {
    if (!isAdmin) {
      toast.error("Admins only");
      return;
    }
    const { error } = editingCustomer
      ? await supabase.from("customers" as any).update(payload).eq("id", editingCustomer.id)
      : await supabase.from("customers" as any).insert(payload);

    if (error) throw error;
    toast.success(editingCustomer ? "Customer updated successfully" : "Customer created successfully");
    load();
  }

  async function toggleActiveStatus(customer: Customer) {
    if (!isAdmin) {
      toast.error("Admins only");
      return;
    }
    try {
      const nextActive = !customer.is_active;
      const { error } = await supabase
        .from("customers" as any)
        .update({ is_active: nextActive } as any)
        .eq("id", customer.id);
      if (error) throw error;
      toast.success(`Customer ${nextActive ? "activated" : "deactivated"}`);
      load();
    } catch (err: any) {
      toast.error(err.message || "Failed to toggle status");
    }
  }

  async function remove(customer: Customer) {
    if (!isAdmin) {
      toast.error("Admins only");
      return;
    }
    try {
      const { error } = await supabase
        .from("customers" as any)
        .delete()
        .eq("id", customer.id);
      if (error) {
        // Check for foreign key violation (PostgreSQL error code 23503)
        if ((error as any).code === "23503") {
          toast.error("This customer has delivery challans and cannot be deleted. Deactivate instead.");
        } else {
          throw error;
        }
      } else {
        toast.success(`Deleted customer: ${customer.name}`);
        load();
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to delete customer");
    }
  }

  const filteredItems = items.filter((item) => {
    const query = search.toLowerCase();
    return (
      item.name.toLowerCase().includes(query) ||
      (item.customer_code && item.customer_code.toLowerCase().includes(query)) ||
      (item.contact_person && item.contact_person.toLowerCase().includes(query))
    );
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Customers</h1>
          <p className="text-muted-foreground mt-1">
            {items.length} registered · {items.filter(i => i.is_active).length} active
          </p>
        </div>
        {isAdmin && (
          <Button onClick={() => { setEditingCustomer(null); setFormOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" />New Customer
          </Button>
        )}
      </div>

      <div className="flex items-center max-w-md relative">
        <Search className="h-4 w-4 text-muted-foreground absolute left-3" />
        <Input
          placeholder="Search by name, code, or contact..."
          className="pl-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((n) => (
            <Card key={n} className="p-5 h-44 animate-pulse bg-secondary/10" />
          ))}
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredItems.map((c) => (
            <Card key={c.id} className="p-5 border border-border/50 bg-card hover:shadow-glow transition-all duration-300">
              <div className="flex items-start gap-3">
                <div className={`h-10 w-10 rounded-lg grid place-items-center ${c.is_active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                  <Building className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold truncate text-foreground">{c.name}</p>
                    <Badge variant={c.is_active ? "default" : "secondary"} className="text-[10px] scale-90 px-1.5 h-4">
                      {c.customer_code ?? "No Code"}
                    </Badge>
                  </div>
                  {c.contact_person && (
                    <p className="text-xs text-muted-foreground">
                      Contact: <span className="text-foreground">{c.contact_person}</span>
                    </p>
                  )}
                  {c.email && (
                    <p className="text-xs text-muted-foreground truncate flex items-center gap-1.5">
                      <Mail className="h-3.5 w-3.5 text-muted-foreground/75" />
                      {c.email}
                    </p>
                  )}
                  {c.phone && (
                    <p className="text-xs text-muted-foreground truncate flex items-center gap-1.5">
                      <Phone className="h-3.5 w-3.5 text-muted-foreground/75" />
                      {c.phone}
                    </p>
                  )}
                  {c.address && (
                    <p className="text-xs text-muted-foreground flex items-start gap-1.5 mt-1 line-clamp-2">
                      <MapPin className="h-3.5 w-3.5 text-muted-foreground/75 shrink-0 mt-0.5" />
                      {c.address}
                    </p>
                  )}
                  {c.gst_number && (
                    <p className="text-[10px] text-muted-foreground/80 mt-1 font-mono">
                      GST: {c.gst_number}
                    </p>
                  )}
                </div>

                {isAdmin && (
                  <div className="flex flex-col gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => { setEditingCustomer(c); setFormOpen(true); }}
                      className="hover:bg-secondary"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => toggleActiveStatus(c)}
                      className={`hover:bg-secondary ${c.is_active ? "text-success hover:text-success" : "text-muted-foreground"}`}
                      title={c.is_active ? "Deactivate Customer" : "Activate Customer"}
                    >
                      {c.is_active ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <XCircle className="h-4 w-4 text-destructive" />}
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive hover:bg-destructive/10">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete {c.name}?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This permanently deletes the customer profile. Historically generated quotations and challans referencing this customer ID will fail to lazy-load the master profile, although their snapshot info remains intact.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => remove(c)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                )}
              </div>
            </Card>
          ))}
          {filteredItems.length === 0 && (
            <Card className="p-12 col-span-full text-center text-muted-foreground">
              No customers found.
            </Card>
          )}
        </div>
      )}

      <CustomerForm
        open={formOpen}
        onOpenChange={setFormOpen}
        customer={editingCustomer}
        onSave={handleSave}
      />
    </div>
  );
}
