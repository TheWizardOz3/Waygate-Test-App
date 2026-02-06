'use client';

import { Suspense, useState } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Wrench, Download, Loader2 } from 'lucide-react';
import { CompositeToolList } from '@/components/features/composite-tools';
import { AllToolsExportTab } from '@/components/features/ai-tools';

type TabValue = 'tools' | 'export';

function AIToolsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  // Get initial tab from URL or default to 'tools'
  const initialTab = (searchParams.get('tab') as TabValue) || 'tools';
  const [activeTab, setActiveTab] = useState<TabValue>(initialTab);

  const handleTabChange = (value: string) => {
    const newTab = value as TabValue;
    setActiveTab(newTab);

    // Update URL with tab parameter
    const params = new URLSearchParams(searchParams.toString());
    if (newTab === 'tools') {
      params.delete('tab');
    } else {
      params.set('tab', newTab);
    }
    const newUrl = params.toString() ? `${pathname}?${params.toString()}` : pathname;
    router.replace(newUrl);
  };

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
        <TabsList className="bg-muted/50">
          <TabsTrigger value="tools" className="gap-2">
            <Wrench className="h-4 w-4" />
            Tools
          </TabsTrigger>
          <TabsTrigger value="export" className="gap-2">
            <Download className="h-4 w-4" />
            Export
          </TabsTrigger>
        </TabsList>

        <TabsContent value="tools" className="mt-0">
          <CompositeToolList />
        </TabsContent>

        <TabsContent value="export" className="mt-0">
          <div className="space-y-6">
            {/* Export Header */}
            <div>
              <h1 className="font-heading text-2xl font-bold">AI Tools</h1>
              <p className="text-muted-foreground">
                Export all your tools for use with AI agents and LLM frameworks
              </p>
            </div>

            {/* Export Content */}
            <AllToolsExportTab />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function AIToolsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <AIToolsContent />
    </Suspense>
  );
}
