# Design Mudah Vector untuk Sablon dan Sticker

Aplikasi untuk upload gambar sederhana, memproses vector/cutline/film pisah warna, dan opsional gambar ulang melalui pipeline hybrid eksperimen `OpenRouter Nemotron safety + FLUX trace-clone image redraw` di Railway.

## Mode SaaS Railway + Supabase

Repo ini memakai jalur fullstack Railway:

- Frontend React/Vite dibuild ke `frontend/dist`.
- Backend Express serve frontend sekaligus API `/api/...`.
- Logic credit/admin/metadata tetap memakai modul Worker yang di-embed oleh backend, tanpa deploy Cloudflare Worker terpisah.
- Supabase migration di `supabase/migrations/` untuk auth profile, credit ledger, job metadata, pricing, dan pembayaran manual Shopee.
- Processing trace siap produksi berjalan di browser agar file hasil tetap di PC user dan tidak membebani storage server.

Panduan deploy Railway lengkap ada di `DEPLOY_RAILWAY.md`.

Ringkasnya:

1. Hubungkan repo ke Railway.
2. Railway akan memakai `railway.json` dan `Dockerfile.fly`.
3. Set env production di Railway: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_PUBLISHABLE_KEY`, `OPENROUTER_API_KEY`, `OPENROUTER_BASE_URL`, `OPENROUTER_IMAGE_MODEL`, `OPENROUTER_IMAGE_MODEL_FALLBACK`, `OPENROUTER_PROMPT_PROFILE`, `OPENROUTER_SAFETY_MODEL`, `OPENROUTER_IMAGE_SIZE`, `OPENROUTER_REASONING_EFFORT`, `OPENROUTER_BACKGROUND_MODE`, `OPENROUTER_SAFETY_ENABLED`, `AI_REDRAW_PRESET`, `LOGO_RESTORE_ENABLED`, `LOGO_RESTORE_STRICT_SPOTS`, `TRACE_SMOOTH_ENABLED`, `TRACE_CURVE_CLEANUP_ENABLED`, `TRACE_EDGE_REFINEMENT_ENABLED`, `READY_TRACE_MIN_LONGEST_SIDE`, `REQUIRE_PROCESSOR_AUTH`, `PROCESSOR_API_KEY`, `GOOGLE_OAUTH_REDIRECT_TO`.
4. Kosongkan `VITE_API_BASE_URL` di production agar frontend memakai same-origin `/api`.
5. Set Supabase Auth Site URL dan Google OAuth redirect ke domain Railway/custom domain.

Backend Express di folder `backend/` tersedia untuk workflow lokal dan Railway production untuk redraw hybrid, trace, cutline, separasi warna, PDF, ZIP, dan registration mark.

## 1. Install Backend

```bash
cd backend
cp .env.example .env
npm install
npm run dev
```

`npm run dev` menjalankan backend tanpa file watcher agar proses AI/vector tidak terputus saat backend menulis file hasil ke storage. Jika perlu watcher untuk edit kode backend, gunakan `npm run dev:watch`.

Backend bisa membaca `.env` dari root project atau `backend/.env`. Untuk redraw hybrid OpenRouter FLUX trace-clone, isi minimalnya:

```env
OPENROUTER_API_KEY=key-openrouter-anda
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
LOGO_RESTORE_ENABLED=1
LOGO_RESTORE_STRICT_SPOTS=1
TRACE_SMOOTH_ENABLED=1
TRACE_SMOOTH_SIGMA=0.7
TRACE_SMOOTH_THRESHOLD=180
TRACE_CURVE_CLEANUP_ENABLED=1
TRACE_CURVE_MORPH_RADIUS=1
TRACE_CURVE_MORPH_ITERATIONS=1
TRACE_CURVE_RESAMPLE_SCALE=0.65
TRACE_CURVE_SMOOTH_SIGMA=0.85
TRACE_CURVE_SMOOTH_THRESHOLD=180
TRACE_CURVE_TURD_SIZE=12
TRACE_CURVE_ALPHA_MAX=1.25
TRACE_CURVE_OPT_TOLERANCE=0.32
TRACE_CURVE_FLOAT_PRECISION=1
TRACE_EDGE_REFINEMENT_ENABLED=1
TRACE_EDGE_SOURCE_SCALE=2
TRACE_EDGE_MAX_DIMENSION=4096
TRACE_EDGE_SHARPEN_SIGMA=0.35
TRACE_EDGE_NORMALIZE_LIGHTING=0
TRACE_EDGE_MIN_COMPONENT_PIXELS=10
TRACE_EDGE_MIN_COMPONENT_RATIO=0.000012
TRACE_EDGE_MEDIUM_COMPONENT_RATIO=0.004
TRACE_EDGE_LARGE_COMPONENT_RATIO=0.025
READY_TRACE_MIN_LONGEST_SIDE=600
READY_TRACE_IDEAL_LONGEST_SIDE=1500
READY_TRACE_MIN_CONTRAST=18
READY_TRACE_MIN_BLUR_SCORE=22
READY_TRACE_MAX_NOISE_SCORE=42
LOGO_RESTORE_MAX_NOISE_SCORE=42
REQUIRE_PROCESSOR_AUTH=1
PROCESSOR_API_KEY=isi-random-secret-production
```

Preset default memakai proteksi `Logo Restore` untuk gambar logo/teks datar yang cukup tajam: backend mengambil bentuk langsung dari source, membuang background edge-connected, menjaga warna spot tanpa model gambar agar layout tidak berubah seperti OCR, lalu membuat SVG/PDF/ZIP langsung dari backend dengan Potrace smoothing. Ready Trace juga memakai quality gate: gambar yang terlalu kecil/blur diblokir sebelum debit dan diarahkan upload ulang atau AI Redraw Premium. Untuk gambar non-logo atau kualitas rendah, Nemotron memeriksa safety visual, lalu FLUX menggambar ulang langsung dari cleaned trace target memakai prompt trace-clone ketat. Jika FLUX gagal atau tidak mengembalikan gambar, backend mencoba fallback `OPENROUTER_IMAGE_MODEL_FALLBACK` satu kali.

Isi lengkap `backend/.env` jika ingin konfigurasi terpisah:

```env
PORT=3001
OPENROUTER_API_KEY=key-openrouter-anda
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
LOGO_RESTORE_ENABLED=1
LOGO_RESTORE_STRICT_SPOTS=1
TRACE_SMOOTH_ENABLED=1
TRACE_SMOOTH_SIGMA=0.7
TRACE_SMOOTH_THRESHOLD=180
TRACE_CURVE_CLEANUP_ENABLED=1
TRACE_CURVE_MORPH_RADIUS=1
TRACE_CURVE_MORPH_ITERATIONS=1
TRACE_CURVE_RESAMPLE_SCALE=0.65
TRACE_CURVE_SMOOTH_SIGMA=0.85
TRACE_CURVE_SMOOTH_THRESHOLD=180
TRACE_CURVE_TURD_SIZE=12
TRACE_CURVE_ALPHA_MAX=1.25
TRACE_CURVE_OPT_TOLERANCE=0.32
TRACE_CURVE_FLOAT_PRECISION=1
TRACE_EDGE_REFINEMENT_ENABLED=1
TRACE_EDGE_SOURCE_SCALE=2
TRACE_EDGE_MAX_DIMENSION=4096
TRACE_EDGE_SHARPEN_SIGMA=0.35
TRACE_EDGE_NORMALIZE_LIGHTING=0
TRACE_EDGE_MIN_COMPONENT_PIXELS=10
TRACE_EDGE_MIN_COMPONENT_RATIO=0.000012
TRACE_EDGE_MEDIUM_COMPONENT_RATIO=0.004
TRACE_EDGE_LARGE_COMPONENT_RATIO=0.025
STORAGE_DIR=./storage
MAX_UPLOAD_MB=10
```

Mode gambar siap proses tetap memakai engine vector lokal/backend tanpa memanggil model AI. Detail arsitektur redraw ada di `HYBRID_REDRAW_POLICY.md`.

## 2. Install Frontend

```bash
cd frontend
npm install
npm run dev
```

Buka `http://localhost:5173`.

