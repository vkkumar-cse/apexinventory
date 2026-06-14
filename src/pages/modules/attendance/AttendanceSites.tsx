import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Edit3, Loader2, MapPin, Plus, Trash2 } from "lucide-react";

type AttendanceSite = {
  id: string;
  site_name: string;
  site_code: string | null;
  latitude: number | string;
  longitude: number | string;
  radius_meters: number;
  address: string | null;
  is_default: boolean;
  is_active: boolean;
};

type SiteForm = {
  site_name: string;
  site_code: string;
  address: string;
  latitude: string;
  longitude: string;
  radius_meters: string;
  is_active: boolean;
};

const emptyForm: SiteForm = {
  site_name: "",
  site_code: "",
  address: "",
  latitude: "",
  longitude: "",
  radius_meters: "100",
  is_active: true,
};

const inputClass = "bg-[#162A4E] border-slate-700/80 text-white placeholder:text-slate-500 focus-visible:ring-blue-500 focus-visible:border-blue-500 h-10";

export default function AttendanceSites() {
  const [sites, setSites] = useState<AttendanceSite[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<AttendanceSite | null>(null);
  const [form, setForm] = useState<SiteForm>(emptyForm);

  useEffect(() => {
    document.title = "Attendance Sites - Apex Software";
    loadSites();
  }, []);

  async function loadSites() {
    try {
      setLoading(true);
      const { data, error } = await (supabase as any)
        .from("attendance_sites")
        .select("*")
        .order("is_default", { ascending: false })
        .order("site_name", { ascending: true });

      if (error) throw error;
      setSites((data as AttendanceSite[]) ?? []);
    } catch (err: any) {
      toast.error(err.message || "Failed to load attendance sites");
    } finally {
      setLoading(false);
    }
  }

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setOpen(true);
  }

  function openEdit(site: AttendanceSite) {
    setEditing(site);
    setForm({
      site_name: site.site_name,
      site_code: site.site_code ?? "",
      address: site.address ?? "",
      latitude: String(site.latitude),
      longitude: String(site.longitude),
      radius_meters: String(site.radius_meters ?? 100),
      is_active: site.is_active,
    });
    setOpen(true);
  }

  async function saveSite() {
    if (!form.site_name.trim()) {
      toast.error("Site name is required");
      return;
    }

    const latitude = Number(form.latitude);
    const longitude = Number(form.longitude);
    const radius = Number.parseInt(form.radius_meters, 10);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      toast.error("Latitude and longitude must be valid numbers");
      return;
    }

    if (!Number.isFinite(radius) || radius <= 0) {
      toast.error("Radius must be greater than 0");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        site_name: form.site_name.trim(),
        site_code: form.site_code.trim() || null,
        address: form.address.trim() || null,
        latitude,
        longitude,
        radius_meters: radius,
        is_active: form.is_active,
      };

      const result = editing
        ? await (supabase as any).from("attendance_sites").update(payload).eq("id", editing.id)
        : await (supabase as any).from("attendance_sites").insert(payload);

      if (result.error) throw result.error;
      toast.success(editing ? "Site updated" : "Site added");
      setOpen(false);
      await loadSites();
    } catch (err: any) {
      toast.error(err.message || "Failed to save site");
    } finally {
      setSaving(false);
    }
  }

  async function disableSite(site: AttendanceSite) {
    const { error } = await (supabase as any)
      .from("attendance_sites")
      .update({ is_active: !site.is_active })
      .eq("id", site.id);

    if (error) toast.error(error.message || "Failed to update site");
    else {
      toast.success(site.is_active ? "Site disabled" : "Site enabled");
      await loadSites();
    }
  }

  async function deleteSite(site: AttendanceSite) {
    if (site.is_default) {
      toast.error("Default site cannot be deleted");
      return;
    }
    if (!window.confirm(`Delete site ${site.site_name}? This is intended for development only.`)) return;

    const { error } = await (supabase as any).from("attendance_sites").delete().eq("id", site.id);
    if (error) toast.error(error.message || "Failed to delete site");
    else {
      toast.success("Site deleted");
      await loadSites();
    }
  }

  return (
    <div className="p-4 md:p-8 space-y-6 text-white min-h-[calc(100vh-100px)] bg-[#0B1528] rounded-2xl border border-slate-800 shadow-2xl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight flex items-center gap-2">
            <MapPin className="h-8 w-8 text-blue-500" />
            Attendance Sites
          </h1>
          <p className="text-slate-400 mt-1">Manage office and field locations used for GPS attendance.</p>
        </div>
        <Button onClick={openCreate} className="bg-blue-600 hover:bg-blue-700 text-white font-bold">
          <Plus className="h-4 w-4 mr-2" />
          Add Site
        </Button>
      </div>

      <Card className="bg-slate-900/60 border border-slate-800 text-white">
        <CardHeader className="border-b border-slate-800/80">
          <CardTitle>Sites</CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          {loading ? (
            <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-blue-500" /></div>
          ) : sites.length === 0 ? (
            <div className="py-16 text-center text-slate-400">No attendance sites found.</div>
          ) : (
            <div className="grid gap-3">
              {sites.map((site) => (
                <div key={site.id} className="grid gap-3 rounded-xl border border-slate-800 bg-[#0B1528]/80 p-4 md:grid-cols-[1.4fr_1fr_1fr_auto] md:items-center">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-bold text-slate-100">{site.site_name}</p>
                      {site.is_default && <Badge className="bg-blue-500/10 text-blue-400 border border-blue-500/20">Default</Badge>}
                      <Badge className={site.is_active ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-slate-800 text-slate-400 border border-slate-700"}>
                        {site.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                    <p className="text-xs text-slate-400 mt-1 truncate">{site.address || site.site_code || "No address"}</p>
                  </div>
                  <div className="text-xs text-slate-300">
                    <p className="font-mono">{Number(site.latitude).toFixed(6)}, {Number(site.longitude).toFixed(6)}</p>
                    <p className="text-slate-500 mt-1">Coordinates</p>
                  </div>
                  <div className="text-xs text-slate-300">
                    <p className="font-bold">{site.radius_meters} meters</p>
                    <p className="text-slate-500 mt-1">Radius</p>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="outline" className="border-slate-800 text-slate-300 hover:bg-slate-800" onClick={() => openEdit(site)}>
                      <Edit3 className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="outline" className="border-slate-800 text-slate-300 hover:bg-slate-800" onClick={() => disableSite(site)}>
                      {site.is_active ? "Disable" : "Enable"}
                    </Button>
                    <Button size="sm" variant="outline" className="border-slate-800 text-red-400 hover:bg-red-500/10" onClick={() => deleteSite(site)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl border-slate-800 bg-[#0B1528] text-white">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Site" : "Add Site"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Site Name</Label>
              <Input className={inputClass} value={form.site_name} onChange={(e) => setForm({ ...form, site_name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Site Code</Label>
              <Input className={inputClass} value={form.site_code} onChange={(e) => setForm({ ...form, site_code: e.target.value })} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Address</Label>
              <Input className={inputClass} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Latitude</Label>
              <Input className={inputClass} value={form.latitude} onChange={(e) => setForm({ ...form, latitude: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Longitude</Label>
              <Input className={inputClass} value={form.longitude} onChange={(e) => setForm({ ...form, longitude: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Radius in meters</Label>
              <Input className={inputClass} type="number" min={1} value={form.radius_meters} onChange={(e) => setForm({ ...form, radius_meters: e.target.value })} />
            </div>
            <div className="rounded-md border border-slate-800 bg-slate-950/40 p-3">
              <div className="flex items-center justify-between gap-4">
                <Label>Active status</Label>
                <Switch checked={form.is_active} onCheckedChange={(checked) => setForm({ ...form, is_active: checked })} />
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="outline" className="border-slate-800 text-slate-300 hover:bg-slate-800" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={saveSite} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white font-bold">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Site"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
