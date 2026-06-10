# Hybrid Redraw Policy

Design Mudah uses an experimental OpenRouter redraw architecture:

- `Nemotron Content Safety = visual safety gate`
- `Gemini 3.1 Flash Image Preview = direct image-to-image redraw`
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
5. If safe, Gemini redraws directly from the cleaned trace target with a strict vector-like prompt, `image_config`, and reasoning effort from env.
6. The resulting PNG is postprocessed, then returned to the existing trace and separation flow.

## Invariants

- Ready trace mode must stay local/backend trace only and must not call OpenRouter.
- Redraw model IDs and OpenRouter image controls must stay env-editable.
- Persist redraw metadata to the job manifest:
  - provider
  - generation model
  - safety model
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
Saved settings normalize to the OpenRouter Gemini image config shape, including older records that used a previous provider.
