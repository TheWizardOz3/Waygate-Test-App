/**
 * LLM Client
 *
 * Centralized LLM model management. Use this to get an LLM client
 * configured for the desired model. Each use case can then use
 * the client with their own prompts and logic.
 *
 * @example
 * ```ts
 * // Get client for default model
 * const llm = getLLM();
 *
 * // Get client for specific model
 * const llm = getLLM('gemini-1.5-flash');
 *
 * // Use in your specific use case with your own prompts
 * const result = await llm.generate(myPrompt, {
 *   systemInstruction: mySystemPrompt,
 *   responseSchema: mySchema,
 * });
 * ```
 */

import type { LLMProvider, LLMModelId, LLMProviderType } from './types';
import { LLM_MODELS, LLMError } from './types';
import { createGeminiProvider } from './providers';

// =============================================================================
// Configuration
// =============================================================================

/**
 * Default model to use when none specified.
 * Can be overridden via LLM_DEFAULT_MODEL env var.
 */
function getDefaultModelId(): LLMModelId {
  const envModel = process.env.LLM_DEFAULT_MODEL as LLMModelId | undefined;
  if (envModel && envModel in LLM_MODELS) {
    return envModel;
  }
  return 'gemini-3-pro';
}

// =============================================================================
// Provider Cache
// =============================================================================

/**
 * Cache of instantiated providers by model ID.
 * Providers are reused to avoid creating new instances on every call.
 */
const providerCache = new Map<string, LLMProvider>();

/**
 * Clear the provider cache (useful for testing)
 */
export function clearProviderCache(): void {
  providerCache.clear();
}

// =============================================================================
// Provider Factory
// =============================================================================

/**
 * Create a provider for the given model configuration
 */
function createProvider(modelId: LLMModelId): LLMProvider {
  const config = LLM_MODELS[modelId];

  if (!config) {
    throw new LLMError(
      'CONFIGURATION_ERROR',
      `Unknown model: ${modelId}. Available models: ${Object.keys(LLM_MODELS).join(', ')}`,
      'gemini', // Default provider for error
      { retryable: false }
    );
  }

  switch (config.provider) {
    case 'gemini':
      return createGeminiProvider(config.model);

    // Future providers:
    // case 'openai':
    //   return createOpenAIProvider(config.model);
    // case 'anthropic':
    //   return createAnthropicProvider(config.model);

    default:
      throw new LLMError(
        'CONFIGURATION_ERROR',
        `Unsupported provider: ${config.provider}`,
        config.provider as LLMProviderType,
        { retryable: false }
      );
  }
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Get an LLM client for the specified model.
 *
 * This is the main entry point for using LLMs in the application.
 * Each use case should call this to get a client, then use their
 * own prompts and schemas with it.
 *
 * @param modelId - Model to use. Defaults to LLM_DEFAULT_MODEL env var or 'gemini-3-pro'
 * @returns LLM provider instance
 *
 * @example
 * ```ts
 * // Use default model
 * const llm = getLLM();
 * const result = await llm.generate('Hello, world!');
 *
 * // Use specific model
 * const fastLlm = getLLM('gemini-1.5-flash');
 * const result = await fastLlm.generate('Quick task...');
 *
 * // With structured output
 * const llm = getLLM();
 * const result = await llm.generate<MyType>(prompt, {
 *   responseSchema: mySchema,
 *   systemInstruction: 'You are a helpful assistant.',
 * });
 * ```
 */
export function getLLM(modelId?: LLMModelId): LLMProvider {
  const effectiveModelId = modelId ?? getDefaultModelId();

  // Check cache first
  const cached = providerCache.get(effectiveModelId);
  if (cached) {
    return cached;
  }

  // Create new provider
  const provider = createProvider(effectiveModelId);
  providerCache.set(effectiveModelId, provider);

  return provider;
}

/**
 * Get information about available models
 */
export function getAvailableModels(): Array<{
  id: LLMModelId;
  provider: LLMProviderType;
  displayName: string;
}> {
  return (Object.keys(LLM_MODELS) as LLMModelId[]).map((id) => {
    const config = LLM_MODELS[id];
    return {
      id,
      provider: config.provider,
      displayName: config.displayName || config.model,
    };
  });
}

/**
 * Get the current default model ID
 */
export function getDefaultModel(): LLMModelId {
  return getDefaultModelId();
}

/**
 * Check if a model ID is valid
 */
export function isValidModel(modelId: string): modelId is LLMModelId {
  return modelId in LLM_MODELS;
}
