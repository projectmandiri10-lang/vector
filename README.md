# AI Redraw Vector untuk Sablon dan Sticker

Aplikasi MVP untuk upload gambar sederhana, redraw dengan GPT Image 2 melalui LiteLLM Proxy, lalu membuat PNG, SVG vector, PDF, ZIP, dan file film pecah warna untuk sablon.

## 1. Install LiteLLM

Gunakan LiteLLM versi terbaru.

```bash
pip install -U "litellm[proxy]"
```

Atau jalankan via Docker image resmi LiteLLM.

## 2. Jalankan LiteLLM Proxy

Set API key OpenAI lalu jalankan proxy dengan config di folder `litellm`.

PowerShell:

```powershell
$env:OPENAI_API_KEY="isi_api_key_openai_anda"
litellm --config .\litellm\config.yaml --port 4000
```

Docker:

```bash
docker run --rm -p 4000:4000 \
  -v "$(pwd)/litellm/config.yaml:/app/config.yaml" \
  -e OPENAI_API_KEY="isi_api_key_openai_anda" \
  ghcr.io/berriai/litellm:main-latest \
  --config /app/config.yaml --port 4000
```

Backend hanya memanggil LiteLLM. API key tidak pernah dikirim ke React frontend.

## 3. Install Backend

```bash
cd backend
cp .env.example .env
npm install
npm run dev
```

`npm run dev` menjalankan backend tanpa file watcher agar proses AI/vector tidak terputus saat backend menulis file hasil ke storage. Jika perlu watcher untuk edit kode backend, gunakan `npm run dev:watch`.

Backend bisa membaca `.env` dari root project atau `backend/.env`. Jika memakai kredensial LiteLLM di root project, isi minimalnya:

```env
LITELLM_BASE_URL=http://localhost:4000
LITELLM_SECRET_KEY=sk-1234
AI_IMAGE_MODEL=gpt-image-2
LITELLM_IMAGE_MODEL=gpt-image-2
```

Nama `LITELLM_API_KEY` juga didukung sebagai alias `LITELLM_SECRET_KEY`.
`LITELLM_BASE_URL` boleh memakai format host proxy (`http://localhost:4000`) atau OpenAI-compatible base URL (`https://domain/v1`).
Jika proxy Anda menamai model dengan prefix provider, pakai `LITELLM_IMAGE_MODEL=openai/gpt-image-2`. Ini tetap GPT Image 2, bukan fallback model lain.

Isi lengkap `backend/.env` jika ingin konfigurasi terpisah:

```env
PORT=3001
LITELLM_BASE_URL=http://localhost:4000
LITELLM_API_KEY=sk-1234
LITELLM_SECRET_KEY=sk-1234
AI_IMAGE_MODEL=gpt-image-2
OPENAI_API_KEY=isi_api_key_openai_anda
STORAGE_DIR=./storage
MAX_UPLOAD_MB=10
```

`OPENAI_API_KEY` hanya dibutuhkan jika Anda menjalankan LiteLLM lokal dengan config repo ini. Jika memakai LiteLLM remote/existing, backend cukup butuh `LITELLM_BASE_URL` dan `LITELLM_SECRET_KEY`.

## 4. Install Frontend

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

## 5. Cara Test Upload Gambar

1. Jalankan LiteLLM di port `4000`.
2. Jalankan backend di port `3001`.
3. Jalankan frontend di port `5173`.
4. Upload gambar JPG/PNG/WebP maksimal 10 MB.
5. Isi nama project.
6. Pilih `Sticker` atau `Sablon`.
7. Klik `Proses gambar`.
8. Tunggu status sampai `Selesai`.

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

Tombol download:

- Download PNG
- Download SVG full color
- Download PDF full color
- Download ZIP semua file
- Download ZIP Film Sablon
- Hapus hasil

`Hapus hasil` menghapus job lengkap dari server, termasuk input, hasil AI, SVG/PDF/ZIP, film, dan metadata. Job yang masih diproses tidak bisa dihapus sampai selesai atau gagal.

## 8. Batasan MVP

- Belum ada payment gateway, tetapi metadata job sudah menyimpan `priceIdr: 20000` dan `paymentStatus: "skipped_mvp"` agar mudah ditambah nanti.
- Job disimpan di filesystem lokal dan status utama disimpan in-memory plus `job.json`.
- Vectorization memakai quantization sederhana dan Potrace; hasil terbaik berasal dari input bergaya logo/ikon/ilustrasi sederhana.
- Pecah warna otomatis tidak menggantikan separasi manual profesional untuk artwork sangat detail.
- Export PDF memakai Puppeteer sebagai jalur utama. Jika Chromium belum tersedia, backend memakai fallback raster PDF berbasis `pdf-lib` agar download PDF tetap tersedia.
- Jika ingin PDF render browser yang lebih presisi, pasang browser Puppeteer dengan `npx puppeteer browsers install chrome`.

## 9. Catatan Biaya GPT Image 2

MVP ini sengaja memakai `AI_IMAGE_MODEL=gpt-image-2` tanpa fallback ke model murah, OpenRouter, atau Gemini. Jika GPT Image 2 gagal di LiteLLM, job dibuat `failed` dengan error jelas agar admin bisa memperbaiki konfigurasi, quota, atau versi LiteLLM.

Kualitas AI:

- `Standar`: quality `medium`
- `Premium`: quality `high`
- `Ultra`: quality `high` dengan prompt tambahan yang lebih ketat

## 10. Endpoint Backend

```text
POST /api/jobs
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
