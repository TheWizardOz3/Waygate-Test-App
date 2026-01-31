'use client';

import { Loader2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface DeleteVariableDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  variableKey: string;
  onConfirm: () => void;
  isDeleting: boolean;
}

export function DeleteVariableDialog({
  open,
  onOpenChange,
  variableKey,
  onConfirm,
  isDeleting,
}: DeleteVariableDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
              <AlertTriangle className="h-5 w-5 text-destructive" />
            </div>
            <div>
              <AlertDialogTitle>Delete Variable</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete{' '}
                <code className="rounded bg-muted px-1 font-mono">{variableKey}</code>?
              </AlertDialogDescription>
            </div>
          </div>
        </AlertDialogHeader>
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
          <p className="text-sm text-amber-600">
            This action cannot be undone. Any action configurations referencing this variable will
            fail to resolve.
          </p>
        </div>
        <AlertDialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isDeleting}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={isDeleting}>
            {isDeleting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Deleting...
              </>
            ) : (
              'Delete Variable'
            )}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
