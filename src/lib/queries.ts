import { supabase } from "@/integrations/supabase/client";

export type ProductRow = {
  id: string;
  name: string;
  type: "raw" | "spare" | "finished";
  stock: number;
  reorder_level: number;
  location: string | null;
  supplier_id: string | null;
  created_at: string;
};

export async function listProducts() {
  const { data, error } = await supabase
    .from("products")
    .select("*, suppliers(name)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function listSuppliers() {
  const { data, error } = await supabase.from("suppliers").select("*").order("name");
  if (error) throw error;
  return data ?? [];
}

export function stockStatus(stock: number, reorder: number) {
  if (stock <= 0) return { label: "Out of Stock", tone: "destructive" as const };
  if (stock <= reorder) return { label: "Low Stock", tone: "warning" as const };
  return { label: "In Stock", tone: "success" as const };
}
