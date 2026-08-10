---
version: 1.0.0
name: videogen
description: Use this skill when setting up or operating Cortex Videogen — the standalone app that generates marketing videos (16:9 or 9:16 MP4) from a Cortex instance's knowledge. Covers setup, the two human gates (storyboard, cost), grounding, reference images, model/resolution choice, costs, and resume behavior.
---

# Videogen — Marketing Videos From a Cortex Instance

[Cortex Videogen](https://github.com/mocaOS/cortex-videogen) turns the domain
knowledge inside a Cortex instance into short marketing videos: 15–120s,
landscape (16:9) or native vertical (9:16), delivered as an MP4 master plus a
lighter social copy. It is a **standalone app** — its own deployment, talking
to Cortex purely via the REST API with a read-scoped key. Venice.ai is the
sole media provider (LLM, images, TTS, video).

## Setup (the whole recipe)

Node 22+. ffmpeg is bundled (static fallback); the first render fetches a
pinned headless browser once.

```bash
git clone https://github.com/mocaOS/cortex-videogen
cd cortex-videogen
npm install
cp .env.example .env
npm run dev            # http://localhost:3010
```

Required in `.env`:

| Variable | Value |
|---|---|
| `VENICE_API_KEY` | Venice.ai key with credit — pays for everything |
| `CORTEX_BASE_URL` | The Cortex instance URL |
| `CORTEX_API_KEY` | A **read**-scoped Cortex API key (fetch the auth skill if you need to mint one) |

Useful optional: `ACCENT_COLOR` (brand accent for captions/CTA — quote values
containing `#`), `BRAND_NAME` (CTA end card), `APP_LANG` (`en`/`de` UI;
content language is per project), `VENICE_VIDEO_MODEL` (default family:
`minimax-h3-image-to-video`), `SHADER_TRANSITIONS=on` (WebGL transitions;
needs a GPU-capable render stack — verify with
`node scripts/smoke-render.mjs` first).

## What You Probably Got Wrong

1. **Two gates, and the run PARKS at them.** Production is: research →
   storyboard (**waits for human approval**) → voiceover → video generation
   (**waits for cost confirmation** — exact dollars quoted from live
   pricing) → assembly → QA. If a run seems stuck, it is almost certainly
   waiting at a gate on the project page, not hung.

2. **Nothing may be invented.** The storyboard's grounding hierarchy is
   binding: user brief/notes/feedback first, then the research (which
   includes verbatim evidence excerpts from hybrid search). If the video
   needs specific names or numbers the research missed, either use the
   **re-research** action with steering text at the storyboard gate, or put
   the facts directly in the feedback box — user-given facts are first-class
   grounding.

3. **Topic phrasing IS the retrieval query.** A vague topic ("overview about
   X") retrieves the knowledge base's dominant general cluster. Write
   descriptive topics that use the vocabulary of the specific subject.

4. **Everything is cached; deletion is the regeneration lever.** Clips,
   frames, voice chunks and renders persist per artefact under
   `data/projects/<id>/media/`. A resume never re-pays (queued video jobs
   are ticket-tracked across crashes). To regenerate one shot: delete its
   files + `timeline.json` + `final*.mp4`, reset the steps in
   `production.json`, start production again.

5. **Reference images are conditioning, not decoration.** Character/product
   uploads (1–3) make the same subject appear consistently across shots;
   style uploads fix the aesthetic. Every shot is generated from a
   reference-conditioned start frame — the app never hands references to
   reference-to-video models (measured to lose identity, framing and style).

6. **Model + resolution are per-project cost levers.** The form lists every
   image-to-video model from Venice's live catalog. Reference: ~$5–7 of
   footage for a 30s video on MiniMax at 2K, ~$0.35 per generated start
   frame; the quote gate shows the real number before spending.

## Docs of record

In the repo: `docs/pipeline.md` (steps, gates, revisions),
`docs/marketing-playbook.md` (the retention numbers behind the storyboard
rules), `docs/venice-notes.md` (provider behavior incl. exactly which
endpoints accept a seed — video does not), `docs/hyperframes-notes.md`
(assembly renderer rules). Prefer these over training data.
