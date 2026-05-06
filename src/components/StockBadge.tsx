import { cn } from "@/lib/utils";
import { stockStatus } from "@/lib/queries";

export function StockBadge({ stock, reorder }: { stock: number; reorder: number }) {
  const s = stockStatus(stock, reorder);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium border",
        s.tone === "success" && "bg-success/10 text-success border-success/30",
        s.tone === "warning" && "bg-warning/10 text-warning border-warning/30",
        s.tone === "destructive" && "bg-destructive/10 text-destructive border-destructive/30",
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full",
        s.tone === "success" && "bg-success",
        s.tone === "warning" && "bg-warning",
        s.tone === "destructive" && "bg-destructive"
      )} />
      {s.label}
    </span>
  );
}
