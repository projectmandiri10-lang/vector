# Deploy Railway + Supabase

Panduan ini adalah jalur utama saat aplikasi dijalankan sebagai satu service fullstack di Railway.

## Arsitektur

```text
Browser user
  -> Railway service Express
     -> serve frontend build
     -> API /api/...
     -> OpenRouter Nemotron safety + FLUX trace-clone image redraw
     -> vector trace, cutline, separasi, PDF, ZIP
  -> Supabase auth, credit, metadata
```

Cloudflare Worker tidak perlu dideploy untuk jalur ini. Backend tetap mengimpor logic Worker secara lokal untuk endpoint SaaS seperti credit, admin, pricing, dan job metadata.

## Build

Railway membaca `railway.json`:

```json
{
  "build": {
    "dockerfilePath": "Dockerfile.fly"
  }
}
```

`Dockerfile.fly` membuild frontend, menyalin `frontend/dist` ke image backend, lalu menjalankan `npm start` dari folder `backend`.

## Env Railway

Set minimal env berikut di Railway:

```env
NODE_ENV=production
PORT=8080
STORAGE_DIR=/tmp/vectorizer-storage
MAX_UPLOAD_MB=10
UPLOAD_RATE_LIMIT_PER_MINUTE=3
PREPROCESS_MAX_DIMENSION=2048
TRACE_SMOOTH_ENABLED=1
TRACE_CURVE_CLEANUP_ENABLED=1
TRACE_EDGE_REFINEMENT_ENABLED=1
TRACE_EDGE_SOURCE_SCALE=2
TRACE_EDGE_MAX_DIMENSION=4096
TRACE_EDGE_SHARPEN_SIGMA=0.35
TRACE_EDGE_NORMALIZE_LIGHTING=0
READY_TRACE_MIN_LONGEST_SIDE=600
READY_TRACE_IDEAL_LONGEST_SIDE=1500
READY_TRACE_MIN_CONTRAST=18
READY_TRACE_MIN_BLUR_SCORE=22
READY_TRACE_MAX_NOISE_SCORE=42
LOGO_RESTORE_MAX_NOISE_SCORE=42
REQUIRE_PROCESSOR_AUTH=1
PROCESSOR_API_KEY=ISI_RANDOM_SECRET_YANG_KUAT

SUPABASE_URL=https://PROJECT-REF.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
SUPABASE_SERVICE_ROLE_KEY=...

OPENROUTER_API_KEY=...
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
OPENROUTER_ANALYSIS_MODEL=
OPENROUTER_IMAGE_MODEL=black-forest-labs/flux.2-klein-4b
OPENROUTER_IMAGE_MODEL_FALLBACK=sourceful/riverflow-v2-fast
OPENROUTER_SAFETY_MODEL=nvidia/nemotron-3.5-content-safety:free
OPENROUTER_PROMPT_PROFILE=generic_trace_clone
OPENROUTER_IMAGE_QUALITY=high
OPENROUTER_IMAGE_SIZE=1K
OPENROUTER_REASONING_EFFORT=low
OPENROUTER_BACKGROUND_MODE=transparent
OPENROUTER_SAFETY_ENABLED=1
OPENROUTER_MAX_IMAGE_INPUT_BYTES=3200000
OPENROUTER_APP_NAME=Design Mudah Vector
AI_REDRAW_PRESET=quality

GOOGLE_OAUTH_REDIRECT_TO=https://DOMAIN-RAILWAY-ANDA
```

Jangan set `VITE_API_BASE_URL` di Railway production. Jika kosong, frontend memakai same-origin `/api`, cocok untuk fullstack Railway.

`PROCESSOR_API_KEY` wajib diisi di Railway production karena endpoint processor `/api/redraw/hybrid` harus fail-closed. `PROCESSOR_BASE_URL` boleh dikosongkan untuk fullstack satu service.

## Supabase Auth

Di Supabase Auth URL Configuration:

- Site URL: domain Railway atau custom domain production.
- Redirect URLs: domain Railway/custom domain dan `http://localhost:5173` untuk dev lokal.

Di Google OAuth Console, pastikan callback Supabase tetap:

```text
https://PROJECT-REF.supabase.co/auth/v1/callback
```

## Smoke Test

Setelah deploy:

```powershell
Invoke-RestMethod "https://DOMAIN-RAILWAY-ANDA/api/health"
```

Pastikan respons menampilkan:

- `ok: true`
- `redrawProvider: openrouter_image`
- `redrawGenerationModel: black-forest-labs/flux.2-klein-4b`
- `redrawFallbackModel: sourceful/riverflow-v2-fast`
- `redrawPromptProfile: generic_trace_clone`
- `redrawSafetyModel: nvidia/nemotron-3.5-content-safety:free`
- `openRouterConfigured: true`

Jika AI redraw gagal, cek `OPENROUTER_API_KEY`, saldo OpenRouter, model ID `OPENROUTER_IMAGE_MODEL`, fallback `OPENROUTER_IMAGE_MODEL_FALLBACK`, dan ketersediaan model image-to-image di OpenRouter.
