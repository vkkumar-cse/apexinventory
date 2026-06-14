import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { formatDurationHours } from "@/lib/formatDuration";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  Banknote,
  Calculator,
  CheckCircle2,
  Download,
  FileText,
  Loader2,
  Pencil,
  Plus,
  Printer,
  ReceiptText,
  Save,
  Trash2,
  User,
} from "lucide-react";

type ProfileLite = {
  id: string;
  employee_code: string | null;
  full_name: string | null;
  display_name: string | null;
  email: string | null;
  department: string | null;
  designation: string | null;
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

type PayrollStatus = "draft" | "generated" | "approved" | "paid";

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
  gross_salary: number;
  absent_deductions: number;
  half_day_deductions: number;
  late_penalties: number;
  overtime_hours: number;
  overtime_amount: number;
  paid_leave_days: number;
  unpaid_leave_days: number;
  adjustments_total: number;
  monthly_payable: number;
  status: PayrollStatus;
  payslip_number: string | null;
  generated_at: string;
};

type AttendanceSession = {
  attendance_date: string;
  check_in: string;
  check_out: string | null;
  status: string | null;
};

type LeaveRequest = {
  leave_type: "paid_leave" | "sick_leave" | "casual_leave" | "unpaid_leave";
  start_date: string;
  end_date: string;
  status: string | null;
};

type AdjustmentType =
  | "addition"
  | "deduction"
  | "bonus"
  | "incentive"
  | "reimbursement"
  | "advance_deduction"
  | "loan_deduction"
  | "penalty"
  | "other";

type AdjustmentRow = {
  id: string;
  employee_id: string;
  payroll_month: string;
  adjustment_type: AdjustmentType;
  amount: number;
  reason: string | null;
};

