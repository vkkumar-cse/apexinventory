import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { FolderTree, Tag } from "lucide-react";

type Cat = { id: string; name: string };

export default function Categories() {
  const [tops, setTops] = useState<Cat[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    document.title = "Categories · Forge Inventory";
    (async () => {
      const { data } = await (supabase as any).from("categories").select("id,name").is("parent_id", null).order("name");
      setTops((data as Cat[]) ?? []);
      // Count products per label
      const { data: prods } = await supabase.from("products").select("labels");
      const c: Record<string, number> = { OPTO: 0, NPD: 0 };
      (prods ?? []).forEach((p: any) => (p.labels ?? []).forEach((l: string) => { c[l] = (c[l] ?? 0) + 1; }));
      setCounts(c);
    })();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Categories</h1>
        <p className="text-muted-foreground mt-1">Two top-level groups. A product can belong to either or both via labels.</p>
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        {tops.map(c => (
          <Link key={c.id} to={`/categories/${c.id}`}>
            <Card className="p-8 hover:border-primary/50 hover:shadow-glow transition group">
              <div className="flex items-center gap-4">
                <div className="h-16 w-16 rounded-xl gradient-primary text-primary-foreground grid place-items-center shadow-glow">
                  <FolderTree className="h-8 w-8" />
                </div>
                <div>
                  <p className="text-2xl font-bold tracking-tight">{c.name}</p>
                  <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                    <Tag className="h-3 w-3" />{counts[c.name] ?? 0} products labelled {c.name}
                  </p>
                </div>
              </div>
            </Card>
          </Link>
        ))}
        {tops.length === 0 && <Card className="p-12 col-span-full text-center text-muted-foreground">Setting up categories…</Card>}
      </div>
    </div>
  );
}
