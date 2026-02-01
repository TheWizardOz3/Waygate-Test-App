/**
 * Agentic Tool Wizard Store
 *
 * Zustand store for managing the multi-step agentic tool creation wizard.
 */

import { create } from 'zustand';
import type {
  AgenticToolExecutionMode,
  EmbeddedLLMConfig,
  TargetAction,
  AvailableTool,
  ContextVariable,
  SafetyLimits,
} from '@/lib/modules/agentic-tools/agentic-tool.schemas';

// =============================================================================
// Types
// =============================================================================

export type AgenticToolWizardStep =
  | 'name-description'
  | 'execution-mode'
  | 'llm-config'
  | 'system-prompt'
  | 'tool-allocation'
  | 'context-config'
  | 'review';

export interface WizardData {
  // Step 1: Name & Description
  name: string;
  slug: string;
  description: string;

  // Step 2: Execution Mode
  executionMode: AgenticToolExecutionMode;

  // Step 3: LLM Configuration
  embeddedLLMConfig: EmbeddedLLMConfig;

  // Step 4: System Prompt
  systemPrompt: string;

  // Step 5: Tool Allocation
  targetActions: TargetAction[]; // For parameter_interpreter mode
  availableTools: AvailableTool[]; // For autonomous_agent mode

  // Step 6: Context Configuration
  contextVariables: Record<string, ContextVariable>;
  autoInjectSchemas: boolean;

  // Optional fields
  toolDescription: string;
  safetyLimits: SafetyLimits;

  // Result
  createdToolId: string | null;
}

interface WizardState {
  // Current step
  currentStep: AgenticToolWizardStep;
  stepHistory: AgenticToolWizardStep[];

  // Wizard data
  data: WizardData;

  // Navigation
  goToStep: (step: AgenticToolWizardStep) => void;
  goBack: () => void;
  canGoBack: () => boolean;
  getNextStep: () => AgenticToolWizardStep | null;

  // Data updates
  setNameAndDescription: (name: string, slug: string, description: string) => void;
  setExecutionMode: (mode: AgenticToolExecutionMode) => void;
  setLLMConfig: (config: Partial<EmbeddedLLMConfig>) => void;
  setSystemPrompt: (prompt: string) => void;
  addTargetAction: (action: TargetAction) => void;
  removeTargetAction: (actionId: string) => void;
  addAvailableTool: (tool: AvailableTool) => void;
  removeAvailableTool: (actionId: string) => void;
  updateAvailableTool: (actionId: string, updates: Partial<AvailableTool>) => void;
  setContextVariable: (key: string, variable: ContextVariable) => void;
  removeContextVariable: (key: string) => void;
  setAutoInjectSchemas: (value: boolean) => void;
  setToolDescription: (description: string) => void;
  setSafetyLimits: (limits: Partial<SafetyLimits>) => void;
  setCreatedToolId: (id: string) => void;

  // Validation
  canProceed: () => boolean;

  // Reset
  reset: () => void;
}

// =============================================================================
// Initial State
// =============================================================================

const initialData: WizardData = {
  name: '',
  slug: '',
  description: '',
  executionMode: 'parameter_interpreter',
  embeddedLLMConfig: {
    provider: 'anthropic',
    model: 'claude-sonnet-4.5',
    reasoningLevel: 'none',
    temperature: 0.2,
    maxTokens: 4000,
  },
  systemPrompt: '',
  targetActions: [],
  availableTools: [],
  contextVariables: {},
  autoInjectSchemas: true,
  toolDescription: '',
  safetyLimits: {
    maxToolCalls: 10,
    timeoutSeconds: 300,
    maxTotalCost: 1.0,
  },
  createdToolId: null,
};

// =============================================================================
// Helpers
// =============================================================================

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

// =============================================================================
// Store
// =============================================================================

