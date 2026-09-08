import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Sparkles, Check, X, Edit, Clock, ArrowRight } from "lucide-react";
import { aiService } from "@/lib/aiService";
import { toast } from "sonner";

interface AISummaryCardProps {
  report: any;
  activities: any[];
  parts: any[];
  onChangeReport: (fields: any) => void;
}

export function AISummaryCard({
  report,
  activities,
  parts,
  onChangeReport,
}: AISummaryCardProps) {
  const [aiLoading, setAiLoading] = useState(false);
  
  // Suggestion panel state
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [beforeText, setBeforeText] = useState("");
  const [suggestedText, setSuggestedText] = useState("");
  const [isEditingSuggestion, setIsEditingSuggestion] = useState(false);
  const [editedText, setEditedText] = useState("");

  const handleImproveGrammar = async () => {
    const text = report.nature_of_problem || "";
    if (!text.trim()) {
      toast.warning("Please enter some notes in the problem description first.");
      return;
    }
    setAiLoading(true);
    try {
      const suggested = await aiService.improveGrammar(text);
      setBeforeText(text);
      setSuggestedText(suggested);
      setEditedText(suggested);
      setActiveAction("grammar");
      setIsEditingSuggestion(false);
    } catch (err) {
      toast.error("AI service is currently offline.");
    } finally {
      setAiLoading(false);
    }
  };

  const handleRewriteProfessionally = async () => {
    const text = report.nature_of_problem || "";
    if (!text.trim()) {
      toast.warning("Please enter some notes in the problem description first.");
      return;
    }
    setAiLoading(true);
    try {
      const suggested = await aiService.rewriteProfessionally(text);
      setBeforeText(text);
      setSuggestedText(suggested);
      setEditedText(suggested);
      setActiveAction("rewrite");
      setIsEditingSuggestion(false);
    } catch (err) {
      toast.error("AI service is currently offline.");
    } finally {
      setAiLoading(false);
    }
  };

  const handleGenerateSummary = async () => {
    setAiLoading(true);
    try {
      const checkedActs = activities.filter((a) => a.is_checked).map((a) => a.activity_name);
      const customActs = activities.filter((a) => a.is_custom).map((a) => a.activity_name);
      const partsList = parts.map((p) => ({ name: p.item_name, quantity: p.quantity }));
      
      const text = report.nature_of_problem || "";
      const suggested = await aiService.generateSummary({
        problemDescription: text,
        activities: checkedActs,
        customActions: customActs,
        partsUsed: partsList,
      });

      setBeforeText(report.ai_summary || "");
      setSuggestedText(suggested);
      setEditedText(suggested);
      setActiveAction("summary");
      setIsEditingSuggestion(false);
    } catch (err) {
      toast.error("AI service is currently offline.");
    } finally {
      setAiLoading(false);
    }
  };

  const handleAccept = () => {
    const finalVal = isEditingSuggestion ? editedText : suggestedText;
    if (activeAction === "summary") {
      onChangeReport({ ai_summary: finalVal });
    } else {
      onChangeReport({ nature_of_problem: finalVal });
    }
    clearSuggestion();
    toast.success("AI suggestion applied.");
  };

  const handleReject = () => {
    clearSuggestion();
    toast.info("AI suggestion dismissed.");
  };

  const clearSuggestion = () => {
    setActiveAction(null);
    setBeforeText("");
    setSuggestedText("");
    setEditedText("");
    setIsEditingSuggestion(false);
  };

  return (
    <Card className="bg-slate-900 border-slate-800 text-white shadow-xl max-w-full">
      <CardHeader>
        <CardTitle className="text-lg font-bold flex items-center gap-2 text-blue-400">
          Step 6: Problem Description & AI Summary
        </CardTitle>
        <CardDescription className="text-xs text-slate-400">
          Enter problem statements, suggestions, and generate summaries using AI.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        
        {/* Nature of Problem Text Area */}
        <div className="space-y-2">
          <Label className="text-xs font-semibold text-slate-300">Nature of Problem <span className="text-red-500">*</span></Label>
          <Textarea
            value={report.nature_of_problem || ""}
            onChange={(e) => onChangeReport({ nature_of_problem: e.target.value })}
            placeholder="Type notes: e.g. machine not working, cable changed, testing done..."
            className="bg-slate-950 border-slate-800 min-h-[90px] text-sm resize-none"
          />
        </div>

        {/* AI helper action buttons */}
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            disabled={aiLoading}
            onClick={handleImproveGrammar}
            className="bg-slate-850 hover:bg-slate-800 border border-slate-700 text-white text-xs h-9 px-3 font-semibold flex items-center gap-1.5"
          >
            <Sparkles className="w-3.5 h-3.5 text-blue-400" /> Improve Grammar
          </Button>
          <Button
            type="button"
            disabled={aiLoading}
            onClick={handleRewriteProfessionally}
            className="bg-slate-850 hover:bg-slate-800 border border-slate-700 text-white text-xs h-9 px-3 font-semibold flex items-center gap-1.5"
          >
            <Sparkles className="w-3.5 h-3.5 text-purple-400" /> Rewrite Professionally
          </Button>
          <Button
            type="button"
            disabled={aiLoading}
            onClick={handleGenerateSummary}
            className="bg-blue-600 hover:bg-blue-700 text-white text-xs h-9 px-3 font-bold flex items-center gap-1.5"
          >
            <Sparkles className="w-3.5 h-3.5" /> Generate Professional Summary
          </Button>
        </div>

        {/* Live Suggestion Panel (Before / After Comparison) */}
        {suggestedText && (
          <div className="border border-blue-500/30 bg-blue-950/20 p-4 rounded-xl space-y-3 animation-fade-in relative z-10">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-blue-400 flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5" />
                AI Suggestion ({activeAction === "summary" ? "Summary" : "Grammar/Tone Edit"})
              </span>
              {aiLoading && <Clock className="w-4 h-4 animate-spin text-blue-400" />}
            </div>

            {isEditingSuggestion ? (
              <div className="space-y-2">
                <Label className="text-[10px] text-slate-400 block font-bold uppercase">Customize Suggestion</Label>
                <Textarea
                  value={editedText}
                  onChange={(e) => setEditedText(e.target.value)}
                  className="bg-slate-950 border-slate-800 min-h-[90px] text-xs text-slate-200"
                />
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 text-xs">
                <div className="space-y-1">
                  <span className="text-[10px] text-slate-500 font-bold uppercase block">Before</span>
                  <div className="bg-slate-950/60 p-2.5 rounded-lg text-slate-400 border border-slate-900 min-h-[70px] whitespace-pre-line leading-relaxed">
                    {beforeText || "(empty)"}
                  </div>
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] text-blue-400 font-bold uppercase block">Suggested After</span>
                  <div className="bg-slate-950 p-2.5 rounded-lg text-slate-200 border border-slate-850 min-h-[70px] whitespace-pre-line leading-relaxed">
                    {suggestedText}
                  </div>
                </div>
              </div>
            )}

            {/* Accept / Reject / Edit Controls */}
            <div className="flex items-center gap-2 pt-1">
              <Button
                type="button"
                onClick={handleAccept}
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-8 px-3 font-bold flex items-center gap-1"
              >
                <Check className="w-3.5 h-3.5" /> Accept
              </Button>
              <Button
                type="button"
                onClick={handleReject}
                className="bg-red-650 hover:bg-red-700 text-white text-xs h-8 px-3 font-bold flex items-center gap-1"
              >
                <X className="w-3.5 h-3.5" /> Reject
              </Button>
              <Button
                type="button"
                onClick={() => setIsEditingSuggestion(!isEditingSuggestion)}
                className="bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs h-8 px-3 font-bold flex items-center gap-1"
              >
                <Edit className="w-3.5 h-3.5" /> {isEditingSuggestion ? "View Comparison" : "Edit"}
              </Button>
            </div>
          </div>
        )}

        {/* AI Summary main field */}
        <div className="space-y-2 pt-2 border-t border-slate-850">
          <Label className="text-xs font-semibold text-slate-300">Service Professional Summary</Label>
          <Textarea
            value={report.ai_summary || ""}
            onChange={(e) => onChangeReport({ ai_summary: e.target.value })}
            placeholder="Generate using the AI button above, or write custom service summary notes..."
            className="bg-slate-950 border-slate-800 min-h-[90px] text-sm resize-none text-slate-200 italic"
          />
        </div>

        {/* Recommendations & Customer Feedback */}
        <div className="grid gap-3 sm:grid-cols-2 pt-2">
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-slate-300">Suggestions & Recommendations</Label>
            <Textarea
              value={report.suggestions || ""}
              onChange={(e) => onChangeReport({ suggestions: e.target.value })}
              placeholder="Enter details..."
              className="bg-slate-950 border-slate-800 min-h-[70px] text-xs resize-none"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-slate-300">Customer Feedback</Label>
            <Textarea
              value={report.customer_feedback || ""}
              onChange={(e) => onChangeReport({ customer_feedback: e.target.value })}
              placeholder="Enter feedback..."
              className="bg-slate-950 border-slate-800 min-h-[70px] text-xs resize-none"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
