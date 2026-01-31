'use client';

import { useMemo } from 'react';
import { AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { useVariables, BUILT_IN_VARIABLES } from '@/hooks';
import { cn } from '@/lib/utils';

// Regex to match ${...} variable references
const VARIABLE_REFERENCE_REGEX = /\$\{([^}]+)\}/g;

/**
 * Parse variable references from a string
 */
export function parseVariableReferences(text: string | undefined | null): string[] {
  if (!text) return [];
  const refs: string[] = [];
  let match;
  while ((match = VARIABLE_REFERENCE_REGEX.exec(text)) !== null) {
    refs.push(match[1]);
  }
  return refs;
}

/**
 * Validate variable references against known variables
 */
interface ValidationResult {
  valid: string[];
  missing: string[];
  builtIn: string[];
}

export function useVariableValidation(
  references: string[]
): ValidationResult & { isLoading: boolean } {
  const { data: variablesData, isLoading } = useVariables({ limit: 500 });
  const tenantVariables = useMemo(() => variablesData?.data ?? [], [variablesData]);

  const validation = useMemo<ValidationResult>(() => {
    const valid: string[] = [];
    const missing: string[] = [];
    const builtIn: string[] = [];

    // Set of known variable paths (use Set<string> for proper type checking)
    const tenantVarKeys = new Set<string>(tenantVariables.map((v) => `var.${v.key}`));
    const builtInPaths = new Set<string>(BUILT_IN_VARIABLES.map((v) => v.path));

    references.forEach((ref) => {
      if (builtInPaths.has(ref)) {
        builtIn.push(ref);
        valid.push(ref);
      } else if (tenantVarKeys.has(ref)) {
        valid.push(ref);
      } else if (ref.startsWith('var.')) {
        // Custom variable that doesn't exist
        missing.push(ref);
      } else if (
        ref.startsWith('current_user.') ||
        ref.startsWith('connection.') ||
        ref.startsWith('request.')
      ) {
        // Built-in namespace but specific key might not exist
        const isValidBuiltIn = builtInPaths.has(ref);
        if (isValidBuiltIn) {
          builtIn.push(ref);
          valid.push(ref);
        } else {
          missing.push(ref);
        }
      } else {
        // Unknown namespace
        missing.push(ref);
      }
    });

    return { valid, missing, builtIn };
  }, [references, tenantVariables]);

  return { ...validation, isLoading };
}

/**
 * Compact inline warning for missing variables
 */
interface VariableValidationInlineProps {
  value: string | undefined | null;
  className?: string;
}

export function VariableValidationInline({ value, className }: VariableValidationInlineProps) {
  const references = useMemo(() => parseVariableReferences(value), [value]);
  const { missing, isLoading } = useVariableValidation(references);

  if (isLoading || references.length === 0 || missing.length === 0) {
    return null;
  }

  return (
    <div className={cn('flex items-center gap-1.5 text-amber-600', className)}>
      <AlertTriangle className="h-3.5 w-3.5" />
      <span className="text-xs">Missing: {missing.map((m) => `\${${m}}`).join(', ')}</span>
    </div>
  );
}

/**
 * Full alert for variable validation status
 */
interface VariableValidationAlertProps {
  value: string | undefined | null;
  className?: string;
  showSuccess?: boolean;
}

export function VariableValidationAlert({
  value,
  className,
  showSuccess = false,
}: VariableValidationAlertProps) {
  const references = useMemo(() => parseVariableReferences(value), [value]);
  const { valid, missing, builtIn, isLoading } = useVariableValidation(references);

  if (isLoading || references.length === 0) {
    return null;
  }

  if (missing.length > 0) {
    return (
      <Alert variant="destructive" className={cn('border-amber-500/50 bg-amber-500/5', className)}>
        <AlertTriangle className="h-4 w-4 text-amber-600" />
        <AlertTitle className="text-amber-600">Missing Variable References</AlertTitle>
        <AlertDescription className="space-y-2">
          <p className="text-sm text-amber-700">
            The following variable references could not be found:
          </p>
          <div className="flex flex-wrap gap-1.5">
            {missing.map((ref) => (
              <Badge
                key={ref}
                variant="outline"
                className="border-amber-500/30 bg-amber-500/10 font-mono text-xs text-amber-700"
              >
                ${'{' + ref + '}'}
              </Badge>
            ))}
          </div>
          <p className="text-xs text-amber-600">
            Create these variables in Settings → Variables or use an existing variable.
          </p>
        </AlertDescription>
      </Alert>
    );
  }

  if (showSuccess && valid.length > 0) {
    return (
      <Alert className={cn('border-emerald-500/50 bg-emerald-500/5', className)}>
        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
        <AlertTitle className="text-emerald-600">Variables Validated</AlertTitle>
        <AlertDescription>
          <div className="flex flex-wrap gap-1.5">
            {valid.map((ref) => (
              <Badge
                key={ref}
                variant="outline"
                className={cn(
                  'font-mono text-xs',
                  builtIn.includes(ref)
                    ? 'border-blue-500/30 bg-blue-500/10 text-blue-700'
                    : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700'
                )}
              >
                ${'{' + ref + '}'}
                {builtIn.includes(ref) && <span className="ml-1 opacity-60">(built-in)</span>}
              </Badge>
            ))}
          </div>
        </AlertDescription>
      </Alert>
    );
  }

  return null;
}

/**
 * Summary component showing variable validation status
 */
interface VariableValidationSummaryProps {
  templates: (string | undefined | null)[];
  className?: string;
}

export function VariableValidationSummary({
  templates,
  className,
}: VariableValidationSummaryProps) {
  const allReferences = useMemo(() => {
    const refs = new Set<string>();
    templates.forEach((t) => {
      parseVariableReferences(t).forEach((r) => refs.add(r));
    });
    return Array.from(refs);
  }, [templates]);

  const { valid, missing, isLoading } = useVariableValidation(allReferences);

  if (isLoading || allReferences.length === 0) {
    return null;
  }

  return (
    <div className={cn('flex items-center gap-3 text-xs', className)}>
      {valid.length > 0 && (
        <div className="flex items-center gap-1 text-emerald-600">
          <CheckCircle2 className="h-3.5 w-3.5" />
          <span>{valid.length} valid</span>
        </div>
      )}
      {missing.length > 0 && (
        <div className="flex items-center gap-1 text-amber-600">
          <AlertTriangle className="h-3.5 w-3.5" />
          <span>{missing.length} missing</span>
        </div>
      )}
      {valid.length === 0 && missing.length === 0 && (
        <div className="flex items-center gap-1 text-muted-foreground">
          <Info className="h-3.5 w-3.5" />
          <span>No variable references</span>
        </div>
      )}
    </div>
  );
}
