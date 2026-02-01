'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Sparkles,
  Wand2,
  ScrollText,
  Settings,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface NavItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  description?: string;
}

const navItems: NavItem[] = [
  {
    title: 'Dashboard',
    href: '/',
    icon: LayoutDashboard,
    description: 'Overview and quick stats',
  },
  {
    title: 'Integrations',
    href: '/integrations',
    icon: Sparkles,
    description: 'Manage your integrations',
  },
  {
    title: 'AI Tools',
    href: '/ai-tools',
    icon: Wand2,
    description: 'Composite and agentic tools',
  },
  {
    title: 'Logs',
    href: '/logs',
    icon: ScrollText,
    description: 'Request history and debugging',
  },
  {
    title: 'Settings',
    href: '/settings',
    icon: Settings,
    description: 'API keys and preferences',
  },
];

interface DashboardSidebarProps {
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

/**
 * Portal Logo SVG component
 * Represents a portal/gateway with energy flowing through
 */
function PortalLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      {/* Outer ring */}
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray="4 2"
      />
      {/* Inner portal */}
      <circle cx="12" cy="12" r="5" stroke="currentColor" strokeWidth="2" />
      {/* Center energy dot */}
      <circle cx="12" cy="12" r="2" fill="currentColor" />
      {/* Energy lines */}
      <path
        d="M12 3v2M12 19v2M3 12h2M19 12h2"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function DashboardSidebar({ collapsed = false, onToggleCollapse }: DashboardSidebarProps) {
  const pathname = usePathname();

  // Check if a nav item is active (exact match or starts with for nested routes)
  const isActive = (href: string) => {
    if (href === '/') {
      return pathname === '/';
    }
    return pathname.startsWith(href);
  };

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        className={cn(
          'flex h-screen flex-col border-r border-sidebar-border bg-sidebar transition-all duration-300',
          collapsed ? 'w-16' : 'w-64'
        )}
      >
        {/* Logo / Brand */}
        <Link
          href="/"
          className={cn(
            'flex h-16 items-center border-b border-sidebar-border px-4 transition-colors hover:bg-sidebar-accent',
            collapsed ? 'justify-center' : 'gap-3'
          )}
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-600 to-indigo-600">
            <PortalLogo className="h-5 w-5 text-white" />
          </div>
          {!collapsed && (
            <span className="font-heading text-xl font-bold text-sidebar-foreground">Waygate</span>
          )}
        </Link>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 px-2 py-4">
          {navItems.map((item) => {
            const active = isActive(item.href);
            const Icon = item.icon;

            const linkContent = (
              <Link
                href={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  active
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                    : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                  collapsed && 'justify-center px-2'
                )}
              >
                <Icon className={cn('h-5 w-5 shrink-0', active && 'text-sidebar-primary')} />
                {!collapsed && <span>{item.title}</span>}
              </Link>
            );

            if (collapsed) {
              return (
                <Tooltip key={item.href}>
                  <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
                  <TooltipContent side="right" className="flex flex-col">
                    <span className="font-medium">{item.title}</span>
                    {item.description && (
                      <span className="text-xs text-muted-foreground">{item.description}</span>
                    )}
                  </TooltipContent>
                </Tooltip>
              );
            }

            return <React.Fragment key={item.href}>{linkContent}</React.Fragment>;
          })}
        </nav>

        {/* Collapse Toggle */}
        <div className="border-t border-sidebar-border p-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggleCollapse}
            className={cn('w-full', collapsed ? 'justify-center' : 'justify-start')}
          >
            {collapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <>
                <ChevronLeft className="h-4 w-4" />
                <span className="ml-2">Collapse</span>
              </>
            )}
          </Button>
        </div>
      </aside>
    </TooltipProvider>
  );
}
