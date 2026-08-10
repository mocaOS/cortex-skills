---
version: 1.0.0
name: trainings
description: Use this skill when deploying, operating, or reasoning about Cortex Trainings — the standalone app that turns a Cortex knowledge base into interactive training units (researched curriculum → approval gate → generated video, voiceover, animations, quizzes → one offline HTML file). Covers the access model, required instance flags, the endpoints it reads, and where the cost actually is.
---

# Cortex Trainings — Courses Generated From Your Knowledge Base

A knowledge base answers the questions people think to ask. Onboarding,
compliance and process knowledge are the questions they *don't* know to ask,
and those normally live in training material that gets written once and then
goes stale. [Cortex Trainings](https://github.com/mocaOS/cortex-trainings)
generates that material from documents the organization already has.

You describe a topic and an audience; an agent researches the instance and
writes a complete curriculum; a human approves it as a plain document; only
then is media generated. The deliverable is **a single HTML file** that runs
offline on double-click.

## What You Probably Got Wrong

1. **It is a standalone app, not an in-instance app.** It has its own
   deployment and its own users, and reaches Cortex only over the REST API —
   the same class as Cortex Chat, not the class described in the
   [apps skill](../apps/SKILL.md). Do not look for it in the registry and do
   not expect `ENABLE_APPS` to matter.

2. **It only ever reads.** Give it a read-only key (`cortex_ro_…`), ideally
   collection-scoped. It never uploads, never mutates the graph, never needs
   `manage`. If someone hands it a read-write key, that is over-provisioning.

3. **Two instance flags are mandatory:** `ENABLE_AGENTIC_RAG` and
   `ENABLE_AGENT_RESEARCH`. The research phase is built on agentic retrieval;
   without them the curriculum step fails. See the
   [setup skill](../setup/SKILL.md) for the env reference.

4. **Production is gated on an explicit human approval.** Describing a topic
   does not produce a course. The curriculum is written first and costs
   almost nothing; media generation is unreachable until someone approves the
   document. Never tell a user "it will just generate a training" — the
   review step is the design, not an obstacle.

5. **Video is where the money goes, and animations are usually better
   anyway.** Generated video is priced per second and dominates the cost by an
   order of magnitude; animations are rendered locally and cost nothing.
   Animations also render **sharp text in any language**, which generative
   video cannot do. Concepts, lists, rules, processes and numbers belong in an
   animation; film is for the two or three moments that need emotion.

6. **The output is one self-contained HTML file, not an LMS package.** No
   SCORM, no xAPI, no telemetry, no completion reporting. It runs from a local
   file, keeps progress in `localStorage`, and is shared by mail, Drive, or by
   uploading it to an LMS as a file. If a user needs completion tracking, that
   is a wrapper around this file, not a change to it.

7. **Interface language and content language are separate.** The app UI
   language is configured for the deployment; the language of a training's
   scripts, voice and on-screen text is chosen per training. Image and video
   prompts are always written in English regardless — the models are trained
   on it — and the generated assets carry no readable text.

## The Two-Part Workflow

**Part 1 — Curriculum (cents).** Four inputs the app refuses to guess: topic
and learning objectives, audience and prior knowledge, content language,
duration (which sets the level count: 3–4 / 5–6 / 7–8). Optional: existing
material to build on, a collection to scope research to, and up to three
character plus three style **reference images** (see *A Training Unit*), which
are analyzed on upload and shape every prompt from the curriculum onward. The agent fans out
deep-research queries across the instance *before* writing, then fills gaps as
it drafts, and produces a document with a fact sheet, learning objectives, a
level table, per-level teaching text, voiceover scripts, a media plan, fully
written-out interactions, a final check, a cheat sheet, **cited sources with
dates**, and a production estimate. Revisions are free and versioned.

**Part 2 — Production (dollars).** A resumable pipeline: extract a structured
plan → generate the guide-character reference image (**a human picks one of
two candidates**; generated *from* the uploads when a character was supplied)
→ synthesize the voiceover → quote and generate film shots (**a human confirms
the cost**) → render animations locally → generate interaction images →
assemble the HTML file → click through the result in a headless browser, which
fails the run if an interaction cannot be completed. Completed steps are skipped
on resume and artefacts are cached, so a failure never re-pays for finished work.

Film shots are also **de-padded** before assembly: video models compose to their
own taste and pad to the requested ratio, and left alone those bars reach the
learner looking like a rendering bug. Do not "fix" that by fitting the clip into
the frame — that just re-letterboxes it in another colour.

## Endpoints It Consumes

Read-only, all through the standard API:

- `POST /api/search` — hybrid retrieval for quick lookups
- `POST /api/ask/stream` — agentic deep research, the workhorse of Part 1
  (streaming; the non-streaming variant carries a server-side deadline)
- `GET /api/graph/communities`, `GET /api/graph/entities`,
  `GET /api/graph/entity/{name}` — mapping a domain and finding topic clusters
- `GET /api/documents/{id}/content` — reading primary sources in full
- `GET /api/collections` — scoping research to a collection

The key stays server-side in the app's own deployment, so the app's origin
does not need to be on the instance's CORS allowlist. See the
[auth skill](../auth/SKILL.md) for key scopes and collection scoping, and the
[ask skill](../ask/SKILL.md) for the retrieval behaviour Part 1 relies on.

## A Training Unit

Levels, each pairing one medium (film / animation / image) with one
interaction. Interactions vary per level on purpose — multiple choice,
myth-or-fact cards, sorting tasks, find-the-mistakes, self-assessment
sliders, and a shuffled final check — because repetition is what makes
e-learning a chore. XP with reduced points on a retry, level badges, a
progress bar, `localStorage` resume, and a printable cheat sheet.

A **guide character** anchors the visual identity. By default it is an abstract
object (orb, crystal, cube) and never a human, because abstract objects stay
visually consistent across image generations while a person drifts between
shots. Its colour is then the deployment's configured accent, and the training
carries exactly one chromatic colour.

A project can instead **bring its own character**: up to three reference images,
analyzed once into an English description and used to generate the anchor image
itself, so the actual design survives rather than a paraphrase of it. Such a
character keeps *its own* colours — the accent still rules the UI, animations
and highlights, but nothing is recoloured to it. The consistency warning above
still applies: a detailed human drifts more between shots than a stylized or
abstract character does.

**Style references** work the same way — up to three images analyzed into one
shared aesthetic that replaces the preset visual style in every film and image
prompt. With both uploaded, the character is rendered into the world the script
describes, in the aesthetic the references define.

**The guide is not in every shot, and should not be.** The storyboard decides
per shot: roughly half a film's shots — establishing shots, object details,
concept imagery — are deliberately character-free, and the opening shot almost
always is. A guide in every shot reads as a mascot parade and buries the
subject, and because the anchor image is a hero portrait, conditioning every
shot on it makes every film open on that same portrait. Character-free shots
still carry the shared style, so they stay in the same visual world.

## Operating Notes

- Requirements: Node 22+, `ffmpeg`/`ffprobe`, headless Chromium for rendering.
- Projects are stored as plain files — every curriculum version, the plan,
  per-step state and all media — so runs are inspectable and recoverable.
- Research generously. Knowledge-base queries are cheap next to agent tokens,
  and agent tokens are cheap next to a second of generated video. A
  well-informed agent writes a better curriculum in fewer expensive passes.
- The healthiest signal in a generated curriculum is it **naming its own
  gaps** — saying the knowledge base does not cover something and asking, at
  the approval gate, instead of filling the hole with general knowledge.
