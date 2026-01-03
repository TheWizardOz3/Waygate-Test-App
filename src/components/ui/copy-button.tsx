'use client';

import * as React from 'react';
import { Copy, Check } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Button } from './button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './tooltip';

interface CopyButtonProps {
  /** The text to copy to clipboard */
  value: string;
  /** Optional label for the toast notification */
  label?: string;
  /** Button size variant */
  size?: 'default' | 'sm' | 'icon';
  /** Additional className */
  className?: string;
  /** Show tooltip */
  showTooltip?: boolean;
}

/**
 * A button that copies text to clipboard with visual feedback.
 */
export function CopyButton({
  value,
  label = 'Copied to clipboard',
  size = 'icon',
  className,
  showTooltip = true,
}: CopyButtonProps) {
  const [isCopied, setIsCopied] = React.useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    try {
      await navigator.clipboard.writeText(value);
      setIsCopied(true);
      toast.success(label);
      setTimeout(() => setIsCopied(false), 2000);
    } catch {
      toast.error('Failed to copy');
    }
  };

  const button = (
    <Button
      variant="ghost"
      size={size}
      onClick={handleCopy}
      className={cn(
        'h-7 w-7 text-muted-foreground hover:text-foreground',
        size === 'sm' && 'h-6 w-6',
        className
      )}
    >
      {isCopied ? <Check className="h-3.5 w-3.5 text-accent" /> : <Copy className="h-3.5 w-3.5" />}
      <span className="sr-only">Copy</span>
    </Button>
  );

  if (!showTooltip) {
    return button;
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent>
          <p>{isCopied ? 'Copied!' : 'Copy'}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

interface CopyableTextProps {
  /** The text to display and copy */
  value: string;
  /** Optional label for the toast notification */
  label?: string;
  /** Additional className for the container */
  className?: string;
  /** Additional className for the text */
  textClassName?: string;
  /** Whether to use monospace font */
  mono?: boolean;
}

/**
 * Text with an inline copy button that appears on hover.
 */
export function CopyableText({
  value,
  label = 'Copied to clipboard',
  className,
  textClassName,
  mono = false,
}: CopyableTextProps) {
  return (
    <span className={cn('group inline-flex items-center gap-1', className)}>
      <span className={cn(mono && 'font-mono', textClassName)}>{value}</span>
      <CopyButton
        value={value}
        label={label}
        size="sm"
        className="opacity-0 transition-opacity group-hover:opacity-100"
      />
    </span>
  );
}
