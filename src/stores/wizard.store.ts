/**
 * Create Integration Wizard Store
 *
 * Zustand store for managing the multi-step integration wizard state.
 */

import { create } from 'zustand';
import type { AuthType } from '@/lib/modules/integrations/integration.schemas';
import type {
  ApiEndpoint,
  ApiAuthMethod,
  ScrapeJobStatusType,
} from '@/lib/modules/ai/scrape-job.schemas';

// =============================================================================
// Types
// =============================================================================

export type WizardStep = 'url-input' | 'scraping' | 'review-actions' | 'configure-auth' | 'success';

export interface SelectedAction extends ApiEndpoint {
  selected: boolean;
  confidence: number; // 0-1 scale
}

export interface WizardData {
  // Step 1: URL Input
  documentationUrl: string;
  wishlist: string[];

  // Step 2: Scraping Progress
  scrapeJobId: string | null;
  scrapeStatus: ScrapeJobStatusType | null;
  scrapeProgress: number;
  scrapeCurrentStep: string;

  // Step 3: Review Actions
  detectedActions: SelectedAction[];
  detectedAuthMethods: ApiAuthMethod[];
  detectedBaseUrl: string;
  detectedApiName: string;

  // Step 4: Configure Auth
  selectedAuthType: AuthType | null;
  authConfig: {
    clientId?: string;
    clientSecret?: string;
    apiKey?: string;
    scopes?: string[];
    authorizationUrl?: string;
    tokenUrl?: string;
    headerName?: string;
  };

  // Step 5: Success
  createdIntegrationId: string | null;
  createdIntegrationName: string;
  selectedActionCount: number;
}

interface WizardState {
  // Current step
  currentStep: WizardStep;
  stepHistory: WizardStep[];

  // Wizard data
  data: WizardData;

  // Navigation
  goToStep: (step: WizardStep) => void;
  goBack: () => void;
  canGoBack: () => boolean;

  // Data updates
  setDocumentationUrl: (url: string) => void;
  setWishlist: (wishlist: string[]) => void;
  setScrapeJob: (jobId: string, status: ScrapeJobStatusType) => void;
  updateScrapeProgress: (
    progress: number,
    currentStep: string,
    status: ScrapeJobStatusType
  ) => void;
  setDetectedActions: (actions: ApiEndpoint[], confidence?: number) => void;
  setDetectedAuthMethods: (authMethods: ApiAuthMethod[]) => void;
  setDetectedApiInfo: (name: string, baseUrl: string) => void;
  toggleActionSelection: (slug: string) => void;
  selectAllActions: () => void;
  deselectAllActions: () => void;
  setSelectedAuthType: (authType: AuthType) => void;
  setAuthConfig: (config: WizardData['authConfig']) => void;
  setCreatedIntegration: (id: string, name: string, actionCount: number) => void;

  // Reset
  reset: () => void;
}

// =============================================================================
// Initial State
// =============================================================================

const initialData: WizardData = {
  documentationUrl: '',
  wishlist: [],
  scrapeJobId: null,
  scrapeStatus: null,
  scrapeProgress: 0,
  scrapeCurrentStep: '',
  detectedActions: [],
  detectedAuthMethods: [],
  detectedBaseUrl: '',
  detectedApiName: '',
  selectedAuthType: null,
  authConfig: {},
  createdIntegrationId: null,
  createdIntegrationName: '',
  selectedActionCount: 0,
};

// =============================================================================
// Store
// =============================================================================

export const useWizardStore = create<WizardState>((set, get) => ({
  currentStep: 'url-input',
  stepHistory: [],
  data: initialData,

  // Navigation
  goToStep: (step) =>
    set((state) => {
      const STEP_ORDER: WizardStep[] = [
        'url-input',
        'scraping',
        'review-actions',
        'configure-auth',
        'success',
      ];
      const currentIndex = STEP_ORDER.indexOf(state.currentStep);
      const targetIndex = STEP_ORDER.indexOf(step);

      // If navigating backwards, truncate history to that point
      if (targetIndex < currentIndex) {
        // Find the index in history where we were at the target step
        const historyIndex = state.stepHistory.findIndex((s) => s === step);
        if (historyIndex >= 0) {
          // Truncate history to before the target step
          return {
            currentStep: step,
            stepHistory: state.stepHistory.slice(0, historyIndex),
          };
        }
        // If step isn't in history, just go there with empty history
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

  // Data updates
  setDocumentationUrl: (url) =>
    set((state) => ({
      data: { ...state.data, documentationUrl: url },
    })),

  setWishlist: (wishlist) =>
    set((state) => ({
      data: { ...state.data, wishlist },
    })),

  setScrapeJob: (jobId, status) =>
    set((state) => ({
      data: {
        ...state.data,
        scrapeJobId: jobId,
        scrapeStatus: status,
        scrapeProgress: 0,
        scrapeCurrentStep: 'Starting...',
      },
    })),

  updateScrapeProgress: (progress, currentStep, status) =>
    set((state) => ({
      data: {
        ...state.data,
        scrapeProgress: progress,
        scrapeCurrentStep: currentStep,
        scrapeStatus: status,
      },
    })),

  setDetectedActions: (actions, confidence = 0.8) =>
    set((state) => ({
      data: {
        ...state.data,
        detectedActions: actions.map((action) => ({
          ...action,
          selected: true, // Default all to selected
          confidence: confidence + Math.random() * 0.2 - 0.1, // Vary confidence slightly
        })),
      },
    })),

  setDetectedAuthMethods: (authMethods) =>
    set((state) => ({
      data: {
        ...state.data,
        detectedAuthMethods: authMethods,
        // Auto-select the first auth method
        selectedAuthType: authMethods[0]?.type || null,
      },
    })),

  setDetectedApiInfo: (name, baseUrl) =>
    set((state) => ({
      data: {
        ...state.data,
        detectedApiName: name,
        detectedBaseUrl: baseUrl,
      },
    })),

  toggleActionSelection: (slug) =>
    set((state) => ({
      data: {
        ...state.data,
        detectedActions: state.data.detectedActions.map((action) =>
          action.slug === slug ? { ...action, selected: !action.selected } : action
        ),
      },
    })),

  selectAllActions: () =>
    set((state) => ({
      data: {
        ...state.data,
        detectedActions: state.data.detectedActions.map((action) => ({
          ...action,
          selected: true,
        })),
      },
    })),

  deselectAllActions: () =>
    set((state) => ({
      data: {
        ...state.data,
        detectedActions: state.data.detectedActions.map((action) => ({
          ...action,
          selected: false,
        })),
      },
    })),

  setSelectedAuthType: (authType) =>
    set((state) => ({
      data: { ...state.data, selectedAuthType: authType },
    })),

  setAuthConfig: (config) =>
    set((state) => ({
      data: { ...state.data, authConfig: { ...state.data.authConfig, ...config } },
    })),

  setCreatedIntegration: (id, name, actionCount) =>
    set((state) => ({
      data: {
        ...state.data,
        createdIntegrationId: id,
        createdIntegrationName: name,
        selectedActionCount: actionCount,
      },
    })),

  reset: () =>
    set({
      currentStep: 'url-input',
      stepHistory: [],
      data: initialData,
    }),
}));
