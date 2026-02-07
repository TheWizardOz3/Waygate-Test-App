# Changelog: Waygate

> Follows [Keep a Changelog](https://keepachangelog.com/) conventions. For pre-v1.0 history, see `docs/archive/changelog-pre-v1.md`.

---

## [Unreleased]

### Added

- **Batch Operations**: Submit high-volume action invocations (up to 10,000 items) for efficient background processing with proactive rate limit pacing. Actions can opt in via `batchEnabled` flag, with optional bulk API routing that transforms N individual payloads into a single bulk endpoint call. Tool exports automatically generate `batch_*` variants for batch-enabled actions so AI agents can discover and use batch endpoints. Includes batch submission API, per-action batch/bulk configuration UI, progress monitoring with stacked progress bars, and React hooks for integration. Unit test suite covers schemas, error classes, rate limit tracker, tool variant generation, and config parsing (93 tests across 4 files).
- **Async Job System**: Database-backed job queue with a Vercel Cron worker for background processing. Supports single and batch jobs with child items, configurable retry with exponential backoff, progress tracking, timeout detection, concurrency limiting per job type, and a swap-friendly `JobQueue` interface (designed for future migration to Trigger.dev). Includes full CRUD API (5 endpoints), internal worker endpoint, Jobs monitoring UI with filtering/pagination, job detail view with progress bars and retry/cancel controls, and comprehensive unit test suite (105 tests across 5 files covering schemas, errors, queue lifecycle, handler registry, and worker dispatch).
- **Multi-Agent Pipelines**: Build single tools that internally execute multiple structured steps with optional inter-step LLM reasoning. Pipelines appear as one tool to parent agents but can internally search, triage, and act across multiple API calls. Includes full CRUD API (13 endpoints), pipeline orchestrator with sequential execution and state accumulation, template expression resolution for data passing between steps, per-step error handling (fail/continue/skip), safety limits (cost and duration), export as Universal/LangChain/MCP tools, execution monitoring with step-level detail, and comprehensive unit test suite (194 tests across 7 test files covering template resolver, state manager, condition evaluator, safety enforcer, output mapper, reasoning prompt builder, and schema validation).
- **Pipeline Configuration Dashboard**: Full UI for creating and configuring multi-agent pipelines. Includes pipeline creation in AI Tool quick-create flow, single-page sectioned dashboard (Tool Identity, Steps, Settings, AI Description), step management with add/remove/reorder, tool selector with search, input mapping editor with `{{template}}` autocomplete, inter-step reasoning configuration with LLM overrides, error handling and retry settings, safety limits, and output mapping. Pipelines appear in the unified AI Tools list with filtering support.
- **Agentic Tool Input Arguments**: Define custom input arguments for agentic tools that the embedded LLM will map from natural language. Includes "Load from Sub-tools" button to import parameters from allocated actions, type selection (string/number/boolean/object/array), required/optional toggles, and quick-add templates for common patterns like `user_query`. Arguments appear as insertable variables in the system prompt editor with emerald highlighting.
- **AI Tools Tabbed Dashboard**: Replaced linear wizard flows for Composite and Agentic tool creation with a streamlined tabbed dashboard. Tools are now created with minimal info (name + description) then configured via four tabs: Details (metadata), Tools/Actions (sub-tool selection), Intelligence (routing/LLM config), and Export (AI descriptions + format export). Single-select mode enforced for Parameter Interpreter agentic tools. Includes unified tool selector with checkbox selection and real-time schema generation for exports.

### Improved

- **Agentic Intelligence Tab UX**: Reorganized layout with LLM Configuration moved inside System Prompt card for better visual grouping. Removed confusing `{{user_input}}` system variable since users should define their own input arguments. Toast notifications now provide clear feedback when loading sub-tool parameters.
- **Agentic Tools (Parameter Interpreter Mode)**: Create AI tools with embedded LLMs that translate natural language into precise API parameters. Configure Claude or Gemini models with custom system prompts, inject integration schemas and reference data as context, and set safety limits (cost, timeout, tool calls). Tools execute single LLM calls to generate validated parameters, then invoke target actions. Includes wizard UI, comprehensive test suite (187 tests), and full CRUD API.
- **Composite Tools Test Suite**: Comprehensive unit test coverage for composite tools feature (146 tests). Tests cover routing rule evaluation, schema merging, parameter mapping, and Zod schema validation. All tests pass successfully.

### Fixed

- **Tool Export Parameter Schemas**: Fixed empty parameter schemas in tool exports. Composite tools now build `unifiedInputSchema` from sub-tool parameters and LLM-generated descriptions. Simple tools with empty `inputSchema` are enriched with path parameters extracted from endpoint templates and parameters parsed from `toolDescription`.
- **AI Description Generation**: Fixed "Generate with AI" button for composite tools not updating UI. Description now persists correctly using `toolDescription` field and syncs on page refresh.
- **API Scraper Parameter Extraction**: Enhanced AI documentation scraper to extract `pathParameters`, `queryParameters`, and `requestBody` from API docs. Previously only extracted 5 flat fields (name, slug, method, path, description), resulting in non-functional tools. New integrations will now have complete parameter schemas.

### Known Issues

- TypeScript compilation errors in agentic tools optional features (20 errors in regenerate-prompt, test-prompt routes). Core functionality fully tested and working.
- TypeScript compilation errors in composite tools implementation (13 errors). Feature is functionally complete but requires type fixes for production readiness.

---

## [1.0.7] - 2026-01-31

### Added

- **Variable Context System**: Define reusable variables at tenant and connection levels with support for strings, numbers, booleans, and JSON values. Reference variables in action configurations using `${var.name}` syntax. Built-in runtime variables (`${current_user.id}`, `${connection.workspaceId}`, `${request.timestamp}`) provide dynamic context. Connection-level variables override tenant defaults, enabling per-connection customization. Sensitive variables are encrypted at rest and masked in logs. New Settings → Variables section and connection detail Variables tab for management. Variable autocomplete in action editors helps discover available variables.

---

## [1.0.6] - 2026-01-30

### Added

- **Simple Tool Export**: Export Waygate actions as AI-consumable tools for all major LLM platforms. Supports Universal (LLM-agnostic), LangChain, and MCP formats. Includes context resolver for human-friendly name→ID resolution, agent-readable response formatters with follow-on instructions, and UI for export/download. Enables AI agents to use Waygate integrations directly through standardized tool interfaces.
- **LLM-Generated Tool Descriptions**: Actions can now store AI-optimized tool descriptions generated by LLM at creation time. Stored descriptions include mini-prompt format (inputs/outputs), success templates, and error templates. Regenerate button in Action Settings tab allows refreshing descriptions as schemas change.

### Improved

- **AI Tools Tab UX**: Simplified tool listing on Integration page shows available tools with parameter counts instead of cluttered expandable descriptions. Per-action tool descriptions are managed in Action editor Settings tab for better organization.
- **Code Renderer Text Wrapping**: All code blocks in AI Tools tab now wrap text instead of requiring horizontal scrolling, improving readability on smaller screens.

---

## [1.0.5] - 2026-01-29

### Added

- **Reference Data Sync**: Integrations can now cache slow-changing reference data (users, channels, repositories, etc.) from external APIs. Configure actions as reference data sources with extraction paths, and Waygate will sync and cache this data for AI tool context. Includes cron-based background sync, manual sync triggers, and UI components for viewing cached data and sync history.

---

## [1.0.4] - 2026-01-28

### Improved

- **Integration Health Visibility**: Health status now visible at integration level. Integration list and table views show aggregate connection health (Healthy/Unhealthy/Pending) instead of simple Active/Draft badges. Integration Overview page includes Connection Health section showing counts by status.

---

## [1.0.3] - 2026-01-26

### Improved

- **Connection Cards**: Reorganized badge layout to prevent overflow. Connector type badge moved to card body, primary badge simplified to icon-only for compact display.
- **Connection Detail Sheet**: Increased width from 512px to 768px/896px for better content visibility.
- **Field Mappings**: Replaced individual mapping cards with a unified table view for easier at-a-glance management.
- **Default Credentials**: Renamed "Credentials" panel in Overview tab to "Default Credentials" with explanatory text clarifying these are used when apps don't specify a connection.
- **Authentication Status**: Added "Setup Required" badge when integration requires authentication but credentials aren't configured. Shows "Configured" badge when credentials are active.
- **Platform Connector UX**: Improved empty state messaging when no platform connectors are available, with clearer guidance to use custom credentials instead.

---

## [1.0.2] - 2026-01-26

### Added

- **Connection Credentials API**: New `/api/v1/connections/{id}/credentials` endpoint returns credential status without exposing sensitive data. Supports connection-specific credentials with fallback to integration-level.

### Fixed

- **Prisma Schema Mismatch**: Added missing `credential_source` column and `CredentialSource` enum via migration. Fixes P2022 errors when loading connection details.
- **Connection Detail Panel**: Health status and credentials sections now load correctly. Health checks can be triggered successfully.

---

## [1.0.1] - 2026-01-25

### Fixed

- **Connections API 500 Error**: Added missing database migration for `ConnectorType` enum, `PlatformConnectorStatus` enum, `platform_connectors` table, and connection columns. Fixed API response format to nest data correctly.

---

## [1.0.0] - 2026-01-25

### Summary

V0.75 complete. All four features finalized: Multi-App Connections, Hybrid Auth Model, Continuous Integration Testing, and Per-App Custom Mappings.

### Added

- **Milestone Restructure**: Reorganized roadmap with AI Tool Factory focus. V1.1 combines Reference Data Sync + Tool Factory. V2 includes Scale & Safety features.

---

## Archive Reference

| Period   | Versions      | Archive Location                   |
| -------- | ------------- | ---------------------------------- |
| Pre-v1.0 | 0.0.0 - 0.9.0 | `docs/archive/changelog-pre-v1.md` |
