# Hybrid Redraw Policy

Design Mudah uses a fixed redraw architecture:

- `OpenRouter Qwen VL = analyzer`
- `OpenRouter Qwen Image = image-to-image redraw`
- deterministic Logo Restore, trace, vector, cutline, film, PDF, and ZIP stay outside AI

## Pipeline

1. Railway Express verifies login and credit through the embedded SaaS logic.
2. The backend preprocesses the upload with a Node heuristic:
   - rotate and normalize
   - crop and resize
   - remove border-connected background
   - preserve enclosed artwork
3. Logo Restore runs first for flat logo/text artwork and can return vector artifacts without generative redraw.
4. For AI redraw, Qwen VL analyzes two references:
   - normalized original upload for full context
   - cleaned trace target for printable artwork boundaries
5. Qwen Image redraws from the strict technical prompt and the cleaned image reference.
6. The resulting PNG is postprocessed, then returned to the existing trace and separation flow.

## Invariants

- Ready trace mode must stay local/backend trace only and must not call OpenRouter.
- Do not let the Worker generate redraw prompts locally.
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
Saved settings normalize to the OpenRouter Qwen config shape, including older records that used a previous provider.
