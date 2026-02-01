/**
 * Composite Tool Wizard Store
 *
 * Zustand store for managing the multi-step composite tool creation wizard.
 * Updated to use unified tool abstraction for tool composition.
 */

import { create } from 'zustand';
import type {
  CompositeToolRoutingMode,
  RoutingConditionType,
} from '@/lib/modules/composite-tools/composite-tool.schemas';
import type { ToolType } from '@/lib/modules/tools';

// =============================================================================
// Types
// =============================================================================

export type CompositeToolWizardStep =
  | 'tool-type'
  | 'name-description'
  | 'select-operations'
  | 'routing-mode'
  | 'routing-rules'
  | 'review';

/**
 * Selected operation using unified tool abstraction.
 * Can reference simple tools (actions), composite tools, or agentic tools.
 */
export interface SelectedOperation {
  /** Tool identifier - actionId for simple tools, toolId for composite/agentic */
  toolId: string;
  /** Tool type for routing to correct service */
  toolType: ToolType;
  /** Tool name for display */
  toolName: string;
  /** Tool slug */
  toolSlug: string;
  /** Integration context (simple tools only) */
  integrationId?: string;
  integrationName?: string;
  /** Unique identifier within this composite tool */
  operationSlug: string;
  /** User-friendly display name */
  displayName: string;
  /** Execution priority/order */
  priority: number;
  /** Tool's input schema - used for routing field derivation */
  inputSchema?: unknown;
  /** AI-optimized tool description */
  description?: string;

  // Legacy fields for backwards compatibility during migration
  /** @deprecated Use toolId instead */
  actionId?: string;
  /** @deprecated Use toolSlug instead */
  actionSlug?: string;
  /** @deprecated Use toolName instead */
  actionName?: string;
}

export interface RoutingRule {
  id: string; // Local ID for UI tracking
  operationSlug: string;
  conditionType: RoutingConditionType;
  conditionField: string;
  conditionValue: string;
  caseSensitive: boolean;
  priority: number;
}

export interface WizardData {
  // Step 1: Tool Type (for future extensibility - Composite vs Agentic)
  toolType: 'composite'; // For now only composite is supported

  // Step 2: Name & Description
  name: string;
  slug: string;
  description: string;

  // Step 3: Selected Operations
  operations: SelectedOperation[];

  // Step 4: Routing Mode
  routingMode: CompositeToolRoutingMode;
  defaultOperationSlug: string | null;

  // Step 5: Routing Rules (for rule-based mode)
  routingRules: RoutingRule[];

  // Result
  createdToolId: string | null;
}

interface WizardState {
  // Current step
  currentStep: CompositeToolWizardStep;
  stepHistory: CompositeToolWizardStep[];

  // Wizard data
  data: WizardData;

  // Navigation
  goToStep: (step: CompositeToolWizardStep) => void;
  goBack: () => void;
  canGoBack: () => boolean;
  getNextStep: () => CompositeToolWizardStep | null;
  getPreviousStep: () => CompositeToolWizardStep | null;

