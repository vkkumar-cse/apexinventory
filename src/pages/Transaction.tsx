import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";

type Tx = {
  id: string;
  type: string;
  quantity: number;
  note: string | null;
  created_at: string;
  product_id: string;
  user_id: string | null;
  products: { name: string; part_no: string | null } | null;
  performed_by?: string;
};

export default function Transactions() {
  const [items, setItems] = useState<Tx[]>([]);
  const [dateFilter, setDateFilter] = useState("");

  useEffect(() => {
    load();
  }, []);

async function load() {
  const { data: txData, error: txError } = await supabase
    .from("transactions")
    .select(`
      *,
      products(name, part_no)
    `)
    .order("created_at", { ascending: false });

  if (txError) {
    console.error(txError);
    return;
  }

  const userIds = Array.from(
    new Set((txData ?? []).map((t: any) => t.user_id).filter(Boolean))
  );

  let profileMap: Record<string, string> = {};

  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, display_name, email")
      .in("id", userIds);

    (profiles ?? []).forEach((p: any) => {
profileMap[String(p.id)] = p.display_name ?? p.email ?? "Unknown";    });
  }

  setItems(
    ((txData as any) ?? []).map((t: any) => ({
      ...t,
performed_by:
  profileMap[String(t.user_id)] ||
  profileMap[t.user_id as string] ||
  "Unknown",    }))
  );
}
 
const filteredItems = items.filter((t) => {
  if (!dateFilter) return true;
  return new Date(t.created_at).toISOString().slice(0, 10) === dateFilter;
});

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          Transaction History
        </h1>
        <p className="text-muted-foreground mt-1">
          Complete inventory movement history.
        </p>
        <div className="mt-4 max-w-xs">
  <input
    type="date"
    value={dateFilter}
    onChange={(e) => setDateFilter(e.target.value)}
    className="w-full rounded-md border border-border bg-background px-3 py-2"
  />
</div>
      </div>

      <div className="grid gap-4">
        {filteredItems.map((t) => (
          <Card key={t.id} className="p-5">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <p className="font-semibold">
                  {t.products?.name ?? "Unknown Product"}
                </p>

                <p className="text-sm text-muted-foreground">
                  {t.products?.part_no ?? "—"}
                </p>

                <p className="text-sm mt-2">
                  Type: <b>{t.type}</b>
                </p>

                <p className="text-sm">
                  Quantity: <b>{t.quantity}</b>
                </p>
                <p className="text-sm">
  By: <b>{t.performed_by}</b>
</p>

                {t.note && (
                  <p className="text-sm text-muted-foreground mt-1">
                    {t.note}
                  </p>
                )}
              </div>

              <div className="text-sm text-muted-foreground">
                {new Date(t.created_at).toLocaleString()}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}