import { AIProvider } from "./AIProvider";

// Local NLP Rules Helper
export class LocalProvider implements AIProvider {
  // Simulate AI latency for realistic UI experience
  private async delay(ms: number = 600) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Predefined grammar replacement dictionary for engineers' shorthand
  private grammarMap: Record<string, string> = {
    "machine not working": "The equipment was inspected after the reported issue.",
    "machine not switching on": "The equipment was inspected following the report that it was not powering on.",
    "cable changed": "The damaged cable was replaced successfully.",
    "testing done": "Functional testing was completed and the equipment is operating normally.",
    "measurement inaccurate": "The measurement calibration was verified and aligned to restore precision.",
    "software communication error": "The software configuration and communication links were diagnosed and restored.",
    "leakage checked": "Electrical insulation and potential leakage were checked and verified safe.",
    "lubrication done": "All linear slide tracks and bearings were cleaned and lubricated.",
    "alignment completed": "Mechanical alignment on the main axis was calibrated and secured.",
  };

  private searchPhrase(phrase: string): string {
    const clean = phrase.toLowerCase().trim().replace(/[.,;:!?]$/, "");
    // Check direct match
    if (this.grammarMap[clean]) {
      return this.grammarMap[clean];
    }
    // Check partial matches
    for (const [key, value] of Object.entries(this.grammarMap)) {
      if (clean.includes(key) || key.includes(clean)) {
        return value;
      }
    }
    // Default fallback: Capitalize and clean structure
    if (phrase.length === 0) return "";
    let formatted = phrase.trim();
    formatted = formatted.charAt(0).toUpperCase() + formatted.slice(1);
    if (!formatted.endsWith(".")) {
      formatted += ".";
    }
    return formatted;
  }

  async improveGrammar(text: string): Promise<string> {
    await this.delay();
    if (!text || text.trim() === "") return "";
    
    // Split by lines or semicolons
    const clauses = text.split(/[\n;,\.]+/).filter(c => c.trim().length > 0);
    const converted = clauses.map(c => this.searchPhrase(c.trim()));
    return converted.join("\n");
  }

  async rewriteProfessionally(text: string): Promise<string> {
    await this.delay(800);
    if (!text || text.trim() === "") return "";
    
    // Make the tone more passive and formal, standard for industrial reports
    const rawLines = text.split(/[\n;,\.]+/).filter(c => c.trim().length > 0);
    const professionalLines = rawLines.map(line => {
      const trimmed = line.trim().toLowerCase();
      if (trimmed.includes("machine not working") || trimmed.includes("not switching on")) {
        return "The system equipment was subjected to testing and diagnosis due to operational failure.";
      }
      if (trimmed.includes("cable changed") || trimmed.includes("replaced")) {
        return `The fault was isolated to the cabling; replacement of the defective component was executed.`;
      }
      if (trimmed.includes("testing done") || trimmed.includes("ok")) {
        return "System parameters were validated and verified to conform to required factory specifications.";
      }
      
      // General passive rewrite rules
      let s = line.trim();
      s = s.replace(/^(i|we)\s+/i, ""); // Remove first person pronoun
      s = s.replace(/^changed\s+/i, "Replaced ");
      s = s.replace(/^fixed\s+/i, "Repaired ");
      s = s.replace(/^done\s+/i, "Completed ");
      s = s.charAt(0).toUpperCase() + s.slice(1);
      if (!s.endsWith(".")) s += ".";
      
      return `Detailed inspection was carried out: ${s.toLowerCase()}`;
    });
    
    return professionalLines.join(" ");
  }

  async generateSummary(params: {
    problemDescription: string;
    activities: string[];
    customActions: string[];
    partsUsed: { name: string; quantity: number }[];
  }): Promise<string> {
    await this.delay(1000);
    const { problemDescription, activities, customActions, partsUsed } = params;
    
    const paragraphs: string[] = [];
    
    // 1. Problem introduction
    if (problemDescription && problemDescription.trim() !== "") {
      const cleanProb = problemDescription.trim().replace(/\.$/, "");
      paragraphs.push(`The equipment was inspected following the reported issue: "${cleanProb}".`);
    } else {
      paragraphs.push(`The equipment was inspected for routine scheduled service and general maintenance diagnostics.`);
    }
    
    // 2. Activities completed
    if (activities.length > 0) {
      // Grouping actions in a summary line (e.g. general cleaning, calibration, mechanical adjustments)
      const actionSummaries: string[] = [];
      const hasActivity = (keyword: string) => activities.some(a => a.toLowerCase().includes(keyword));
      
      if (hasActivity("clean")) actionSummaries.push("general cleaning");
      if (hasActivity("lubricat") || hasActivity("bearings")) actionSummaries.push("lubrication");
      if (hasActivity("calibrat") || hasActivity("accurac")) actionSummaries.push("calibration");
      if (hasActivity("belt") || hasActivity("tight") || hasActivity("align")) actionSummaries.push("mechanical alignment");
      if (hasActivity("cable") || hasActivity("wiring") || hasActivity("sensor")) actionSummaries.push("electrical inspection");
      if (hasActivity("soft") || hasActivity("firm") || hasActivity("backup")) actionSummaries.push("software and firmware update");
      if (hasActivity("test") || hasActivity("run")) actionSummaries.push("functional testing");
      if (hasActivity("hand") || hasActivity("demonstrat") || hasActivity("train")) actionSummaries.push("formal handover and demonstration");
      
      if (actionSummaries.length > 0) {
        let actionStr = "";
        if (actionSummaries.length === 1) {
          actionStr = actionSummaries[0];
        } else {
          actionStr = actionSummaries.slice(0, -1).join(", ") + ", and " + actionSummaries[actionSummaries.length - 1];
        }
        paragraphs.push(`Necessary maintenance procedures, including ${actionStr}, were completed successfully.`);
      }
    }
    
    // 3. Custom actions and replaced parts
    const specificDetailParts: string[] = [];
    if (customActions && customActions.length > 0) {
      specificDetailParts.push(...customActions.map(act => act.trim().replace(/\.$/, "")));
    }
    
    if (partsUsed && partsUsed.length > 0) {
      const partsStr = partsUsed.map(p => `${p.name} (Qty: ${p.quantity})`).join(", ");
      specificDetailParts.push(`replaced the following parts: ${partsStr}`);
    }
    
    if (specificDetailParts.length > 0) {
      const detailStr = specificDetailParts.join(", and ");
      paragraphs.push(`Specifically, the service engineer ${detailStr.charAt(0).toLowerCase() + detailStr.slice(1)}.`);
    }
    
    // 4. Final verification statement
    paragraphs.push("The equipment was verified to be operating within acceptable tolerance limits and was handed over to the customer in good working condition.");
    
    return paragraphs.join(" ");
  }
}
