# Feature: Dashboard Polish & Tagging System

**Status:** ✅ Complete  
**Priority:** P2 (V0.5)  
**Estimated Complexity:** LOW-MEDIUM  
**Dependencies:** Basic Configuration UI ✅, Action Registry ✅  
**Combines:** Integration & Action Tagging + Dashboard & Logs Polish

---

## Overview

This combined feature adds lightweight tagging for integrations and actions, and ensures the dashboard and logs are connected to real backend data (currently using sample/mock data in places).

### User Stories

> As a developer with multiple integrations, I want to tag and filter them by category (e.g., "payment", "communication") so I can quickly find what I need.

> As a developer, I want the dashboard to show my actual integration stats and real request logs, not sample data.

### Goals

1. **Integration Tagging**: Add, edit, and filter integrations by user-defined tags
2. **Action Tagging**: Add, edit, and filter actions by tags
3. **Dashboard Data Connection**: Ensure stats cards pull real data from APIs
4. **Logs Data Connection**: Ensure log viewer displays real request logs

---

## Requirements

### Functional Requirements

#### Tagging System

- [x] **Integration Tags**: Add, edit, remove tags on integrations
- [x] **Action Tags**: Add, edit, remove tags on actions
- [x] **Tag Autocomplete**: Suggest existing tags when typing
- [x] **Tag Filter (Integrations)**: Filter integration list by tags
- [x] **Tag Filter (Actions)**: Filter action table by tags
- [x] **Tag Colors**: Auto-generate colors from tag name (hash-based)

#### Dashboard & Logs Connection

- [x] **Dashboard Stats**: Connect stats cards to real API data (integration counts, request totals)
- [x] **Recent Activity**: Show real recent requests, not mock data
- [x] **Log Stats Hook**: Ensure `useLogStats` returns real aggregated data
- [x] **Logs API**: Verify logs endpoint returns actual request logs

---

## Database Schema Changes

Add `tags` column to `actions` table:

```prisma
model Action {
  // ... existing fields ...
  tags String[] @default([])
}
```

**Migration required**: Single column addition.

---

## Implementation Tasks

### Phase 1: Tag Infrastructure (~1.5 hours)

| #   | Task               | Description                                         | Files                             |
| --- | ------------------ | --------------------------------------------------- | --------------------------------- |
| 1.1 | Database Migration | Add `tags` column to `actions` table                | `prisma/schema.prisma`, migration |
| 1.2 | Tag Schemas        | Add tags to action schemas, validation (2-30 chars) | `action.schemas.ts`               |
| 1.3 | Tag Color Utility  | Hash-based color from tag name                      | `src/lib/utils/tag-colors.ts`     |
| 1.4 | Tags API           | GET endpoint to list unique tags in tenant          | `src/app/api/v1/tags/route.ts`    |

### Phase 2: Tag UI Components (~2 hours)

| #   | Task         | Description                               | Files                                                |
| --- | ------------ | ----------------------------------------- | ---------------------------------------------------- |
| 2.1 | TagBadge     | Colored badge with optional remove button | `src/components/ui/tag-badge.tsx`                    |
| 2.2 | TagInput     | Multi-select input with autocomplete      | `src/components/ui/tag-input.tsx`                    |
| 2.3 | TagFilter    | Dropdown filter for lists                 | `src/components/features/integrations/TagFilter.tsx` |
| 2.4 | useTags Hook | Fetch all tags for autocomplete           | `src/hooks/useTags.ts`                               |

### Phase 3: Integration & Action Tagging (~2 hours)

| #   | Task               | Description                             | Files                                        |
| --- | ------------------ | --------------------------------------- | -------------------------------------------- |
| 3.1 | Integration List   | Add tag filter, show tags in cards/rows | `IntegrationList.tsx`, `IntegrationCard.tsx` |
| 3.2 | Integration Detail | Editable tags in overview               | `IntegrationOverview.tsx`                    |
| 3.3 | Action Table       | Add tag column and filter               | `ActionTable.tsx`                            |
| 3.4 | Action Editor      | Tag input in editor                     | `BasicInfoSection.tsx`                       |

### Phase 4: Dashboard & Logs Data Connection (~2 hours)

| #   | Task                  | Description                                                | Files                                       |
| --- | --------------------- | ---------------------------------------------------------- | ------------------------------------------- |
| 4.1 | Audit Dashboard Data  | Verify `useLogStats` hook fetches real data, fix if needed | `src/hooks/useLogs.ts`, `DashboardHome.tsx` |
| 4.2 | Audit Recent Activity | Ensure recent activity shows real logs                     | `RecentActivity.tsx`                        |
| 4.3 | Audit Logs Page       | Verify log viewer uses real API responses                  | `LogViewer.tsx`                             |
| 4.4 | Fix Any Gaps          | Connect any remaining mock data to real APIs               | Various                                     |

---

## API Endpoints

### New

| Endpoint       | Method | Purpose                    |
| -------------- | ------ | -------------------------- |
| `/api/v1/tags` | GET    | List unique tags in tenant |

### Modified

| Endpoint                               | Changes                       |
| -------------------------------------- | ----------------------------- |
| `GET /api/v1/integrations`             | Add `tags` query param filter |
| `GET /api/v1/integrations/:id/actions` | Add `tags` query param filter |
| `POST/PATCH /api/v1/actions`           | Handle `tags` array           |

---

## Tag Color System

