'use client';

import * as React from 'react';
import { CheckCircle2, AlertCircle, Clock, FileQuestion } from 'lucide-react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';
import type { IntegrationStatus } from '@/lib/modules/integrations/integration.schemas';

// =============================================================================
// Badge Variants
// =============================================================================

const statusBadgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors',
  {
    variants: {
      status: {
        active: 'bg-success/10 text-success',
        error: 'bg-destructive/10 text-destructive',
        draft: 'bg-muted text-muted-foreground',
        disabled: 'bg-warning/10 text-warning',
      },
      size: {
        sm: 'px-2 py-0.5 text-xs',
        md: 'px-2.5 py-0.5 text-xs',
        lg: 'px-3 py-1 text-sm',
      },
    },
    defaultVariants: {
      status: 'draft',
      size: 'md',
    },
  }
);

// =============================================================================
// Status Configuration
// =============================================================================

interface StatusConfig {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
}

const statusConfig: Record<IntegrationStatus, StatusConfig> = {
  active: {
    label: 'Active',
    icon: CheckCircle2,
    description: 'Integration is connected and working',
  },
  error: {
    label: 'Error',
    icon: AlertCircle,
    description: 'Integration has errors that need attention',
  },
  draft: {
    label: 'Draft',
    icon: FileQuestion,
    description: 'Integration is not yet configured',
  },
  disabled: {
    label: 'Disabled',
    icon: Clock,
    description: 'Integration is temporarily disabled',
  },
};

// =============================================================================
// Component
// =============================================================================

export interface IntegrationStatusBadgeProps extends Omit<
  VariantProps<typeof statusBadgeVariants>,
  'status'
> {
  status: IntegrationStatus;
  showIcon?: boolean;
  showLabel?: boolean;
  className?: string;
}

/**
 * Status badge for integrations with semantic colors and icons.
 * Displays the current status of an integration (active, error, draft, disabled).
 */
export function IntegrationStatusBadge({
  status,
  size,
  showIcon = true,
  showLabel = true,
  className,
}: IntegrationStatusBadgeProps) {
  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <span
      className={cn(statusBadgeVariants({ status, size }), className)}
      title={config.description}
    >
      {showIcon && <Icon className="h-3 w-3" />}
      {showLabel && <span>{config.label}</span>}
    </span>
  );
}

// =============================================================================
// Credential Status Badge
// =============================================================================

type CredentialStatus = 'active' | 'expired' | 'needs_reauth' | 'missing';

const credentialStatusConfig: Record<
  CredentialStatus,
  { label: string; className: string; description: string }
> = {
  active: {
    label: 'Connected',
    className: 'bg-success/10 text-success',
    description: 'Credentials are valid and working',
  },
  expired: {
    label: 'Expired',
    className: 'bg-warning/10 text-warning',
    description: 'Credentials have expired and need refresh',
  },
  needs_reauth: {
    label: 'Needs Auth',
    className: 'bg-destructive/10 text-destructive',
    description: 'Re-authentication required',
  },
  missing: {
    label: 'Not Connected',
    className: 'bg-muted text-muted-foreground',
    description: 'No credentials configured',
  },
};

export interface CredentialStatusBadgeProps {
  status: CredentialStatus;
  className?: string;
}

/**
 * Status badge specifically for credential/connection status.
 */
export function CredentialStatusBadge({ status, className }: CredentialStatusBadgeProps) {
  const config = credentialStatusConfig[status];

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        config.className,
        className
      )}
      title={config.description}
    >
      {config.label}
    </span>
  );
}

// =============================================================================
// Integration Health Badge
// =============================================================================

interface ConnectionHealthSummary {
  totalConnections: number;
  healthy: number;
  degraded: number;
  unhealthy: number;
  unknown: number;
}

export interface IntegrationHealthBadgeProps {
  integrationStatus: IntegrationStatus;
  connectionHealth?: ConnectionHealthSummary;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

/**
 * Health-aware status badge for integrations.
 * Shows:
 * - "Healthy" when all connections are healthy
 * - "X Healthy, Y Unhealthy" when there are mixed health states
 * - "No Connections" when there are no connections
 * - "Draft" when the integration is in draft status
 */
export function IntegrationHealthBadge({
  integrationStatus,
  connectionHealth,
  size = 'sm',
  className,
}: IntegrationHealthBadgeProps) {
  // If draft, show Draft badge
  if (integrationStatus === 'draft') {
    return <IntegrationStatusBadge status="draft" size={size} className={className} />;
  }

  // If disabled, show Disabled badge
  if (integrationStatus === 'disabled') {
    return <IntegrationStatusBadge status="disabled" size={size} className={className} />;
  }

  // If no health data or no connections, show the regular status badge
  if (!connectionHealth || connectionHealth.totalConnections === 0) {
    // For active integrations with no connections yet
    if (integrationStatus === 'active') {
      return (
        <span
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground',
            className
          )}
          title="No connections configured yet"
        >
          <CheckCircle2 className="h-3 w-3" />
          No Connections
        </span>
      );
    }
    return <IntegrationStatusBadge status={integrationStatus} size={size} className={className} />;
  }

  const { healthy, degraded, unhealthy } = connectionHealth;
  const hasIssues = degraded > 0 || unhealthy > 0;

  // All healthy
  if (!hasIssues && healthy > 0) {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success',
          className
        )}
        title={`All ${healthy} connection${healthy > 1 ? 's' : ''} healthy`}
      >
        <CheckCircle2 className="h-3 w-3" />
        Healthy
      </span>
    );
  }

  // Some unhealthy
  if (unhealthy > 0) {
    const healthyText = healthy > 0 ? `${healthy} Healthy, ` : '';
    const degradedText = degraded > 0 ? `${degraded} Degraded, ` : '';
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive',
          className
        )}
        title={`${healthyText}${degradedText}${unhealthy} Unhealthy`}
      >
        <AlertCircle className="h-3 w-3" />
        {unhealthy} Unhealthy
      </span>
    );
  }

  // Some degraded but none unhealthy
  if (degraded > 0) {
    const healthyText = healthy > 0 ? `${healthy} Healthy, ` : '';
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning',
          className
        )}
        title={`${healthyText}${degraded} Degraded`}
      >
        <AlertCircle className="h-3 w-3" />
        {degraded} Degraded
      </span>
    );
  }

  // No health data yet (all unknown)
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground',
        className
      )}
      title="Health checks have not run yet"
    >
      <Clock className="h-3 w-3" />
      Pending
    </span>
  );
}
