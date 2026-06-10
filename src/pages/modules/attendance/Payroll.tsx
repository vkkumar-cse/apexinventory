import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Banknote,
  Calculator,
  FileText,
  Loader2,
  Plus,
  Printer,
  ReceiptText,
  Save,
  User,
} from "lucide-react";

type ProfileLite = {
  id: string;
  employee_code: string | null;
  full_name: string | null;
  display_name: string | null;
  email: string | null;
  status: string | null;
  is_active: boolean | null;
};

type SalarySettings = {
  id?: string;
  employee_id: string;
  basic_salary: number;
  allowance: number;
  deductions: number;
  per_day_salary: number;
  overtime_rate: number;
  bank_name: string;
  bank_account_number: string;
  bank_ifsc: string;
};

type PayrollRow = {
  id: string;
  employee_id: string;
  payroll_month: string;
  present_days: number;
  absent_days: number;
  half_days: number;
  leave_days: number;
  late_marks: number;
  total_working_hours: number;
  base_salary: number;
  absent_deductions: number;
  half_day_deductions: number;
  late_penalties: number;
  overtime_amount: number;
  adjustments_total: number;
  monthly_payable: number;
  generated_at: string;
};

type AttendanceRow = {
  employee_id: string;
  attendance_date: string;
  status: string | null;
  working_hours: number | string | null;
};

type AdjustmentRow = {
  adjustment_type: "addition" | "deduction";
  amount: number | string | null;
};

const emptySettings = (employeeId = ""): SalarySettings => ({
  employee_id: employeeId,
  basic_salary: 0,
  allowance: 0,
  deductions: 0,
  per_day_salary: 0,
  overtime_rate: 0,
  bank_name: "",
  bank_account_number: "",
  bank_ifsc: "",
});