export const useAgenticToolWizardStore = create<WizardState>((set, get) => ({
  currentStep: 'name-description',
  stepHistory: [],
  data: initialData,

  // Navigation
  goToStep: (step) =>
    set((state) => {
      const STEP_ORDER: AgenticToolWizardStep[] = [
        'name-description',
        'execution-mode',
        'llm-config',
        'system-prompt',
        'tool-allocation',
        'context-config',
        'review',
      ];
      const currentIndex = STEP_ORDER.indexOf(state.currentStep);
      const targetIndex = STEP_ORDER.indexOf(step);

      // If navigating backwards, truncate history to that point
      if (targetIndex < currentIndex) {
        const historyIndex = state.stepHistory.findIndex((s) => s === step);
        if (historyIndex >= 0) {
          return {
            currentStep: step,
            stepHistory: state.stepHistory.slice(0, historyIndex),
          };
        }
        return {
          currentStep: step,
          stepHistory: [],
        };
      }

      // Normal forward navigation - add current step to history
      return {
        currentStep: step,
        stepHistory: [...state.stepHistory, state.currentStep],
      };
    }),

  goBack: () =>
    set((state) => {
      const history = [...state.stepHistory];
      const previousStep = history.pop();
      return previousStep ? { currentStep: previousStep, stepHistory: history } : state;
    }),

  canGoBack: () => get().stepHistory.length > 0,

  getNextStep: () => {
    const state = get();
    const STEP_ORDER: AgenticToolWizardStep[] = [
      'name-description',
      'execution-mode',
      'llm-config',
      'system-prompt',
      'tool-allocation',
      'context-config',
      'review',
    ];
    const currentIndex = STEP_ORDER.indexOf(state.currentStep);

    if (currentIndex < STEP_ORDER.length - 1) {
      return STEP_ORDER[currentIndex + 1];
    }
    return null;
  },

  // Data updates
  setNameAndDescription: (name, slug, description) =>
    set((state) => ({
      data: {
        ...state.data,
        name,
        slug: slug || generateSlug(name),
        description,
      },
    })),

  setExecutionMode: (mode) =>
    set((state) => ({
      data: { ...state.data, executionMode: mode },
    })),

  setLLMConfig: (config) =>
    set((state) => ({
      data: {
        ...state.data,
        embeddedLLMConfig: { ...state.data.embeddedLLMConfig, ...config },
      },
    })),

  setSystemPrompt: (prompt) =>
    set((state) => ({
      data: { ...state.data, systemPrompt: prompt },
    })),

  addTargetAction: (action) =>
    set((state) => {
      // Don't add duplicate
      if (state.data.targetActions.some((a) => a.actionId === action.actionId)) {
        return state;
      }
      return {
        data: {
          ...state.data,
          targetActions: [...state.data.targetActions, action],
        },
      };
    }),

  removeTargetAction: (actionId) =>
    set((state) => ({
      data: {
        ...state.data,
        targetActions: state.data.targetActions.filter((a) => a.actionId !== actionId),
      },
    })),

  addAvailableTool: (tool) =>
    set((state) => {
      // Don't add duplicate
      if (state.data.availableTools.some((t) => t.actionId === tool.actionId)) {
        return state;
      }
      return {
        data: {
          ...state.data,
          availableTools: [...state.data.availableTools, tool],
        },
      };
    }),

  removeAvailableTool: (actionId) =>
    set((state) => ({
      data: {
        ...state.data,
        availableTools: state.data.availableTools.filter((t) => t.actionId !== actionId),
      },
    })),

  updateAvailableTool: (actionId, updates) =>
    set((state) => ({
      data: {
        ...state.data,
        availableTools: state.data.availableTools.map((t) =>
          t.actionId === actionId ? { ...t, ...updates } : t
        ),
      },
    })),

  setContextVariable: (key, variable) =>
    set((state) => ({
      data: {
        ...state.data,
        contextVariables: { ...state.data.contextVariables, [key]: variable },
      },
    })),

  removeContextVariable: (key) =>
    set((state) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { [key]: _unused, ...rest } = state.data.contextVariables;
      return {
        data: {
          ...state.data,
          contextVariables: rest,
        },
      };
    }),

  setAutoInjectSchemas: (value) =>
    set((state) => ({
      data: { ...state.data, autoInjectSchemas: value },
    })),

  setToolDescription: (description) =>
    set((state) => ({
      data: { ...state.data, toolDescription: description },
    })),

  setSafetyLimits: (limits) =>
    set((state) => ({
      data: {
        ...state.data,
        safetyLimits: { ...state.data.safetyLimits, ...limits },
      },
    })),

  setCreatedToolId: (id) =>
    set((state) => ({
      data: { ...state.data, createdToolId: id },
    })),

  // Validation
  canProceed: () => {
    const state = get();
    const { data, currentStep } = state;

    switch (currentStep) {
      case 'name-description':
        return data.name.trim().length > 0 && data.slug.trim().length > 0;

      case 'execution-mode':
        return true; // Always can proceed

      case 'llm-config':
        return Boolean(
          data.embeddedLLMConfig.provider &&
          data.embeddedLLMConfig.model &&
          data.embeddedLLMConfig.temperature >= 0 &&
          data.embeddedLLMConfig.temperature <= 1 &&
          data.embeddedLLMConfig.maxTokens >= 1000 &&
          data.embeddedLLMConfig.maxTokens <= 8000
        );

      case 'system-prompt':
        return data.systemPrompt.trim().length >= 10;

      case 'tool-allocation':
        if (data.executionMode === 'parameter_interpreter') {
          return data.targetActions.length >= 1;
        } else {
          return data.availableTools.length >= 1;
        }

      case 'context-config':
        return true; // Optional step

      case 'review':
        return true;

      default:
        return true;
    }
  },

  // Reset
  reset: () =>
    set({
      currentStep: 'name-description',
      stepHistory: [],
      data: initialData,
    }),
}));
