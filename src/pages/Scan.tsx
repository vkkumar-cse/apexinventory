import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScanLine, Package } from "lucide-react";

export default function Scan() {
  const navigate = useNavigate();
  const [recent, setRecent] = useState<{ id: string; name: string }[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    document.title = "Scan · Forge Inventory";
    supabase.from("products").select("id,name").order("updated_at", { ascending: false }).limit(8)
      .then(({ data }) => setRecent(data ?? []));
  }, []);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="text-center">
        <div className="inline-flex h-16 w-16 rounded-2xl gradient-primary items-center justify-center shadow-glow mb-4">
          <ScanLine className="h-8 w-8 text-primary-foreground" />
        </div>
        <h1 className="text-3xl font-bold tracking-tight">Scan a product</h1>
        <p className="text-muted-foreground mt-2">Point your phone camera at any printed QR. Or paste a product ID below.</p>
      </div>

      <Card className="p-6">
        <form onSubmit={e => { e.preventDefault(); if (search.trim()) navigate(`/product/${search.trim()}`); }} className="flex gap-2">
          <Input placeholder="Paste product ID or QR URL" value={search}
            onChange={e => {
              const v = e.target.value;
              const m = v.match(/product\/([a-f0-9-]+)/i);
              setSearch(m ? m[1] : v);
            }} />
          <Button type="submit">Open</Button>
        </form>
      </Card>

      <Card className="p-6">
        <h2 className="font-semibold mb-3">Recently updated</h2>
        <div className="space-y-2">
          {recent.map(p => (
            <button key={p.id} onClick={() => navigate(`/product/${p.id}`)}
              className="w-full flex items-center gap-3 p-3 rounded-lg bg-secondary/40 hover:bg-secondary text-left">
              <Package className="h-4 w-4 text-primary" />
              <span className="font-medium">{p.name}</span>
            </button>
          ))}
        </div>
      </Card>
    </div>
  );
}
