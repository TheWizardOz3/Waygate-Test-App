# Project Status: Waygate

**Last Updated:** 2026-02-20

---

## Current Milestone: V2 (Deploy & Scale)

**Goal:** Production deployment, background job infrastructure, bulk operations, and proactive API maintenance.

### Build Order

| Order | Feature                  | Status | Dependencies           |
| ----- | ------------------------ | ------ | ---------------------- |
| 1     | TypeScript Error Fixes   | Done   | None                   |
| 2     | Async Job System         | Done   | TS Error Fixes         |
| 3     | Batch Operations         | Done   | Async Job System       |
| 4     | Schema Drift Detection   | Done   | Async Job System       |
| 5     | Auto-Maintenance System  | Done   | Schema Drift Detection |
| 6     | End-User Auth Delegation | Done   | Auto-Maintenance       |

**Feature Summaries:**

- **TypeScript Error Fixes:** Resolve 33 existing TS errors across composite tools (13) and agentic tools (20) to enable clean builds
- **Async Job System:** Trigger.dev or BullMQ integration for background processing, scheduled jobs, and queue management
- **Batch Operations:** Queue and batch high-volume write operations to avoid rate limits, with progress tracking
- **Schema Drift Detection:** Periodic re-scraping of API docs, compare against stored schemas, alert on discrepancies
- **Auto-Maintenance System:** Detect API changes, auto-propose integration config updates with approval workflow
- **End-User Auth Delegation:** App entity with per-app API keys, per-app OAuth credentials, app-scoped connections, and dual-key auth resolution

### Definition of Done

- Background job system running scheduled tasks
- Batch operations complete via job queue
- Schema drift alerts trigger on detected API changes
- Auto-maintenance proposes updates with approval workflow
- Apps can be created with dedicated API keys, per-app OAuth credentials, and scoped connection resolution

---

## Completed Milestones

| Milestone | Completed  | Summary                                                                                                  |
| --------- | ---------- | -------------------------------------------------------------------------------------------------------- |
| **MVP**   | 2026-01-02 | Core platform: AI doc scraping, action registry, auth framework, gateway API, config UI                  |
| **V0.5**  | 2026-01-04 | Production robustness: pagination, response validation, field mapping, tagging                           |
| **V0.75** | 2026-01-25 | Multi-tenancy: connections, hybrid auth, health checks, per-app mappings                                 |
| **V1**    | 2026-01-28 | E2E testing, performance optimization (query deduplication, code splitting), polish                      |
| **V1.1**  | 2026-01-31 | AI Tool Foundations: reference data sync, tool export (Universal/LangChain/MCP), variable/context system |
| **V1.5**  | 2026-02-06 | AI Tool Factory: composite tools, agentic tools, multi-agent pipelines with inter-step reasoning         |

---

## Next Milestone: V2.1 (Developer Experience & Ease)

**Goal:** Make building on Waygate dramatically easier than calling APIs directly — typed SDKs, instant code scaffolding, provider-flexible intents, production safety through versioning, and production deployment.

### Build Order

| Order | Feature                    | Status      | Dependencies             |
| ----- | -------------------------- | ----------- | ------------------------ |
| 1     | Vercel Deployment & CI/CD  | Done        | None (V2 complete)       |
| 2     | Versioning & Rollbacks     | Not Started | None                     |
| 3     | Copy-paste Code Generation | Not Started | Action Registry (exists) |
| 4     | Auto-generated Typed SDK   | Not Started | Action Registry (exists) |
| 5     | Intent-based Action Layer  | Not Started | Typed SDK (#4)           |
| 6     | Just-in-Time Auth          | Not Started | Auth Framework (exists)  |

**Feature Summaries:**

- **Versioning & Rollbacks:** Track integration versions, per-app pinning, instant rollback to any previous version
- **Copy-paste Code Generation:** Per-action ready-to-use code snippets in multiple languages/frameworks
- **Auto-generated Typed SDK:** `npx waygate generate` produces per-tenant typed client with full autocomplete
- **Intent-based Action Layer:** Semantic grouping of actions by intent across integrations with runtime provider selection
- **Just-in-Time Auth:** On-demand OAuth flows for end users, OAuth broker for user-facing integrations
- **Vercel Deployment & CI/CD:** Production Vercel config, GitHub Actions CI pipeline (lint, type-check, test), environment variable management, database migration strategy

### Definition of Done

- Can roll back to any previous version of an integration
- Every action has copy-paste code snippets available
- `npx waygate generate` produces a typed client with full autocomplete
- Can define intents that map to multiple providers with runtime selection
- End users can authenticate via JIT OAuth flow
- Application deployed to Vercel with CI/CD pipeline

---

## Future Milestones

### V2.2: Self-Service & Governance

Sandbox/production environments, full no-code UI (wizards), RBAC & team management.

### V2.3: Ecosystem & Extensibility

Webhook ingestion, LLM tool wrapping.

---

## Known Issues

- Existing AI-scraped integrations with incorrect `authType='none'` (e.g., Slack) need manual correction via the integration settings UI. Only new scrapes get the `authTypeUnverified` flag automatically.

---

## Technical Debt

_None currently tracked_

---

## Quick Reference

- [Product Specification](product_spec.md)
- [Architecture](architecture.md)
- [Decision Log](decision_log.md)
- [Changelog](changelog.md)
