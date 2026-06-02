import { useEffect, useState } from "react";
import { z } from "zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

const schema = z.object({
  customer_code: z.string().trim().min(1, "Customer Code is required").max(50),
  name: z.string().trim().min(1, "Customer Name is required").max(150),
  email: z.string().trim().email("Invalid email").max(255).optional().or(z.literal("")),
  phone: z.string().trim().max(40).optional(),
  contact_person: z.string().trim().max(120).optional(),
  address: z.string().trim().max(500).optional(),
  gst_number: z.string().trim().max(50).optional(),
  is_active: z.boolean(),
});

type Customer = {
  id?: string;
  customer_code: string;
  name: string;
  email: string | null;
  phone: string | null;
  contact_person: string | null;
  address: string | null;
  gst_number: string | null;
  is_active: boolean;
};

interface CustomerFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer: Customer | null;
  onSave: (payload: any) => Promise<void>;
}

const emptyForm = {
  customer_code: "",
  name: "",
  email: "",
  phone: "",
  contact_person: "",
  address: "",
  gst_number: "",
  is_active: true,
};

export default function CustomerForm({ open, onOpenChange, customer, onSave }: CustomerFormProps) {
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (customer) {
      setForm({
        customer_code: customer.customer_code ?? "",
        name: customer.name ?? "",
        email: customer.email ?? "",
        phone: customer.phone ?? "",
        contact_person: customer.contact_person ?? "",
        address: customer.address ?? "",
        gst_number: customer.gst_number ?? "",
        is_active: customer.is_active ?? true,
      });
    } else {
      setForm(emptyForm);
    }
  }, [customer, open]);

  async function handleSave() {
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      toast.error(parsed.error.errors[0].message);
      return;
    }

    try {
      setSaving(true);
      await onSave({
        ...parsed.data,
        email: parsed.data.email || null,
        phone: parsed.data.phone || null,
        contact_person: parsed.data.contact_person || null,
        address: parsed.data.address || null,
        gst_number: parsed.data.gst_number || null,
      });
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to save customer");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{customer ? `Edit Customer: ${customer.name}` : "Add New Customer"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="customer_code">Customer Code</Label>
              <Input
                id="customer_code"
                placeholder="e.g. CUST001"
                value={form.customer_code}
                onChange={(e) => setForm({ ...form, customer_code: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">Customer Name</Label>
              <Input
                id="name"
                placeholder="Acme Corporation"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="info@acme.com"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone Number</Label>
              <Input
                id="phone"
                placeholder="+1 ... or +91 ..."
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="contact_person">Contact Person</Label>
              <Input
                id="contact_person"
                placeholder="John Doe"
                value={form.contact_person}
                onChange={(e) => setForm({ ...form, contact_person: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="gst_number">GST / Tax Number</Label>
              <Input
                id="gst_number"
                placeholder="27AAAAA1111A1Z1"
                value={form.gst_number}
                onChange={(e) => setForm({ ...form, gst_number: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="address">Address</Label>
            <Textarea
              id="address"
              placeholder="Full shipping / billing address"
              rows={3}
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
          </div>

          <div className="flex items-center justify-between p-3 border border-border/50 rounded-lg bg-secondary/20">
            <div className="space-y-0.5">
              <Label htmlFor="is_active" className="text-sm font-semibold">Active Status</Label>
              <p className="text-xs text-muted-foreground">Inactive customers cannot be assigned to new transactions.</p>
            </div>
            <Switch
              id="is_active"
              checked={form.is_active}
              onCheckedChange={(checked) => setForm({ ...form, is_active: checked })}
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save Customer"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
