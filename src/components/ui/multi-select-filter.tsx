'use client';

import * as React from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export interface FilterOption {
  value: string;
  label: string;
}

export interface MultiSelectFilterProps {
  /** Available options to select from */
  options: FilterOption[];
  /** Currently selected option values */
  selected: string[];
  /** Callback when selection changes */
  onSelectionChange: (selected: string[]) => void;
  /** Placeholder text when no options are selected (e.g., "All Types") */
  placeholder: string;
  /** Placeholder text for the search input */
  searchPlaceholder?: string;
  /** Text shown when no options match the search */
  emptyMessage?: string;
  /** Optional custom renderer for option items */
  renderOption?: (option: FilterOption) => React.ReactNode;
  /** Additional className for the trigger button */
  className?: string;
  /** Additional className for the popover content */
  contentClassName?: string;
  /** Alignment of the popover */
  align?: 'start' | 'end' | 'center';
}

export function MultiSelectFilter({
  options,
  selected,
  onSelectionChange,
  placeholder,
  searchPlaceholder = 'Search...',
  emptyMessage = 'No results found.',
  renderOption,
  className,
  contentClassName,
  align = 'start',
}: MultiSelectFilterProps) {
  const [open, setOpen] = React.useState(false);

  const toggleOption = (value: string) => {
    if (selected.includes(value)) {
      onSelectionChange(selected.filter((v) => v !== value));
    } else {
      onSelectionChange([...selected, value]);
    }
  };

  const clearAll = () => {
    onSelectionChange([]);
  };

  const triggerLabel = React.useMemo(() => {
    if (selected.length === 0) return placeholder;
    if (selected.length === 1) {
      return options.find((o) => o.value === selected[0])?.label ?? selected[0];
    }
    return `${selected.length} selected`;
  }, [selected, options, placeholder]);

  const hasSelection = selected.length > 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn('justify-between', className)}
        >
          <span className={cn('truncate', !hasSelection && 'text-muted-foreground')}>
            {triggerLabel}
          </span>
          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className={cn('w-[220px] p-0', contentClassName)} align={align}>
        <Command className="[&_[cmdk-input-wrapper]]:border-b-0 [&_[cmdk-input-wrapper]]:px-2 [&_[cmdk-input-wrapper]]:py-1 [&_[cmdk-input]]:h-7 [&_[cmdk-input]]:py-0 [&_[cmdk-input]]:text-xs">
          {options.length > 8 && <CommandInput placeholder={searchPlaceholder} />}
          <CommandList>
            <CommandEmpty>{emptyMessage}</CommandEmpty>
            <CommandGroup>
              {options.map((option) => {
                const isSelected = selected.includes(option.value);
                return (
                  <CommandItem
                    key={option.value}
                    value={option.label}
                    onSelect={() => toggleOption(option.value)}
                    className="gap-2"
                  >
                    <div
                      className={cn(
                        'flex h-4 w-4 items-center justify-center rounded-sm border',
                        isSelected
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-muted opacity-50'
                      )}
                    >
                      {isSelected && <Check className="h-3 w-3" />}
                    </div>
                    {renderOption ? renderOption(option) : <span>{option.label}</span>}
                  </CommandItem>
                );
              })}
            </CommandGroup>
            {hasSelection && (
              <CommandGroup>
                <CommandItem onSelect={clearAll} className="justify-center text-muted-foreground">
                  Clear all
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
