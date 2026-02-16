# Audit Data Flows, Dependencies & Security

Audit the codebase for broken or disconnected data flows, missing dependencies, and security issues.

1. Read `docs/architecture.md` and `docs/project_status.md` to understand the intended system design and current state

2. Trace every major pipeline end-to-end: **API route → service → repository → database**. Flag any mismatches between what's defined in the Prisma schema, what services expect, and what the UI actually calls.

3. Check for:
   - Unused or dead API endpoints
   - Services that reference non-existent repositories or functions
   - Zod schemas that don't match Prisma models
   - API responses that don't match what the frontend expects
   - Dead code paths or orphaned modules
   - Missing error handling on external API calls
   - Broken or circular import chains

4. While reading the code, also check for security issues:
   - Unvalidated or unsanitized user input
   - Missing authentication or authorization checks
   - Credentials or secrets logged or exposed in responses
   - SQL injection, XSS, or injection vulnerabilities
   - Overly permissive CORS or API access
   - Missing rate limiting on public endpoints
   - Sensitive data in client-side code or localStorage

5. Produce a markdown report grouped by category:
   - **Critical** — Broken flows, security vulnerabilities, data integrity risks
   - **Should Fix** — Mismatches, dead code, missing validation
   - **Minor** — Cleanup opportunities, unused imports, inconsistencies

6. For each finding, include: file path, description of the issue, and recommended fix.

Start with step 1.
