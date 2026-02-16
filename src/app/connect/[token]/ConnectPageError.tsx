import { AlertCircle, Clock, CheckCircle2, XCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

interface ConnectPageErrorProps {
  type: 'not_found' | 'expired' | 'completed' | 'error';
}

const errorConfig = {
  not_found: {
    icon: XCircle,
    iconColor: 'text-destructive',
    bgColor: 'bg-destructive/10',
    title: 'Session Not Found',
    description:
      'This connect link is invalid or has already been used. Please request a new one from the application.',
  },
  expired: {
    icon: Clock,
    iconColor: 'text-amber-500',
    bgColor: 'bg-amber-500/10',
    title: 'Session Expired',
    description:
      'This connect session has expired. Please request a new connect link from the application.',
  },
  completed: {
    icon: CheckCircle2,
    iconColor: 'text-emerald-500',
    bgColor: 'bg-emerald-500/10',
    title: 'Already Connected',
    description:
      'This connect session has already been completed successfully. You can close this window.',
  },
  error: {
    icon: AlertCircle,
    iconColor: 'text-destructive',
    bgColor: 'bg-destructive/10',
    title: 'Something Went Wrong',
    description:
      'An unexpected error occurred. Please try again or request a new connect link from the application.',
  },
};

export function ConnectPageError({ type }: ConnectPageErrorProps) {
  const config = errorConfig[type];
  const Icon = config.icon;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardContent className="flex flex-col items-center gap-4 pb-8 pt-8 text-center">
          <div
            className={`flex h-16 w-16 items-center justify-center rounded-full ${config.bgColor}`}
          >
            <Icon className={`h-8 w-8 ${config.iconColor}`} />
          </div>
          <div className="space-y-2">
            <h1 className="text-xl font-semibold tracking-tight">{config.title}</h1>
            <p className="text-sm text-muted-foreground">{config.description}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
