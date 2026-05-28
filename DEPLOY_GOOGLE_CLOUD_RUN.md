# Deploy Processor Backend ke Google Cloud Run

Panduan ini memindahkan engine berat backend ke Google Cloud Run, sambil menjaga prinsip penting: AI hanya bertugas menggambar ulang gambar. Vector trace, cutline sticker, separasi warna, ZIP, PDF, dan registration mark tetap dikerjakan oleh engine backend deterministik.

Referensi resmi yang dipakai:

- Cloud Run container harus listen pada `PORT` yang diinjeksi Cloud Run: https://docs.cloud.google.com/run/docs/container-contract
- Build container dengan Dockerfile/Cloud Build: https://docs.cloud.google.com/run/docs/building/containers
- Secret produksi sebaiknya disimpan di Secret Manager: https://docs.cloud.google.com/run/docs/configuring/services/secrets

## 1. Arsitektur Yang Disarankan

```text
User Browser
  -> Cloudflare Pages frontend: https://designmudah.pages.dev
  -> Cloudflare Worker API: login, credit, admin, contoh job, Gemini redraw
  -> Google Cloud Run processor: trace, cutline, separasi warna, PDF, ZIP, registration mark
  -> Supabase: auth, credit, metadata, bucket contoh
```

Kenapa tetap memakai Worker:

- Worker sudah mengurus auth Supabase, credit, admin, dan publikasi contoh.
- Cloud Run dipakai untuk pekerjaan yang butuh runtime Node penuh, filesystem sementara, Sharp, Potrace, Puppeteer/Chromium, dan proses yang lebih stabil daripada browser/Worker.
- `PROCESSOR_API_KEY` membuat endpoint job Cloud Run tidak terbuka bebas, walaupun service Cloud Run dibuat public untuk memudahkan akses dari Worker.

## 2. Backup Cloudflare

Backup sudah disiapkan di:

```text
backups/cloudflare-infrastructure-2026-05-28/
```

Isi backup hanya kode dan konfigurasi aman:

- `cloudflare-worker/`
- `DEPLOY_CLOUDFLARE_SUPABASE.md`
- `wrangler.toml.snapshot`

Yang tidak ikut backup: `.dev.vars`, `.env`, `.wrangler/`, dan `node_modules/`.

## 3. Bukti AI Hanya Redraw

Backend Cloud Run memakai route lama `POST /api/jobs`, tetapi alurnya berbeda menurut `inputMode`:

- `inputMode=ready_trace`: backend menyalin hasil preprocess ke `trace-source.png`, lalu langsung trace/cutline/separasi. Gemini tidak dipanggil.
- `inputMode=ai_redraw`: backend memanggil Gemini sekali untuk membuat `ai-redraw.png`, lalu file hasil redraw itu dipakai oleh engine trace/cutline/separasi.

Di frontend SaaS saat ini, alur lebih hemat credit:

- Gambar ulang tetap lewat Worker `/api/image-retouch`.
- Setelah redraw, engine lokal/browser atau Cloud Run processor bisa diberi file redraw sebagai sumber trace.
- Jadi backend tidak perlu memakai AI untuk separasi warna, registration mark, cutting sticker, ZIP, atau PDF.

Health endpoint backend juga menampilkan:

```json
{
  "redrawProvider": "gemini",
  "redrawScope": "only when inputMode=ai_redraw"
}
```

## 4. File Infrastruktur Baru

File yang ditambahkan untuk Cloud Run:

- `backend/Dockerfile`: container Node 22 + Chromium untuk export PDF.
- `backend/.dockerignore`: mencegah `.env`, storage, cache, dan dependency lokal masuk image.
- `cloudbuild.cloud-run.yaml`: build image, push ke Artifact Registry, deploy ke Cloud Run.
- `backend/src/middleware/processorAuth.js`: proteksi opsional `x-processor-api-key`.

Worker juga punya route proxy baru:

```text
POST /api/processor/jobs
GET /api/processor/jobs
GET /api/processor/jobs/:jobId
GET /api/processor/jobs/:jobId/download/...
DELETE /api/processor/jobs/:jobId
```

Route proxy ini butuh login user dan meneruskan request ke Cloud Run dengan `PROCESSOR_API_KEY`.

