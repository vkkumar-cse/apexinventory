import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Plus, Trash, Minus, ShoppingCart } from "lucide-react";

interface ChargesCardProps {
  report: any;
  parts: any[];
  inventoryProducts: any[];
  onChangeReport: (fields: any) => void;
  onChangeParts: (updatedParts: any[]) => void;
}

export function ChargesCard({
  report,
  parts,
  inventoryProducts,
  onChangeReport,
  onChangeParts,
}: ChargesCardProps) {
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);

  const handleSearch = (query: string) => {
    setSearch(query);
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }
    const filtered = inventoryProducts.filter(
      (p) =>
        p.name?.toLowerCase().includes(query.toLowerCase()) ||
        p.sku?.toLowerCase().includes(query.toLowerCase())
    );
    setSearchResults(filtered.slice(0, 5));
  };

  const handleAddPart = (product: any) => {
    const existing = parts.find((p) => p.product_id === product.id);
    let updated: any[];
    if (existing) {
      updated = parts.map((p) =>
        p.product_id === product.id
          ? { ...p, quantity: p.quantity + 1, total_price: Number(((p.quantity + 1) * p.unit_price).toFixed(2)) }
          : p
      );
    } else {
      updated = [
        ...parts,
        {
          product_id: product.id,
          part_number: product.sku || "",
          item_name: product.name,
          quantity: 1,
          unit_price: Number(product.price || 0),
          total_price: Number(product.price || 0),
        },
      ];
    }
    onChangeParts(updated);
    recalculateSpares(updated);
    setSearch("");
    setSearchResults([]);
  };

  const handleUpdateQty = (productId: string, diff: number) => {
    const updated = parts
      .map((p) => {
        if (p.product_id === productId) {
          const newQty = Math.max(1, p.quantity + diff);
          return {
            ...p,
            quantity: newQty,
            total_price: Number((newQty * p.unit_price).toFixed(2)),
          };
        }
        return p;
      });
    onChangeParts(updated);
    recalculateSpares(updated);
  };

  const handleRemovePart = (productId: string) => {
    const updated = parts.filter((p) => p.product_id !== productId);
    onChangeParts(updated);
    recalculateSpares(updated);
  };

  const recalculateSpares = (currentParts: any[]) => {
    const sum = currentParts.reduce((acc, p) => acc + (p.total_price || 0), 0);
    const sparesSum = Number(sum.toFixed(2));
    
    const labour = Number(report.labour_charges || 0);
    const travel = Number(report.travel_charges || 0);
    const other = Number(report.other_charges || 0);
    
    onChangeReport({
      spare_charges: sparesSum,
      total_charges: Number((labour + sparesSum + travel + other).toFixed(2)),
    });
  };

  const handleChargeChange = (field: string, val: number) => {
    const charges = {
      labour_charges: Number(report.labour_charges || 0),
      spare_charges: Number(report.spare_charges || 0),
      travel_charges: Number(report.travel_charges || 0),
      other_charges: Number(report.other_charges || 0),
      [field]: val,
    };

    const sum =
      charges.labour_charges +
      charges.spare_charges +
      charges.travel_charges +
      charges.other_charges;

    onChangeReport({
      ...charges,
      total_charges: Number(sum.toFixed(2)),
    });
  };

  return (
    <Card className="bg-slate-900 border-slate-800 text-white shadow-xl max-w-full">
      <CardHeader>
        <CardTitle className="text-lg font-bold flex items-center gap-2 text-blue-400">
          Step 5: Spare Parts & Charges
        </CardTitle>
        <CardDescription className="text-xs text-slate-400">
          Log components changed from inventory and billing rates.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        
        {/* Product Search */}
        <div className="space-y-2 relative">
          <Label className="text-xs font-semibold text-slate-300">Add Spare Parts from Inventory</Label>
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4.5 w-4.5 text-slate-500" />
            <Input
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Search products by name or SKU..."
              className="bg-slate-950 border-slate-800 text-white pl-10 min-h-10 text-sm"
            />
          </div>

          {/* Search Dropdown */}
          {searchResults.length > 0 && (
            <div className="absolute z-20 left-0 right-0 bg-slate-950 border border-slate-800 rounded-lg shadow-xl overflow-hidden mt-1 divide-y divide-slate-900">
              {searchResults.map((product) => (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => handleAddPart(product)}
                  className="w-full flex items-center justify-between p-3 text-left hover:bg-slate-900 transition text-xs"
                >
                  <div>
                    <div className="font-bold text-slate-200">{product.name}</div>
                    <div className="text-[10px] text-slate-500 font-mono">SKU: {product.sku || "N/A"}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-blue-400 font-semibold">â‚¹{product.price || 0}</span>
                    <Plus className="w-3.5 h-3.5 text-slate-400" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Selected Spares Table */}
        {parts.length > 0 && (
          <div className="border border-slate-850 rounded-xl overflow-hidden bg-slate-950/20">
            <div className="p-3 bg-slate-950/60 border-b border-slate-850 flex items-center gap-2">
              <ShoppingCart className="w-4 h-4 text-blue-400" />
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Replaced Components</span>
            </div>
            <div className="divide-y divide-slate-850 max-h-[180px] overflow-y-auto">
              {parts.map((p) => (
                <div key={p.product_id} className="flex items-center justify-between p-3 text-xs gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-slate-200 truncate">{p.item_name}</div>
                    <div className="text-[10px] text-slate-500 font-mono">PN: {p.part_number || "N/A"} Â· â‚¹{p.unit_price}/unit</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => handleUpdateQty(p.product_id, -1)}
                      className="h-7 w-7 bg-slate-900 border border-slate-800 hover:bg-slate-950 text-white rounded-md"
                    >
                      <Minus className="w-3 h-3" />
                    </Button>
                    <span className="font-bold w-6 text-center text-slate-200">{p.quantity}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => handleUpdateQty(p.product_id, 1)}
                      className="h-7 w-7 bg-slate-900 border border-slate-800 hover:bg-slate-950 text-white rounded-md"
                    >
                      <Plus className="w-3 h-3" />
                    </Button>
                    <span className="w-16 text-right font-bold text-slate-300">â‚¹{p.total_price}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemovePart(p.product_id)}
                      className="h-7 w-7 text-red-500 hover:text-red-400 hover:bg-slate-950"
                    >
                      <Trash className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Charges Inputs */}
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-4 pt-3 border-t border-slate-850">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-slate-300">Labour (â‚¹)</Label>
            <Input
              type="number"
              value={report.labour_charges}
              onChange={(e) => handleChargeChange("labour_charges", Number(e.target.value))}
              placeholder="0.00"
              className="bg-slate-950 border-slate-800 text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-slate-300">Spares cost (â‚¹)</Label>
            <Input
              type="number"
              value={report.spare_charges}
              disabled
              className="bg-slate-950/60 border-slate-800 text-sm text-slate-400 cursor-not-allowed"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-slate-300">Travel (â‚¹)</Label>
            <Input
              type="number"
              value={report.travel_charges}
              onChange={(e) => handleChargeChange("travel_charges", Number(e.target.value))}
              placeholder="0.00"
              className="bg-slate-950 border-slate-800 text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-slate-300">Other (â‚¹)</Label>
            <Input
              type="number"
              value={report.other_charges}
              onChange={(e) => handleChargeChange("other_charges", Number(e.target.value))}
              placeholder="0.00"
              className="bg-slate-950 border-slate-800 text-sm"
            />
          </div>
        </div>

        {/* Dynamic Grand Total */}
        <div className="bg-slate-950/60 border border-slate-850 p-4 rounded-xl flex items-center justify-between mt-2">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Total service charges</span>
          <span className="text-xl font-extrabold text-blue-400">â‚¹{report.total_charges || "0.00"}</span>
        </div>
      </CardContent>
    </Card>
  );
}
