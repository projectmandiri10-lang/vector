# Hybrid Redraw Policy

Design Mudah uses an experimental OpenRouter redraw architecture:

- `Nemotron Content Safety = visual safety gate`
- `FLUX.2 Klein 1K = direct trace-clone image redraw`
- `Riverflow V2 Fast = fallback image redraw when the primary model is unavailable`
- deterministic Logo Restore, trace, vector, cutline, film, PDF, and ZIP stay outside AI

## Pipeline

1. Railway Express verifies login and credit through the embedded SaaS logic.
2. The backend preprocesses the upload with a Node heuristic:
   - rotate and normalize
   - crop and resize
   - remove border-connected background
   - preserve enclosed artwork
3. Logo Restore runs first for flat logo/text artwork and can return vector artifacts without generative redraw.
4. For AI redraw, Nemotron checks the normalized original and cleaned trace target for safety.
5. If safe, FLUX redraws directly from the cleaned trace target with a strict trace-clone prompt and `image_config.image_size=1K`.
6. If the primary model is unavailable or returns no image, the backend retries once with `OPENROUTER_IMAGE_MODEL_FALLBACK`.
7. The resulting PNG is postprocessed, then returned to the existing trace and separation flow.

## Invariants

- Ready trace mode must stay local/backend trace only and must not call OpenRouter.
- Redraw model IDs and OpenRouter image controls must stay env-editable.
- Persist redraw metadata to the job manifest:
  - provider
  - generation model
  - fallback model and fallback-used flag
  - safety model
  - prompt profile
  - image size
  - reasoning effort
  - background mode
  - preset
  - preprocess mode
  - safety summary
  - final technical prompt
- Keep user-facing redraw pricing flat unless pricing policy is explicitly changed.

## Admin Setting

The active pipeline config lives in `app_settings.ai_redraw_model`.
Saved settings normalize to the OpenRouter image config shape, including older records that used Gemini or Riverflow providers.
