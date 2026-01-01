# AI Assistant Instructions: Waygate

> Master instructions for AI coding assistants. This file governs behavior, coding standards, and guardrails.

---

## 1. Project Identity

**One-Line Summary:** AI-powered integration gateway that transforms API documentation into production-ready, maintainable integrations.

**Core Objectives:**
1. Enable developers to create working integrations from any API documentation in minutes
2. Provide a unified, typed interface for invoking actions across any external API
3. Handle authentication, retries, and maintenance automatically so developers can focus on building

**Tech Stack (Quick Ref):** Next.js 14 / TypeScript / Supabase (PostgreSQL) / Vercel / Google Gemini / Firecrawl

**System Architecture:**
```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Consuming Applications                         │
└─────────────────────────────────────────────────────────────────────────┘
                                     │ Waygate API Key
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                             WAYGATE PLATFORM                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │   Gateway   │  │   Config    │  │    Auth     │  │     AI      │    │
│  │     API     │  │     UI      │  │   Service   │  │   Service   │    │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘    │
│         └────────────────┴────────────────┴────────────────┘            │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │  Integration Engine │ Execution Engine │ Credential Vault │ Logs  │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │   PostgreSQL (Supabase)  │  Redis (V1+)  │  Supabase Storage      │  │
│  └───────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
                                     │ Integration Credentials
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│              External APIs (Slack, Google, Stripe, GitHub, etc.)         │
└─────────────────────────────────────────────────────────────────────────┘
```

**Design Principles:**
- **Progressive Disclosure:** Start simple, reveal complexity on demand
- **Transparency Over Magic:** Show AI reasoning, make everything overridable
- **API-First, UI-Second:** Every capability accessible via API first
- **Fail Loudly, Recover Quietly:** Surface errors prominently, handle transient failures automatically

---

## 2. Documentation Map

| Document | Purpose | When to Reference |
|----------|---------|-------------------|
| `docs/product_spec.md` | Requirements, features, UX specs, design system | New features, understanding "what" to build |
| `docs/architecture.md` | Tech stack, system design, DB schema, API spec | Implementation decisions, "how" to build |
| `docs/decision_log.md` | Architecture decisions & rationale | Before proposing major changes |
| `docs/project_status.md` | Current progress, blockers, next steps | Session start, understanding context |
| `docs/changelog.md` | Version history, recent changes | Understanding recent modifications |
| `docs/brainstorm.md` | Ideas, exploration, rough concepts | Brainstorming new features |
| `docs/Features/` | Individual feature specifications | Detailed feature work |

> **⚠️ CRITICAL:** Documentation must be kept in sync with code changes. See Section 11 for mandatory update triggers.

---

## 3. Critical Constraints (Non-Negotiables)

**Security:**
- Never commit secrets, credentials, or API keys — use environment variables
- Never log sensitive data (passwords, tokens, PII, OAuth credentials)
- All user input must be validated server-side with Zod
- All database queries must use Prisma (parameterized by default)
- Credentials stored encrypted (AES-256-GCM) — never log decrypted values

**Data Integrity:**
- All database migrations must be reversible with rollback scripts
- Prefer soft deletes (`deleted_at`) for business data; hard deletes allowed for technical data (logs, sessions) or compliance
- Tenant isolation enforced via Supabase RLS
- All destructive operations require explicit confirmation and audit logging
- Database schema changes require migration files (no manual DB edits)

**Code Quality:**
- All code must pass linting and type checking before commit
- Avoid `any` types in TypeScript — if unavoidable, use `// eslint-disable...` with justification
- No disabled lint rules without documented justification
- No TODO/FIXME without linked issue/ticket

**Reliability:**
- All external API calls must have timeout, retry logic, and error handling
- All async operations must handle failure states
- No unbounded queries — all list endpoints must be paginated
- Background jobs must be idempotent (safe to retry)

**Deployment:**
- All changes must go through PR review before merge to main
- All PRs must have passing CI (build, lint, tests) before merge
- Production deployments require staging verification first
- Feature flags for risky changes that can be disabled without deploy

---

## 4. Development Workflow

### 4.1 Git Standards

**Branches:** `feat|fix|chore|docs|hotfix/{ticket-id}-short-description`

