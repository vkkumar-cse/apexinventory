import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

interface CustomerCardProps {
  report: any;
  customers: any[];
  onChange: (fields: any) => void;
}

export function CustomerCard({ report, customers, onChange }: CustomerCardProps) {
  const handleCustomerChange = (customerId: string) => {
    const selected = customers.find((c) => c.id === customerId);
    if (selected) {
      onChange({
        customer_id: selected.id,
        customer_name: selected.name,
        customer_address: selected.address || "",
        contact_person: selected.contact_person || "",
        phone_number: selected.phone || "",
        email: selected.email || "",
      });
    }
  };

  return (
    <Card className="bg-slate-900 border-slate-800 text-white shadow-xl max-w-full">
      <CardHeader>
        <CardTitle className="text-lg font-bold flex items-center gap-2 text-blue-400">
          Step 1: Customer Information
        </CardTitle>
        <CardDescription className="text-xs text-slate-400">
          Select customer details or review auto-filled data.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label className="text-xs font-semibold text-slate-300">Select Customer Profile</Label>
          <Select 
            value={report.customer_id || "new"} 
            onValueChange={handleCustomerChange}
          >
            <SelectTrigger className="bg-slate-950 border-slate-800 text-white min-h-11">
              <SelectValue placeholder="Choose a registered customer" />
            </SelectTrigger>
            <SelectContent className="bg-slate-900 border-slate-800 text-white">
              {customers.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-slate-300">Customer Name</Label>
            <Input
              value={report.customer_name || ""}
              onChange={(e) => onChange({ customer_name: e.target.value })}
              placeholder="e.g. M/s. Client Name"
              className="bg-slate-950 border-slate-800 min-h-10 text-sm"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-slate-300">Contact Person</Label>
            <Input
              value={report.contact_person || ""}
              onChange={(e) => onChange({ contact_person: e.target.value })}
              placeholder="e.g. Mr. John Doe"
              className="bg-slate-950 border-slate-800 min-h-10 text-sm"
            />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-slate-300">Phone Number</Label>
            <Input
              value={report.phone_number || ""}
              onChange={(e) => onChange({ phone_number: e.target.value })}
              placeholder="Phone number"
              className="bg-slate-950 border-slate-800 min-h-10 text-sm"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-slate-300">Email Address</Label>
            <Input
              type="email"
              value={report.email || ""}
              onChange={(e) => onChange({ email: e.target.value })}
              placeholder="Email address"
              className="bg-slate-950 border-slate-800 min-h-10 text-sm"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-xs font-semibold text-slate-300">Address Details</Label>
          <Textarea
            value={report.customer_address || ""}
            onChange={(e) => onChange({ customer_address: e.target.value })}
            placeholder="Complete postal address"
            className="bg-slate-950 border-slate-800 min-h-[70px] text-sm resize-none"
          />
        </div>
      </CardContent>
    </Card>
  );
}