Cara cepat di Windows:

```bat
start-app.bat
```

File ini menjalankan backend dan frontend di window terpisah, lalu membuka browser ke `http://localhost:5173`.

Jika backend tidak berjalan di `http://localhost:3001`, buat `frontend/.env.local`:

```env
VITE_API_BASE_URL=http://localhost:3001
```

## 3. Cara Test Upload Gambar

1. Jalankan backend di port `3001`.
2. Jalankan frontend di port `5173`.
3. Upload gambar JPG/PNG/WebP maksimal 10 MB.
4. Isi nama project.
5. Pilih `Sticker` atau `Sablon`.
6. Klik `Proses gambar`.
7. Tunggu status sampai `Selesai`.

Untuk foto rumit, hasil pecah warna mungkin tidak sempurna. MVP ini paling cocok untuk logo sederhana, ikon, gambar kartun, sticker, dan desain sablon sederhana.

## 6. Cara Mengaktifkan Pecah Warna

Pilih jenis produksi `Sablon`. Toggle `Pecah warna untuk sablon` otomatis aktif, tetapi tetap bisa dimatikan.

Saat pecah warna aktif, isi:

- `Ukuran gambar aktual`: lebar cetak artwork dalam cm, dari 1 sampai 100 cm. Tinggi mengikuti rasio gambar.
- `Ukuran kertas`: A4 atau A3.
- `Orientasi kertas`: Portrait atau Landscape.

