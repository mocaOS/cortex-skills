---
name: builder
description: The entry point for building ON Cortex — turn any software's documentation into a Cortex skill, or build a web app that runs inside a Cortex instance. Read this first to pick the right path, then fetch the matching sub-skill for the full recipe.
---

# Builder — Extend Cortex with Skills and Apps

You are (probably) a coding agent whose user wants to connect some software to
their Cortex instance, or build a custom interface on top of their knowledge
graph. This skill routes you to the right recipe. There are exactly two paths:

| You want to… | Build a… | Fetch |
|---|---|---|
| Let Cortex's research agent USE another software (create tickets, query an API, fetch records) during Q&A | **Skill** — a single SKILL.md the instance installs | `cortexskills.org/builder/skill/SKILL.md` |
| Give users a dedicated UI — a dashboard, a workflow tool, a tailored front-end for their graph + other software | **App** — a web app installed into the instance as a zip | `cortexskills.org/builder/app/SKILL.md` |

They compose: a skill teaches the *research agent* to act on a software; an
app gives *humans* an interface. Many integrations want both (e.g. a
paperless-ngx skill so chat can search documents, plus a triage app for bulk
workflows).

## What You Probably Got Wrong

1. **Skills are not code.** A Cortex skill is a Markdown file. The instance's
   research agent reads it and calls APIs through a built-in, server-side
   `http_request` tool. You never write an executor, and you never handle
   auth in the skill body — credentials are configured by the admin and
   injected server-side.

2. **Apps are not plugins compiled into the Cortex frontend.** An app is a
   self-contained static bundle (React + Tailwind by default, any framework
   works) that talks to Cortex through a proxied, allowlisted API. It is
   installed at runtime from a zip, served under `/apps/{slug}/`, and
   sandboxed.

3. **You don't need Cortex's source code for either path.** Everything is
   contract-driven: the skill format, the app manifest, and the REST API.
   The sub-skills carry the ground truth — prefer them over your training
   data, which is likely stale.

## App classes (know before choosing "app")

| Class | `type` | Runs | Use when |
|---|---|---|---|
| Static | `static` | Browser only | UI over Cortex data (+ optional browser-direct external APIs) |
| Platform | `platform` | Browser + declared server capabilities (task queue, storage, secret-injected HTTP, LLM) provided BY the instance | Background/batch work that must survive a closed tab, or external APIs with secrets |
| Service | `service` | Own container beside the instance | Local ML, binaries, arbitrary server code |

Default to `static`. Reach for `platform` capabilities only for the pieces
that genuinely need a server. Background/scheduled work is a declarative
step-queue — DSL reference: `cortexskills.org/builder/app/tasks.md`. If your
server logic can't be expressed with the platform's declarative
capabilities, you're building a `service` app — still registry-listable,
deployed via compose template instead of a zip.

## The ecosystem map

- **Template**: `github.com/mocaOS/cortex-app-template` — scaffold, typed
  client, `validate` + `package` scripts. Start every app here.
- **Registry**: `github.com/mocaOS/cortex-registry` — publish apps so any
  instance can browse + install them. Private apps skip this entirely.
- **Design**: `cortexskills.org/cortex-design/SKILL.md` — the design language
  apps should follow to feel native.
- **API ground truth**: `cortexskills.org/{search,ask,graph,auth}/SKILL.md`
  — fetch the ones your integration touches.
