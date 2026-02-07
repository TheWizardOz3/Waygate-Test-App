'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Menu,
  Sparkles,
  LayoutDashboard,
  Puzzle,
  ListChecks,
  ScrollText,
  Settings,
} from 'lucide-react';

import { DashboardSidebar } from './DashboardSidebar';
import { DashboardHeader } from './DashboardHeader';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

interface DashboardLayoutProps {
  children: React.ReactNode;
  /** Optional title to display in the header */
  title?: string;
}

const navItems = [
  { title: 'Dashboard', href: '/', icon: LayoutDashboard },
  { title: 'Integrations', href: '/integrations', icon: Puzzle },
  { title: 'Jobs', href: '/jobs', icon: ListChecks },
  { title: 'Logs', href: '/logs', icon: ScrollText },
  { title: 'Settings', href: '/settings', icon: Settings },
];

/**
 * Main dashboard layout with collapsible sidebar, header, and main content area.
 * Sidebar collapse state is persisted to localStorage.
 * Mobile-friendly with a drawer navigation.
 */
export function DashboardLayout({ children, title }: DashboardLayoutProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(false);
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false);
  const pathname = usePathname();

  // Load sidebar state from localStorage on mount
  React.useEffect(() => {
    const stored = localStorage.getItem('waygate-sidebar-collapsed');
    if (stored !== null) {
      setSidebarCollapsed(stored === 'true');
    }
  }, []);

  // Close mobile nav when route changes
  React.useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  // Persist sidebar state to localStorage
  const handleToggleSidebar = React.useCallback(() => {
    setSidebarCollapsed((prev) => {
      const newValue = !prev;
      localStorage.setItem('waygate-sidebar-collapsed', String(newValue));
      return newValue;
    });
  }, []);

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Desktop Sidebar - Hidden on mobile */}
      <div className="hidden md:block">
        <DashboardSidebar collapsed={sidebarCollapsed} onToggleCollapse={handleToggleSidebar} />
      </div>

      {/* Main Content Area */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {/* Header with mobile menu */}
        <header className="flex h-16 items-center justify-between border-b bg-background px-4 md:px-6">
          {/* Mobile menu button */}
          <div className="flex items-center gap-4">
            <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
              <SheetTrigger asChild className="md:hidden">
                <Button variant="ghost" size="icon">
                  <Menu className="h-5 w-5" />
                  <span className="sr-only">Toggle menu</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-64 p-0">
                <SheetHeader className="border-b px-4 py-4">
                  <SheetTitle className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
                      <Sparkles className="h-5 w-5 text-primary-foreground" />
                    </div>
                    <span className="font-heading text-xl font-bold">Waygate</span>
                  </SheetTitle>
                </SheetHeader>
                <nav className="space-y-1 px-2 py-4">
                  {navItems.map((item) => {
                    const Icon = item.icon;
                    const active = isActive(item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                          'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                          active
                            ? 'bg-primary/10 text-primary'
                            : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                        )}
                      >
                        <Icon className="h-5 w-5" />
                        {item.title}
                      </Link>
                    );
                  })}
                </nav>
              </SheetContent>
            </Sheet>

            {/* Mobile logo */}
            <Link href="/" className="flex items-center gap-2 md:hidden">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
                <Sparkles className="h-5 w-5 text-primary-foreground" />
              </div>
              <span className="font-heading text-lg font-bold">Waygate</span>
            </Link>
          </div>

          {/* Desktop header content */}
          <div className="hidden flex-1 md:block">
            <DashboardHeader title={title} />
          </div>

          {/* Mobile header actions would go here */}
        </header>

        {/* Page Content */}
        <main
          className={cn(
            'min-w-0 flex-1 overflow-y-auto overflow-x-hidden p-4 md:p-6',
            'scroll-smooth'
          )}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
