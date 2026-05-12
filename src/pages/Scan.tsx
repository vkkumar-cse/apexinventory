import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScanLine, Package } from "lucide-react";
import { toast } from "sonner";
import { CameraScanner } from "@/components/CameraScanner";

export default function Scan() {
  const navigate = useNavigate();
  const [recent, setRecent] = useState<{ id: string; code: number; part_no: string | null; name: string }[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    document.title = "Scan · Apex Inventory";
    supabase.from("products").select("id,code,part_no,name").order("updated_at", { ascending: false }).limit(8)
      .then(({ data }) => setRecent((data as any) ?? []));
  }, []);

  function resolveAndGo(raw: string) {
    const trimmed = raw.trim();
    if (!trimmed) return;
    const urlMatch = trimmed.match(/\/product\/([^/?#\s]+)/i);
    if (urlMatch) { navigate(`/product/${urlMatch[1]}`); return; }
    if (/^[A-Za-z0-9_-]+$/.test(trimmed)) { navigate(`/product/${trimmed}`); return; }
    toast.error("Unrecognised QR. Enter a product ID, SKU, or paste a full URL.");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    resolveAndGo(search);
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="text-center">
        <div className="inline-flex h-16 w-16 rounded-2xl gradient-primary items-center justify-center shadow-glow mb-4">
          <ScanLine className="h-8 w-8 text-primary-foreground" />
        </div>
        <h1 className="text-3xl font-bold tracking-tight">Scan a product</h1>
        <p className="text-muted-foreground mt-2">
          Use your phone camera, or enter a product number below.
        </p>
      </div>

      <Card className="p-6">
        <CameraScanner onResult={(text) => resolveAndGo(text)} />
      </Card>

      <Card className="p-6">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Input
            placeholder="Enter ID (e.g. 1 or opt01) or paste QR URL"
            value={search}
            onChange={e => setSearch(e.target.value)}
            inputMode="text"
          />
          <Button type="submit">Open</Button>
        </form>
        <p className="text-xs text-muted-foreground mt-3">
          Accepts a numeric ID, custom SKU (<span className="font-mono">opt01</span>), full URL, or UUID.
        </p>
      </Card>

      <Card className="p-6">
        <h2 className="font-semibold mb-3">Recently updated</h2>
        <div className="space-y-2">
          {recent.map(p => (
            <button
              key={p.id}
              onClick={() => navigate(`/product/${p.part_no ?? p.code}`)}
              className="w-full flex items-center gap-3 p-3 rounded-lg bg-secondary/40 hover:bg-secondary text-left"
            >
              <Package className="h-4 w-4 text-primary" />
              <span className="font-mono text-xs text-primary">{p.part_no ? p.part_no : `#${p.code}`}</span>
              <span className="font-medium">{p.name}</span>
            </button>
          ))}
          {recent.length === 0 && (
            <p className="text-sm text-muted-foreground py-4 text-center">No products yet.</p>
          )}
        </div>
      </Card>
    </div>
  );
}
