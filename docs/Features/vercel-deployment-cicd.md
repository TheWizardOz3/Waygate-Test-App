# Feature Spec: Vercel Deployment & CI/CD

## 1. Overview

### 1.1 One-Line Summary

Production deployment pipeline with Vercel hosting, GitHub Actions CI, and environment management to ship Waygate reliably.

### 1.2 User Story

> As a **Solo Builder**, I want to **deploy Waygate to production with automated quality gates**, so that **I can ship confidently knowing every change is linted, type-checked, and tested before it reaches users**.

### 1.3 Problem Statement

Waygate has a complete feature set through V2 but no production deployment infrastructure. There is:

- No GitHub Actions CI pipeline — broken code could be merged unchecked
- A minimal `next.config.mjs` with no production optimizations
- No documented process for environment variable promotion between environments
- No database migration strategy for production (currently using `prisma db push`)
- No build verification beyond local dev

### 1.4 Business Value

- **User Impact:** Users get a live, accessible deployment at a production URL
- **Business Impact:** Waygate becomes usable beyond localhost — prerequisite for any real adoption
- **Technical Impact:** Automated quality gates prevent regressions; production config enables real-world performance

---

## 2. Scope & Requirements

### 2.1 Functional Requirements

| ID   | Requirement                                                       | Priority | Notes                                      |
| ---- | ----------------------------------------------------------------- | -------- | ------------------------------------------ |
| FR-1 | GitHub Actions CI pipeline runs lint, type-check, test on PRs     | MUST     | Blocks merge on failure                    |
| FR-2 | Production Next.js config with security headers and optimizations | MUST     | CSP, image optimization, standalone output |
| FR-3 | Vercel project configuration for production deployment            | MUST     | Build command, env vars, Node.js version   |
| FR-4 | Environment variable documentation and management strategy        | MUST     | Clear mapping of what goes where           |
| FR-5 | Database migration strategy for production                        | MUST     | Use `prisma migrate deploy` in build step  |
| FR-6 | Vercel preview deployments for PRs                                | SHOULD   | Automatic via Vercel GitHub integration    |
| FR-7 | Build-time Prisma client generation                               | MUST     | `prisma generate` before `next build`      |

### 2.2 Non-Functional Requirements

| Requirement | Target                           | Measurement             |
| ----------- | -------------------------------- | ----------------------- |
| Build time  | < 5 minutes for full CI pipeline | GitHub Actions duration |
| Deploy time | < 2 minutes from merge to live   | Vercel deployment logs  |
| Uptime      | 99.5% availability               | Vercel Analytics        |
| Security    | A+ on securityheaders.com        | Manual scan post-deploy |

### 2.3 Acceptance Criteria

- [ ] **Given** a PR is opened, **when** CI runs, **then** lint, type-check, and tests all execute and must pass before merge
- [ ] **Given** code is merged to main, **when** Vercel deploys, **then** the production build succeeds with Prisma client generated and migrations applied
- [ ] **Given** the production deployment, **when** inspecting response headers, **then** security headers (CSP, X-Frame-Options, etc.) are present
- [ ] **Given** a PR branch, **when** pushed to GitHub, **then** a Vercel preview deployment is created automatically
- [ ] **Given** the production environment, **when** cron jobs fire, **then** they execute successfully with proper authorization

### 2.4 Out of Scope

- Custom domain setup (DNS, SSL) — done manually in Vercel dashboard
- Staging environment setup — defer to after initial production deploy
- Monitoring/alerting (Sentry, Axiom) — separate future task
- Load testing — separate future task
- Feature flags infrastructure — separate future task

---

## 3. User Experience

### 3.1 User Flow

This is an infrastructure feature — no direct UI changes. The "user" is the developer (you).

```
Push to PR → CI runs (lint, type-check, test) → Preview deploy
     ↓
Merge to main → Vercel auto-deploys → Prisma migrate → Production live
```

---

## 4. Technical Approach

### 4.1 Architecture Fit

| Area              | Impact | Description                                         |
| ----------------- | ------ | --------------------------------------------------- |
| Frontend          | MODIFY | Security headers, image optimization in next.config |
| Backend           | MODIFY | Build-time prisma generate, migration in deploy     |
| Database          | NONE   | No schema changes; migration strategy only          |
| External Services | NEW    | GitHub Actions, Vercel project setup                |
| Infrastructure    | NEW    | CI pipeline, deployment pipeline                    |

### 4.2 Existing State

| Component           | Current State                                     | Target State                               |
| ------------------- | ------------------------------------------------- | ------------------------------------------ |
| `next.config.mjs`   | Empty (`{}`)                                      | Security headers, image config, standalone |
| `.github/workflows` | Does not exist                                    | CI pipeline with lint + type-check + test  |
| `vercel.json`       | Cron jobs only                                    | Add build settings, env var references     |
| `package.json`      | All scripts exist (lint, type-check, test, build) | Add `postinstall` for prisma generate      |
| Prisma migrations   | 18 migrations exist, using `db push` in dev       | `migrate deploy` for production            |

