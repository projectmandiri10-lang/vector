# Deploy Railway + Supabase

Panduan ini adalah jalur utama saat aplikasi dijalankan sebagai satu service fullstack di Railway.

## Arsitektur

```text
Browser user
  -> Railway service Express
     -> serve frontend build
     -> API /api/...
     -> GLM redraw via Z.AI
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

SUPABASE_URL=https://PROJECT-REF.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
SUPABASE_SERVICE_ROLE_KEY=...

GLM_API_KEY=...
GLM_API_BASE_URL=https://api.z.ai/api/paas/v4
GLM_ANALYSIS_MODEL=glm-5v-turbo
GLM_IMAGE_MODEL=glm-image
AI_REDRAW_PRESET=quality

GOOGLE_OAUTH_REDIRECT_TO=https://DOMAIN-RAILWAY-ANDA
```

Jangan set `VITE_API_BASE_URL` di Railway production. Jika kosong, frontend memakai same-origin `/api`, cocok untuk fullstack Railway.

`PROCESSOR_API_KEY` dan `PROCESSOR_BASE_URL` boleh dikosongkan karena tidak ada processor terpisah.

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
- `redrawProvider: zai_glm5v_glm_image`
- `redrawAnalysisModel: glm-5v-turbo`
- `redrawGenerationModel: glm-image`

Jika AI redraw gagal, cek `GLM_API_KEY` dan akses model `glm-5v-turbo` / `glm-image` di akun Z.AI.