**Commits:** Use [Conventional Commits](https://conventionalcommits.org) — `type(scope): subject`
- Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`
- Atomic commits, present tense imperative, ≤72 char subject

### 4.2 Pre-Commit Requirements

- [ ] Builds without errors
- [ ] Linter and formatter pass
- [ ] Tests pass
- [ ] No debug statements, commented code, or hardcoded secrets
- [ ] New dependencies documented

**Never commit:** broken builds, failing tests, incomplete refactors

---

## 5. Coding Standards

### 5.1 General Principles

- **Readability over cleverness:** Write code for humans first
- **DRY (Don't Repeat Yourself):** Extract shared logic, but avoid premature abstraction
- **YAGNI (You Aren't Gonna Need It):** Don't build for hypothetical future requirements
- **Single Responsibility:** Functions/classes do one thing well
- **Explicit over implicit:** Favor clarity over magic
- **Fail fast:** Validate early, surface errors immediately

### 5.2 File Organization (Waygate-Specific)

| New... | Goes in... |
|--------|------------|
| React Component | `src/components/features/{domain}/` |
| API route | `src/app/api/v1/{resource}/route.ts` |
| Service (business logic) | `src/lib/modules/{module}/{module}.service.ts` |
| Repository (data access) | `src/lib/modules/{module}/{module}.repository.ts` |
| Zod Schema | `src/lib/modules/{module}/{module}.schemas.ts` |
| Hook | `src/hooks/use{Name}.ts` |
| Utility | `src/lib/utils/{name}.ts` |

### 5.3 Naming Conventions

| Element | Convention | Example |
|---------|------------|---------|
| Variables | camelCase, descriptive | `userEmail`, `isLoading` |
| Constants | SCREAMING_SNAKE_CASE | `MAX_RETRY_COUNT`, `API_BASE_URL` |
| Functions | camelCase, verb prefix | `getUserById()`, `validateInput()` |
| Classes | PascalCase, noun | `UserService`, `PaymentProcessor` |
| Interfaces/Types | PascalCase, descriptive | `UserProfile`, `ApiResponse` |
| Files (components) | PascalCase | `UserProfile.tsx` |
| Files (utilities) | camelCase or kebab-case | `formatDate.ts`, `api-client.ts` |
| CSS classes | kebab-case or BEM | `user-profile`, `btn--primary` |
| Database tables | snake_case, plural | `user_accounts`, `order_items` |
| Environment variables | SCREAMING_SNAKE_CASE | `DATABASE_URL`, `API_KEY` |

### 5.4 TypeScript Specifics

- Enable strict mode
- Avoid `any` — use `unknown` and narrow, or define proper types
- Use Zod for all runtime validation (inputs, configs, API responses)
- Throw errors, don't return them — use typed error classes
- Prefer named exports over default exports
- Keep API routes thin — validate input, call service, format response

### 5.5 Import Order

1. React/Next.js imports
2. External packages
3. Internal absolute imports (`@/lib/...`)
4. Relative imports (`./`, `../`)
5. Type imports (with `type` keyword)

---

## 6. Error Handling

### 6.1 Error Response Format (LLM-Friendly)

```typescript
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable description",
    "details": { "field": "value", "reason": "specific issue" },
    "requestId": "uuid-for-debugging",
    "suggestedResolution": {
      "action": "RETRY_WITH_MODIFIED_INPUT",
      "description": "How to fix this",
      "retryable": true,
      "retryAfterMs": null
    }
  }
}
```

### 6.2 Logging Standards

| Level | When to Use |
|-------|-------------|
| `error` | Unexpected failures, exceptions |
| `warn` | Recoverable issues, deprecations |
| `info` | Key business events (action invoked, auth completed) |
| `debug` | Detailed execution flow |

---

## 7. Security Guidelines

### 7.1 Data Handling

- **Never log:** passwords, tokens, API keys, PII, credit card numbers
- **Never commit:** secrets, credentials, environment files (.env)
- **Always sanitize:** user input before display (prevent XSS)
- **Always parameterize:** database queries (prevent SQL injection)
- **Always validate:** input on both client AND server

1. **Waygate API Key** (`Tenant.waygateApiKey`): Consuming apps use this to authenticate with Waygate Gateway API
2. **Integration Credentials** (`IntegrationCredential`): OAuth tokens/API keys for external services (Slack, Google, etc.) — stored encrypted

- Store tokens securely (httpOnly cookies preferred over localStorage)
- Implement token refresh before expiration
- Check authorization on every protected operation (server-side)
- Use principle of least privilege
- Invalidate sessions on password change/logout

- Encrypt all external credentials with AES-256-GCM before storage
- Decrypt only in-memory for requests
- Never log credentials, even in error messages
- Use Supabase RLS for tenant isolation

---

## 8. Testing Requirements

| Test Type | Coverage Target | Tools |
|-----------|-----------------|-------|
| Unit Tests | 80%+ for services, utilities | Vitest |
| Integration Tests | Critical API paths | Vitest + MSW |
| E2E Tests | Happy paths only | Playwright |

**Test File Location:** `tests/unit/`, `tests/integration/`, `tests/e2e/`

---

## 9. AI Assistant Behavior

### 9.1 Before Making Changes

1. **Read `project_status.md`** first to understand current context
2. **Read relevant files** before proposing edits — don't assume
3. **Review `architecture.md`** for established patterns
4. **Check `decision_log.md`** for prior decisions on similar topics

### 9.2 When Writing Code

- Follow existing patterns in the codebase
- **Search for existing utilities/helpers before creating new ones**
- Prefer editing existing files over creating new ones
- Keep changes minimal and focused on the task
- Business logic in `*.service.ts`, data access in `*.repository.ts`

### 9.3 What NOT to Do

- Don't add features beyond what's requested
- Don't refactor unrelated code in the same commit
- Don't add abstractions for one-time operations
- Don't add dependencies without explicit approval
- Don't generate placeholder content or TODO implementations
- **Don't skip documentation updates**

### 9.4 After Making Changes

1. **Update `changelog.md`** with what was added, changed, or fixed
2. **Update `project_status.md`** to reflect current progress
3. **Add to `decision_log.md`** if any architectural decisions were made
4. **Update `architecture.md`** if tech stack, schema, or API changed
5. **Create/update feature docs** in `docs/Features/` for feature work

**Never leave documentation stale.** Documentation updates are part of completing the work, not a separate task.

### 10.5 Communication

- Explain significant architectural decisions
- Flag potential issues or concerns proactively
- Ask clarifying questions when requirements are ambiguous
- Summarize changes made at the end of significant work
- Confirm which documentation was updated after completing work

---

## 10. Documentation Maintenance

| Trigger Event | Required Documentation Updates |
|---------------|-------------------------------|
| **Feature completed** | `changelog.md`, `project_status.md` |
| **Bug fixed** | `changelog.md`, `project_status.md` |
| **New dependency added** | `architecture.md`, `changelog.md` |
| **Database schema changed** | `architecture.md`, `decision_log.md`, `changelog.md` |
| **API endpoint added/changed** | `architecture.md`, `changelog.md` |
| **Work session ended** | `project_status.md` |

---

## 11. Quick Reference Commands

```bash
# Development
pnpm dev                    # Start development server
pnpm build                  # Build for production
pnpm lint                   # Run linter
pnpm format                 # Run formatter

