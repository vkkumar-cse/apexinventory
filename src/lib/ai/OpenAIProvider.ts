import { AIProvider } from "./AIProvider";
import { LocalProvider } from "./LocalProvider";
import { supabase } from "@/integrations/supabase/client";

export class OpenAIProvider implements AIProvider {
  private localFallback = new LocalProvider();

  async improveGrammar(text: string): Promise<string> {
    try {
      const { data, error } = await supabase.functions.invoke("openai-service", {
        body: { action: "improveGrammar", text }
      });
      if (error) throw error;
      return data.result;
    } catch (err) {
      console.warn("OpenAI Edge Function not configured or returned error. Falling back to local AI rules.", err);
      return this.localFallback.improveGrammar(text);
    }
  }

  async rewriteProfessionally(text: string): Promise<string> {
    try {
      const { data, error } = await supabase.functions.invoke("openai-service", {
        body: { action: "rewriteProfessionally", text }
      });
      if (error) throw error;
      return data.result;
    } catch (err) {
      console.warn("OpenAI Edge Function not configured or returned error. Falling back to local AI rules.", err);
      return this.localFallback.rewriteProfessionally(text);
    }
  }

  async generateSummary(params: {
    problemDescription: string;
    activities: string[];
    customActions: string[];
    partsUsed: { name: string; quantity: number }[];
  }): Promise<string> {
    try {
      const { data, error } = await supabase.functions.invoke("openai-service", {
        body: { action: "generateSummary", params }
      });
      if (error) throw error;
      return data.result;
    } catch (err) {
      console.warn("OpenAI Edge Function not configured or returned error. Falling back to local AI rules.", err);
      return this.localFallback.generateSummary(params);
    }
  }
}