```typescript
// src/lib/utils/tag-colors.ts
const TAG_COLORS = [
  { bg: 'bg-blue-100', text: 'text-blue-700' },
  { bg: 'bg-purple-100', text: 'text-purple-700' },
  { bg: 'bg-green-100', text: 'text-green-700' },
  { bg: 'bg-amber-100', text: 'text-amber-700' },
  { bg: 'bg-rose-100', text: 'text-rose-700' },
  { bg: 'bg-cyan-100', text: 'text-cyan-700' },
  { bg: 'bg-indigo-100', text: 'text-indigo-700' },
  { bg: 'bg-emerald-100', text: 'text-emerald-700' },
];

export function getTagColor(tagName: string) {
  const hash = tagName.split('').reduce((acc, char) => char.charCodeAt(0) + ((acc << 5) - acc), 0);
  return TAG_COLORS[Math.abs(hash) % TAG_COLORS.length];
}
```

---

## Acceptance Criteria

### Tagging

- [x] Can add/remove tags on integrations
- [x] Can add/remove tags on actions
- [x] Tag autocomplete shows existing tags
- [x] Integration list filters by tag
- [x] Action table filters by tag
- [x] Tags display with consistent colors

### Dashboard & Logs

- [x] Dashboard stats show real integration counts
- [x] Dashboard stats show real request metrics (last 7 days)
- [x] Recent activity shows actual recent requests
- [x] Logs page displays real request log data
- [x] No mock/sample data in production views

---

## Estimated Timeline

| Phase                               | Estimated Time |
| ----------------------------------- | -------------- |
| 1. Tag Infrastructure               | ~1.5 hours     |
| 2. Tag UI Components                | ~2 hours       |
| 3. Integration & Action Tagging     | ~2 hours       |
| 4. Dashboard & Logs Data Connection | ~2 hours       |
| **Total**                           | **~7.5 hours** |

---

## Out of Scope

- AI tag suggestions
- Tag sharing across tenants
- Custom tag colors (user-defined)
- Bulk tag operations
- Tag analytics
- New dashboard features (sparklines, etc.)

---

## Implementation Notes

### Files Created

| File                                                 | Purpose                                               |
| ---------------------------------------------------- | ----------------------------------------------------- |
| `src/lib/utils/tag-colors.ts`                        | Hash-based tag color generation with 10 color palette |
| `src/components/ui/tag-badge.tsx`                    | TagBadge and TagList components with dynamic coloring |
| `src/components/ui/tag-input.tsx`                    | Multi-select tag input with autocomplete popover      |
| `src/components/features/integrations/TagFilter.tsx` | Dropdown filter for tag-based filtering               |
| `src/hooks/useTags.ts`                               | React Query hook for fetching tenant tags             |
| `src/app/api/v1/tags/route.ts`                       | API endpoint to list unique tags                      |
| `src/app/api/v1/logs/stats/route.ts`                 | API endpoint for log statistics                       |
| `tests/unit/tags/tag-colors.test.ts`                 | 11 unit tests for color utility                       |
| `tests/unit/tags/tag-schemas.test.ts`                | 14 unit tests for tag validation                      |
| `prisma/migrations/20260103_add_tags_to_actions/`    | Database migration for tags column                    |

### Files Modified

| File                                                           | Changes                                                   |
| -------------------------------------------------------------- | --------------------------------------------------------- |
| `prisma/schema.prisma`                                         | Added `tags String[] @default([])` to Action model        |
| `src/lib/modules/actions/action.schemas.ts`                    | Added TagSchema, tags to ActionBaseSchema                 |
| `src/lib/modules/actions/action.validation.ts`                 | Added tags to ActionEditorSchema                          |
| `src/components/features/integrations/IntegrationList.tsx`     | Added TagFilter, tag display in cards/rows                |
| `src/components/features/integrations/IntegrationCard.tsx`     | Display tags as colored badges                            |
| `src/components/features/integrations/IntegrationOverview.tsx` | Editable TagInput for integration tags                    |
| `src/components/features/actions/ActionTable.tsx`              | Added Tags column and TagFilter                           |
| `src/components/features/actions/editor/BasicInfoSection.tsx`  | Added TagInput for action editing                         |
| `src/components/features/actions/ActionEditor.tsx`             | Include tags in create/update payloads                    |
| `src/components/features/actions/AddActionWizard.tsx`          | Include tags when persisting AI-generated actions         |
| `src/lib/modules/logging/logging.service.ts`                   | Enriched logs with integration/action names               |
| `src/lib/modules/logging/logging.repository.ts`                | Added getOverallLogStats function                         |
| `src/lib/modules/logging/logging.schemas.ts`                   | Extended RequestLogResponseSchema with enriched fields    |
| `src/hooks/useLogs.ts`                                         | Fixed API paths, added LogEntry type with enriched fields |
| `src/hooks/index.ts`                                           | Exported useTags hook                                     |

### Tag Validation Rules

- Tags must be **2-30 characters** in length
- Tags must be **lowercase alphanumeric with hyphens only** (`/^[a-z0-9-]+$/`)
- Maximum of **10 tags** per integration or action
- Tags are **case-insensitive** (normalized to lowercase on input)

### Color System

10 colors with light/dark mode support:

- Blue, Purple, Green, Amber, Rose, Cyan, Indigo, Emerald, Teal, Orange
- Colors are determined by a hash of the tag name for consistency

---

## References

- [Product Spec - Integration Tagging](../product_spec.md#feature-integration-tagging-system)
- [Existing Integration Schema](../../prisma/schema.prisma)
