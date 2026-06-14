import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Tx = {
  id: string;
  transaction_number?: string | null;
  type: string;
  quantity: number;
  note: string | null;
  created_at: string;
  product_id: string | null;
  user_id: string | null;
  products: { name: string; part_no: string | null } | null;
  created_by_name: string;
};

export default function Transactions() {
  const [items, setItems] = useState<Tx[]>([]);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "purchase" | "usage">("all");

  useEffect(() => {
    document.title = "Transaction History · Apex Software";
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
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, display_name, email")
        .in("id", userIds);

      if (profilesError) {
        console.error(profilesError);
      } else {
        (profiles ?? []).forEach((p: any) => {
          profileMap[String(p.id)] = p.display_name ?? p.email ?? "Unknown";
        });
      }
    }

    setItems(
      ((txData as any) ?? []).map((t: any) => ({
        ...t,
        created_by_name:
          profileMap[String(t.user_id)] ||
          profileMap[t.user_id as string] ||
          "Unknown",
      }))
    );
  }

  const filteredItems = useMemo(() => {
    const searchTerm = productSearch.trim().toLowerCase();

    return items
      .slice()
      .sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )
      .filter((t) => {
        if (typeFilter !== "all" && t.type !== typeFilter) {
          return false;
        }

        const transactionDate = new Date(t.created_at).toISOString().slice(0, 10);
        if (fromDate && transactionDate < fromDate) {
          return false;
        }
        if (toDate && transactionDate > toDate) {
          return false;
        }

        if (searchTerm) {
          const productName = t.products?.name ?? "";
          return productName.toLowerCase().includes(searchTerm);
        }

        return true;
      });
  }, [items, fromDate, toDate, productSearch, typeFilter]);

  return (
    <div className="max-w-full space-y-6 overflow-x-hidden">
      <div className="min-w-0">
        <h1 className="break-words text-2xl font-bold tracking-tight sm:text-3xl">
          Transaction History
        </h1>
        <p className="text-muted-foreground mt-1">
          Complete inventory movement history.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[repeat(5,minmax(0,1fr))]">
        <div className="space-y-2">
          <Label htmlFor="fromDate">From Date</Label>
          <Input
            id="fromDate"
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="toDate">To Date</Label>
          <Input
            id="toDate"
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="productSearch">Search Product</Label>
          <Input
            id="productSearch"
            type="text"
            value={productSearch}
            placeholder="Search product"
            onChange={(e) => setProductSearch(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="typeFilter">Type</Label>
          <select
            id="typeFilter"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as "all" | "purchase" | "usage")}
            className="h-11 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none transition focus:border-primary focus:ring-1 focus:ring-primary"
          >
            <option value="all">All</option>
            <option value="purchase">Purchase</option>
            <option value="usage">Usage</option>
          </select>
        </div>

        <div className="flex items-end justify-stretch lg:justify-end">
          <Button
            type="button"
            variant="secondary"
            className="w-full lg:w-auto"
            onClick={() => {
              setFromDate("");
              setToDate("");
            }}
          >
            Clear Dates
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-secondary/10">
        <div className="space-y-3 p-3 md:hidden">
          {filteredItems.length === 0 ? (
            <div className="rounded-lg bg-slate-950/80 px-4 py-6 text-center text-sm text-muted-foreground">
              No transactions match the selected filters.
            </div>
          ) : (
            filteredItems.map((t, index) => {
              const displayNumber = t.transaction_number?.trim() || `TXN-${index + 1}`;

              return (
                <div key={t.id} className="rounded-lg border border-border/60 bg-slate-950/80 p-4">
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="break-all font-mono text-xs text-primary">{displayNumber}</p>
                      <p className="mt-1 break-words font-semibold text-foreground">{t.products?.name ?? "Unknown Product"}</p>
                    </div>
                    <span className="shrink-0 rounded-md border border-border px-2 py-1 text-xs capitalize text-muted-foreground">
                      {t.type}
                    </span>
                  </div>
                  <div className="mt-3 grid gap-2 text-sm text-muted-foreground">
                    <div className="flex justify-between gap-3">
                      <span>Date</span>
                      <span className="text-right text-foreground">{new Date(t.created_at).toLocaleDateString()}</span>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span>Quantity</span>
                      <span className="font-mono text-foreground">{t.quantity}</span>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span>Created By</span>
                      <span className="break-words text-right text-foreground">{t.created_by_name}</span>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span>Created At</span>
                      <span className="text-right text-foreground">{new Date(t.created_at).toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="hidden md:block">
          <table className="min-w-full border-collapse">
            <thead className="bg-white">
              <tr>
                <th className="border-b border-border px-4 py-3 text-left text-sm font-semibold text-black">
                  Transaction No
                </th>
                <th className="border-b border-border px-4 py-3 text-left text-sm font-semibold text-black">
                  Date
                </th>
                <th className="border-b border-border px-4 py-3 text-left text-sm font-semibold text-black">
                  Product
                </th>
                <th className="border-b border-border px-4 py-3 text-left text-sm font-semibold text-black">
                  Type
                </th>
                <th className="border-b border-border px-4 py-3 text-right text-sm font-semibold text-black">
                  Quantity
                </th>
                <th className="border-b border-border px-4 py-3 text-left text-sm font-semibold text-black">
                  Created By
                </th>
                <th className="border-b border-border px-4 py-3 text-left text-sm font-semibold text-black">
                  Created At
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.length === 0 ? (
                <tr className="bg-slate-950/80">
                  <td colSpan={7} className="px-4 py-6 text-center text-sm text-muted-foreground">
                    No transactions match the selected filters.
                  </td>
                </tr>
              ) : (
                filteredItems.map((t, index) => {
                  const displayNumber =
                    t.transaction_number?.trim() || `TXN-${index + 1}`;

                  return (
                    <tr
                      key={t.id}
                      className="border-b border-border/50 bg-slate-950/80 hover:bg-slate-900"
                    >
                      <td className="px-4 py-3 text-sm font-medium text-foreground">
                        {displayNumber}
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {new Date(t.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-sm text-foreground">
                        {t.products?.name ?? "Unknown Product"}
                      </td>
                      <td className="px-4 py-3 text-sm text-foreground">
                        {t.type}
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-foreground">
                        {t.quantity}
                      </td>
                      <td className="px-4 py-3 text-sm text-foreground">
                        {t.created_by_name}
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {new Date(t.created_at).toLocaleString()}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
