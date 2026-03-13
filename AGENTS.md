# Agents

This file documents all available agents from personal Claude config (`~/.claude-personal/agents/`). No project-level agents exist in `.claude/agents/`. See [CLAUDE.md](./CLAUDE.md) for repo conventions all agents must follow.

## Project Agent Registry

No project-level agents defined in `.claude/agents/`.

## Personal Agent Registry

Source: `~/.claude-personal/agents/`

### architecture-design

**Model:** opus
**Purpose:** Design system architecture, select tech stacks, define component boundaries, and produce authoritative architecture plans for new features or products.
**Scope:** System-level decisions — service boundaries, data architecture, framework choices, scalability strategy, migration paths.
**Triggers:** Designing a new major feature or product, introducing new services/subsystems, choosing frameworks or infrastructure, changing system shape (monolith to services, sync to async), before large feature execution.
**Constraints:** Does NOT implement features, write code, or design UI. Produces the architecture plan that implementation must follow.

### bug-fixer

**Model:** sonnet
**Purpose:** Identify root cause of bugs and apply the smallest safe fix that corrects behavior without introducing unrelated changes.
**Scope:** Reported bugs, failing tests, incorrect behavior, production issues, flaky/intermittent failures.
**Triggers:** Bug reported, test failing, behavior incorrect or inconsistent, production/staging issue, flaky failures.
**Constraints:** No unrelated refactors, no style cleanups, no new features, no architecture changes, no dependency updates unless required for the fix. Must include regression test.

### bug-investigator

**Model:** opus
**Purpose:** Forensic analysis and root cause identification for bugs. Traces execution paths, analyzes state mutations, identifies race conditions, isolates minimal failing conditions.
**Scope:** Investigation only — unclear or intermittent bug behavior, production incidents, multi-layer failures, flaky tests, confusing logs, performance regressions, data corruption.
**Triggers:** Bug behavior is unclear or intermittent, production incidents, failures spanning multiple layers, nondeterministic tests, confusing errors, performance regressions, data state issues.
**Constraints:** NEVER applies fixes, modifies code, refactors, or adds features. Investigation and reporting only. Every claim requires evidence.

### commercialization-readiness-auditor

**Model:** opus
**Purpose:** Evaluate whether a codebase is ready for commercial release, open-sourcing, or public distribution. Assesses security exposure, licensing risks, dependency vulnerabilities, packaging readiness.
**Scope:** Full repository audit for release readiness — secrets, licensing, dependencies, packaging, operational readiness, public/private boundary decisions.
**Triggers:** Evaluating commercial release readiness, open-source readiness, release blocker identification, public vs private repository boundary decisions.
**Constraints:** Read-only assessment. Does NOT modify files, execute code, or run builds unless explicitly asked.

### docs-drift-auditor

**Model:** sonnet
**Purpose:** Detect documentation drift — the divergence between what docs say and what code actually does. Distinguishes between actual drift (doc vs committed code) and new version updates (doc vs unstaged code).
**Scope:** All documentation files (README, docs/, CLAUDE.md, etc.) mapped against public APIs, CLI commands, config, environment variables, and HTTP endpoints.
**Triggers:** New features added and docs may need updating, APIs/CLI/behavior changed, refactors touched public surfaces, preparing for release, documentation suspected outdated, onboarding friction reported.
**Constraints:** Never invents features. Only documents what exists in code. Prefers removal over misinformation.

### feature-executor

**Model:** sonnet
**Purpose:** Implement features exactly according to an existing product specification. Spec-driven, disciplined implementation with minimal diffs.
**Scope:** Implementation of provided product specs — translating specifications into code changes, tests, and PR-ready deliverables.
**Triggers:** A Product Spec artifact exists and needs implementation. Will NOT proceed without a spec.
**Constraints:** No requirement invention, no scope creep, no behavior changes beyond spec, no architecture changes unless spec requires it. Minimal diffs only. Every line changed must trace to a spec requirement.

### implementation-planner

**Model:** opus
**Purpose:** Translate existing product, UI, and/or architecture specs into a durable, checklist-driven implementation plan that survives context compaction.
**Scope:** Reads specs from `specs/product/`, `specs/ui/`, `specs/architecture/` and produces plans in `plans/`. Does not implement code or make architecture decisions.
**Triggers:** After specs are written but before code implementation begins. When a structured execution plan is needed.
**Constraints:** Does NOT implement code, make architecture decisions, or define product requirements. If specs are missing, marks sections as blocked rather than inventing requirements.

### mind-keg

**Model:** sonnet
**Purpose:** Manage persistent memory via the Mind Keg MCP tools — search, store, update, deprecate, and flag learnings across repository, workspace, and global scopes.
**Scope:** All Mind Keg MCP tools (store_learning, search_learnings, update_learning, deprecate_learning, flag_stale, delete_learning, list_repositories, list_workspaces).
**Triggers:** Session start (search for relevant learnings), significant discoveries during session, session end (offer to save learnings), user requests to remember/save knowledge.
**Constraints:** Never stores a learning without user confirmation of scope. Always searches all three scopes (repo, workspace, global) before concluding no relevant learnings exist. Uses short, focused queries (1-3 keywords).

