import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Key, Eye, EyeOff, ShieldCheck } from "lucide-react";

export default function ChangePassword() {
  const { user, refresh } = useAuth();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Validation rules
  const hasUpper = /[A-Z]/.test(newPassword);
  const [hasUpperSatisfied, setHasUpperSatisfied] = useState(false);
  const hasLower = /[a-z]/.test(newPassword);
  const hasDigit = /[0-9]/.test(newPassword);
  const hasSpecial = /[^A-Za-z0-9]/.test(newPassword);
  const validLength = newPassword.length >= 8 && newPassword.length <= 128;
  const passwordsMatch = newPassword === confirmPassword && confirmPassword.length > 0;

  const isFormValid = hasUpper && hasLower && hasDigit && hasSpecial && validLength && passwordsMatch;

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid) return;

    setIsSubmitting(true);
    try {
      // 1. Update Supabase Auth password
      const { error: authError } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (authError) throw authError;

      // 2. Set must_change_password to false in target user profile
      const { error: profileError } = await (supabase as any)
        .from("profiles")
        .update({ must_change_password: false } as any)
        .eq("id", user?.id ?? "");
      if (profileError) throw profileError;

      toast.success("Password changed successfully.");
      
      // 3. Reload auth context profiles, which removes route gates and redirects
      await refresh();
    } catch (err: any) {
      toast.error(err.message || "Failed to update password. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0B1528] p-4 relative overflow-hidden text-white">
      {/* Background gradients */}
      <div className="absolute top-0 right-0 w-80 h-80 bg-blue-500/5 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-80 h-80 bg-indigo-500/5 rounded-full blur-[100px] pointer-events-none" />

      <Card className="max-w-md w-full border-slate-800 bg-slate-900/60 backdrop-blur-sm shadow-2xl relative z-10 rounded-2xl">
        <CardHeader className="text-center space-y-2">
          <div className="mx-auto w-12 h-12 bg-indigo-500/10 border border-indigo-500/20 rounded-xl flex items-center justify-center text-indigo-400">
            <Key className="w-6 h-6" />
          </div>
          <CardTitle className="text-2xl font-extrabold tracking-tight text-slate-100">Change Password</CardTitle>
          <CardDescription className="text-slate-400 text-xs">
            For security reasons, your administrator has requested that you set a new account password.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleResetPassword} className="space-y-4">
            <div className="space-y-2">
              <Label className="text-slate-350 text-xs font-semibold">New Password</Label>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  className="bg-[#0B1528] border-slate-700 text-slate-100 placeholder-slate-600 focus-visible:ring-indigo-500 text-sm h-10 pr-10"
                  disabled={isSubmitting}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-3 text-slate-500 hover:text-slate-300"
                  disabled={isSubmitting}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-slate-350 text-xs font-semibold">Confirm Password</Label>
              <Input
                type={showPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                className="bg-[#0B1528] border-slate-700 text-slate-100 placeholder-slate-600 focus-visible:ring-indigo-500 text-sm h-10"
                disabled={isSubmitting}
              />
            </div>

            {/* Live Password Rules Validator List */}
            <div className="bg-[#0B1528]/50 border border-slate-800 rounded-xl p-3.5 space-y-2 text-xs text-slate-400">
              <span className="font-bold text-[10px] uppercase text-slate-500 block mb-1">Complexity Requirements</span>
              <div className="flex items-center gap-2">
                <span className={validLength ? "text-emerald-400 font-bold" : "text-slate-650"}>
                  {validLength ? "✓" : "○"}
                </span>
                <span className={validLength ? "text-slate-300" : ""}>8 to 128 characters</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={hasUpper ? "text-emerald-400 font-bold" : "text-slate-650"}>
                  {hasUpper ? "✓" : "○"}
                </span>
                <span className={hasUpper ? "text-slate-300" : ""}>At least one uppercase letter (A-Z)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={hasLower ? "text-emerald-400 font-bold" : "text-slate-650"}>
                  {hasLower ? "✓" : "○"}
                </span>
                <span className={hasLower ? "text-slate-300" : ""}>At least one lowercase letter (a-z)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={hasDigit ? "text-emerald-400 font-bold" : "text-slate-650"}>
                  {hasDigit ? "✓" : "○"}
                </span>
                <span className={hasDigit ? "text-slate-300" : ""}>At least one numeric digit (0-9)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={hasSpecial ? "text-emerald-400 font-bold" : "text-slate-650"}>
                  {hasSpecial ? "✓" : "○"}
                </span>
                <span className={hasSpecial ? "text-slate-300" : ""}>At least one special symbol (@, #, $, etc.)</span>
              </div>
              <div className="flex items-center gap-2 border-t border-slate-850 pt-2 mt-1">
                <span className={passwordsMatch ? "text-emerald-400 font-bold" : "text-slate-650"}>
                  {passwordsMatch ? "✓" : "○"}
                </span>
                <span className={passwordsMatch ? "text-slate-300" : ""}>Passwords match</span>
              </div>
            </div>

            <Button
              type="submit"
              disabled={isSubmitting || !isFormValid}
              className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 font-bold h-11 text-sm text-white"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Saving Password...
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4 mr-2" />
                  Save Password
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
