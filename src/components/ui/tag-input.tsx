'use client';

import * as React from 'react';
import { X, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from './input';
import { Button } from './button';
import { TagBadge } from './tag-badge';
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from './command';
import { Popover, PopoverContent, PopoverTrigger } from './popover';

export interface TagInputProps {
  /** Currently selected tags */
  value: string[];
  /** Callback when tags change */
  onChange: (tags: string[]) => void;
  /** Available tags for autocomplete */
  suggestions?: string[];
  /** Placeholder text */
  placeholder?: string;
  /** Maximum number of tags allowed */
  maxTags?: number;
  /** Whether the input is disabled */
  disabled?: boolean;
  /** Additional className for the container */
  className?: string;
}

/**
 * TagInput - A multi-select tag input with autocomplete
 *
 * Features:
 * - Add tags by typing and pressing Enter
 * - Autocomplete from existing tags
 * - Create new tags inline
 * - Remove tags with click or backspace
 */
export function TagInput({
  value,
  onChange,
  suggestions = [],
  placeholder = 'Add tags...',
  maxTags = 10,
  disabled = false,
  className,
}: TagInputProps) {
  const [inputValue, setInputValue] = React.useState('');
  const [open, setOpen] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Filter suggestions to exclude already selected tags and match input
  const filteredSuggestions = React.useMemo(() => {
    const lowerInput = inputValue.toLowerCase().trim();
    return suggestions.filter(
      (tag) => !value.includes(tag) && (lowerInput === '' || tag.toLowerCase().includes(lowerInput))
    );
  }, [suggestions, value, inputValue]);

  // Normalize tag: lowercase, trim, replace spaces with hyphens
  const normalizeTag = (tag: string): string => {
    return tag
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .slice(0, 30);
  };

  const addTag = (tag: string) => {
    const normalized = normalizeTag(tag);
    if (
      normalized &&
      normalized.length >= 2 &&
      !value.includes(normalized) &&
      value.length < maxTags
    ) {
      onChange([...value, normalized]);
      setInputValue('');
      setOpen(false);
    }
  };

  const removeTag = (tagToRemove: string) => {
    onChange(value.filter((tag) => tag !== tagToRemove));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && inputValue.trim()) {
      e.preventDefault();
      addTag(inputValue);
    } else if (e.key === 'Backspace' && !inputValue && value.length > 0) {
      // Remove last tag on backspace when input is empty
      removeTag(value[value.length - 1]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  const canAddNew =
    inputValue.trim().length >= 2 &&
    !value.includes(normalizeTag(inputValue)) &&
    value.length < maxTags;

  const showCreateOption = canAddNew && !filteredSuggestions.includes(normalizeTag(inputValue));

  return (
    <div className={cn('space-y-2', className)}>
      {/* Selected tags */}
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {value.map((tag) => (
            <TagBadge key={tag} tag={tag} removable onRemove={removeTag} size="default" />
          ))}
        </div>
      )}

      {/* Input with popover */}
      {value.length < maxTags && (
        <Popover open={open && !disabled} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <div className="relative">
              <Input
                ref={inputRef}
                value={inputValue}
                onChange={(e) => {
                  setInputValue(e.target.value);
                  if (!open && e.target.value) {
                    setOpen(true);
                  }
                }}
                onKeyDown={handleKeyDown}
                onFocus={() => setOpen(true)}
                placeholder={placeholder}
                disabled={disabled}
                className="pr-8"
              />
              {inputValue && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full w-8 hover:bg-transparent"
                  onClick={() => setInputValue('')}
                >
                  <X className="h-4 w-4 text-muted-foreground" />
                </Button>
              )}
            </div>
          </PopoverTrigger>
          <PopoverContent
            className="w-[var(--radix-popover-trigger-width)] p-0"
            align="start"
            onOpenAutoFocus={(e) => e.preventDefault()}
          >
            <Command>
              <CommandList>
                {filteredSuggestions.length === 0 && !showCreateOption ? (
                  <CommandEmpty>
                    {inputValue.trim().length < 2
                      ? 'Type at least 2 characters'
                      : 'No matching tags'}
                  </CommandEmpty>
                ) : (
                  <>
                    {showCreateOption && (
                      <CommandGroup heading="Create new">
                        <CommandItem onSelect={() => addTag(inputValue)} className="gap-2">
                          <Plus className="h-4 w-4" />
                          Create &quot;{normalizeTag(inputValue)}&quot;
                        </CommandItem>
                      </CommandGroup>
                    )}
                    {filteredSuggestions.length > 0 && (
                      <CommandGroup heading="Suggestions">
                        {filteredSuggestions.slice(0, 8).map((tag) => (
                          <CommandItem key={tag} onSelect={() => addTag(tag)}>
                            <TagBadge tag={tag} size="sm" className="mr-2" />
                            {tag}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    )}
                  </>
                )}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      )}

      {/* Tag limit message */}
      {value.length >= maxTags && (
        <p className="text-xs text-muted-foreground">Maximum {maxTags} tags allowed</p>
      )}
    </div>
  );
}