type LatePolicy = {
  mode: "marks_to_half_day" | "fixed_penalty";
  late_marks_for_half_day: number;
  fixed_penalty_amount: number;
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
  `Rs. ${Number(value ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

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

const dateKey = (value: Date) =>
  `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;

const eachDateInRange = (start: string, end: string) => {
  const result: string[] = [];
  const cursor = new Date(`${start}T00:00:00`);
  const last = new Date(`${end}T00:00:00`);
  while (cursor <= last) {
    result.push(dateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return result;
};

const adjustmentSign = (type: AdjustmentType) =>
  ["deduction", "advance_deduction", "loan_deduction", "penalty"].includes(type) ? -1 : 1;

const adjustmentLabels: Record<AdjustmentType, string> = {
  addition: "Addition",
  deduction: "Deduction",
  bonus: "Bonus",
  incentive: "Incentive",
  reimbursement: "Reimbursement",
  advance_deduction: "Advance Deduction",
  loan_deduction: "Loan Deduction",
  penalty: "Penalty",
  other: "Other",
};

const defaultLatePolicy: LatePolicy = {
  mode: "marks_to_half_day",
  late_marks_for_half_day: 3,
  fixed_penalty_amount: 0,
};

export default function Payroll() {
  const { user, isAdmin } = useAuth();
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [profiles, setProfiles] = useState<ProfileLite[]>([]);
  const [settingsByEmployee, setSettingsByEmployee] = useState<Record<string, SalarySettings>>({});
  const [payrollRows, setPayrollRows] = useState<PayrollRow[]>([]);
  const [adjustments, setAdjustments] = useState<AdjustmentRow[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [month, setMonth] = useState(getMonthInput());
  const [form, setForm] = useState<SalarySettings>(emptySettings());
  const [latePolicy, setLatePolicy] = useState<LatePolicy>(defaultLatePolicy);
  const [selectedPayslip, setSelectedPayslip] = useState<PayrollRow | null>(null);
  const [editingAdjustmentId, setEditingAdjustmentId] = useState<string | null>(null);
  const [adjustmentForm, setAdjustmentForm] = useState({
    adjustment_type: "bonus" as AdjustmentType,
    amount: "",
    reason: "",
  });

  const profileById = useMemo(() => new Map(profiles.map((profile) => [profile.id, profile])), [profiles]);
  const selectedProfile = profileById.get(selectedEmployeeId);
  const rowsToShow = isAdmin ? payrollRows : payrollRows.filter((row) => row.employee_id === user?.id);
  const selectedAdjustments = adjustments.filter((row) => row.employee_id === selectedEmployeeId);

  const dashboard = useMemo(() => {
    const totalDeductions = rowsToShow.reduce((total, row) => total + row.absent_deductions + row.half_day_deductions + row.late_penalties + Math.max(0, -row.adjustments_total), 0);
    return {
      totalEmployees: profiles.length,
      generated: rowsToShow.filter((row) => row.status === "generated").length,
      pending: Math.max(0, profiles.length - rowsToShow.length) + rowsToShow.filter((row) => row.status === "draft").length,
      approved: rowsToShow.filter((row) => row.status === "approved").length,
      paid: rowsToShow.filter((row) => row.status === "paid").length,
      payable: rowsToShow.reduce((total, row) => total + row.monthly_payable, 0),
      overtime: rowsToShow.reduce((total, row) => total + row.overtime_amount, 0),
      deductions: totalDeductions,
    };
  }, [profiles.length, rowsToShow]);

  useEffect(() => {
    document.title = "Payroll Details - Apex Attendance";
    loadPayrollData();
  }, [isAdmin, user?.id, month]);

  useEffect(() => {
    setForm(selectedEmployeeId ? settingsByEmployee[selectedEmployeeId] ?? emptySettings(selectedEmployeeId) : emptySettings());
  }, [selectedEmployeeId, settingsByEmployee]);

  const loadPayrollData = async () => {
    setLoading(true);
    try {
      const profileQuery = supabase
        .from("profiles" as any)
        .select("id, employee_code, full_name, display_name, email, department, designation, status, is_active")
        .order("full_name", { ascending: true });

      const { data: profilesRaw, error: profilesError } = isAdmin ? await profileQuery : await profileQuery.eq("id", user?.id ?? "");
      if (profilesError) throw profilesError;

      const loadedProfiles = ((profilesRaw ?? []) as any[]).map((profile): ProfileLite => ({
        id: profile.id,
        employee_code: profile.employee_code ?? null,
        full_name: profile.full_name ?? null,
        display_name: profile.display_name ?? null,
        email: profile.email ?? null,
        department: profile.department ?? null,
        designation: profile.designation ?? null,
        status: profile.status ?? null,
        is_active: profile.is_active ?? true,
      }));

      setProfiles(loadedProfiles);
      const employeeIds = loadedProfiles.map((profile) => profile.id);
      if (!selectedEmployeeId && employeeIds.length > 0) setSelectedEmployeeId(isAdmin ? employeeIds[0] : user?.id ?? employeeIds[0]);

      if (employeeIds.length === 0) {
        setSettingsByEmployee({});
        setPayrollRows([]);
        setAdjustments([]);
        return;
      }

      const [{ data: settingsRaw, error: settingsError }, { data: payrollRaw, error: payrollError }, { data: adjustmentsRaw, error: adjustmentsError }, { data: latePolicyRaw }] = await Promise.all([
        supabase.from("employee_salary_settings" as any).select("*").in("employee_id", employeeIds),
        supabase.from("monthly_payroll" as any).select("*").eq("payroll_month", `${month}-01`).in("employee_id", employeeIds).order("generated_at", { ascending: false }),
        supabase.from("payroll_adjustments" as any).select("*").eq("payroll_month", `${month}-01`).in("employee_id", employeeIds).order("created_at", { ascending: false }),
        supabase.from("attendance_settings" as any).select("value").eq("key", "payroll_late_policy").maybeSingle(),
      ]);

      if (settingsError) throw settingsError;
      if (payrollError) throw payrollError;
      if (adjustmentsError) throw adjustmentsError;

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
        gross_salary: Number(row.gross_salary ?? row.base_salary ?? 0),
        absent_deductions: Number(row.absent_deductions ?? 0),
        half_day_deductions: Number(row.half_day_deductions ?? 0),
        late_penalties: Number(row.late_penalties ?? 0),
        overtime_hours: Number(row.overtime_hours ?? 0),
        overtime_amount: Number(row.overtime_amount ?? 0),
        paid_leave_days: Number(row.paid_leave_days ?? 0),
        unpaid_leave_days: Number(row.unpaid_leave_days ?? 0),
        adjustments_total: Number(row.adjustments_total ?? 0),
        monthly_payable: Number(row.monthly_payable ?? 0),
        status: (row.status ?? "generated") as PayrollStatus,
        payslip_number: row.payslip_number ?? null,
        generated_at: row.generated_at,
      })));

      setAdjustments(((adjustmentsRaw ?? []) as any[]).map((row): AdjustmentRow => ({
        id: row.id,
        employee_id: row.employee_id,
        payroll_month: row.payroll_month,
        adjustment_type: row.adjustment_type,
        amount: Number(row.amount ?? 0),
        reason: row.reason ?? null,
      })));

      if (latePolicyRaw?.value && typeof latePolicyRaw.value === "object") {
        setLatePolicy({ ...defaultLatePolicy, ...(latePolicyRaw.value as Partial<LatePolicy>) });
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to load payroll");
    } finally {
      setLoading(false);
    }
  };

  const saveSalarySettings = async () => {
    if (!isAdmin || !selectedEmployeeId) return;
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

      const { error } = await supabase.from("employee_salary_settings" as any).upsert(payload as any, { onConflict: "employee_id" });
      if (error) throw error;
      toast.success("Salary settings saved");
      await loadPayrollData();
    } catch (err: any) {
      toast.error(err.message || "Failed to save salary settings");
    } finally {
      setIsSaving(false);
    }
  };

  const saveLatePolicy = async () => {
    if (!isAdmin) return;
    const value = {
      mode: latePolicy.mode,
      late_marks_for_half_day: Math.max(1, Number(latePolicy.late_marks_for_half_day || 1)),
      fixed_penalty_amount: Math.max(0, Number(latePolicy.fixed_penalty_amount || 0)),
    };
    const { error } = await supabase.from("attendance_settings" as any).upsert({ key: "payroll_late_policy", value, updated_at: new Date().toISOString() } as any);
    if (error) toast.error(error.message || "Failed to save late policy");
    else toast.success("Late policy saved");
  };

  const saveAdjustment = async () => {
    if (!isAdmin || !selectedEmployeeId) return;
    const amount = Number(adjustmentForm.amount || 0);
    if (amount <= 0) {
      toast.error("Enter adjustment amount");
      return;
    }

    try {
      const payload = {
        employee_id: selectedEmployeeId,
        payroll_month: `${month}-01`,
        adjustment_type: adjustmentForm.adjustment_type,
        amount,
        reason: adjustmentForm.reason.trim() || null,
        updated_at: new Date().toISOString(),
        updated_by: user?.id ?? null,
      };
      const result = editingAdjustmentId
        ? await supabase.from("payroll_adjustments" as any).update(payload as any).eq("id", editingAdjustmentId)
        : await supabase.from("payroll_adjustments" as any).insert({ ...payload, created_by: user?.id ?? null } as any);

      if (result.error) throw result.error;
      toast.success(editingAdjustmentId ? "Adjustment updated" : "Adjustment added");
      setEditingAdjustmentId(null);
      setAdjustmentForm({ adjustment_type: "bonus", amount: "", reason: "" });
      await loadPayrollData();
    } catch (err: any) {
      toast.error(err.message || "Failed to save adjustment");
    }
  };

  const editAdjustment = (row: AdjustmentRow) => {
    setEditingAdjustmentId(row.id);
    setAdjustmentForm({ adjustment_type: row.adjustment_type, amount: String(row.amount), reason: row.reason ?? "" });
  };

  const deleteAdjustment = async (id: string) => {
    if (!isAdmin || !window.confirm("Delete this payroll adjustment?")) return;
    const { error } = await supabase.from("payroll_adjustments" as any).delete().eq("id", id);
    if (error) toast.error(error.message || "Failed to delete adjustment");
    else {
      toast.success("Adjustment deleted");
      await loadPayrollData();
    }
  };

  const buildPayrollForEmployee = async (employeeId: string) => {
    const settings = settingsByEmployee[employeeId] ?? emptySettings(employeeId);
    const { start, end } = monthRange(month);
    const totalDays = daysInMonth(month);

    const [{ data: sessionsRaw, error: sessionsError }, { data: leaveRaw, error: leaveError }, { data: adjustmentsRaw, error: adjustmentsError }] = await Promise.all([
      supabase
        .from("attendance_sessions" as any)
        .select("attendance_date, check_in, check_out, status")
        .eq("profile_id", employeeId)
        .eq("status", "completed")
        .gte("attendance_date", start)
        .lte("attendance_date", end),
      supabase
        .from("leave_requests" as any)
        .select("leave_type, start_date, end_date, status")
        .eq("employee_id", employeeId)
        .eq("status", "approved")
        .lte("start_date", end)
        .gte("end_date", start),
      supabase
        .from("payroll_adjustments" as any)
        .select("adjustment_type, amount")
        .eq("employee_id", employeeId)
        .eq("payroll_month", `${month}-01`),
    ]);

    if (sessionsError) throw sessionsError;
    if (leaveError) throw leaveError;
    if (adjustmentsError) throw adjustmentsError;

    const sessions = (sessionsRaw ?? []) as unknown as AttendanceSession[];
    const leaves = (leaveRaw ?? []) as unknown as LeaveRequest[];
    const adjustmentRows = (adjustmentsRaw ?? []) as unknown as Pick<AdjustmentRow, "adjustment_type" | "amount">[];
    const hoursByDay = new Map<string, number>();

    sessions.forEach((row) => {
      if (!row.check_out) return;
      const hours = Math.max(0, (new Date(row.check_out).getTime() - new Date(row.check_in).getTime()) / 36e5);
      hoursByDay.set(row.attendance_date, (hoursByDay.get(row.attendance_date) ?? 0) + hours);
    });

    const paidLeaveDates = new Set<string>();
    const unpaidLeaveDates = new Set<string>();
    leaves.forEach((leave) => {
      const leaveStart = leave.start_date > start ? leave.start_date : start;
      const leaveEnd = leave.end_date < end ? leave.end_date : end;
      eachDateInRange(leaveStart, leaveEnd).forEach((day) => {
        if (leave.leave_type === "unpaid_leave") unpaidLeaveDates.add(day);
        else paidLeaveDates.add(day);
      });
    });

    let presentDays = 0;
    let halfDays = 0;
    let lateMarks = 0;
    let totalWorkingHours = 0;
    let overtimeHours = 0;
    const fullDayHours = 8;
    const halfDayHours = 4;

    hoursByDay.forEach((hours) => {
      totalWorkingHours += hours;
      if (hours >= fullDayHours) {
        presentDays += 1;
        overtimeHours += hours - fullDayHours;
      } else if (hours >= halfDayHours) {
        halfDays += 1;
      } else {
        lateMarks += 1;
        halfDays += 1;
      }
    });

    const leaveDays = paidLeaveDates.size + unpaidLeaveDates.size;
    const attendedOrLeaveDays = new Set([...hoursByDay.keys(), ...paidLeaveDates, ...unpaidLeaveDates]).size;
    const absentDays = Math.max(0, totalDays - attendedOrLeaveDays);
    const baseSalary = Number(settings.basic_salary || 0);
    const allowance = Number(settings.allowance || 0);
    const configuredDeductions = Number(settings.deductions || 0);
    const grossSalary = baseSalary + allowance;
    const perDaySalary = Number(settings.per_day_salary || grossSalary / totalDays || 0);
    const lateHalfDays = latePolicy.mode === "marks_to_half_day" ? Math.floor(lateMarks / Math.max(1, latePolicy.late_marks_for_half_day)) : 0;
    const latePenalties = latePolicy.mode === "fixed_penalty" ? lateMarks * Number(latePolicy.fixed_penalty_amount || 0) : lateHalfDays * (perDaySalary / 2);
    const absentDeductions = (absentDays + unpaidLeaveDates.size) * perDaySalary;
    const halfDayDeductions = halfDays * (perDaySalary / 2);
    const overtimeAmount = overtimeHours * Number(settings.overtime_rate || 0);
    const adjustmentsTotal = adjustmentRows.reduce((total, adjustment) => total + adjustmentSign(adjustment.adjustment_type) * Number(adjustment.amount ?? 0), 0);
    const monthlyPayable = grossSalary - configuredDeductions - absentDeductions - halfDayDeductions - latePenalties + overtimeAmount + adjustmentsTotal;
    const payslipNumber = `PAY-${month.replace("-", "")}-${employeeId.slice(0, 8).toUpperCase()}`;

    return {
      employee_id: employeeId,
      payroll_month: `${month}-01`,
      present_days: presentDays,
      absent_days: absentDays,
      half_days: halfDays,
      leave_days: leaveDays,
      late_marks: lateMarks,
      total_working_hours: Number(totalWorkingHours.toFixed(2)),
      base_salary: Number(grossSalary.toFixed(2)),
      gross_salary: Number(grossSalary.toFixed(2)),
      absent_deductions: Number(absentDeductions.toFixed(2)),
      half_day_deductions: Number(halfDayDeductions.toFixed(2)),
      late_penalties: Number(latePenalties.toFixed(2)),
      overtime_hours: Number(overtimeHours.toFixed(2)),
      overtime_amount: Number(overtimeAmount.toFixed(2)),
      paid_leave_days: paidLeaveDates.size,
      unpaid_leave_days: unpaidLeaveDates.size,
      adjustments_total: Number(adjustmentsTotal.toFixed(2)),
      monthly_payable: Number(monthlyPayable.toFixed(2)),
      status: "generated",
      payslip_number: payslipNumber,
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
      const { error } = await supabase.from("monthly_payroll" as any).upsert(rows as any[], { onConflict: "employee_id,payroll_month" });
      if (error) throw error;
      toast.success(scope === "all" ? "Monthly payroll generated for all employees" : "Monthly payroll generated");
      await loadPayrollData();
    } catch (err: any) {
      toast.error(err.message || "Failed to generate payroll");
    } finally {
      setIsGenerating(false);
    }
  };

  const updatePayrollStatus = async (row: PayrollRow, status: PayrollStatus) => {
    if (!isAdmin) return;
    const payload: Record<string, string | null> = { status };
    if (status === "approved") {
      payload.approved_at = new Date().toISOString();
      payload.approved_by = user?.id ?? null;
    }
    if (status === "paid") {
      payload.paid_at = new Date().toISOString();
      payload.paid_by = user?.id ?? null;
    }
    const { error } = await supabase.from("monthly_payroll" as any).update(payload as any).eq("id", row.id);
    if (error) toast.error(error.message || "Failed to update payroll status");
    else {
      toast.success(`Payroll marked ${status}`);
      await loadPayrollData();
    }
  };

  const openPayslipPrint = (row: PayrollRow) => {
    const profile = profileById.get(row.employee_id);
    const settings = settingsByEmployee[row.employee_id] ?? emptySettings(row.employee_id);
    const html = buildPayslipHtml(row, profile, settings);
    const printWindow = window.open("", "_blank", "width=900,height=1100");
    if (!printWindow) {
      toast.error("Allow popups to print payslip");
      return;
    }
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  const downloadPayslip = (row: PayrollRow) => {
    const profile = profileById.get(row.employee_id);
    const settings = settingsByEmployee[row.employee_id] ?? emptySettings(row.employee_id);
    const blob = buildPayslipPdf(row, profile, settings);
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${row.payslip_number || "payslip"}.pdf`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success("Payslip PDF downloaded");
  };

  const payslipLines = (row: PayrollRow, profile: ProfileLite | undefined, settings: SalarySettings) => {
    const name = profile?.full_name || profile?.display_name || profile?.email || "Employee";
    return [
      "Apex Inventory - Payslip",
      `Payslip Number: ${row.payslip_number || "-"}`,
      `Month: ${month}`,
      "",
      `Employee Name: ${name}`,
      `Employee Code: ${profile?.employee_code || "-"}`,
      `Department: ${profile?.department || "-"}`,
      `Designation: ${profile?.designation || "-"}`,
      "",
      "Attendance Summary",
      `Present Days: ${row.present_days}`,
      `Absent Days: ${row.absent_days}`,
      `Half Days: ${row.half_days}`,
      `Late Marks: ${row.late_marks}`,
      `Leave Days: ${row.leave_days}`,
      `Working Hours: ${formatDurationHours(row.total_working_hours)}`,
      "",
      "Salary Breakdown",
      `Basic Salary: ${money(settings.basic_salary)}`,
      `Allowance: ${money(settings.allowance)}`,
      `Overtime (${formatDurationHours(row.overtime_hours)}): ${money(row.overtime_amount)}`,
      `Adjustments: ${money(row.adjustments_total)}`,
      "",
      "Deductions",
      `Salary Settings Deductions: ${money(settings.deductions)}`,
      `Absent Deduction: ${money(row.absent_deductions)}`,
      `Half Day Deduction: ${money(row.half_day_deductions)}`,
      `Late Penalty: ${money(row.late_penalties)}`,
      "",
      `Net Payable Salary: ${money(row.monthly_payable)}`,
    ];
  };

  const buildPayslipPdf = (row: PayrollRow, profile: ProfileLite | undefined, settings: SalarySettings) => {
    const escapePdf = (text: string) => text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
    const lines = payslipLines(row, profile, settings);
    const content = [
      "BT",
      "/F1 18 Tf",
      "50 790 Td",
      `(${escapePdf(lines[0])}) Tj`,
      "/F1 11 Tf",
      ...lines.slice(1).map((line) => `0 -20 Td (${escapePdf(line)}) Tj`),
      "ET",
    ].join("\n");
    const objects = [
      "<< /Type /Catalog /Pages 2 0 R >>",
      "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
      `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    ];
    let pdf = "%PDF-1.4\n";
    const offsets = [0];
    objects.forEach((object, index) => {
      offsets.push(pdf.length);
      pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
    });
    const xrefOffset = pdf.length;
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    offsets.slice(1).forEach((offset) => {
      pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
    });
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
    return new Blob([pdf], { type: "application/pdf" });
  };

  const buildPayslipHtml = (row: PayrollRow, profile: ProfileLite | undefined, settings: SalarySettings) => {
    const name = profile?.full_name || profile?.display_name || profile?.email || "Employee";
    return `<!doctype html><html><head><title>${row.payslip_number || "Payslip"}</title><style>
      body{font-family:Arial,sans-serif;color:#111827;margin:32px}.head{display:flex;justify-content:space-between;border-bottom:2px solid #111827;padding-bottom:16px}
      h1{margin:0;font-size:24px}.muted{color:#6b7280}.grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:24px}
      table{width:100%;border-collapse:collapse;margin-top:8px}td,th{border:1px solid #d1d5db;padding:8px;text-align:left}.right{text-align:right}.total{font-size:20px;font-weight:700}
      @media print{button{display:none}body{margin:20px}}
    </style></head><body>
      <div class="head"><div><h1>Apex Inventory</h1><div class="muted">Professional Payslip</div></div><div><b>${row.payslip_number || ""}</b><br/>${month}</div></div>
      <div class="grid"><table><tbody>
        <tr><td>Employee</td><td>${name}</td></tr><tr><td>Employee Code</td><td>${profile?.employee_code || "-"}</td></tr>
        <tr><td>Department</td><td>${profile?.department || "-"}</td></tr><tr><td>Designation</td><td>${profile?.designation || "-"}</td></tr>
      </tbody></table><table><tbody>
        <tr><td>Bank</td><td>${settings.bank_name || "-"}</td></tr><tr><td>Account</td><td>${settings.bank_account_number || "-"}</td></tr>
        <tr><td>IFSC</td><td>${settings.bank_ifsc || "-"}</td></tr><tr><td>Status</td><td>${row.status}</td></tr>
      </tbody></table></div>
      <div class="grid"><table><thead><tr><th colspan="2">Attendance Summary</th></tr></thead><tbody>
        <tr><td>Present Days</td><td>${row.present_days}</td></tr><tr><td>Absent Days</td><td>${row.absent_days}</td></tr>
        <tr><td>Half Days</td><td>${row.half_days}</td></tr><tr><td>Late Marks</td><td>${row.late_marks}</td></tr>
        <tr><td>Leave Days</td><td>${row.leave_days}</td></tr><tr><td>Working Hours</td><td>${formatDurationHours(row.total_working_hours)}</td></tr>
      </tbody></table><table><thead><tr><th colspan="2">Salary Breakdown</th></tr></thead><tbody>
        <tr><td>Basic Salary</td><td class="right">${money(settings.basic_salary)}</td></tr><tr><td>Allowance</td><td class="right">${money(settings.allowance)}</td></tr>
        <tr><td>Overtime (${formatDurationHours(row.overtime_hours)})</td><td class="right">${money(row.overtime_amount)}</td></tr><tr><td>Adjustments</td><td class="right">${money(row.adjustments_total)}</td></tr>
      </tbody></table></div>
      <table><thead><tr><th>Deductions</th><th class="right">Amount</th></tr></thead><tbody>
        <tr><td>Salary Settings Deductions</td><td class="right">${money(settings.deductions)}</td></tr><tr><td>Absent Deduction</td><td class="right">${money(row.absent_deductions)}</td></tr>
        <tr><td>Half Day Deduction</td><td class="right">${money(row.half_day_deductions)}</td></tr><tr><td>Late Penalty</td><td class="right">${money(row.late_penalties)}</td></tr>
        <tr><td class="total">Net Payable Salary</td><td class="right total">${money(row.monthly_payable)}</td></tr>
      </tbody></table></body></html>`;
  };

  return (
    <div className="p-4 md:p-8 space-y-6 text-white min-h-[calc(100vh-100px)] bg-[#0B1528] rounded-2xl border border-slate-800 shadow-2xl">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/80 pb-5">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight flex items-center gap-2">
            <ReceiptText className="h-8 w-8 text-emerald-400" />
            Payroll
          </h1>
          <p className="text-slate-400 mt-1">
            {isAdmin ? "Attendance, leave, overtime, adjustments, and payslips in one monthly payroll workflow." : "View your salary, attendance basis, and payslips."}
          </p>
        </div>
        <Input type="month" value={month} onChange={(event) => setMonth(event.target.value)} className="bg-[#162A4E] border-slate-700/80 text-white w-44" />
      </div>

      {loading ? (
        <div className="flex justify-center py-24"><Loader2 className="h-8 w-8 animate-spin text-blue-500" /></div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
            {[
              ["Employees", dashboard.totalEmployees, "text-blue-400"],
              ["Generated", dashboard.generated, "text-emerald-400"],
              ["Pending", dashboard.pending, "text-amber-400"],
              ["Approved", dashboard.approved, "text-indigo-400"],
              ["Paid", dashboard.paid, "text-green-400"],
              ["Payable", money(dashboard.payable), "text-emerald-400"],
              ["Overtime", money(dashboard.overtime), "text-cyan-400"],
              ["Deductions", money(dashboard.deductions), "text-rose-400"],
            ].map(([label, value, color]) => (
              <Card key={label} className="bg-slate-900/60 border-slate-800 text-white">
                <CardContent className="p-4">
                  <div className="text-[11px] uppercase tracking-wide text-slate-400">{label}</div>
                  <div className={`mt-2 text-xl font-extrabold ${color}`}>{value}</div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            {isAdmin && (
              <div className="space-y-6">
                <Card className="bg-slate-900/60 border-slate-800 text-white">
                  <CardHeader><CardTitle className="text-lg flex items-center gap-2"><User className="h-5 w-5 text-blue-400" />Salary Settings</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-1.5">
                      <Label className="text-slate-300">Employee</Label>
                      <select value={selectedEmployeeId} onChange={(event) => setSelectedEmployeeId(event.target.value)} className="flex h-10 w-full rounded-md border border-slate-700/80 bg-[#162A4E] px-3 py-2 text-sm text-white">
                        {profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.full_name || profile.display_name || profile.email || "Unknown"}{profile.employee_code ? ` (${profile.employee_code})` : ""}</option>)}
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      {(["basic_salary", "allowance", "deductions", "per_day_salary", "overtime_rate"] as const).map((key) => (
                        <div key={key} className="space-y-1.5">
                          <Label className="text-slate-300 capitalize">{key.replace(/_/g, " ")}</Label>
                          <Input type="number" value={String(form[key] ?? 0)} onChange={(event) => setForm({ ...form, [key]: Number(event.target.value) })} className="bg-[#162A4E] border-slate-700/80 text-white" />
                        </div>
                      ))}
                    </div>
                    <Input placeholder="Bank Name" value={form.bank_name} onChange={(event) => setForm({ ...form, bank_name: event.target.value })} className="bg-[#162A4E] border-slate-700/80 text-white" />
                    <div className="grid grid-cols-2 gap-3">
                      <Input placeholder="Account Number" value={form.bank_account_number} onChange={(event) => setForm({ ...form, bank_account_number: event.target.value })} className="bg-[#162A4E] border-slate-700/80 text-white" />
                      <Input placeholder="IFSC Code" value={form.bank_ifsc} onChange={(event) => setForm({ ...form, bank_ifsc: event.target.value })} className="bg-[#162A4E] border-slate-700/80 text-white" />
                    </div>
                    <Button onClick={saveSalarySettings} disabled={isSaving || !selectedEmployeeId} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold">
                      {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}Save Salary Details
                    </Button>
                  </CardContent>
                </Card>

                <Card className="bg-slate-900/60 border-slate-800 text-white">
                  <CardHeader><CardTitle className="text-lg">Late Policy</CardTitle></CardHeader>
                  <CardContent className="space-y-3">
                    <select value={latePolicy.mode} onChange={(event) => setLatePolicy({ ...latePolicy, mode: event.target.value as LatePolicy["mode"] })} className="flex h-10 w-full rounded-md border border-slate-700/80 bg-[#162A4E] px-3 py-2 text-sm text-white">
                      <option value="marks_to_half_day">Late marks convert to half day</option>
                      <option value="fixed_penalty">Fixed penalty per late mark</option>
                    </select>
                    <Input type="number" value={latePolicy.late_marks_for_half_day} onChange={(event) => setLatePolicy({ ...latePolicy, late_marks_for_half_day: Number(event.target.value) })} className="bg-[#162A4E] border-slate-700/80 text-white" />
                    <Input type="number" value={latePolicy.fixed_penalty_amount} onChange={(event) => setLatePolicy({ ...latePolicy, fixed_penalty_amount: Number(event.target.value) })} className="bg-[#162A4E] border-slate-700/80 text-white" />
                    <Button onClick={saveLatePolicy} variant="outline" className="w-full border-slate-700 text-slate-300 hover:bg-slate-800">Save Policy</Button>
                  </CardContent>
                </Card>

                <Card className="bg-slate-900/60 border-slate-800 text-white">
                  <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Plus className="h-5 w-5 text-indigo-400" />Adjustments</CardTitle></CardHeader>
                  <CardContent className="space-y-3">
                    <select value={adjustmentForm.adjustment_type} onChange={(event) => setAdjustmentForm({ ...adjustmentForm, adjustment_type: event.target.value as AdjustmentType })} className="flex h-10 w-full rounded-md border border-slate-700/80 bg-[#162A4E] px-3 py-2 text-sm text-white">
                      {Object.entries(adjustmentLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                    <Input type="number" placeholder="Amount" value={adjustmentForm.amount} onChange={(event) => setAdjustmentForm({ ...adjustmentForm, amount: event.target.value })} className="bg-[#162A4E] border-slate-700/80 text-white" />
                    <Textarea placeholder="Reason" value={adjustmentForm.reason} onChange={(event) => setAdjustmentForm({ ...adjustmentForm, reason: event.target.value })} className="bg-[#162A4E] border-slate-700/80 text-white" />
                    <Button onClick={saveAdjustment} variant="outline" className="w-full border-slate-700 text-slate-300 hover:bg-slate-800">{editingAdjustmentId ? "Update Adjustment" : "Add Adjustment"}</Button>
                    <div className="space-y-2 pt-2">
                      {selectedAdjustments.map((row) => (
                        <div key={row.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-800 bg-[#0B1528] p-3 text-sm">
                          <div><div className="font-semibold">{adjustmentLabels[row.adjustment_type]} {money(row.amount)}</div><div className="text-xs text-slate-500">{row.reason || "No reason"}</div></div>
                          <div className="flex gap-1">
                            <Button size="icon" variant="ghost" onClick={() => editAdjustment(row)}><Pencil className="h-4 w-4" /></Button>
                            <Button size="icon" variant="ghost" onClick={() => deleteAdjustment(row.id)}><Trash2 className="h-4 w-4 text-rose-400" /></Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            <div className={isAdmin ? "xl:col-span-2 space-y-6" : "xl:col-span-3 space-y-6"}>
              {isAdmin && (
                <div className="flex flex-col sm:flex-row gap-3">
                  <Button onClick={() => generatePayroll("selected")} disabled={isGenerating || !selectedEmployeeId} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold">
                    {isGenerating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Calculator className="h-4 w-4 mr-2" />}Generate Selected
                  </Button>
                  <Button onClick={() => generatePayroll("all")} disabled={isGenerating} variant="outline" className="border-slate-700 text-slate-300 hover:bg-slate-800">Generate All Employees</Button>
                </div>
              )}

              <Card className="bg-slate-900/60 border-slate-800 text-white">
                <CardHeader><CardTitle className="text-lg flex items-center gap-2"><ReceiptText className="h-5 w-5 text-emerald-400" />Payroll Register</CardTitle></CardHeader>
                <CardContent>
                  {rowsToShow.length === 0 ? (
                    <div className="text-center py-16 border border-dashed border-slate-800 rounded-xl text-slate-500">{isAdmin ? "Generate payroll for this month." : "Payroll has not been generated for this month yet."}</div>
                  ) : (
                    <div className="overflow-x-auto rounded-xl border border-slate-800">
                      <table className="w-full text-sm text-left">
                        <thead className="bg-[#0B1528]/85 text-slate-400 font-semibold uppercase tracking-wider text-xs border-b border-slate-800">
                          <tr><th className="py-3 px-3">Employee</th><th className="py-3 px-3 text-center">Attendance</th><th className="py-3 px-3 text-right">Deductions</th><th className="py-3 px-3 text-right">Earnings</th><th className="py-3 px-3 text-right">Actions</th></tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60">
                          {rowsToShow.map((row) => {
                            const profile = profileById.get(row.employee_id);
                            return (
                              <tr key={row.id} className="hover:bg-slate-800/40">
                                <td className="py-4 px-3">
                                  <div className="font-semibold text-slate-200">{profile?.full_name || profile?.display_name || profile?.email || "Employee"}</div>
                                  <div className="text-xs text-slate-500 font-mono">{row.payslip_number || row.payroll_month}</div>
                                  <Badge className="mt-1 bg-slate-800 text-slate-300 border border-slate-700 text-[10px]">{row.status}</Badge>
                                </td>
                                <td className="py-4 px-3 text-center text-xs text-slate-300">
                                  <div>P {row.present_days} / A {row.absent_days} / H {row.half_days} / L {row.leave_days}</div>
                                  <div className="text-slate-500 mt-1">Late {row.late_marks} / {formatDurationHours(row.total_working_hours)}</div>
                                </td>
                                <td className="py-4 px-3 text-right text-xs text-slate-300">
                                  <div>Absent {money(row.absent_deductions)}</div><div>Half {money(row.half_day_deductions)}</div><div>Late {money(row.late_penalties)}</div>
                                </td>
                                <td className="py-4 px-3 text-right text-xs text-slate-300">
                                  <div>Gross {money(row.gross_salary)}</div><div>OT {formatDurationHours(row.overtime_hours)} / {money(row.overtime_amount)}</div><div>Adj {money(row.adjustments_total)}</div>
                                  <div className="text-lg font-extrabold text-emerald-400 mt-1">{money(row.monthly_payable)}</div>
                                </td>
                                <td className="py-4 px-3">
                                  <div className="flex flex-wrap justify-end gap-2">
                                    {isAdmin && row.status === "generated" && <Button size="sm" onClick={() => updatePayrollStatus(row, "approved")} className="bg-indigo-600 hover:bg-indigo-700"><CheckCircle2 className="h-4 w-4 mr-1" />Approve</Button>}
                                    {isAdmin && row.status === "approved" && <Button size="sm" onClick={() => updatePayrollStatus(row, "paid")} className="bg-emerald-600 hover:bg-emerald-700"><Banknote className="h-4 w-4 mr-1" />Paid</Button>}
                                    <Button size="sm" variant="outline" onClick={() => setSelectedPayslip(row)} className="border-slate-700 text-slate-300 hover:bg-slate-800"><FileText className="h-4 w-4 mr-1" />View</Button>
                                    <Button size="sm" variant="outline" onClick={() => openPayslipPrint(row)} className="border-slate-700 text-slate-300 hover:bg-slate-800"><Printer className="h-4 w-4" /></Button>
                                    <Button size="sm" variant="outline" onClick={() => downloadPayslip(row)} className="border-slate-700 text-slate-300 hover:bg-slate-800"><Download className="h-4 w-4" /></Button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </>
      )}

      <Dialog open={Boolean(selectedPayslip)} onOpenChange={(open) => !open && setSelectedPayslip(null)}>
        <DialogContent className="max-w-3xl bg-slate-950 border-slate-800 text-white">
          <DialogHeader><DialogTitle>Payslip Preview</DialogTitle></DialogHeader>
          {selectedPayslip && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-[#0B1528] border border-slate-800 p-3">
                  <div className="text-slate-400">Employee</div>
                  <div className="font-bold">{profileById.get(selectedPayslip.employee_id)?.full_name || profileById.get(selectedPayslip.employee_id)?.display_name || "Employee"}</div>
                </div>
                <div className="rounded-lg bg-[#0B1528] border border-slate-800 p-3">
                  <div className="text-slate-400">Net Payable</div>
                  <div className="text-xl font-extrabold text-emerald-400">{money(selectedPayslip.monthly_payable)}</div>
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  ["Present", selectedPayslip.present_days],
                  ["Absent", selectedPayslip.absent_days],
                  ["Half Days", selectedPayslip.half_days],
                  ["Leave Days", selectedPayslip.leave_days],
                  ["Late Marks", selectedPayslip.late_marks],
                  ["Hours", formatDurationHours(selectedPayslip.total_working_hours)],
                  ["Overtime", formatDurationHours(selectedPayslip.overtime_hours)],
                  ["Adjustments", money(selectedPayslip.adjustments_total)],
                ].map(([label, value]) => <div key={label} className="rounded-lg bg-[#0B1528] border border-slate-800 p-3"><div className="text-slate-400">{label}</div><div className="font-bold">{value}</div></div>)}
              </div>
              <div className="flex justify-end gap-2">
                <Button onClick={() => openPayslipPrint(selectedPayslip)} className="bg-blue-600 hover:bg-blue-700"><Printer className="h-4 w-4 mr-2" />Print</Button>
                <Button onClick={() => downloadPayslip(selectedPayslip)} variant="outline" className="border-slate-700 text-slate-300 hover:bg-slate-800"><Download className="h-4 w-4 mr-2" />Download</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
