import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

interface EquipmentCardProps {
  report: any;
  onChange: (fields: any) => void;
}

export function EquipmentCard({ report, onChange }: EquipmentCardProps) {
  return (
    <Card className="bg-slate-900 border-slate-800 text-white shadow-xl max-w-full">
      <CardHeader>
        <CardTitle className="text-lg font-bold flex items-center gap-2 text-blue-400">
          Step 2: Instrument & Equipment Details
        </CardTitle>
        <CardDescription className="text-xs text-slate-400">
          Log full particulars of the equipment being serviced.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-slate-300">Equipment Name <span className="text-red-500">*</span></Label>
            <Input
              value={report.equipment_name || ""}
              onChange={(e) => onChange({ equipment_name: e.target.value })}
              placeholder="e.g. Profile Projector"
              className="bg-slate-950 border-slate-800 min-h-10 text-sm"
              required
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-slate-300">Identification No. <span className="text-red-500">*</span></Label>
            <Input
              value={report.identification_number || ""}
              onChange={(e) => onChange({ identification_number: e.target.value })}
              placeholder="e.g. ID-8899"
              className="bg-slate-950 border-slate-800 min-h-10 text-sm"
            />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-slate-300">Serial Number <span className="text-red-500">*</span></Label>
            <Input
              value={report.serial_number || ""}
              onChange={(e) => onChange({ serial_number: e.target.value })}
              placeholder="Manufacturer serial no."
              className="bg-slate-950 border-slate-800 min-h-10 text-sm"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-slate-300">Make / Brand</Label>
            <Input
              value={report.make || ""}
              onChange={(e) => onChange({ make: e.target.value })}
              placeholder="e.g. Mitutoyo"
              className="bg-slate-950 border-slate-800 min-h-10 text-sm"
            />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-slate-300">Model Name / No.</Label>
            <Input
              value={report.model || ""}
              onChange={(e) => onChange({ model: e.target.value })}
              placeholder="Model code"
              className="bg-slate-950 border-slate-800 min-h-10 text-sm"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-slate-300">Equipment Location</Label>
            <Input
              value={report.location || ""}
              onChange={(e) => onChange({ location: e.target.value })}
              placeholder="e.g. Lab 2, Calibration Bay"
              className="bg-slate-950 border-slate-800 min-h-10 text-sm"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
