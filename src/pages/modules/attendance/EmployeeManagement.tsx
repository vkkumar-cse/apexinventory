import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Employee = {
  id: string;
  employee_code: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  department: string | null;
  designation: string | null;
  joining_date: string | null;
  status: string;
};

export default function EmployeeManagement() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [form, setForm] = useState({
    employee_code: "",
    full_name: "",
    email: "",
    phone: "",
    department: "",
    designation: "",
    joining_date: "",
    status: "active",
  });

  const fetchEmployees = async () => {
    const { data, error } = await supabase
      .from("employees" as any)
      .select("*")
      .order("created_at", { ascending: false });

    if (!error && data) setEmployees(data as any[]);
  };

  useEffect(() => {
    fetchEmployees();
  }, []);

  const clearForm = () => {
    setForm({
      employee_code: "",
      full_name: "",
      email: "",
      phone: "",
      department: "",
      designation: "",
      joining_date: "",
      status: "active",
    });
  };

  const addEmployee = async () => {
    if (!form.employee_code || !form.full_name) {
      toast.error("Employee code and full name are required");
      return;
    }

    setIsSubmitting(true);
    const { error } = await supabase.from("employees" as any).insert(form as any);
    setIsSubmitting(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Employee added successfully");
    clearForm();
    fetchEmployees();
  };

  const updateEmployee = async () => {
    if (!form.employee_code || !form.full_name) {
      toast.error("Employee code and full name are required");
      return;
    }

    if (!selectedEmployeeId) {
      toast.error("No employee selected");
      return;
    }

    setIsSubmitting(true);
    const { error } = await supabase
      .from("employees" as any)
      .update(form as any)
      .eq("id", selectedEmployeeId);
    setIsSubmitting(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Employee updated successfully");
    clearForm();
    setSelectedEmployeeId(null);
    setIsEditMode(false);
    fetchEmployees();
  };

  const handleEditEmployee = (emp: Employee) => {
    setForm({
      employee_code: emp.employee_code,
      full_name: emp.full_name,
      email: emp.email || "",
      phone: emp.phone || "",
      department: emp.department || "",
      designation: emp.designation || "",
      joining_date: emp.joining_date || "",
      status: emp.status,
    });
    setSelectedEmployeeId(emp.id);
    setIsEditMode(true);
  };

  const handleCancelEdit = () => {
    clearForm();
    setSelectedEmployeeId(null);
    setIsEditMode(false);
  };

  const deleteEmployee = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this employee?")) return;

    const { error } = await supabase.from("employees" as any).delete().eq("id", id);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Employee deleted successfully");
    fetchEmployees();
  };

  return (
    <div className="p-8 text-white min-h-[calc(100vh-100px)]">
      <h1 className="text-3xl font-bold mb-6">Employee Management</h1>

      <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl mb-8 shadow-sm">
        <h2 className="text-xl font-bold mb-4 text-slate-100">
          {isEditMode ? "Edit Employee" : "Add New Employee"}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="emp_code" className="text-slate-400">Employee Code *</Label>
            <Input id="emp_code" className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 focus-visible:ring-primary" placeholder="e.g. EMP001"
              value={form.employee_code}
              onChange={(e) => setForm({ ...form, employee_code: e.target.value })}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="full_name" className="text-slate-400">Full Name *</Label>
            <Input id="full_name" className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 focus-visible:ring-primary" placeholder="John Doe"
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email" className="text-slate-400">Email</Label>
            <Input id="email" type="email" className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 focus-visible:ring-primary" placeholder="john@example.com"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="phone" className="text-slate-400">Phone</Label>
            <Input id="phone" className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 focus-visible:ring-primary" placeholder="+1 234 567 890"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="department" className="text-slate-400">Department</Label>
            <Input id="department" className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 focus-visible:ring-primary" placeholder="Engineering"
              value={form.department}
              onChange={(e) => setForm({ ...form, department: e.target.value })}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="designation" className="text-slate-400">Designation</Label>
            <Input id="designation" className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 focus-visible:ring-primary" placeholder="Software Engineer"
              value={form.designation}
              onChange={(e) => setForm({ ...form, designation: e.target.value })}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="joining_date" className="text-slate-400">Joining Date</Label>
            <Input id="joining_date" type="date" className="bg-slate-800 border-slate-700 text-white [color-scheme:dark] focus-visible:ring-primary"
              value={form.joining_date}
              onChange={(e) => setForm({ ...form, joining_date: e.target.value })}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="status" className="text-slate-400">Status</Label>
            <select id="status" className="flex h-10 w-full items-center justify-between rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>

          <div className="col-span-1 md:col-span-2 mt-4 flex gap-3">
            <Button
              onClick={isEditMode ? updateEmployee : addEmployee}
              disabled={isSubmitting}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold h-11 transition-colors"
            >
              {isSubmitting 
                ? (isEditMode ? "Updating..." : "Adding...") 
                : (isEditMode ? "Update Employee" : "Add Employee")}
            </Button>
            {isEditMode && (
              <Button
                onClick={handleCancelEdit}
                disabled={isSubmitting}
                variant="outline"
                className="flex-1 border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800 font-bold h-11 transition-colors"
              >
                Cancel
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-sm">
        <h2 className="text-xl font-bold mb-4 text-slate-100">Employee List</h2>

        {employees.length === 0 ? (
          <div className="text-center py-12 border-2 border-dashed border-slate-800 rounded-lg">
            <p className="text-slate-400">No employees added yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-slate-400 border-b border-slate-800">
                  <th className="pb-3 font-medium px-2">Code</th>
                  <th className="pb-3 font-medium px-2">Name</th>
                  <th className="pb-3 font-medium px-2">Department</th>
                  <th className="pb-3 font-medium px-2">Designation</th>
                  <th className="pb-3 font-medium px-2">Status</th>
                  <th className="pb-3 font-medium px-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {employees.map((emp) => (
                  <tr key={emp.id} className="border-b border-slate-800/50 hover:bg-slate-800/50 transition-colors group">
                    <td className="py-4 px-2 text-slate-300 font-medium group-hover:text-white transition-colors">{emp.employee_code}</td>
                    <td className="py-4 px-2 text-slate-100">{emp.full_name}</td>
                    <td className="py-4 px-2 text-slate-400">{emp.department || "-"}</td>
                    <td className="py-4 px-2 text-slate-400">{emp.designation || "-"}</td>
                    <td className="py-4 px-2">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                        emp.status === 'active' 
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                          : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                      }`}>
                        {emp.status.charAt(0).toUpperCase() + emp.status.slice(1)}
                      </span>
                    </td>
                    <td className="py-4 px-2 text-right flex gap-2 justify-end">
                      <button
                        onClick={() => handleEditEmployee(emp)}
                        className="bg-blue-500/10 text-blue-400 hover:bg-blue-500 hover:text-white border border-blue-500/20 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => deleteEmployee(emp.id)}
                        className="bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white border border-red-500/20 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
