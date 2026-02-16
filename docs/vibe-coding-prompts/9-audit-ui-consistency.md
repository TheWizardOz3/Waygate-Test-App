# Audit UI/UX Consistency

Audit all UI screens and components for visual and structural consistency.

1. Read `docs/product_spec.md` and `docs/architecture.md` to understand the intended design system and component patterns

2. Inventory all page layouts and shared components. Map which components are used on which pages.

3. Identify:
   - Duplicate or near-duplicate components that serve similar purposes (e.g., two different modal patterns, multiple card layouts, similar list views)
   - Inconsistent spacing, padding, or margins across similar views
   - Pages that don't follow the shared layout pattern
   - Inconsistent use of typography, colors, or button styles vs the design system
   - Form patterns that differ between screens (input styles, validation display, submit flows)
   - Inconsistent loading states, empty states, or error states
   - Navigation or header/footer inconsistencies

4. For each group of similar components, recommend which should be the **canonical** version and which should be consolidated into it.

5. Produce a markdown report grouped by category:
   - **Consolidate** — Duplicate components that should be merged (specify which to keep)
   - **Standardize** — Inconsistent patterns that should align to an existing standard
   - **Missing** — Shared components or patterns that should exist but don't (e.g., no shared empty state)

6. For each finding, include: file paths of all affected components/pages, description of the inconsistency, and recommended action.

Start with step 1.