---

## 5. Implementation Tasks

### Task 1: GitHub Actions CI Pipeline (~30 min)

Create `.github/workflows/ci.yml` that runs on push and pull_request:

- **Steps:** checkout → pnpm setup → install deps → `prisma generate` → lint → type-check → test
- **Node version:** 20.x (matches runtime)
- **Package manager:** pnpm with caching
- **Prisma:** Generate client before lint/type-check (needed for type resolution)
- **Environment:** Set `DATABASE_URL` to a dummy value for type-check (Prisma generate doesn't need a real DB)
- **Concurrency:** Cancel in-progress runs on same PR to save minutes

### Task 2: Production Next.js Config (~30 min)

Update `next.config.mjs` with:

- **Security headers:** Content-Security-Policy, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, Strict-Transport-Security
- **Image optimization:** Configure allowed remote image domains (if any)
- **Output:** Consider `standalone` output for optimized Vercel deployment
- **Experimental:** Enable any relevant Next.js 14 features
- **External packages:** Ensure `bcrypt` and `pg` are handled for serverless (may need `serverComponentsExternalPackages`)

### Task 3: Vercel Build Configuration (~30 min)

Update `vercel.json` and project settings:

- **Build command:** `prisma generate && prisma migrate deploy && next build`
- **Install command:** `pnpm install`
- **Node.js version:** 20.x
- **Framework preset:** Next.js
- **Root directory:** `/`
- **Cron jobs:** Already configured, verify `CRON_SECRET` is set for authorization
- Ensure internal cron endpoints validate the `CRON_SECRET` header

### Task 4: Environment Variable Strategy (~30 min)

Document and organize environment variables:

- **Create** a clear mapping of env vars needed per environment (dev, preview, production)
- **Update** `.env.example` with any missing vars (e.g., `CRON_SECRET` is commented out)
- **Verify** all internal cron endpoints check `Authorization: Bearer ${CRON_SECRET}` header
- **Document** which env vars are "build time" vs "runtime"
- **Add** `NEXT_PUBLIC_APP_URL` production value documentation

### Task 5: Prisma Production Migration Strategy (~30 min)

Set up reliable database migrations for production:

- **Add** `postinstall` script: `prisma generate` (ensures client is always up-to-date)
- **Build command** includes `prisma migrate deploy` to apply pending migrations
- **Verify** all 18 existing migrations are clean and sequential
- **Document** the migration workflow: local dev uses `db push`, production uses `migrate deploy`
- **Handle** the existing schema drift (agentic tools migration missing) — create a baseline migration if needed

### Task 6: Cron Endpoint Security (~30 min)

Ensure all internal cron endpoints are secured:

- **Verify** each cron endpoint in `vercel.json` validates the Vercel cron secret
- Endpoints to audit:
  - `/api/v1/internal/token-refresh`
  - `/api/v1/internal/health-checks/credential`
  - `/api/v1/internal/health-checks/connectivity`
  - `/api/v1/internal/reference-sync`
  - `/api/v1/internal/drift-analyzer`
  - `/api/v1/internal/job-worker`
- **Pattern:** Check `request.headers.get('authorization') === \`Bearer ${process.env.CRON_SECRET}\``

---

## 6. Test Plan

| Test Type   | What to Test                                      | How                                               |
| ----------- | ------------------------------------------------- | ------------------------------------------------- |
| CI Pipeline | Pipeline runs and catches intentional lint errors | Push a branch with a lint error, verify CI fails  |
| Build       | Production build succeeds locally                 | Run `pnpm build` locally with production env vars |
| Headers     | Security headers present in responses             | `curl -I` the deployed URL                        |
| Cron Auth   | Cron endpoints reject unauthenticated requests    | `curl` without CRON_SECRET, verify 401            |
| Migrations  | `prisma migrate deploy` applies cleanly           | Run against a fresh database                      |
| Preview     | PR creates a preview deployment                   | Open a test PR and verify Vercel preview deploys  |

---

## 7. Risks & Mitigations

| Risk                                   | Likelihood | Impact | Mitigation                                             |
| -------------------------------------- | ---------- | ------ | ------------------------------------------------------ |
| Schema drift blocks `migrate deploy`   | Medium     | High   | Create baseline migration to sync state                |
| `bcrypt` native module fails on Vercel | Medium     | High   | Add to `serverComponentsExternalPackages`              |
| CI takes too long (> 10 min)           | Low        | Medium | pnpm caching, concurrency controls                     |
| Environment variable mismatch          | Medium     | High   | Clear documentation, `.env.example` as source of truth |