# Testing
pnpm test                   # Run all tests
pnpm test:watch             # Run tests in watch mode
pnpm test:coverage          # Run tests with coverage

# Database
pnpm prisma migrate dev     # Run migrations (dev)
pnpm prisma migrate deploy  # Run migrations (prod)
pnpm prisma db seed         # Seed database
pnpm prisma migrate reset   # Reset database

# Other
pnpm type-check             # TypeScript type check
pnpm prisma generate        # Generate Prisma client
```

---

## 12. Waygate-Specific Guidelines

### 12.1 Core Domain Terminology

| Term | Definition |
|------|------------|
| **Action** | A single operation through an integration (e.g., `slack.sendMessage`) |
| **Integration** | A configured connection to an external API |
| **Tenant** | An isolated account (organization/user) |
| **Consuming App** | An application that uses Waygate's Gateway API |

### 12.2 Request Pipeline Flow

```
API Request → Auth Check → Input Validation (Zod) → Build Request
     → Execute (with retries) → Response Validation → Return Result
```

### 12.3 Key Design Decisions

- **Modular Monolith:** Single Next.js app with separated internal modules
- **Repository Pattern:** Data access abstracted in `*.repository.ts`
- **Service Layer:** Business rules in `*.service.ts`, never in API routes
- **Circuit Breaker:** In-memory state tracking failures per integration

### 12.4 Visual Design (UI Work)

- **Color Primary:** `#1E1B4B` (Indigo 950)
- **Color Secondary:** `#7C3AED` (Violet 600) 
- **Color Accent:** `#10B981` (Emerald 500)
- **Typography:** Crimson Pro (headings), Inter (body), JetBrains Mono (code)
- **Component Library:** Shadcn/ui with Tailwind CSS
- **Icon Style:** Lucide, with optional fantasy-themed accents (sparingly)

---

*Last Updated: 2026-01-01*