## 5. Persiapan Google Cloud

Jalankan dari PowerShell:

```powershell
$PROJECT_ID = "PROJECT_ID_ANDA"
$REGION = "asia-southeast2"
$REPOSITORY = "design-mudah"
$SERVICE = "design-mudah-processor"

gcloud config set project $PROJECT_ID
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com
```

Buat Artifact Registry:

```powershell
gcloud artifacts repositories create $REPOSITORY `
  --repository-format=docker `
  --location=$REGION `
  --description="Design Mudah container images"
```

Jika repository sudah ada, command ini boleh dilewati.

## 6. Simpan Secret

Simpan Gemini API key:

```powershell
Write-Output "GEMINI_API_KEY_ANDA" | gcloud secrets create gemini-api-key --data-file=-
```

Buat secret internal antara Worker dan Cloud Run:

```powershell
$PROCESSOR_KEY = [guid]::NewGuid().ToString("N")
Write-Output $PROCESSOR_KEY | gcloud secrets create processor-api-key --data-file=-
```

Berikan akses secret ke runtime service account Cloud Run:

```powershell
$PROJECT_NUMBER = gcloud projects describe $PROJECT_ID --format="value(projectNumber)"
$RUNTIME_SA = "$PROJECT_NUMBER-compute@developer.gserviceaccount.com"

gcloud secrets add-iam-policy-binding gemini-api-key `
  --member="serviceAccount:$RUNTIME_SA" `
  --role="roles/secretmanager.secretAccessor"

gcloud secrets add-iam-policy-binding processor-api-key `
  --member="serviceAccount:$RUNTIME_SA" `
  --role="roles/secretmanager.secretAccessor"
```

## 7. Build Dan Deploy Cloud Run

Jalankan dari root repo:

```powershell
gcloud builds submit `
  --config cloudbuild.cloud-run.yaml `
  --substitutions _REGION=$REGION,_ARTIFACT_REPOSITORY=$REPOSITORY,_SERVICE=$SERVICE,_FRONTEND_ORIGIN=https://designmudah.pages.dev
```

Ambil URL service:

```powershell
$PROCESSOR_URL = gcloud run services describe $SERVICE `
  --region=$REGION `
  --format="value(status.url)"

Write-Output $PROCESSOR_URL
```

Test health:

```powershell
Invoke-RestMethod "$PROCESSOR_URL/api/health"
```

Profil resource default di `cloudbuild.cloud-run.yaml` sengaja dibuat hemat:

```text
1 vCPU
2GiB memory
min-instances=0
max-instances=1
concurrency=1
timeout=600s
```

Alasannya: kualitas trace tidak ditentukan oleh jumlah CPU, melainkan oleh kualitas input, resolusi preprocess, mask warna, dan parameter Potrace. `1 vCPU + 2GiB` biasanya lebih masuk akal untuk free tier daripada `2 vCPU + 2GiB`, karena kuota vCPU-second lebih cepat habis saat CPU dinaikkan. `max-instances=1` dan `concurrency=1` juga mencegah lonjakan paralel yang bisa membakar kuota.

Parameter trace default:

```text
PREPROCESS_MAX_DIMENSION=2048
TRACE_THRESHOLD=180
TRACE_TURD_SIZE=4
TRACE_OPT_TOLERANCE=0.18
UPLOAD_RATE_LIMIT_PER_MINUTE=3
```

Jika ingin lebih hemat untuk banyak user, turunkan `PREPROCESS_MAX_DIMENSION` ke `1600` dan naikkan `TRACE_TURD_SIZE` ke `6`. Jika ingin kualitas paling tajam untuk job sedikit, biarkan `2048`, `4`, dan `0.18`.

Test endpoint job yang dilindungi:

```powershell
$PROCESSOR_KEY = gcloud secrets versions access latest --secret=processor-api-key
Invoke-RestMethod "$PROCESSOR_URL/api/jobs" -Headers @{ "x-processor-api-key" = $PROCESSOR_KEY }
```

Jika request tanpa header key ke `/api/jobs` menghasilkan `401`, proteksinya sudah aktif.

## 8. Sambungkan Worker Ke Cloud Run

Edit `cloudflare-worker/wrangler.toml`, isi URL Cloud Run:

```toml
[vars]
PROCESSOR_BASE_URL = "https://design-mudah-processor-xxxxx.a.run.app"
```

Set secret Worker dengan nilai yang sama seperti `processor-api-key`:

```powershell
cd cloudflare-worker
$PROCESSOR_KEY = gcloud secrets versions access latest --secret=processor-api-key
Write-Output $PROCESSOR_KEY | npx wrangler secret put PROCESSOR_API_KEY
npx wrangler deploy
cd ..
```

Test proxy Worker:

```powershell
$WORKER_URL = "https://design-mudah.NAMA-ANDA.workers.dev"
$ACCESS_TOKEN = "SUPABASE_ACCESS_TOKEN_USER_LOGIN"

