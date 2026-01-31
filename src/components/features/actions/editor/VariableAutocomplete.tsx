'use client';

import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverAnchor } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useVariables, BUILT_IN_VARIABLES } from '@/hooks';
import { cn } from '@/lib/utils';

interface VariableOption {
  path: string;
  description: string;
  category: string;
  isBuiltIn: boolean;
}

interface VariableAutocompleteInputProps {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  className?: string;
  multiline?: boolean;
  disabled?: boolean;
}

export function VariableAutocompleteInput({
  value,
  onChange,
  onBlur,
  placeholder,
  className,
  multiline = false,
  disabled = false,
}: VariableAutocompleteInputProps) {
  const [open, setOpen] = useState(false);
  const [cursorPosition, setCursorPosition] = useState(0);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  // Fetch tenant variables for autocomplete
  const { data: variablesData } = useVariables({ limit: 100 });
  const tenantVariables = useMemo(() => variablesData?.data ?? [], [variablesData]);

  // Build autocomplete options
  const options = useMemo<VariableOption[]>(() => {
    const opts: VariableOption[] = [];

    // Add user-defined variables
    tenantVariables.forEach((v) => {
      opts.push({
        path: `var.${v.key}`,
        description: v.description || `${v.valueType} variable`,
        category: 'var',
        isBuiltIn: false,
      });
    });

    // Add built-in variables
    BUILT_IN_VARIABLES.forEach((v) => {
      opts.push({
        path: v.path,
        description: v.description,
        category: v.category,
        isBuiltIn: true,
      });
    });

    return opts;
  }, [tenantVariables]);

  // Detect if we're in the middle of typing a variable reference
  const getPartialMatch = useCallback(
    (text: string, pos: number): { start: number; partial: string } | null => {
      // Look backwards from cursor for ${
      let start = -1;
      for (let i = pos - 1; i >= 0; i--) {
        if (text[i] === '}') return null; // Already closed
        if (text[i] === '{' && i > 0 && text[i - 1] === '$') {
          start = i - 1;
          break;
        }
      }
      if (start === -1) return null;

      // Extract partial variable name
      const partial = text.slice(start + 2, pos);
      return { start, partial };
    },
    []
  );

  const partialMatch = useMemo(
    () => getPartialMatch(value, cursorPosition),
    [value, cursorPosition, getPartialMatch]
  );

  // Filter options based on partial match
  const filteredOptions = useMemo(() => {
    if (!partialMatch) return [];
    const partial = partialMatch.partial.toLowerCase();
    return options.filter(
      (opt) =>
        opt.path.toLowerCase().includes(partial) || opt.description.toLowerCase().includes(partial)
    );
  }, [options, partialMatch]);

  // Group options by category
  const groupedOptions = useMemo(() => {
    const groups: Record<string, VariableOption[]> = {};
    filteredOptions.forEach((opt) => {
      if (!groups[opt.category]) {
        groups[opt.category] = [];
      }
      groups[opt.category].push(opt);
    });
    return groups;
  }, [filteredOptions]);

  // Show popover when we have a partial match and filtered options
  useEffect(() => {
    setOpen(!!partialMatch && filteredOptions.length > 0);
  }, [partialMatch, filteredOptions]);

  const handleSelect = (option: VariableOption) => {
    if (!partialMatch) return;

    // Replace the partial ${...} with the complete reference
    const before = value.slice(0, partialMatch.start);
    const after = value.slice(cursorPosition);
    const newValue = `${before}\${${option.path}}${after}`;

    onChange(newValue);
    setOpen(false);

    // Set cursor position after the inserted variable
    const newPos = partialMatch.start + option.path.length + 3; // ${...}
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.setSelectionRange(newPos, newPos);
        inputRef.current.focus();
      }
    }, 0);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    onChange(e.target.value);
    setCursorPosition(e.target.selectionStart ?? 0);
  };

  const handleKeyDown = () => {
    // Update cursor position on arrow keys
    setTimeout(() => {
      if (inputRef.current) {
        setCursorPosition(inputRef.current.selectionStart ?? 0);
      }
    }, 0);
  };

  const handleClick = () => {
    if (inputRef.current) {
      setCursorPosition(inputRef.current.selectionStart ?? 0);
    }
  };

  const getCategoryLabel = (category: string) => {
    switch (category) {
      case 'var':
        return 'Custom Variables';
      case 'current_user':
        return 'Current User';
      case 'connection':
        return 'Connection';
      case 'request':
        return 'Request';
      default:
        return category;
    }
  };

  const InputComponent = multiline ? Textarea : Input;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <InputComponent
          ref={inputRef as React.RefObject<HTMLInputElement & HTMLTextAreaElement>}
          value={value}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onClick={handleClick}
          onBlur={onBlur}
          placeholder={placeholder}
          disabled={disabled}
          className={cn('font-mono text-sm', className)}
        />
      </PopoverAnchor>
      <PopoverContent
        className="w-[400px] p-0"
        align="start"
        sideOffset={5}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <Command>
          <CommandList>
            <CommandEmpty>No variables found</CommandEmpty>
            {Object.entries(groupedOptions).map(([category, categoryOptions]) => (
              <CommandGroup key={category} heading={getCategoryLabel(category)}>
                {categoryOptions.map((option) => (
                  <CommandItem
                    key={option.path}
                    value={option.path}
                    onSelect={() => handleSelect(option)}
                    className="flex items-center justify-between gap-2"
                  >
                    <div className="flex items-center gap-2">
                      <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                        ${'{' + option.path + '}'}
                      </code>
                      {option.isBuiltIn && (
                        <Badge variant="outline" className="text-[10px]">
                          built-in
                        </Badge>
                      )}
                    </div>
                    <span className="max-w-[180px] truncate text-xs text-muted-foreground">
                      {option.description}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Helper component to show available variables below an input
 */
interface VariableHintProps {
  className?: string;
}

export function VariableHint({ className }: VariableHintProps) {
  return (
    <p className={cn('text-xs text-muted-foreground', className)}>
      Type <code className="rounded bg-muted px-1">${'{'}</code> to insert a variable reference
    </p>
  );
}

/**
 * Badge list of available variables for quick reference
 */
interface VariableBadgeListProps {
  onInsert?: (path: string) => void;
  className?: string;
}

export function VariableBadgeList({ onInsert, className }: VariableBadgeListProps) {
  const { data: variablesData } = useVariables({ limit: 50 });
  const tenantVariables = useMemo(() => variablesData?.data ?? [], [variablesData]);

  const allVariables = useMemo(() => {
    const vars: VariableOption[] = [];

    // Custom variables first
    tenantVariables.forEach((v) => {
      vars.push({
        path: `var.${v.key}`,
        description: v.description || '',
        category: 'var',
        isBuiltIn: false,
      });
    });

    // Then built-in
    BUILT_IN_VARIABLES.forEach((v) => {
      vars.push({
        path: v.path,
        description: v.description,
        category: v.category,
        isBuiltIn: true,
      });
    });

    return vars;
  }, [tenantVariables]);

  if (allVariables.length === 0) return null;

  return (
    <div className={cn('space-y-2', className)}>
      <p className="text-xs font-medium text-muted-foreground">Available Variables</p>
      <div className="flex flex-wrap gap-1.5">
        {allVariables.slice(0, 10).map((v) => (
          <Badge
            key={v.path}
            variant="outline"
            className={cn(
              'cursor-pointer font-mono text-[10px] transition-colors hover:bg-muted',
              onInsert && 'hover:border-primary'
            )}
            onClick={() => onInsert?.(`\${${v.path}}`)}
          >
            ${'{' + v.path + '}'}
          </Badge>
        ))}
        {allVariables.length > 10 && (
          <Badge variant="outline" className="text-[10px] text-muted-foreground">
            +{allVariables.length - 10} more
          </Badge>
        )}
      </div>
    </div>
  );
}
