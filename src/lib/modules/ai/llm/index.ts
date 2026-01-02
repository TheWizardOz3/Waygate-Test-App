/**
 * LLM Module
 *
 * Centralized LLM model management for the application.
 *
 * Usage:
 * ```ts
 * import { getLLM } from '@/lib/modules/ai/llm';
 *
 * // Get client with default model
 * const llm = getLLM();
 *
 * // Generate content
 * const result = await llm.generate('My prompt');
 *
 * // With structured output
 * const result = await llm.generate<MyType>(prompt, {
 *   responseSchema: mySchema,
 *   systemInstruction: 'You are...',
 * });
 * ```
 */

// Client (main entry point)
export {
  getLLM,
  getAvailableModels,
  getDefaultModel,
  isValidModel,
  clearProviderCache,
} from './client';

// Types
export {
  LLMError,
  LLM_MODELS,
  type LLMProvider,
  type LLMProviderType,
  type LLMModelId,
  type LLMModelConfig,
  type LLMGenerateOptions,
  type LLMGenerateResult,
  type LLMResponseSchema,
  type LLMSchemaProperty,
  type LLMUsage,
  type LLMErrorCode,
} from './types';

// Providers (for direct access if needed)
export { GeminiProvider, createGeminiProvider } from './providers';