### open-source-readiness-auditor

**Model:** sonnet
**Purpose:** Audit repositories for open-source release readiness. Assesses public API stability, code hygiene, security, build/onboarding, documentation, testing, licensing, contribution governance, and adoption fit.
**Scope:** Full repository readiness assessment across nine dimensions: API stability, code hygiene, security, onboarding, documentation, testing, licensing, governance, and adoption.
**Triggers:** Preparing a repository for open-source release, evaluating if an internal project is ready for GitHub, before announcing/marketing an OSS project, choosing a license or contribution model.
**Constraints:** Produces a public-readiness plan, not code. Does NOT implement features, refactor code, or design new behavior.

### oss-commercial-strategy

**Model:** opus
**Purpose:** Evaluate whether a repository, app, or product should be open-sourced or commercialized. Provides brutally honest viability assessments and strategic recommendations.
**Scope:** Product viability analysis — problem value, market/audience, differentiation, open-source dynamics, monetization feasibility, cost/ops reality, competitive landscape.
**Triggers:** Deciding if a project is monetizable, considering dual-licensing or open-core strategies, evaluating commercialization vs open-source, before investing significant time in scaling a project.
**Constraints:** Brutal honesty over encouragement. Economic reality over technical elegance. Never provides false hope or motivational bias.

### platform-architecture-auditor

**Model:** opus
**Purpose:** Evaluate whether a proposed platform or architecture change (migration) is technically justified, product-justified, economically sustainable, and operationally sane.
**Scope:** Strategic platform decisions — web to Electron, web to mobile, monolith to microservices, runtime framework selection, distribution strategy.
**Triggers:** Evaluating platform migrations, choosing between desktop/web/mobile/hybrid, selecting runtime frameworks, making distribution decisions, assessing whether an architectural change is justified.
**Constraints:** Does NOT implement migrations, write code, design features, or provide implementation guidance. Provides strategic analysis and verdicts only.

### product-spec-designer

**Model:** opus
**Purpose:** Transform ambiguous ideas into precise, implementable technical specifications. Covers functional behavior, API contracts, data model impact, edge cases, failure modes, and acceptance criteria.
**Scope:** Product and technical specification design for new features, behavior changes, APIs, workflows, or business logic.
**Triggers:** Designing a new feature, changing existing behavior, adding APIs/workflows/business logic, ambiguous requirements needing clarification.
**Constraints:** Designs WHAT must be built, not HOW it is coded. Does not write implementation code. Does not make architectural decisions beyond spec requirements. Does not invent business logic without justification.

### refactor-executor

**Model:** sonnet
**Purpose:** Implement scoped, safe refactors or fixes addressing one audit finding at a time from a Repository Auditor report.
**Scope:** Single audit findings — security fixes, reliability improvements, performance fixes, maintainability improvements.
**Triggers:** A Repository Auditor report exists and a specific finding/ticket has been selected for implementation.
**Constraints:** Fix ONE finding at a time. Minimal diff. No architecture rewrites. Behavior preservation. No style refactors unless required. No sweeping rewrites or bundled fixes.

### repo-auditor

**Model:** sonnet
**Purpose:** Conduct structured audits of repositories to identify security risks, reliability issues, correctness bugs, performance bottlenecks, maintainability problems, and operational gaps.
**Scope:** Full repository audit across five dimensions: security, performance, reliability/correctness, maintainability, observability/operations.
**Triggers:** Pre-release reviews, post-merge audits, onboarding to a new codebase, after dependency updates, after production incidents.
**Constraints:** Read-only mode by default. No sweeping rewrites. Ignore pure style issues. No invented vulnerabilities — every claim requires evidence. Prefer small, safe, incremental changes over overhauls.

### repo-docs-generator

**Model:** opus
**Purpose:** Generate or regenerate CLAUDE.md and AGENTS.md files by analyzing a codebase and discovering existing agent definitions.
**Scope:** Repository analysis and documentation generation — directory structure, languages, frameworks, conventions, tests, CI/CD, agents.
**Triggers:** Setting up a new repo for Claude Code usage, codebase changed significantly and docs need updating, new agents added.
**Constraints:** Never invents agents or conventions. Documents only what exists. Preserves accurate existing content in CLAUDE.md.

### requirements-clarifier

**Model:** opus
**Purpose:** Analyze incoming requests (feature requests, bug reports, change requests) and produce structured requirements analysis. Acts as a gatekeeper ensuring clarity before any planning or implementation.
**Scope:** Requirements elicitation, risk assessment, scope definition. Produces verdicts: CLEAR, UNCLEAR, or BLOCKED.
**Triggers:** New task, feature request, or issue presented before any planning or implementation begins.
**Constraints:** NEVER proceeds into planning or implementation. Never asks questions answerable by reading existing specs/docs/code. Prefers assumptions over questions when risk is LOW. Blocks and asks when risk is HIGH.

### saas-pricing-strategist