Invoke-RestMethod "$WORKER_URL/api/processor/jobs" `
  -Headers @{ Authorization = "Bearer $ACCESS_TOKEN" }
```

Untuk download file hasil nanti, URL proxy memakai pola:

```text
$WORKER_URL/api/processor/jobs/{jobId}/download/full-png
```

## 9. Mode Deployment Aman

Fase aman yang disarankan:

1. Deploy Cloud Run processor lebih dulu.
2. Test `/api/health` dan `/api/jobs` melalui Worker proxy.
3. Biarkan `VITE_API_BASE_URL` frontend production tetap mengarah ke Worker, bukan langsung ke Cloud Run.
4. Setelah proxy processing dipakai penuh oleh frontend, browser akan tetap bicara ke Worker, dan Worker yang bicara ke Cloud Run.

Jangan arahkan `VITE_API_BASE_URL` production langsung ke Cloud Run jika `PROCESSOR_API_KEY` dimatikan, karena user bisa melewati flow credit/admin.

## 10. Catatan Storage

Konfigurasi awal di `cloudbuild.cloud-run.yaml` memakai:

```text
STORAGE_DIR=/tmp/vectorizer-storage
--max-instances=1
```

Ini cukup untuk migrasi awal dan smoke test, tetapi `/tmp` Cloud Run tidak permanen. Untuk produksi penuh, hasil job yang perlu diakses lama harus dipindahkan ke storage permanen, misalnya:

- Supabase Storage untuk artefak contoh dan artefak yang ingin dibagikan.
- Google Cloud Storage bucket yang dimount atau diupload dari backend.
- Database metadata untuk status job permanen.

Sampai storage permanen selesai, gunakan Cloud Run sebagai processor aktif yang hasilnya segera diambil frontend/Worker, bukan sebagai arsip permanen semua user.

## 11. Smoke Test Upload Manual

Contoh upload ready trace langsung ke Cloud Run dengan `curl.exe`:

```powershell
$PROCESSOR_KEY = gcloud secrets versions access latest --secret=processor-api-key

$CREATE_JSON = curl.exe -s -X POST "$PROCESSOR_URL/api/jobs" `
  -H "x-processor-api-key: $PROCESSOR_KEY" `
  -F "image=@C:\path\gambar.png" `
  -F "projectName=Smoke Test" `
  -F "productionType=sablon" `
  -F "inputMode=ready_trace" `
  -F "makeVector=true" `
  -F "separateColors=true" `
  -F "colorLimitMode=manual" `
  -F "maxColors=2" `
  -F "whiteAsBackground=true" `
  -F "actualWidthCm=10" `
  -F "paperSize=A4" `
  -F "paperOrientation=portrait"

$JOB_ID = ($CREATE_JSON | ConvertFrom-Json).jobId
Invoke-RestMethod "$PROCESSOR_URL/api/jobs/$JOB_ID" -Headers @{ "x-processor-api-key" = $PROCESSOR_KEY }
```

Untuk mode redraw, ganti `inputMode` menjadi `ai_redraw`. Hanya mode ini yang akan memakai Gemini di backend.

## 12. Rollback

Jika deploy Cloud Run bermasalah:

```powershell
gcloud run services delete design-mudah-processor --region=asia-southeast2
```

Worker/Pages tetap bisa dikembalikan ke alur Cloudflare sebelumnya dengan melihat snapshot:

```text
backups/cloudflare-infrastructure-2026-05-28/
```