Contoh: jika isi 10 cm, artwork pada file film SVG/PDF dibuat selebar 10 cm saat print. Ukuran ini tidak ditulis di file export, hanya ditampilkan di preview hasil frontend.

Aturan film:

- Setiap file film hanya berisi satu warna aktif.
- Warna aktif diubah menjadi hitam 100%.
- Warna lain tidak disertakan.
- Registration mark berada di posisi sama untuk semua warna.
- Label film memakai format `FILM 01 - #HEX`.
- Jika ukuran artwork plus registration mark tidak muat di A4/A3, backend akan meminta user mengecilkan ukuran cm, memilih A3, atau mengubah orientasi.

Untuk `Sticker`, pecah warna default OFF karena sticker biasanya tidak perlu film sablon.

## 7. Cara Download Hasil

Setelah job selesai, frontend menampilkan:

- Preview PNG full color
- Preview SVG full color
- Daftar film warna jika pecah warna aktif
- Arsip hasil berisi job lama yang sudah selesai atau gagal

Tombol download:

- Download PNG
- Download SVG full color
- Download PDF full color
- Download ZIP semua file
- Download ZIP Film Sablon
- Hapus hasil

`Hapus hasil` menghapus job lengkap dari server, termasuk input, hasil AI, SVG/PDF/ZIP, film, dan metadata. Job yang masih diproses tidak bisa dihapus sampai selesai atau gagal.
Halaman arsip menampilkan preview kecil, tombol download SVG, tombol download film, ZIP jika tersedia, dan tombol delete.

## 8. Batasan MVP

- Belum ada payment gateway, tetapi metadata job sudah menyimpan `priceIdr: 20000` dan `paymentStatus: "skipped_mvp"` agar mudah ditambah nanti.
- Job disimpan di filesystem lokal dan status utama disimpan in-memory plus `job.json`.
- Vectorization memakai quantization sederhana dan Potrace; hasil terbaik berasal dari input bergaya logo/ikon/ilustrasi sederhana.
- Pecah warna otomatis tidak menggantikan separasi manual profesional untuk artwork sangat detail.
- Export PDF memakai Puppeteer sebagai jalur utama. Jika Chromium belum tersedia, backend memakai fallback raster PDF berbasis `pdf-lib` agar download PDF tetap tersedia.
- Jika ingin PDF render browser yang lebih presisi, pasang browser Puppeteer dengan `npx puppeteer browsers install chrome`.

## 9. Catatan Biaya Gambar Ulang

Gambar ulang default eksperimen memakai OpenRouter: Nemotron untuk safety gate visual dan FLUX.2 Klein 1K untuk direct trace-clone image redraw. Rincian pembanding biaya ada di `AI_REDRAW_PRICE_COMPARISON.md`.

Kualitas AI:

- `Standar`: quality `medium`
- Mode Premium dan Ultra dihilangkan agar biaya dan alur produksi tetap sederhana.

## 10. Endpoint Backend

```text
POST /api/jobs
GET /api/jobs
GET /api/jobs/:jobId
GET /api/jobs/:jobId/download/full-png
GET /api/jobs/:jobId/download/full-svg
GET /api/jobs/:jobId/download/full-pdf
GET /api/jobs/:jobId/download/zip
GET /api/jobs/:jobId/download/separation-zip
DELETE /api/jobs/:jobId
```

Status job:

```text
uploaded
preprocessing
processing_ai
vectorizing
separating_colors
exporting
done
failed
```
