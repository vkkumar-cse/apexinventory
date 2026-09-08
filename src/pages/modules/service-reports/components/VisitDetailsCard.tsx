import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface VisitDetailsCardProps {
  report: any;
  onChange: (fields: any) => void;
}

const VISIT_TYPES = ["Chargeable", "AMC Visit", "Warranty Visit"];
const NATURE_OF_VISIT_OPTIONS = [
  "Installation",
  "Breakdown",
  "Calibration",
  "Preventive Maintenance",
  "Repair",
  "Validation",
  "Inspection",
  "Training",
  "Emergency Visit"
];

export function VisitDetailsCard({ report, onChange }: VisitDetailsCardProps) {
  const handleNatureChange = (option: string, checked: boolean) => {
    const list = report.nature_of_visit || [];
    let updated: string[];
    if (checked) {
      updated = [...list, option];
    } else {
      updated = list.filter((v: string) => v !== option);
    }
    onChange({ nature_of_visit: updated });
  };

  return (
    <Card className="bg-slate-900 border-slate-800 text-white shadow-xl max-w-full">
      <CardHeader>
        <CardTitle className="text-lg font-bold flex items-center gap-2 text-blue-400">
          Step 3: Visit Information
        </CardTitle>
        <CardDescription className="text-xs text-slate-400">
          Specify the service scope, schedules, and type of visit.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <Label className="text-xs font-semibold text-slate-300">Visit Type <span className="text-red-500">*</span></Label>
          <Select
            value={report.visit_type || ""}
            onValueChange={(val) => onChange({ visit_type: val })}
          >
            <SelectTrigger className="bg-slate-950 border-slate-800 text-white min-h-11">
              <SelectValue placeholder="Select type of visit" />
            </SelectTrigger>
            <SelectContent className="bg-slate-900 border-slate-800 text-white">
              {VISIT_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-slate-300">Problem Reported Date</Label>
            <Input
              type="date"
              value={report.problem_reported_date || ""}
              onChange={(e) => onChange({ problem_reported_date: e.target.value })}
              className="bg-slate-950 border-slate-800 min-h-10 text-sm"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-slate-300">Committed Service Date</Label>
            <Input
              type="date"
              value={report.committed_service_date || ""}
              onChange={(e) => onChange({ committed_service_date: e.target.value })}
              className="bg-slate-950 border-slate-800 min-h-10 text-sm"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-slate-300">Our Visit Date <span className="text-red-500">*</span></Label>
            <Input
              type="date"
              value={report.actual_visit_date || ""}
              onChange={(e) => onChange({ actual_visit_date: e.target.value })}
              className="bg-slate-950 border-slate-800 min-h-10 text-sm"
              required
            />
          </div>
        </div>

        <div className="space-y-3">
          <Label className="text-xs font-semibold text-slate-300">Nature of Visit (Select all that apply) <span className="text-red-500">*</span></Label>
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 bg-slate-950/40 p-4 border border-slate-850 rounded-xl">
            {NATURE_OF_VISIT_OPTIONS.map((option) => {
              const isChecked = (report.nature_of_visit || []).includes(option);
              return (
                <div key={option} className="flex items-center space-x-2.5 py-1">
                  <Checkbox
                    id={`nature-${option}`}
                    checked={isChecked}
                    onCheckedChange={(checked) => handleNatureChange(option, !!checked)}
                    className="border-slate-700 bg-slate-900 data-[state=checked]:bg-blue-600 data-[state=checked]:text-white h-4.5 w-4.5 rounded"
                  />
                  <label
                    htmlFor={`nature-${option}`}
                    className="text-xs font-medium text-slate-300 cursor-pointer select-none leading-none"
                  >
                    {option}
                  </label>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
