'use client';

import * as React from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getTagColor } from '@/lib/utils/tag-colors';

export interface TagBadgeProps {
  /** The tag text to display */
  tag: string;
  /** Optional callback when remove button is clicked */
  onRemove?: (tag: string) => void;
  /** Whether the tag is removable (shows X button) */
  removable?: boolean;
  /** Optional click handler for the tag itself */
  onClick?: (tag: string) => void;
  /** Additional className */
  className?: string;
  /** Size variant */
  size?: 'sm' | 'default';
}

/**
 * TagBadge - A colored badge for displaying tags
 *
 * Colors are automatically generated based on the tag name for consistency.
 */
export function TagBadge({
  tag,
  onRemove,
  removable = false,
  onClick,
  className,
  size = 'default',
}: TagBadgeProps) {
  const color = getTagColor(tag);

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    onRemove?.(tag);
  };

  const handleClick = () => {
    onClick?.(tag);
  };

  const isClickable = !!onClick;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md border font-medium',
        color.bg,
        color.text,
        color.border,
        color.darkBg,
        color.darkText,
        color.darkBorder,
        size === 'sm' ? 'px-1.5 py-0.5 text-xs' : 'px-2 py-1 text-xs',
        isClickable && 'cursor-pointer hover:opacity-80',
        className
      )}
      onClick={isClickable ? handleClick : undefined}
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
    >
      {tag}
      {removable && (
        <button
          type="button"
          onClick={handleRemove}
          className="ml-0.5 rounded-sm opacity-70 hover:opacity-100 focus:outline-none focus:ring-1 focus:ring-offset-1"
          aria-label={`Remove ${tag} tag`}
        >
          <X className={cn(size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5')} />
        </button>
      )}
    </span>
  );
}

/**
 * TagList - A simple wrapper for rendering multiple tags
 */
export interface TagListProps {
  tags: string[];
  onRemove?: (tag: string) => void;
  onClick?: (tag: string) => void;
  removable?: boolean;
  size?: 'sm' | 'default';
  className?: string;
  maxVisible?: number;
}

export function TagList({
  tags,
  onRemove,
  onClick,
  removable = false,
  size = 'default',
  className,
  maxVisible,
}: TagListProps) {
  const visibleTags = maxVisible ? tags.slice(0, maxVisible) : tags;
  const hiddenCount = maxVisible ? Math.max(0, tags.length - maxVisible) : 0;

  if (tags.length === 0) {
    return null;
  }

  return (
    <div className={cn('flex flex-wrap gap-1', className)}>
      {visibleTags.map((tag) => (
        <TagBadge
          key={tag}
          tag={tag}
          onRemove={onRemove}
          onClick={onClick}
          removable={removable}
          size={size}
        />
      ))}
      {hiddenCount > 0 && (
        <span
          className={cn(
            'inline-flex items-center rounded-md border bg-muted px-1.5 text-muted-foreground',
            size === 'sm' ? 'py-0.5 text-xs' : 'py-1 text-xs'
          )}
        >
          +{hiddenCount} more
        </span>
      )}
    </div>
  );
}
