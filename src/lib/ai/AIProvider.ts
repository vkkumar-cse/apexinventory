export interface AIProvider {
  improveGrammar(text: string): Promise<string>;
  rewriteProfessionally(text: string): Promise<string>;
  generateSummary(params: {
    problemDescription: string;
    activities: string[];
    customActions: string[];
    partsUsed: { name: string; quantity: number }[];
  }): Promise<string>;
}
