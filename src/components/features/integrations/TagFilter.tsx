'use client';

import * as React from 'react';
import { Check, Tags } from 'lucide-react';
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
import { TagBadge } from '@/components/ui/tag-badge';

export interface TagFilterProps {
  /** Currently selected tags for filtering */
  selectedTags: string[];
  /** Callback when selection changes */
  onSelectionChange: (tags: string[]) => void;
  /** Available tags to choose from */
  availableTags: string[];
  /** Placeholder text when no tags selected */
  placeholder?: string;
  /** Additional className */
  className?: string;
}

/**
 * TagFilter - A dropdown for filtering by tags
 *
 * Used in list views to filter integrations/actions by their tags.
 */
export function TagFilter({
  selectedTags,
  onSelectionChange,
  availableTags,
  placeholder = 'Filter by tags',
  className,
}: TagFilterProps) {
  const [open, setOpen] = React.useState(false);

  const toggleTag = (tag: string) => {
    if (selectedTags.includes(tag)) {
      onSelectionChange(selectedTags.filter((t) => t !== tag));
    } else {
      onSelectionChange([...selectedTags, tag]);
    }
  };

  const clearAll = () => {
    onSelectionChange([]);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn('w-[180px] justify-between', className)}
        >
          <div className="flex items-center gap-2 truncate">
            <Tags className="h-4 w-4 shrink-0" />
            {selectedTags.length === 0 ? (
              <span className="text-muted-foreground">{placeholder}</span>
            ) : selectedTags.length === 1 ? (
              <span className="truncate">{selectedTags[0]}</span>
            ) : (
              <span>{selectedTags.length} tags</span>
            )}
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[220px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search tags..." />
          <CommandList>
            <CommandEmpty>No tags found.</CommandEmpty>
            <CommandGroup>
              {availableTags.map((tag) => {
                const isSelected = selectedTags.includes(tag);
                return (
                  <CommandItem
                    key={tag}
                    value={tag}
                    onSelect={() => toggleTag(tag)}
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
                    <TagBadge tag={tag} size="sm" />
                  </CommandItem>
                );
              })}
            </CommandGroup>
            {selectedTags.length > 0 && (
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
