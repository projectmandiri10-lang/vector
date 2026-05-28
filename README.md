# Design Mudah Vector untuk Sablon dan Sticker

Aplikasi untuk upload gambar sederhana, memproses vector/cutline/film pisah warna, dan opsional gambar ulang melalui Gemini API langsung tanpa LiteLLM.

## Mode SaaS Cloudflare + Supabase

Repo ini juga sudah berisi jalur SaaS baru:

- Frontend React/Vite untuk Cloudflare Pages.
- Cloudflare Worker di `cloudflare-worker/` untuk credit, admin, AI proxy, dan metadata job.
- Supabase migration di `supabase/migrations/` untuk auth profile, credit ledger, job metadata, pricing, dan pembayaran manual Shopee.
- Processing trace siap produksi berjalan di browser agar file hasil tetap di PC user dan tidak membebani storage server.

Panduan deploy lengkap ada di `DEPLOY_CLOUDFLARE_SUPABASE.md`.

Backend Express di folder `backend/` tetap tersedia sebagai legacy/dev workflow lokal yang memakai filesystem server.
Backend ini sekarang juga bisa dipaketkan sebagai Google Cloud Run processor untuk trace, cutline, separasi warna, PDF, ZIP, dan registration mark. Panduan lengkap ada di `DEPLOY_GOOGLE_CLOUD_RUN.md`.

## 1. Install Backend

```bash
cd backend
cp .env.example .env
npm install
npm run dev
```

`npm run dev` menjalankan backend tanpa file watcher agar proses AI/vector tidak terputus saat backend menulis file hasil ke storage. Jika perlu watcher untuk edit kode backend, gunakan `npm run dev:watch`.

Backend bisa membaca `.env` dari root project atau `backend/.env`. Jika memakai gambar ulang melalui Gemini API, isi minimalnya:

```env
GEMINI_API_KEY=isi_api_key_gemini_anda
GEMINI_ANALYSIS_MODEL=gemini-3.1-pro-preview
GEMINI_IMAGE_MODEL=gemini-3.1-flash-image-preview
GEMINI_IMAGE_SIZE=2K
```

Untuk kualitas lebih tinggi, `GEMINI_IMAGE_MODEL` bisa diganti ke `gemini-3-pro-image-preview`.

Isi lengkap `backend/.env` jika ingin konfigurasi terpisah:

```env
PORT=3001
GEMINI_API_KEY=isi_api_key_gemini_anda
GEMINI_ANALYSIS_MODEL=gemini-3.1-pro-preview
GEMINI_IMAGE_MODEL=gemini-3.1-flash-image-preview
GEMINI_IMAGE_SIZE=2K
STORAGE_DIR=./storage
MAX_UPLOAD_MB=10
```

`GEMINI_API_KEY` hanya dipakai saat user memilih mode gambar ulang. Mode gambar siap proses tetap memakai engine vector lokal/backend tanpa memanggil model gambar.

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

Gambar ulang memakai Gemini API langsung tanpa LiteLLM. Default model image adalah `gemini-3.1-flash-image-preview` untuk menekan biaya. Jika ingin kualitas lebih tinggi, gunakan `gemini-3-pro-image-preview`.

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