**Model:** opus
**Purpose:** Develop SaaS pricing strategies including tier design, competitive positioning, willingness-to-pay analysis, and pricing experiment plans.
**Scope:** Pricing strategy — value metrics, competitive landscape, tier design, positioning, experiment planning, risk assessment.
**Triggers:** Developing pricing tiers, analyzing competitive positioning, creating pricing experiments, structuring freemium vs paid, determining price points.
**Constraints:** Avoids underpricing without strategic reason. Prefers simple pricing early. Explicitly states all assumptions. Never copies competitor pricing blindly.

### seo-strategy-analyst

**Model:** opus
**Purpose:** Produce comprehensive SEO strategy analysis including keyword/intent mapping, content audits, gap analysis, opportunity mapping, competitive signals, and priority action plans.
**Scope:** SEO analysis across six pillars: keyword/intent landscape, content audit, content gap analysis, opportunity mapping, competitive signals, priority action plan.
**Triggers:** Content opportunity mapping, keyword research strategy, competitive SEO analysis, technical SEO audits, building comprehensive SEO strategies.
**Constraints:** Prioritizes intent alignment over keyword density. Ties recommendations to actual product value. Flags insufficient data explicitly. Specific over generic.

### ui-spec-generator

**Model:** sonnet
**Purpose:** Translate product requirements into comprehensive, implementable UI specifications covering screens, layouts, interaction flows, states, accessibility, and responsive behavior.
**Scope:** UI/UX design specifications for any user-facing feature — screens, layouts, user flows, component inventory, states, accessibility, responsive behavior, microcopy.
**Triggers:** Feature needs UI/UX design guidance, new screens/layouts needed, interaction flows to define, accessibility requirements to specify.
**Constraints:** Does NOT implement code, invent backend capabilities, or invent business logic. Produces specifications, not implementations. Declares data dependencies rather than assuming they exist.

### workflow-orchestrator

**Model:** opus
**Purpose:** Ensure no execution happens without proper specification and planning. Classifies work, identifies missing artifacts, generates specs and plans, and hands off to the correct execution agent.
**Scope:** Full Spec-Design-Plan-Execute pipeline. Creates/updates files under `specs/`, `plans/`, and `decisions/`. Routes to downstream agents (Feature Executor, Bug Fixer, Refactor Executor).
**Triggers:** Starting a new feature, initiative, or significant change. When automatic determination of required spec/design/planning steps is needed before code is written.
**Constraints:** Does NOT write production code. Only outputs markdown artifacts (specs, plans, decision records). Always reads CLAUDE.md first. No execution handoff until all required artifacts exist. No requirement invention.

## Delegation Map

| Task Type | Agent |
|---|---|
| System/platform architecture design | architecture-design |
| Bug fix (known issue, apply fix) | bug-fixer |
| Bug investigation (forensic analysis) | bug-investigator |
| Commercial release readiness | commercialization-readiness-auditor |
| Documentation drift detection | docs-drift-auditor |
| Spec-driven feature implementation | feature-executor |
| Implementation plan generation | implementation-planner |
| Persistent memory management | mind-keg |
| Open-source release readiness | open-source-readiness-auditor |
| OSS vs commercial strategy | oss-commercial-strategy |
| Platform migration evaluation | platform-architecture-auditor |
| Product/feature specification | product-spec-designer |
| Audit finding fix (scoped refactor) | refactor-executor |
| Repository audit (security, perf, reliability) | repo-auditor |
| CLAUDE.md / AGENTS.md generation | repo-docs-generator |
| Requirements clarification | requirements-clarifier |
| SaaS pricing strategy | saas-pricing-strategist |
| SEO strategy and content planning | seo-strategy-analyst |
| UI/UX specification | ui-spec-generator |
| Workflow orchestration (spec-plan-execute) | workflow-orchestrator |
| Everything else | generalist (no specific agent) |

## Multi-Agent Sequencing

For complex features, execute agents in this order:

1. **Clarify** — `requirements-clarifier` (ensure requirements are complete)
2. **Specify** — `product-spec-designer` + `ui-spec-generator` + `architecture-design` (define what to build)
3. **Plan** — `implementation-planner` (create execution checklist)
4. **Implement** — `feature-executor` or `refactor-executor` (write code)
5. **Fix** — `bug-fixer` (address issues found during implementation)
6. **Review** — `repo-auditor` + `docs-drift-auditor` (audit quality and documentation)
7. **Release** — `open-source-readiness-auditor` or `commercialization-readiness-auditor` (validate release readiness)

The `workflow-orchestrator` can automate steps 1-4 as a single invocation.

The `mind-keg` agent operates orthogonally — invoke it at session start, after discoveries, and at session end regardless of other agent activity.

## Coverage Gaps

The following areas have no dedicated agent coverage (observations only — no new agents should be created):

- **Performance optimization** — No dedicated performance tuning agent. Performance issues are partially covered by `repo-auditor` (detection) and `bug-fixer` (if perf is a bug).
- **Database migration authoring** — No agent specifically for writing migration scripts.
- **CI/CD pipeline configuration** — No agent for designing or modifying CI/CD workflows.
- **Dependency updates / upgrade management** — No agent for evaluating and executing dependency upgrades.
- **Code review** — No dedicated PR review agent. `repo-auditor` covers audit but not inline review.
