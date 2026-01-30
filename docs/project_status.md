# Project Status: Waygate

**Last Updated:** 2026-01-29

---

## Current Milestone: V1.1 (AI Tool Foundations)

**Goal:** Export Waygate actions as AI-consumable tools for LangChain and MCP.

### Build Order

| #   | Feature                 | Status      | Dependencies       | Notes                                                                |
| --- | ----------------------- | ----------- | ------------------ | -------------------------------------------------------------------- |
| 1   | Reference data sync     | ✅ COMPLETE | None               | Foundational - syncs reference data (users, channels) for AI context |
| 2   | Simple tool export      | NOT STARTED | Actions (MVP ✅)   | Core tool generation - exports actions as LangChain/MCP tools        |
| 3   | Variable/context system | NOT STARTED | Simple tool export | Dynamic context injection for runtime variables in AI tools          |

### Definition of Done

- Waygate actions exportable as LangChain/MCP tools
- Reference data synced and accessible to AI tools
- Variable/context system for dynamic tool behavior

---

## Completed Milestones

| Milestone | Completed  | Summary                                                                                 |
| --------- | ---------- | --------------------------------------------------------------------------------------- |
| **MVP**   | 2026-01-02 | Core platform: AI doc scraping, action registry, auth framework, gateway API, config UI |
| **V0.5**  | 2026-01-04 | Production robustness: pagination, response validation, field mapping, tagging          |
| **V0.75** | 2026-01-25 | Multi-tenancy: connections, hybrid auth, health checks, per-app mappings                |
| **V1**    | 2026-01-28 | E2E testing, performance optimization (query deduplication, code splitting), polish     |

---

## Future Milestones

### V1.5: AI Tool Factory - Agentic Tools

Export Waygate actions as AI-consumable tools for LangChain and MCP. Reference data sync, simple/composite tool export, variable/context system.

### V1.5: AI Tool Factory - Agentic Tools

Agent-embedded tools with LLM interpretation. Multi-agent pipelines with inter-step reasoning.

### V2: Scale & Safety

Async job system, batch operations, sandbox/production environments, versioning & rollbacks, schema drift detection, auto-maintenance.

### V2.1: Self-Service & Access

Full no-code UI, RBAC & team management, just-in-time auth, platform connector admin UI (manage Waygate's default OAuth apps).

### V2.2: Developer Experience

Webhook ingestion, SDK generation.

---

## Known Issues

_None currently tracked_

---

## Technical Debt

_None currently tracked_

---

## Quick Reference

- [Product Specification](product_spec.md)
- [Architecture](architecture.md)
- [Decision Log](decision_log.md)
- [Changelog](changelog.md)
