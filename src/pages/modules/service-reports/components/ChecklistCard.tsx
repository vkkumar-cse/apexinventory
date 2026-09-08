import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Trash, Search, ChevronDown, ChevronUp, Wrench } from "lucide-react";
import { SERVICE_CHECKLIST } from "@/lib/serviceReportChecklist";

interface ChecklistCardProps {
  activities: any[];
  onChange: (updatedActivities: any[]) => void;
}

export function ChecklistCard({ activities, onChange }: ChecklistCardProps) {
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [customText, setCustomText] = useState("");

  const handleToggleActivity = (categoryName: string, name: string, checked: boolean) => {
    const existingIdx = activities.findIndex(
      (a) => a.category === categoryName && a.activity_name === name && !a.is_custom
    );

    let updated = [...activities];
    if (existingIdx > -1) {
      updated[existingIdx] = { ...updated[existingIdx], is_checked: checked };
    } else {
      updated.push({
        category: categoryName,
        activity_name: name,
        is_checked: checked,
        is_custom: false,
      });
    }
    onChange(updated);
  };

  const handleAddCustom = () => {
    if (!customText.trim()) return;
    const updated = [
      ...activities,
      {
        category: "Custom Actions",
        activity_name: customText.trim(),
        is_checked: true,
        is_custom: true,
      },
    ];
    onChange(updated);
    setCustomText("");
  };

  const handleRemoveCustom = (name: string) => {
    const updated = activities.filter((a) => !(a.is_custom && a.activity_name === name));
    onChange(updated);
  };

  const toggleCategory = (cat: string) => {
    setCollapsed((prev) => ({ ...prev, [cat]: !prev[cat] }));
  };

  // Filter service categories based on search
  const filteredChecklist = Object.entries(SERVICE_CHECKLIST).reduce(
    (acc, [category, items]) => {
      const matched = items.filter((item) =>
        item.toLowerCase().includes(search.toLowerCase())
      );
      if (matched.length > 0) {
        acc[category] = matched;
      }
      return acc;
    },
    {} as Record<string, string[]>
  );

  const customActions = activities.filter((a) => a.is_custom);

  return (
    <Card className="bg-slate-900 border-slate-800 text-white shadow-xl max-w-full">
      <CardHeader>
        <CardTitle className="text-lg font-bold flex items-center gap-2 text-blue-400">
          Step 4: Service Activities & Checklist
        </CardTitle>
        <CardDescription className="text-xs text-slate-400">
          Check off tasks completed. Add custom actions if necessary.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Search bar */}
        <div className="relative">
          <Search className="absolute left-3 top-3.5 h-4.5 w-4.5 text-slate-500" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search service checklist tasks..."
            className="bg-slate-950 border-slate-800 text-white pl-10 min-h-11"
          />
        </div>

        {/* Categories list */}
        <div className="space-y-3 max-h-[350px] overflow-y-auto pr-1">
          {Object.entries(filteredChecklist).map(([cat, items]) => {
            const isCollapsed = !!collapsed[cat];
            return (
              <div key={cat} className="border border-slate-850 bg-slate-950/20 rounded-xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleCategory(cat)}
                  className="w-full flex items-center justify-between p-3.5 bg-slate-950/60 hover:bg-slate-950 border-b border-slate-850 transition"
                >
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    {cat} ({items.length})
                  </span>
                  {isCollapsed ? <ChevronDown className="w-4 h-4 text-slate-500" /> : <ChevronUp className="w-4 h-4 text-slate-500" />}
                </button>

                {!isCollapsed && (
                  <div className="p-3.5 grid gap-2 sm:grid-cols-2">
                    {items.map((item) => {
                      const isChecked = activities.some(
                        (a) => a.category === cat && a.activity_name === item && a.is_checked && !a.is_custom
                      );
                      return (
                        <div key={item} className="flex items-start space-x-2 py-0.5">
                          <Checkbox
                            id={`act-${cat}-${item}`}
                            checked={isChecked}
                            onCheckedChange={(checked) => handleToggleActivity(cat, item, !!checked)}
                            className="border-slate-700 bg-slate-900 data-[state=checked]:bg-blue-600 data-[state=checked]:text-white h-4.5 w-4.5 rounded mt-0.5"
                          />
                          <label
                            htmlFor={`act-${cat}-${item}`}
                            className="text-xs text-slate-300 leading-tight cursor-pointer select-none"
                          >
                            {item}
                          </label>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Custom Actions log */}
        <div className="space-y-3 pt-3 border-t border-slate-850">
          <Label className="text-xs font-bold text-slate-400 uppercase">Custom Actions</Label>
          <div className="flex gap-2">
            <Input
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              placeholder="Describe other specific work carried out..."
              className="bg-slate-950 border-slate-800 min-h-11"
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddCustom())}
            />
            <Button
              type="button"
              onClick={handleAddCustom}
              className="bg-blue-600 hover:bg-blue-700 text-white h-11 shrink-0 font-bold px-4"
            >
              <Plus className="w-4.5 h-4.5" />
            </Button>
          </div>

          {/* List of custom actions */}
          {customActions.length > 0 && (
            <div className="space-y-2 bg-slate-950/40 p-3 border border-slate-850 rounded-xl">
              {customActions.map((c) => (
                <div key={c.activity_name} className="flex items-center justify-between bg-slate-900 border border-slate-800 rounded-lg p-2.5">
                  <span className="text-xs text-slate-200">{c.activity_name}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRemoveCustom(c.activity_name)}
                    className="text-red-500 hover:text-red-400 hover:bg-slate-950 h-7 w-7"
                  >
                    <Trash className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