const money = (value: number | string | null | undefined) =>
  `₹${Number(value ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

const getMonthInput = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
};

const daysInMonth = (month: string) => {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(year, monthNumber, 0).getDate();
};

const monthRange = (month: string) => {
  const [year, monthNumber] = month.split("-").map(Number);
  const lastDay = daysInMonth(month);
  return {
    start: `${month}-01`,
    end: `${year}-${String(monthNumber).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`,
  };
};

export default function Payroll() {
  const { user, isAdmin } = useAuth();
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [profiles, setProfiles] = useState<ProfileLite[]>([]);
  const [settingsByEmployee, setSettingsByEmployee] = useState<Record<string, SalarySettings>>({});
  const [payrollRows, setPayrollRows] = useState<PayrollRow[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [month, setMonth] = useState(getMonthInput());
  const [form, setForm] = useState<SalarySettings>(emptySettings());
  const [adjustmentForm, setAdjustmentForm] = useState({
    adjustment_type: "addition" as "addition" | "deduction",
    amount: "",
    reason: "",
  });

  const profileNameById = useMemo(() => {
    return new Map(profiles.map((profile) => [
      profile.id,
      profile.full_name || profile.display_name || profile.email || "Unknown Employee",
    ]));
  }, [profiles]);

  const selectedProfileName = profileNameById.get(selectedEmployeeId) || "Select employee";

  useEffect(() => {
    document.title = "Payroll Details · Apex Attendance";
    loadPayrollData();
  }, [isAdmin, user?.id, month]);

  useEffect(() => {
    if (!selectedEmployeeId) {
      setForm(emptySettings());
      return;
    }

    setForm(settingsByEmployee[selectedEmployeeId] ?? emptySettings(selectedEmployeeId));
  }, [selectedEmployeeId, settingsByEmployee]);

  const loadPayrollData = async () => {
    setLoading(true);
    try {
      const profileQuery = supabase
        .from("profiles" as any)
        .select("id, employee_code, full_name, display_name, email, status, is_active")
        .order("full_name", { ascending: true });

      const { data: profilesRaw, error: profilesError } = isAdmin
        ? await profileQuery
        : await profileQuery.eq("id", user?.id ?? "");

      if (profilesError) throw profilesError;

      const loadedProfiles = ((profilesRaw ?? []) as any[]).map((profile): ProfileLite => ({
        id: profile.id,
        employee_code: profile.employee_code ?? null,
        full_name: profile.full_name ?? null,
        display_name: profile.display_name ?? null,
        email: profile.email ?? null,
        status: profile.status ?? null,
        is_active: profile.is_active ?? true,
      }));

      setProfiles(loadedProfiles);

      const employeeIds = loadedProfiles.map((profile) => profile.id);
      if (!selectedEmployeeId && employeeIds.length > 0) {
        setSelectedEmployeeId(isAdmin ? employeeIds[0] : user?.id ?? employeeIds[0]);
      }

      if (employeeIds.length === 0) {
        setSettingsByEmployee({});
        setPayrollRows([]);
        return;
      }

      const [{ data: settingsRaw, error: settingsError }, { data: payrollRaw, error: payrollError }] = await Promise.all([
        supabase
          .from("employee_salary_settings" as any)
          .select("*")
          .in("employee_id", employeeIds),
        supabase
          .from("monthly_payroll" as any)
          .select("*")
          .eq("payroll_month", `${month}-01`)
          .in("employee_id", employeeIds)
          .order("generated_at", { ascending: false }),
      ]);

      if (settingsError) throw settingsError;
      if (payrollError) throw payrollError;

      const nextSettings: Record<string, SalarySettings> = {};
      ((settingsRaw ?? []) as any[]).forEach((row) => {
        nextSettings[row.employee_id] = {
          id: row.id,
          employee_id: row.employee_id,
          basic_salary: Number(row.basic_salary ?? 0),
          allowance: Number(row.allowance ?? 0),
          deductions: Number(row.deductions ?? 0),
          per_day_salary: Number(row.per_day_salary ?? 0),
          overtime_rate: Number(row.overtime_rate ?? 0),
          bank_name: row.bank_name ?? "",
          bank_account_number: row.bank_account_number ?? "",
          bank_ifsc: row.bank_ifsc ?? "",
        };
      });
      setSettingsByEmployee(nextSettings);

      setPayrollRows(((payrollRaw ?? []) as any[]).map((row): PayrollRow => ({
        id: row.id,
        employee_id: row.employee_id,
        payroll_month: row.payroll_month,
        present_days: Number(row.present_days ?? 0),
        absent_days: Number(row.absent_days ?? 0),
        half_days: Number(row.half_days ?? 0),
        leave_days: Number(row.leave_days ?? 0),
        late_marks: Number(row.late_marks ?? 0),
        total_working_hours: Number(row.total_working_hours ?? 0),
        base_salary: Number(row.base_salary ?? 0),
        absent_deductions: Number(row.absent_deductions ?? 0),
        half_day_deductions: Number(row.half_day_deductions ?? 0),
        late_penalties: Number(row.late_penalties ?? 0),
        overtime_amount: Number(row.overtime_amount ?? 0),
        adjustments_total: Number(row.adjustments_total ?? 0),
        monthly_payable: Number(row.monthly_payable ?? 0),
        generated_at: row.generated_at,
      })));
    } catch (err: any) {
      toast.error(err.message || "Failed to load payroll");
    } finally {
      setLoading(false);
    }
  };

  const saveSalarySettings = async () => {
    if (!isAdmin) return;
    if (!selectedEmployeeId) {
      toast.error("Select an employee");
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        employee_id: selectedEmployeeId,
        basic_salary: Number(form.basic_salary || 0),
        allowance: Number(form.allowance || 0),
        deductions: Number(form.deductions || 0),
        per_day_salary: Number(form.per_day_salary || 0),
        overtime_rate: Number(form.overtime_rate || 0),
        bank_name: form.bank_name.trim() || null,
        bank_account_number: form.bank_account_number.trim() || null,
        bank_ifsc: form.bank_ifsc.trim() || null,
        updated_by: user?.id ?? null,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from("employee_salary_settings" as any)
        .upsert(payload as any, { onConflict: "employee_id" });

      if (error) throw error;
      toast.success("Salary settings saved");
      await loadPayrollData();
    } catch (err: any) {
      toast.error(err.message || "Failed to save salary settings");
    } finally {
      setIsSaving(false);
    }
  };

  const addAdjustment = async () => {
    if (!isAdmin || !selectedEmployeeId) return;
    const amount = Number(adjustmentForm.amount || 0);
    if (amount <= 0) {
      toast.error("Enter adjustment amount");
      return;
    }

    try {
      const { error } = await supabase.from("payroll_adjustments" as any).insert({
        employee_id: selectedEmployeeId,
        payroll_month: `${month}-01`,
        adjustment_type: adjustmentForm.adjustment_type,
        amount,
        reason: adjustmentForm.reason.trim() || null,
        created_by: user?.id ?? null,
      } as any);

      if (error) throw error;
      toast.success("Adjustment added");
      setAdjustmentForm({ adjustment_type: "addition", amount: "", reason: "" });
    } catch (err: any) {
      toast.error(err.message || "Failed to add adjustment");
    }
  };

  const buildPayrollForEmployee = async (employeeId: string) => {
    const settings = settingsByEmployee[employeeId] ?? emptySettings(employeeId);
    const { start, end } = monthRange(month);
    const totalDays = daysInMonth(month);

    const [{ data: attendanceRaw, error: attendanceError }, { data: adjustmentsRaw, error: adjustmentsError }] = await Promise.all([
      supabase
        .from("attendance" as any)
        .select("employee_id, attendance_date, status, working_hours")
        .eq("employee_id", employeeId)
        .gte("attendance_date", start)
        .lte("attendance_date", end),
      supabase
        .from("payroll_adjustments" as any)
        .select("adjustment_type, amount")
        .eq("employee_id", employeeId)
        .eq("payroll_month", `${month}-01`),
    ]);

    if (attendanceError) throw attendanceError;
    if (adjustmentsError) throw adjustmentsError;

    const attendance = (attendanceRaw ?? []) as unknown as AttendanceRow[];
    const adjustments = (adjustmentsRaw ?? []) as unknown as AdjustmentRow[];
    let presentDays = 0;
    let halfDays = 0;
    let leaveDays = 0;
    let lateMarks = 0;
    let totalWorkingHours = 0;

    attendance.forEach((row) => {
      const status = (row.status || "present").toLowerCase();
      if (status === "half-day") {
        halfDays += 1;
      } else if (status === "leave") {
        leaveDays += 1;
      } else {
        presentDays += 1;
        if (status === "late") lateMarks += 1;
      }

      totalWorkingHours += Number(row.working_hours ?? 0);
    });

    const attendanceDays = new Set(attendance.map((row) => row.attendance_date)).size;
    const absentDays = Math.max(0, totalDays - attendanceDays - leaveDays);
    const baseSalary = Number(settings.basic_salary) + Number(settings.allowance) - Number(settings.deductions);
    const perDaySalary = Number(settings.per_day_salary || 0);
    const absentDeductions = absentDays * perDaySalary;
    const halfDayDeductions = halfDays * (perDaySalary / 2);
    const latePenalties = lateMarks * (perDaySalary * 0.1);
    const expectedHours = (presentDays + halfDays * 0.5) * 8;
    const overtimeHours = Math.max(0, totalWorkingHours - expectedHours);
    const overtimeAmount = overtimeHours * Number(settings.overtime_rate || 0);
    const adjustmentsTotal = adjustments.reduce((total, adjustment) => {
      const amount = Number(adjustment.amount ?? 0);
      return adjustment.adjustment_type === "deduction" ? total - amount : total + amount;
    }, 0);
    const monthlyPayable = baseSalary - absentDeductions - halfDayDeductions - latePenalties + overtimeAmount + adjustmentsTotal;

    return {
      employee_id: employeeId,
      payroll_month: `${month}-01`,
      present_days: presentDays,
      absent_days: absentDays,
      half_days: halfDays,
      leave_days: leaveDays,
      late_marks: lateMarks,
      total_working_hours: Number(totalWorkingHours.toFixed(2)),
      base_salary: Number(baseSalary.toFixed(2)),
      absent_deductions: Number(absentDeductions.toFixed(2)),
      half_day_deductions: Number(halfDayDeductions.toFixed(2)),
      late_penalties: Number(latePenalties.toFixed(2)),
      overtime_amount: Number(overtimeAmount.toFixed(2)),
      adjustments_total: Number(adjustmentsTotal.toFixed(2)),
      monthly_payable: Number(monthlyPayable.toFixed(2)),
      generated_at: new Date().toISOString(),
      generated_by: user?.id ?? null,
    };
  };

  const generatePayroll = async (scope: "selected" | "all") => {
    if (!isAdmin) return;
    const employeeIds = scope === "all"
      ? profiles.filter((profile) => profile.status === "approved" && profile.is_active !== false).map((profile) => profile.id)
      : [selectedEmployeeId].filter(Boolean);

    if (employeeIds.length === 0) {
      toast.error("No employees available for payroll");
      return;
    }

    setIsGenerating(true);
    try {
      const rows = await Promise.all(employeeIds.map((employeeId) => buildPayrollForEmployee(employeeId)));
      const { error } = await supabase
        .from("monthly_payroll" as any)
        .upsert(rows as any[], { onConflict: "employee_id,payroll_month" });

      if (error) throw error;
      toast.success(scope === "all" ? "Monthly payroll generated for all employees" : "Monthly payroll generated");
      await loadPayrollData();
    } catch (err: any) {
      toast.error(err.message || "Failed to generate payroll");
    } finally {
      setIsGenerating(false);
    }
  };

  const rowsToShow = isAdmin ? payrollRows : payrollRows.filter((row) => row.employee_id === user?.id);
  const totalPayable = rowsToShow.reduce((total, row) => total + row.monthly_payable, 0);

  return (
    <div className="p-4 md:p-8 space-y-6 text-white min-h-[calc(100vh-100px)] bg-[#0B1528] rounded-2xl border border-slate-800 shadow-2xl relative overflow-hidden">
      <div className="absolute top-0 right-0 w-80 h-80 bg-emerald-500/5 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-80 h-80 bg-blue-500/5 rounded-full blur-[100px] pointer-events-none" />

      <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/80 pb-5">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight flex items-center gap-2">
            <ReceiptText className="h-8 w-8 text-emerald-400" />
            Payroll Details
          </h1>
          <p className="text-slate-400 mt-1">
            {isAdmin ? "Set salaries, generate monthly payroll, and review payable salary." : "View your generated salary details and attendance payroll basis."}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Input
            type="month"
            value={month}
            onChange={(event) => setMonth(event.target.value)}
            className="bg-[#162A4E] border-slate-700/80 text-white w-44"
          />
          <Button variant="outline" className="border-slate-700 text-slate-300 hover:bg-slate-800" disabled>
            <Printer className="h-4 w-4 mr-2" />
            Print Payslip
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-24 relative z-10">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 relative z-10">
          {isAdmin && (
            <div className="space-y-6">
              <Card className="bg-slate-900/60 border-slate-800 text-white">
                <CardHeader className="border-b border-slate-800/80 pb-4">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <User className="h-5 w-5 text-blue-400" />
                    Salary Settings
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-5 space-y-4">
                  <div className="space-y-1.5">
                    <Label className="text-slate-300">Employee</Label>
                    <select
                      value={selectedEmployeeId}
                      onChange={(event) => setSelectedEmployeeId(event.target.value)}
                      className="flex h-10 w-full rounded-md border border-slate-700/80 bg-[#162A4E] px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {profiles.map((profile) => (
                        <option key={profile.id} value={profile.id}>
                          {profile.full_name || profile.display_name || profile.email || "Unknown"}{profile.employee_code ? ` (${profile.employee_code})` : ""}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    {[
                      ["basic_salary", "Basic Salary"],
                      ["allowance", "Allowance"],
                      ["deductions", "Deductions"],
                      ["per_day_salary", "Per Day Salary"],
                      ["overtime_rate", "Overtime Rate"],
                    ].map(([key, label]) => (
                      <div key={key} className="space-y-1.5">
                        <Label className="text-slate-300">{label}</Label>
                        <Input
                          type="number"
                          value={String((form as any)[key] ?? 0)}
                          onChange={(event) => setForm({ ...form, [key]: Number(event.target.value) } as SalarySettings)}
                          className="bg-[#162A4E] border-slate-700/80 text-white"
                        />
                      </div>
                    ))}
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-slate-300">Bank Name</Label>
                    <Input value={form.bank_name} onChange={(event) => setForm({ ...form, bank_name: event.target.value })} className="bg-[#162A4E] border-slate-700/80 text-white" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-slate-300">Account Number</Label>
                      <Input value={form.bank_account_number} onChange={(event) => setForm({ ...form, bank_account_number: event.target.value })} className="bg-[#162A4E] border-slate-700/80 text-white" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-slate-300">IFSC</Label>
                      <Input value={form.bank_ifsc} onChange={(event) => setForm({ ...form, bank_ifsc: event.target.value })} className="bg-[#162A4E] border-slate-700/80 text-white" />
                    </div>
                  </div>

                  <Button onClick={saveSalarySettings} disabled={isSaving || !selectedEmployeeId} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold">
                    {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                    Save Salary Details
                  </Button>
                </CardContent>
              </Card>

              <Card className="bg-slate-900/60 border-slate-800 text-white">
                <CardHeader className="border-b border-slate-800/80 pb-4">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Plus className="h-5 w-5 text-indigo-400" />
                    Monthly Adjustment
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-5 space-y-3">
                  <p className="text-xs text-slate-400">For {selectedProfileName} in {month}.</p>
                  <select
                    value={adjustmentForm.adjustment_type}
                    onChange={(event) => setAdjustmentForm({ ...adjustmentForm, adjustment_type: event.target.value as "addition" | "deduction" })}
                    className="flex h-10 w-full rounded-md border border-slate-700/80 bg-[#162A4E] px-3 py-2 text-sm text-white"
                  >
                    <option value="addition">Addition</option>
                    <option value="deduction">Deduction</option>
                  </select>
                  <Input
                    type="number"
                    placeholder="Amount"
                    value={adjustmentForm.amount}
                    onChange={(event) => setAdjustmentForm({ ...adjustmentForm, amount: event.target.value })}
                    className="bg-[#162A4E] border-slate-700/80 text-white"
                  />
                  <Input
                    placeholder="Reason"
                    value={adjustmentForm.reason}
                    onChange={(event) => setAdjustmentForm({ ...adjustmentForm, reason: event.target.value })}
                    className="bg-[#162A4E] border-slate-700/80 text-white"
                  />
                  <Button onClick={addAdjustment} variant="outline" className="w-full border-slate-700 text-slate-300 hover:bg-slate-800">
                    Add Adjustment
                  </Button>
                </CardContent>
              </Card>
            </div>
          )}

          <div className={isAdmin ? "xl:col-span-2 space-y-6" : "xl:col-span-3 space-y-6"}>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="bg-slate-900/60 border-slate-800 text-white">
                <CardHeader className="p-4 pb-2">
                  <CardTitle className="text-xs uppercase tracking-wider text-slate-400">Payroll Rows</CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-0 flex items-end justify-between">
                  <span className="text-3xl font-extrabold text-blue-400">{rowsToShow.length}</span>
                  <FileText className="h-5 w-5 text-blue-500" />
                </CardContent>
              </Card>
              <Card className="bg-slate-900/60 border-slate-800 text-white">
                <CardHeader className="p-4 pb-2">
                  <CardTitle className="text-xs uppercase tracking-wider text-slate-400">Total Payable</CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-0 flex items-end justify-between">
                  <span className="text-2xl font-extrabold text-emerald-400">{money(totalPayable)}</span>
                  <Banknote className="h-5 w-5 text-emerald-500" />
                </CardContent>
              </Card>
              <Card className="bg-slate-900/60 border-slate-800 text-white">
                <CardHeader className="p-4 pb-2">
                  <CardTitle className="text-xs uppercase tracking-wider text-slate-400">Month</CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-0 flex items-end justify-between">
                  <span className="text-2xl font-extrabold text-slate-100">{month}</span>
                  <Calculator className="h-5 w-5 text-indigo-500" />
                </CardContent>
              </Card>
            </div>

            {isAdmin && (
              <div className="flex flex-col sm:flex-row gap-3">
                <Button onClick={() => generatePayroll("selected")} disabled={isGenerating || !selectedEmployeeId} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold">
                  {isGenerating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Calculator className="h-4 w-4 mr-2" />}
                  Generate Selected
                </Button>
                <Button onClick={() => generatePayroll("all")} disabled={isGenerating} variant="outline" className="border-slate-700 text-slate-300 hover:bg-slate-800">
                  Generate All Employees
                </Button>
              </div>
            )}

            <Card className="bg-slate-900/60 border-slate-800 text-white">
              <CardHeader className="border-b border-slate-800/80 pb-4">
                <CardTitle className="text-lg flex items-center gap-2">
                  <ReceiptText className="h-5 w-5 text-emerald-400" />
                  Payroll Register
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4">
                {rowsToShow.length === 0 ? (
                  <div className="text-center py-16 border border-dashed border-slate-800 rounded-xl text-slate-500">
                    {isAdmin ? "Generate payroll for this month to populate salary rows." : "Payroll has not been generated for this month yet."}
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-slate-800">
                    <table className="w-full text-sm text-left">
                      <thead className="bg-[#0B1528]/85 text-slate-400 font-semibold uppercase tracking-wider text-xs border-b border-slate-800">
                        <tr>
                          <th className="py-3 px-3">Employee</th>
                          <th className="py-3 px-3 text-center">Attendance Basis</th>
                          <th className="py-3 px-3 text-right">Deductions</th>
                          <th className="py-3 px-3 text-right">Overtime</th>
                          <th className="py-3 px-3 text-right">Payable</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {rowsToShow.map((row) => (
                          <tr key={row.id} className="hover:bg-slate-800/40">
                            <td className="py-4 px-3">
                              <div className="font-semibold text-slate-200">{profileNameById.get(row.employee_id) || "Employee"}</div>
                              <div className="text-xs text-slate-500 font-mono">{row.payroll_month}</div>
                              <Badge className="mt-1 bg-slate-800 text-slate-300 border border-slate-700 text-[10px]">
                                Generated {new Date(row.generated_at).toLocaleDateString("en-IN")}
                              </Badge>
                            </td>
                            <td className="py-4 px-3 text-center text-xs text-slate-300">
                              <div>P {row.present_days} / A {row.absent_days} / H {row.half_days} / L {row.leave_days}</div>
                              <div className="text-slate-500 mt-1">Late {row.late_marks} · {row.total_working_hours.toFixed(2)} hrs</div>
                            </td>
                            <td className="py-4 px-3 text-right text-xs text-slate-300">
                              <div>Absent {money(row.absent_deductions)}</div>
                              <div>Half-day {money(row.half_day_deductions)}</div>
                              <div>Late {money(row.late_penalties)}</div>
                            </td>
                            <td className="py-4 px-3 text-right text-slate-300">
                              <div>{money(row.overtime_amount)}</div>
                              {row.adjustments_total !== 0 && (
                                <div className={row.adjustments_total > 0 ? "text-emerald-400 text-xs" : "text-rose-400 text-xs"}>
                                  Adj {money(row.adjustments_total)}
                                </div>
                              )}
                            </td>
                            <td className="py-4 px-3 text-right">
                              <div className="text-lg font-extrabold text-emerald-400">{money(row.monthly_payable)}</div>
                              <div className="text-xs text-slate-500">Base {money(row.base_salary)}</div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
