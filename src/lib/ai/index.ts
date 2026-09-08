import { AIProvider } from "./AIProvider";
import { LocalProvider } from "./LocalProvider";
import { OpenAIProvider } from "./OpenAIProvider";
import { GeminiProvider } from "./GeminiProvider";

export type AIProviderType = "local" | "openai" | "gemini";

// Easily toggle the active AI provider backend here
const ACTIVE_PROVIDER_TYPE: AIProviderType = "local";

function getProvider(type: AIProviderType): AIProvider {
  switch (type) {
    case "openai":
      return new OpenAIProvider();
    case "gemini":
      return new GeminiProvider();
    case "local":
    default:
      return new LocalProvider();
  }
}

export const aiService = getProvider(ACTIVE_PROVIDER_TYPE);
