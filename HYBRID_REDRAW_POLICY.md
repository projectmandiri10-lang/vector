# Hybrid Redraw Policy

Design Mudah uses a fixed redraw architecture:

- `GLM-5V Turbo = director`
- `GLM-Image = painter`
- `Gemini + Imagen 3 = fallback when GLM quality is not good enough`
- deterministic trace, vector, cutline, film, PDF, and ZIP stay outside AI

## Pipeline

1. Cloudflare Worker verifies login and credit.
2. Worker forwards redraw jobs to Cloud Run.
3. Cloud Run preprocesses the upload with a Node heuristic:
   - rotate and normalize
   - crop and resize
   - remove border-connected background
   - preserve enclosed artwork
4. GLM-5V Turbo analyzes the cleaned upload and returns:
   - structured JSON analysis
   - one strict English technical redraw prompt
5. GLM-Image redraws from that prompt only.
6. The resulting PNG is returned to the existing trace and separation flow.

## Invariants

- Do not use GLM-Image or Imagen as direct image editing for uploaded redraw jobs.
- Do not let Worker generate redraw prompts locally.
- Persist redraw metadata to the job manifest:
  - provider
  - analysis model
  - generation model
  - preset
  - preprocess mode
  - analysis summary
  - final technical prompt
- Keep user-facing redraw pricing flat unless pricing policy is explicitly changed.

## Admin Setting

The active pipeline config lives in `app_settings.ai_redraw_model`.
It must stay backward-safe with legacy Gemini records, while new default saves normalize to the GLM hybrid config shape.
