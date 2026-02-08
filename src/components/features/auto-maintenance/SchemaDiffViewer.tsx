'use client';

import { useState } from 'react';
import { ChevronRight, ChevronDown, Plus, Minus, Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ProposalChange } from '@/lib/modules/auto-maintenance/auto-maintenance.schemas';

// =============================================================================
// Types
// =============================================================================

interface SchemaDiffViewerProps {
  currentSchema: Record<string, unknown>;
  proposedSchema: Record<string, unknown>;
  direction: 'Input Schema' | 'Output Schema';
  changes?: ProposalChange[];
  className?: string;
}

type DiffStatus = 'added' | 'removed' | 'modified' | 'unchanged';

interface DiffNode {
  key: string;
  path: string;
  currentValue: unknown;
  proposedValue: unknown;
  status: DiffStatus;
  children: DiffNode[];
}

// =============================================================================
// Diff Computation
// =============================================================================

function computeDiff(
  current: Record<string, unknown>,
  proposed: Record<string, unknown>,
  parentPath: string = ''
): DiffNode[] {
  const allKeys = new Set([...Object.keys(current), ...Object.keys(proposed)]);
  const nodes: DiffNode[] = [];

  for (const key of Array.from(allKeys)) {
    const path = parentPath ? `${parentPath}.${key}` : key;
    const currentVal = current[key];
    const proposedVal = proposed[key];

    const inCurrent = key in current;
    const inProposed = key in proposed;

    let status: DiffStatus;
    if (!inCurrent && inProposed) {
      status = 'added';
    } else if (inCurrent && !inProposed) {
      status = 'removed';
    } else if (isPlainObject(currentVal) && isPlainObject(proposedVal)) {
      const children = computeDiff(
        currentVal as Record<string, unknown>,
        proposedVal as Record<string, unknown>,
        path
      );
      const hasChanges = children.some((c) => c.status !== 'unchanged');
      status = hasChanges ? 'modified' : 'unchanged';
      nodes.push({
        key,
        path,
        currentValue: currentVal,
        proposedValue: proposedVal,
        status,
        children,
      });
      continue;
    } else if (JSON.stringify(currentVal) !== JSON.stringify(proposedVal)) {
      status = 'modified';
    } else {
      status = 'unchanged';
    }

    let children: DiffNode[] = [];
    if (isPlainObject(proposedVal) && status === 'added') {
      children = objectToNodes(proposedVal as Record<string, unknown>, path, 'added');
    } else if (isPlainObject(currentVal) && status === 'removed') {
      children = objectToNodes(currentVal as Record<string, unknown>, path, 'removed');
    }

    nodes.push({
      key,
      path,
      currentValue: currentVal,
      proposedValue: proposedVal,
      status,
      children,
    });
  }

  return nodes;
}

function objectToNodes(
  obj: Record<string, unknown>,
  parentPath: string,
  status: DiffStatus
): DiffNode[] {
  return Object.entries(obj).map(([key, value]) => {
    const path = `${parentPath}.${key}`;
    const children = isPlainObject(value)
      ? objectToNodes(value as Record<string, unknown>, path, status)
      : [];
    return {
      key,
      path,
      currentValue: status === 'removed' ? value : undefined,
      proposedValue: status === 'added' ? value : undefined,
      status,
      children,
    };
  });
}

