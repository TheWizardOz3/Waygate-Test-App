# Suggested tech stack (default)
Frontend: Vercel, Next.js, TailwindCSS, Shadcn/ui
Database: MongoDB, Supabase
Auth: Auth0
Emails: Resend
Object Storage: Google Cloud

---

# AI Workflow Cheatsheet

Use `@docs/prompts/[name].md` to invoke these prompts.

## Project Bootstrap (Cascading)
| Order | Prompt | Purpose |
|-------|--------|---------|
| 1 | `@plan-product_spec.md` | brainstorm → product spec |
| 2 | `@plan-architecture.md` | spec → architecture |
| 3 | `@plan-project_status.md` | spec + arch → status tracker |
| 4 | `@plan-env.md` | set up environment variables |
| 5 | `@plan-mcps_and_plugins.md` | configure MCPs and Cursor plugins |

## Development Cycle
| Prompt | Purpose |
|--------|---------|
| `@plan-milestone.md` | Plan a milestone's feature sequence |
| `@plan-feature.md` | Break feature into atomic tasks |
| `@build-task.md` | Implement a single task |
| `@test.md` | Test what was built |
| `@finalize.md` | Update docs, prep commit |

## Quick Commands
| Goal | Prompt |
|------|--------|
| Continue | `Next task` |
| Status | `What's our current progress?` |
| Context | `Read project_status.md and remind me where we are` |
