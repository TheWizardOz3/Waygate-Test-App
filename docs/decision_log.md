# Decision Log: {{PROJECT_NAME}}

> **Purpose:** This is the Architectural Decision Record (ADR) — the "Why" behind architectural changes, error resolutions, and pattern evolutions. It serves as institutional memory for AI assistants and developers to understand context, avoid repeating mistakes, and maintain consistency.

**Related Documents:**
- `architecture.md` — Technical implementation details (the "How")
- `product_spec.md` — Product requirements (the "What")
- `changelog.md` — Version history and release notes

---

## Quick Reference Index

| ID | Date | Category | Status | Summary |
|----|------|----------|--------|---------|
| {{ID}} | {{DATE}} | {{CATEGORY}} | {{STATUS}} | {{ONE_LINE_SUMMARY}} |

**Categories:** `arch` | `data` | `api` | `ui` | `test` | `infra` | `error`

**Statuses:** `active` | `superseded` | `reverted`

---

## Entry Format

```
### {{ID}}: {{TITLE}}
**Date:** {{YYYY-MM-DD}} | **Category:** {{CATEGORY}} | **Status:** {{STATUS}}

#### Trigger
{{What prompted this change — error encountered, limitation hit, requirement change, performance issue, etc.}}

#### Decision
{{What changed — be specific about files, patterns, or configurations modified}}

#### Rationale
{{Why this approach was chosen over alternatives}}

#### Supersedes
{{Previous decision ID this replaces, or "N/A" if new}}

#### Migration
- **Affected files:** {{glob pattern or specific paths}}
- **Find:** {{exact code pattern, function name, or import to locate}}
- **Replace with:** {{new pattern or approach}}
- **Verify:** {{command to run or test to confirm migration complete}}

#### AI Instructions
{{Specific rules for AI when working in this area — what to do, what NOT to do}}
```

---

## Log Entries

<!-- Add new entries below this line, newest first -->

### {{ID}}: {{TITLE}}
**Date:** {{YYYY-MM-DD}} | **Category:** {{CATEGORY}} | **Status:** active

#### Trigger
{{DESCRIPTION}}

#### Decision
{{DESCRIPTION}}

#### Rationale
{{DESCRIPTION}}

#### Supersedes
N/A

#### Migration
- **Affected files:** N/A (new implementation)
- **Find:** N/A
- **Replace with:** N/A
- **Verify:** N/A

#### AI Instructions
{{SPECIFIC_RULES}}

---