  // Data updates
  setToolType: (type: 'composite') => void;
  setNameAndDescription: (name: string, slug: string, description: string) => void;
  addOperation: (operation: SelectedOperation) => void;
  /** Remove operation by tool ID */
  removeOperation: (toolId: string) => void;
  /** Update operation priority by tool ID */
  updateOperationPriority: (toolId: string, priority: number) => void;
  setRoutingMode: (mode: CompositeToolRoutingMode) => void;
  setDefaultOperation: (operationSlug: string | null) => void;
  addRoutingRule: (rule: Omit<RoutingRule, 'id' | 'priority'>) => void;
  updateRoutingRule: (id: string, updates: Partial<RoutingRule>) => void;
  removeRoutingRule: (id: string) => void;
  reorderRoutingRules: (ruleIds: string[]) => void;
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
  toolType: 'composite',
  name: '',
  slug: '',
  description: '',
  operations: [],
  routingMode: 'rule_based',
  defaultOperationSlug: null,
  routingRules: [],
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

function generateLocalId(): string {
  return Math.random().toString(36).substring(2, 9);
}

// =============================================================================
// Store
// =============================================================================

export const useCompositeToolWizardStore = create<WizardState>((set, get) => ({
  currentStep: 'name-description', // Skip tool type for now since only composite is supported
  stepHistory: [],
  data: initialData,

  // Navigation
  goToStep: (step) =>
    set((state) => {
      const STEP_ORDER: CompositeToolWizardStep[] = [
        'name-description',
        'select-operations',
        'routing-mode',
        'routing-rules',
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
    const STEP_ORDER: CompositeToolWizardStep[] = [
      'name-description',
      'select-operations',
      'routing-mode',
      'routing-rules',
      'review',
    ];
    const currentIndex = STEP_ORDER.indexOf(state.currentStep);

    // Skip routing-rules step if agent-driven mode
    if (state.currentStep === 'routing-mode' && state.data.routingMode === 'agent_driven') {
      return 'review';
    }

    if (currentIndex < STEP_ORDER.length - 1) {
      return STEP_ORDER[currentIndex + 1];
    }
    return null;
  },

  getPreviousStep: () => {
    const state = get();
    const history = [...state.stepHistory];
    return history.pop() ?? null;
  },

  // Data updates
  setToolType: (type) =>
    set((state) => ({
      data: { ...state.data, toolType: type },
    })),

  setNameAndDescription: (name, slug, description) =>
    set((state) => ({
      data: {
        ...state.data,
        name,
        slug: slug || generateSlug(name),
        description,
      },
    })),

  addOperation: (operation) =>
    set((state) => {
      // Don't add duplicate - check by toolId (primary) or legacy actionId
      const isDuplicate = state.data.operations.some(
        (op) =>
          op.toolId === operation.toolId || (op.actionId && op.actionId === operation.actionId)
      );
      if (isDuplicate) {
        return state;
      }
      return {
        data: {
          ...state.data,
          operations: [
            ...state.data.operations,
            { ...operation, priority: state.data.operations.length },
          ],
        },
      };
    }),

  removeOperation: (toolId) =>
    set((state) => {
      // Find the operation being removed to get its operationSlug
      const removedOp = state.data.operations.find(
        (op) => op.toolId === toolId || op.actionId === toolId
      );
      return {
        data: {
          ...state.data,
          operations: state.data.operations.filter(
            (op) => op.toolId !== toolId && op.actionId !== toolId
          ),
          // Also remove any routing rules for this operation
          routingRules: removedOp
            ? state.data.routingRules.filter(
                (rule) => rule.operationSlug !== removedOp.operationSlug
              )
            : state.data.routingRules,
        },
      };
    }),

  updateOperationPriority: (toolId, priority) =>
    set((state) => ({
      data: {
        ...state.data,
        operations: state.data.operations.map((op) =>
          op.toolId === toolId || op.actionId === toolId ? { ...op, priority } : op
        ),
      },
    })),

  setRoutingMode: (mode) =>
    set((state) => ({
      data: { ...state.data, routingMode: mode },
    })),

  setDefaultOperation: (operationSlug) =>
    set((state) => ({
      data: { ...state.data, defaultOperationSlug: operationSlug },
    })),

  addRoutingRule: (rule) =>
    set((state) => ({
      data: {
        ...state.data,
        routingRules: [
          ...state.data.routingRules,
          {
            ...rule,
            id: generateLocalId(),
            priority: state.data.routingRules.length,
          },
        ],
      },
    })),

  updateRoutingRule: (id, updates) =>
    set((state) => ({
      data: {
        ...state.data,
        routingRules: state.data.routingRules.map((rule) =>
          rule.id === id ? { ...rule, ...updates } : rule
        ),
      },
    })),

  removeRoutingRule: (id) =>
    set((state) => ({
      data: {
        ...state.data,
        routingRules: state.data.routingRules.filter((rule) => rule.id !== id),
      },
    })),

  reorderRoutingRules: (ruleIds) =>
    set((state) => {
      const newRules = ruleIds
        .map((id, index) => {
          const rule = state.data.routingRules.find((r) => r.id === id);
          return rule ? { ...rule, priority: index } : null;
        })
        .filter((r): r is RoutingRule => r !== null);

      return {
        data: {
          ...state.data,
          routingRules: newRules,
        },
      };
    }),

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

      case 'select-operations':
        return data.operations.length >= 2; // Need at least 2 operations for composite

      case 'routing-mode':
        return true; // Always can proceed from routing mode

      case 'routing-rules':
        // For rule-based, should have at least one rule or a default operation
        if (data.routingMode === 'rule_based') {
          return data.routingRules.length > 0 || data.defaultOperationSlug !== null;
        }
        return true;

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
