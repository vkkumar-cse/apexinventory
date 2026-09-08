import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { FileText, UserCheck, Calendar } from "lucide-react";

interface ReviewCardProps {
  report: any;
  activities: any[];
  parts: any[];
  photos: any[];
  onChangeReport: (fields: any) => void;
}

export function ReviewCard({
  report,
  activities,
  parts,
  photos,
  onChangeReport,
}: ReviewCardProps) {
  const checkedActivities = activities.filter((a) => a.is_checked && !a.is_custom);
  const customActions = activities.filter((a) => a.is_custom);

  return (
    <Card className="bg-slate-900 border-slate-800 text-white shadow-xl max-w-full">
      <CardHeader>
        <CardTitle className="text-lg font-bold flex items-center gap-2 text-blue-400">
          Step 8: Final Review & Sign-Off Details
        </CardTitle>
        <CardDescription className="text-xs text-slate-400">
          Review all service details and verify sign-off names before submission.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        
        {/* Quick Summary Grid */}
        <div className="grid gap-4 sm:grid-cols-2 text-xs border border-slate-850 p-4 rounded-xl bg-slate-950/20">
          <div>
            <div className="text-slate-400 font-bold uppercase mb-1">Customer Summary</div>
            <div className="font-semibold text-slate-200">{report.customer_name || "Not entered"}</div>
            <div className="text-[10px] text-slate-400 mt-0.5">{report.contact_person} Â· {report.phone_number}</div>
          </div>
          <div>
            <div className="text-slate-400 font-bold uppercase mb-1">Equipment Details</div>
            <div className="font-semibold text-slate-200">{report.equipment_name || "Not entered"}</div>
            <div className="text-[10px] text-slate-400 mt-0.5">SN: {report.serial_number} Â· ID: {report.identification_number}</div>
          </div>
        </div>

        {/* Checked Activities count */}
        <div className="text-xs space-y-1 bg-slate-950/40 p-3.5 border border-slate-850 rounded-xl">
          <div className="flex justify-between font-bold text-slate-400 uppercase">
            <span>Tasks Performed</span>
            <span className="text-blue-400 font-semibold">{checkedActivities.length} Predefined</span>
          </div>
          {customActions.length > 0 && (
            <div className="text-[10px] text-slate-500 pt-1">
              +{customActions.length} additional custom action(s) logged
            </div>
          )}
          {parts.length > 0 && (
            <div className="flex justify-between font-bold text-slate-400 uppercase pt-2 border-t border-slate-900 mt-2">
              <span>Spare Parts Changed</span>
              <span className="text-blue-400 font-semibold">{parts.length} item(s)</span>
            </div>
          )}
        </div>

        {/* Text Signatures replacing Canvas pads */}
        <div className="space-y-4 pt-3 border-t border-slate-850">
          <h3 className="text-sm font-bold text-slate-300 flex items-center gap-1.5">
            <UserCheck className="w-4 h-4 text-blue-450" />
            Physical Sign-Off Verification Details
          </h3>
          
          <div className="grid gap-4 sm:grid-cols-2">
            {/* Engineer text signoff */}
            <div className="p-4 border border-slate-800 bg-slate-950/40 rounded-xl space-y-3">
              <span className="text-[11px] font-bold text-slate-400 uppercase block">Service Engineer</span>
              <div className="space-y-2">
                <Label className="text-xs text-slate-400">Engineer Full Name <span className="text-red-500">*</span></Label>
                <Input
                  value={report.engineer_signature_name || ""}
                  onChange={(e) => onChangeReport({ engineer_signature_name: e.target.value })}
                  placeholder="e.g. M. Somu"
                  className="bg-slate-950 border-slate-800 h-10 text-xs"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-slate-400">Sign Date</Label>
                <Input
                  type="date"
                  value={report.engineer_signature_date || ""}
                  onChange={(e) => onChangeReport({ engineer_signature_date: e.target.value })}
                  className="bg-slate-950 border-slate-800 h-10 text-xs"
                />
              </div>
            </div>

            {/* Customer text signoff */}
            <div className="p-4 border border-slate-800 bg-slate-950/40 rounded-xl space-y-3">
              <span className="text-[11px] font-bold text-slate-400 uppercase block">Customer Representative</span>
              <div className="space-y-2">
                <Label className="text-xs text-slate-400">Customer Representative Name <span className="text-red-500">*</span></Label>
                <Input
                  value={report.customer_signature_name || ""}
                  onChange={(e) => onChangeReport({ customer_signature_name: e.target.value })}
                  placeholder="e.g. Mr. John Doe"
                  className="bg-slate-950 border-slate-800 h-10 text-xs"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-slate-400">Sign Date</Label>
                <Input
                  type="date"
                  value={report.customer_signature_date || ""}
                  onChange={(e) => onChangeReport({ customer_signature_date: e.target.value })}
                  className="bg-slate-950 border-slate-800 h-10 text-xs"
                />
              </div>
            </div>
          </div>
          
          <p className="text-[10px] text-slate-500 text-center leading-relaxed">
            Note: By filling in these names, you confirm the details are correct. The generated PDF report can be physically signed after printing.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
