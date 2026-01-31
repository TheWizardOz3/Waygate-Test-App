'use client';

import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCreateVariable, useCreateConnectionVariable, useUpdateVariable } from '@/hooks';
import { toast } from 'sonner';
import type {
  VariableResponse,
  VariableTypeValue,
  Environment,
  CreateVariableInput,
} from '@/lib/modules/variables/variable.schemas';

interface VariableDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  variable?: VariableResponse | null;
  connectionId?: string;
  onSuccess?: () => void;
}

const VALUE_TYPES: { value: VariableTypeValue; label: string }[] = [
  { value: 'string', label: 'String' },
  { value: 'number', label: 'Number' },
  { value: 'boolean', label: 'Boolean' },
  { value: 'json', label: 'JSON Object' },
];

const ENVIRONMENTS: { value: Environment | 'all'; label: string }[] = [
  { value: 'all', label: 'All Environments' },
  { value: 'development', label: 'Development' },
  { value: 'staging', label: 'Staging' },
  { value: 'production', label: 'Production' },
];

export function VariableDialog({
  open,
  onOpenChange,
  variable,
  connectionId,
  onSuccess,
}: VariableDialogProps) {
  const isEditing = !!variable;

  // Form state
  const [key, setKey] = useState('');
  const [value, setValue] = useState('');
  const [valueType, setValueType] = useState<VariableTypeValue>('string');
  const [sensitive, setSensitive] = useState(false);
  const [environment, setEnvironment] = useState<Environment | 'all'>('all');
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Mutations
  const createMutation = useCreateVariable();
  const createConnectionMutation = useCreateConnectionVariable(connectionId ?? '');
  const updateMutation = useUpdateVariable(connectionId);

  // Reset form when dialog opens/closes or variable changes
  useEffect(() => {
    if (open) {
      if (variable) {
        setKey(variable.key);
        // Don't show redacted values
        if (!variable.sensitive) {
          setValue(
            variable.valueType === 'json'
              ? JSON.stringify(variable.value, null, 2)
              : String(variable.value)
          );
        } else {
          setValue('');
        }
        setValueType(variable.valueType);
        setSensitive(variable.sensitive);
        setEnvironment(variable.environment ?? 'all');
        setDescription(variable.description ?? '');
      } else {
        setKey('');
        setValue('');
        setValueType('string');
        setSensitive(false);
        setEnvironment('all');
        setDescription('');
      }
      setErrors({});
    }
  }, [open, variable]);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!key.trim()) {
      newErrors.key = 'Variable key is required';
    } else if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(key)) {
      newErrors.key =
        'Key must start with a letter and contain only letters, numbers, and underscores';
    } else if (['current_user', 'connection', 'request', 'var'].includes(key)) {
      newErrors.key = 'This key name is reserved';
    }

    // For sensitive variables being edited, value is optional (keeps existing)
    if (!value.trim() && !(isEditing && sensitive)) {
      newErrors.value = 'Value is required';
    }

    // Validate value matches type
    if (value.trim()) {
      if (valueType === 'number' && isNaN(Number(value))) {
        newErrors.value = 'Value must be a valid number';
      }
      if (valueType === 'boolean' && !['true', 'false'].includes(value.toLowerCase())) {
        newErrors.value = 'Value must be "true" or "false"';
      }
      if (valueType === 'json') {
        try {
          JSON.parse(value);
        } catch {
          newErrors.value = 'Value must be valid JSON';
        }
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const parseValue = (): unknown => {
    switch (valueType) {
      case 'number':
        return Number(value);
      case 'boolean':
        return value.toLowerCase() === 'true';
      case 'json':
        return JSON.parse(value);
      default:
        return value;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    try {
      const parsedValue = parseValue();
      const env = environment === 'all' ? null : environment;

      if (isEditing) {
        // Update existing variable
        const updateData: Record<string, unknown> = {
          id: variable!.id,
          valueType,
          sensitive,
          environment: env,
          description: description || null,
        };
        // Only include value if it's been changed (for sensitive vars, empty means keep existing)
        if (value.trim()) {
          updateData.value = parsedValue;
        }
        await updateMutation.mutateAsync(
          updateData as Parameters<typeof updateMutation.mutateAsync>[0]
        );
        toast.success('Variable updated');
      } else {
        // Create new variable
        const createData = {
          key,
          value: parsedValue as CreateVariableInput['value'],
          valueType,
          sensitive,
          environment: env,
          description: description || null,
        };

        if (connectionId) {
          await createConnectionMutation.mutateAsync(createData);
        } else {
          await createMutation.mutateAsync(createData);
        }
        toast.success('Variable created');
      }

      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save variable';
      toast.error(message);
    }
  };

  const isPending =
    createMutation.isPending || createConnectionMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Variable' : 'Create Variable'}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Update the variable value and settings.'
              : connectionId
                ? 'Create a connection-level variable override.'
                : 'Create a new tenant-level variable.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Key */}
          <div className="space-y-2">
            <Label htmlFor="key">Variable Key</Label>
            <Input
              id="key"
              placeholder="api_version"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              disabled={isEditing}
              className="font-mono"
            />
            {errors.key && <p className="text-xs text-destructive">{errors.key}</p>}
            {!isEditing && (
              <p className="text-xs text-muted-foreground">
                Reference as{' '}
                <code className="rounded bg-muted px-1">${'{var.' + (key || 'key') + '}'}</code>
              </p>
            )}
          </div>

          {/* Value Type */}
          <div className="space-y-2">
            <Label>Value Type</Label>
            <Select value={valueType} onValueChange={(v) => setValueType(v as VariableTypeValue)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VALUE_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Value */}
          <div className="space-y-2">
            <Label htmlFor="value">Value</Label>
            {valueType === 'json' ? (
              <Textarea
                id="value"
                placeholder='{"key": "value"}'
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="min-h-[100px] font-mono text-sm"
              />
            ) : valueType === 'boolean' ? (
              <Select value={value} onValueChange={setValue}>
                <SelectTrigger>
                  <SelectValue placeholder="Select value" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">true</SelectItem>
                  <SelectItem value="false">false</SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <Input
                id="value"
                type={valueType === 'number' ? 'number' : 'text'}
                placeholder={valueType === 'number' ? '0' : 'value'}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="font-mono"
              />
            )}
            {errors.value && <p className="text-xs text-destructive">{errors.value}</p>}
            {isEditing && sensitive && (
              <p className="text-xs text-muted-foreground">
                Leave empty to keep the existing encrypted value.
              </p>
            )}
          </div>

          {/* Environment */}
          <div className="space-y-2">
            <Label>Environment</Label>
            <Select
              value={environment}
              onValueChange={(v) => setEnvironment(v as typeof environment)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ENVIRONMENTS.map((env) => (
                  <SelectItem key={env.value} value={env.value}>
                    {env.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Restrict this variable to a specific environment.
            </p>
          </div>

          {/* Sensitive */}
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="space-y-0.5">
              <Label>Sensitive</Label>
              <p className="text-xs text-muted-foreground">
                Encrypt the value and mask it in logs and UI
              </p>
            </div>
            <Switch checked={sensitive} onCheckedChange={setSensitive} />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Description (optional)</Label>
            <Input
              id="description"
              placeholder="What is this variable used for?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : isEditing ? (
              'Save Changes'
            ) : (
              'Create Variable'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
