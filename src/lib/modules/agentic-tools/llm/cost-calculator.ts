/**
 * Cost Calculator
 *
 * Calculates LLM usage costs for agentic tools.
 * Pricing is per million tokens as of January 2026.
 */

// =============================================================================
// Pricing Constants
// =============================================================================

/**
 * Model pricing per million tokens
 * Updated: January 2026
 */
interface ModelPricing {
  input: number; // Price per 1M input tokens
  output: number; // Price per 1M output tokens
}

/**
 * Anthropic pricing
 * Source: https://www.anthropic.com/api#pricing
 */
const ANTHROPIC_PRICING: Record<string, ModelPricing> = {
  'claude-opus-4.5': { input: 15.0, output: 75.0 },
  'claude-sonnet-4.5': { input: 3.0, output: 15.0 },
  'claude-3-5-sonnet-20241022': { input: 3.0, output: 15.0 },
  'claude-3-5-sonnet-20240620': { input: 3.0, output: 15.0 },
};

/**
 * Google pricing
 * Source: https://ai.google.dev/pricing
 */
const GOOGLE_PRICING: Record<string, ModelPricing> = {
  // Gemini 3.x models
  'gemini-3-pro-preview': { input: 1.25, output: 5.0 },
  'gemini-3-flash-preview': { input: 0.625, output: 2.5 },
  // Gemini 2.x models
  'gemini-2.5-flash': { input: 0.625, output: 2.5 },
  'gemini-2.5-pro': { input: 1.25, output: 5.0 },
  'gemini-2.0-flash-exp': { input: 0.625, output: 2.5 },
  // Gemini 1.5 models (legacy)
  'gemini-1.5-pro': { input: 1.25, output: 5.0 },
  'gemini-1.5-flash': { input: 0.625, output: 2.5 },
};

/**
 * Default pricing for unknown models (conservative estimate)
 */
const DEFAULT_PRICING: ModelPricing = { input: 5.0, output: 15.0 };

// =============================================================================
// Cost Calculation
// =============================================================================

/**
 * Calculate cost for LLM usage
 *
 * @param provider - LLM provider (anthropic or google)
 * @param model - Model identifier
 * @param inputTokens - Number of input tokens
 * @param outputTokens - Number of output tokens
 * @returns Cost in USD
 */
export function calculateCost(
  provider: 'anthropic' | 'google',
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const pricing = getModelPricing(provider, model);

  // Calculate cost per million tokens
  const inputCost = (inputTokens / 1_000_000) * pricing.input;
  const outputCost = (outputTokens / 1_000_000) * pricing.output;

  // Round to 6 decimal places ($0.000001)
  return Math.round((inputCost + outputCost) * 1_000_000) / 1_000_000;
}

/**
 * Calculate cost breakdown for LLM usage
 *
 * @param provider - LLM provider
 * @param model - Model identifier
 * @param inputTokens - Number of input tokens
 * @param outputTokens - Number of output tokens
 * @returns Detailed cost breakdown
 */
export function calculateCostBreakdown(
  provider: 'anthropic' | 'google',
  model: string,
  inputTokens: number,
  outputTokens: number
): {
  inputCost: number;
  outputCost: number;
  totalCost: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  pricing: ModelPricing;
} {
  const pricing = getModelPricing(provider, model);

  const inputCost = (inputTokens / 1_000_000) * pricing.input;
  const outputCost = (outputTokens / 1_000_000) * pricing.output;
  const totalCost = Math.round((inputCost + outputCost) * 1_000_000) / 1_000_000;

  return {
    inputCost: Math.round(inputCost * 1_000_000) / 1_000_000,
    outputCost: Math.round(outputCost * 1_000_000) / 1_000_000,
    totalCost,
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    pricing,
  };
}

/**
 * Get pricing for a specific model
 *
 * @param provider - LLM provider
 * @param model - Model identifier
 * @returns Model pricing or default pricing if model not found
 */
function getModelPricing(provider: 'anthropic' | 'google', model: string): ModelPricing {
  const pricingMap = provider === 'anthropic' ? ANTHROPIC_PRICING : GOOGLE_PRICING;

  // Try exact match
  if (pricingMap[model]) {
    return pricingMap[model];
  }

  // Try fuzzy match (e.g., model might have version suffix)
  for (const [knownModel, pricing] of Object.entries(pricingMap)) {
    if (model.startsWith(knownModel) || knownModel.startsWith(model)) {
      return pricing;
    }
  }

  // Return default pricing with warning
  console.warn(
    `Unknown model pricing for ${provider}/${model}. Using default pricing: ${DEFAULT_PRICING.input}/${DEFAULT_PRICING.output} per 1M tokens`
  );
  return DEFAULT_PRICING;
}

/**
 * Estimate cost for a prompt before execution
 *
 * @param provider - LLM provider
 * @param model - Model identifier
 * @param estimatedInputTokens - Estimated input tokens (rough calculation: chars / 4)
 * @param estimatedOutputTokens - Estimated output tokens
 * @returns Estimated cost in USD
 */
export function estimateCost(
  provider: 'anthropic' | 'google',
  model: string,
  estimatedInputTokens: number,
  estimatedOutputTokens: number
): number {
  return calculateCost(provider, model, estimatedInputTokens, estimatedOutputTokens);
}

/**
 * Estimate tokens from text length
 * Rough approximation: 1 token ≈ 4 characters (varies by language and model)
 *
 * @param text - Input text
 * @returns Estimated token count
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Get all available pricing information
 *
 * @returns All model pricing by provider
 */
export function getAllPricing(): {
  anthropic: Record<string, ModelPricing>;
  google: Record<string, ModelPricing>;
} {
  return {
    anthropic: { ...ANTHROPIC_PRICING },
    google: { ...GOOGLE_PRICING },
  };
}
