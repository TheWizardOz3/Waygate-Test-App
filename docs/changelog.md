# Changelog: Waygate

> Follows [Keep a Changelog](https://keepachangelog.com/) conventions. For pre-v1.0 history, see `docs/archive/changelog-pre-v1.md`.

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
