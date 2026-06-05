# Hybrid Redraw Policy

Design Mudah uses a fixed redraw architecture:

- `Gemini = director`
- `Imagen 3 = painter`
- deterministic trace, vector, cutline, film, PDF, and ZIP stay outside AI

## Pipeline

1. Cloudflare Worker verifies login and credit.
2. Worker forwards redraw jobs to Cloud Run.
3. Cloud Run preprocesses the upload with a Node heuristic:
   - rotate and normalize
   - crop and resize
   - remove border-connected background
   - preserve enclosed artwork
4. Gemini analyzes the cleaned upload and returns:
   - structured JSON analysis
   - one strict English technical redraw prompt
5. Imagen 3 redraws from that prompt only.
6. The resulting PNG is returned to the existing trace and separation flow.

## Invariants

- Do not use Imagen as direct image editing for uploaded redraw jobs.
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
It must stay backward-safe with legacy Gemini-only records, but new saves should always normalize to the hybrid config shape.