function isPlainObject(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

// =============================================================================
// Formatting
// =============================================================================

function formatValue(val: unknown): string {
  if (val === undefined) return '';
  if (val === null) return 'null';
  if (typeof val === 'string') return `"${val}"`;
  if (typeof val === 'boolean' || typeof val === 'number') return String(val);
  if (Array.isArray(val)) return JSON.stringify(val);
  if (isPlainObject(val)) return '{...}';
  return String(val);
}

// =============================================================================
// Sub-Components
// =============================================================================

const statusStyles: Record<DiffStatus, string> = {
  added: 'bg-emerald-500/10 border-l-2 border-emerald-500',
  removed: 'bg-destructive/10 border-l-2 border-destructive',
  modified: 'bg-amber-500/10 border-l-2 border-amber-500',
  unchanged: '',
};

const statusIcons: Record<DiffStatus, React.ElementType | null> = {
  added: Plus,
  removed: Minus,
  modified: Pencil,
  unchanged: null,
};

function DiffNodeRow({
  node,
  depth,
  changes,
}: {
  node: DiffNode;
  depth: number;
  changes?: ProposalChange[];
}) {
  const [expanded, setExpanded] = useState(node.status !== 'unchanged');
  const hasChildren = node.children.length > 0;
  const StatusIcon = statusIcons[node.status];

  const matchingChange = changes?.find(
    (c) => node.path.endsWith(c.fieldPath) || c.fieldPath.endsWith(node.key)
  );

  return (
    <>
      <div
        className={cn(
          'flex items-center gap-1 px-2 py-1 font-mono text-sm',
          statusStyles[node.status],
          hasChildren && 'cursor-pointer'
        )}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={hasChildren ? () => setExpanded(!expanded) : undefined}
      >
        {hasChildren ? (
          expanded ? (
            <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
          )
        ) : (
          <span className="w-3 shrink-0" />
        )}

        {StatusIcon && <StatusIcon className="h-3 w-3 shrink-0" />}

        <span className={cn('font-medium', node.status === 'removed' && 'line-through opacity-70')}>
          {node.key}
        </span>

        {!hasChildren && node.status === 'modified' && (
          <span className="ml-2 text-xs text-muted-foreground">
            <span className="text-destructive line-through">{formatValue(node.currentValue)}</span>
            <span className="mx-1">&rarr;</span>
            <span className="text-emerald-600">{formatValue(node.proposedValue)}</span>
          </span>
        )}

        {!hasChildren && node.status === 'added' && (
          <span className="ml-2 text-xs text-emerald-600">{formatValue(node.proposedValue)}</span>
        )}

        {!hasChildren && node.status === 'removed' && (
          <span className="ml-2 text-xs text-destructive line-through">
            {formatValue(node.currentValue)}
          </span>
        )}

        {!hasChildren && node.status === 'unchanged' && (
          <span className="ml-2 text-xs text-muted-foreground">
            {formatValue(node.currentValue)}
          </span>
        )}

        {matchingChange && (
          <span className="ml-auto max-w-[200px] truncate text-xs italic text-muted-foreground">
            {matchingChange.description}
          </span>
        )}
      </div>

      {expanded &&
        hasChildren &&
        node.children.map((child) => (
          <DiffNodeRow key={child.path} node={child} depth={depth + 1} changes={changes} />
        ))}
    </>
  );
}

// =============================================================================
// Main Component
// =============================================================================

/**
 * Renders a side-by-side-style diff view of two JSON Schema objects.
 * Highlights added (green), removed (red), and modified (amber) fields.
 * Supports collapsible nested objects for large schemas.
 */
export function SchemaDiffViewer({
  currentSchema,
  proposedSchema,
  direction,
  changes,
  className,
}: SchemaDiffViewerProps) {
  const diffNodes = computeDiff(currentSchema, proposedSchema);
  const hasChanges = diffNodes.some((n) => n.status !== 'unchanged');

  if (!hasChanges) {
    return (
      <div
        className={cn('rounded-lg border p-4 text-center text-sm text-muted-foreground', className)}
      >
        No changes to {direction.toLowerCase()}
      </div>
    );
  }

  return (
    <div className={cn('rounded-lg border', className)}>
      <div className="flex items-center justify-between border-b px-3 py-2">
        <span className="text-sm font-medium">{direction}</span>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-emerald-500" /> Added
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-destructive" /> Removed
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-amber-500" /> Modified
          </span>
        </div>
      </div>
      <div className="max-h-[400px] divide-y divide-border/50 overflow-y-auto">
        {diffNodes.map((node) => (
          <DiffNodeRow key={node.path} node={node} depth={0} changes={changes} />
        ))}
      </div>
    </div>
  );
}
