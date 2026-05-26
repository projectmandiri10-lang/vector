# Deploy Cloudflare + Supabase

Panduan ini menyiapkan aplikasi Vectorizer sebagai SaaS ringan:

- Frontend React/Vite di Cloudflare Pages.
- API sensitif di Cloudflare Worker.
- Auth, database, credit, admin, dan payment manual di Supabase.
- File hasil tetap di browser/PC user; server hanya menyimpan metadata.

Referensi resmi:

- Cloudflare Workers limits: https://developers.cloudflare.com/workers/platform/limits/
- Cloudflare Pages limits: https://developers.cloudflare.com/pages/platform/limits/
- Cloudflare R2 pricing: https://developers.cloudflare.com/r2/pricing/
- Cloudflare Pages Git integration: https://developers.cloudflare.com/pages/get-started/git-integration/
- Cloudflare Worker secrets: https://developers.cloudflare.com/workers/configuration/secrets/
- Cloudflare Wrangler: https://developers.cloudflare.com/workers/wrangler/
- Supabase Auth: https://supabase.com/docs/guides/auth
- Supabase Google OAuth: https://supabase.com/docs/guides/auth/social-login/auth-google

## 0. Buat Akun Cloudflare dari Nol

Bagian ini untuk kondisi Anda belum pernah menyentuh Cloudflare.

1. Buka https://dash.cloudflare.com/sign-up.
2. Daftar memakai email Anda.
3. Verifikasi email jika Cloudflare meminta.
4. Masuk ke Cloudflare Dashboard.
5. Di sidebar, cari menu `Workers & Pages`.
6. Jika Cloudflare menawarkan plan, pilih plan Free untuk kebutuhan awal.
7. Untuk deploy otomatis, pastikan project ini sudah ada di GitHub.

Urutan deploy yang dipakai:

1. Deploy Worker API dulu.
2. Simpan URL Worker, misalnya `https://design-mudah.NAMA-ANDA.workers.dev`.
3. Deploy frontend ke Pages.
4. Masukkan URL Worker ke env Pages sebagai `VITE_API_BASE_URL`.
5. Setelah Pages punya URL, update redirect URL di Supabase dan Google OAuth.

Catatan penting:

- Cloudflare Pages dipakai untuk frontend.
- Cloudflare Worker dipakai untuk API sensitif.
- Jangan masukkan `SUPABASE_SERVICE_ROLE_KEY` ke Cloudflare Pages. Key itu hanya boleh masuk ke Worker secrets.
- Domain custom tidak wajib. Awalnya cukup pakai domain gratis `*.pages.dev` dan `*.workers.dev`.

## 1. Buat Project Supabase

1. Daftar/login di https://supabase.com.
2. Buat project baru.
3. Simpan data berikut dari `Project Settings > API`:
   - Project URL
   - Publishable key atau anon public key
   - Service role key
4. Buka `SQL Editor`.
5. Jalankan isi file:

```text
supabase/migrations/20260526000000_saas_credit_auth.sql
```

Migration ini membuat:

- `profiles`
- `credit_ledger`
- `jobs`
- `manual_payments`
- `pricing_rules`
- trigger user baru
- RLS policies
- fungsi `credit_balance`

Email `jho.j80@gmail.com` otomatis menjadi `superuser` dan `is_unlimited=true` saat akun dibuat.

## 2. Aktifkan Login Email dan Google

Email/password:

1. Supabase Dashboard > Authentication > Providers.
2. Pastikan Email aktif.
3. Untuk produksi, atur email template dan SMTP jika perlu.

Google OAuth:

1. Buka Google Cloud Console.
2. Buat OAuth Client ID tipe `Web application`.
3. Authorized JavaScript origins:

```text
http://localhost:5173
https://DOMAIN-CLOUDFLARE-ANDA.pages.dev
https://DOMAIN-ANDA.com
```

4. Authorized redirect URI diambil dari Supabase:

```text
https://PROJECT-REF.supabase.co/auth/v1/callback
```

5. Supabase Dashboard > Authentication > Providers > Google.
6. Masukkan Google Client ID dan Client Secret.
7. Supabase Authentication > URL Configuration:
   - Site URL: domain Cloudflare Pages.
   - Redirect URLs: domain Cloudflare Pages dan `http://localhost:5173`.

Catatan `.env` lokal:

```text
GOOGLE_OAUTH_CLIENT_ID=client-id-dari-google
GOOGLE_OAUTH_CLIENT_SECRET=client-secret-dari-google
GOOGLE_OAUTH_CALLBACK_URL=https://PROJECT-REF.supabase.co/auth/v1/callback
VITE_GOOGLE_OAUTH_REDIRECT_TO=http://localhost:5173
```

`GOOGLE_OAUTH_CLIENT_SECRET` jangan dimasukkan ke Cloudflare Pages/frontend. Secret tersebut cukup disimpan di Supabase Google provider dan catatan `.env` lokal.

## 3. Siapkan LiteLLM atau OpenAI-Compatible Image API

Worker memakai endpoint LiteLLM:

```text
POST {LITELLM_BASE_URL}/v1/images/edits
```

Env yang dibutuhkan:

```text
LITELLM_BASE_URL=https://domain-litellm-anda
LITELLM_SECRET_KEY=sk-...
AI_IMAGE_MODEL=gpt-image-2
```

Catatan: file AI hanya transit dari browser ke Worker lalu ke provider AI. Aplikasi tidak menyimpan file permanen di server.

## 4. Deploy Cloudflare Worker API

Worker harus dibuat lebih dulu karena frontend butuh URL API Worker.

### 4.1 Login Wrangler

Masuk folder Worker:

```powershell
cd cloudflare-worker
npm install
npx wrangler login
```

Saat `npx wrangler login` berjalan:

1. Browser akan terbuka.
2. Login ke akun Cloudflare yang baru dibuat.
3. Klik authorize/allow untuk Wrangler.
4. Kembali ke terminal.

Jika ini pertama kali memakai Workers, Cloudflare bisa meminta Anda memilih atau membuat subdomain `workers.dev`. Pilih nama pendek yang mudah dikenali, misalnya nama brand/aplikasi. Nama ini akan menjadi bagian URL Worker.

Jika Anda memakai layar Git integration Worker yang meminta build/deploy field, isi seperti ini:

```text
Worker/project name: design-mudah
Production branch: main
Path / Root directory: cloudflare-worker
Build command: kosongkan
Deploy command: npx wrangler deploy
Non-production branch deploy command: npx wrangler versions upload
API token: Create new token / auto-generated Cloudflare token
API token name: vectorizer-worker-builds
Variable name: kosongkan dulu
Variable value: kosongkan dulu
```

Jika Cloudflare tidak mengizinkan `Build command` kosong, isi:

```text
npm ci
```

Jangan isi `API token` dengan `SUPABASE_ACCESS_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY`, atau token LiteLLM. Field `API token` di layar ini adalah token milik Cloudflare untuk deploy Worker. Runtime secret Supabase/LiteLLM diisi setelah Worker dibuat, lewat bagian `Settings > Variables & Secrets` atau lewat `wrangler secret put`.

Nama Worker harus sama dengan `name` di `cloudflare-worker/wrangler.toml`, yaitu `design-mudah`.

### 4.2 Set Worker Secrets

Masih di folder `cloudflare-worker`, set secrets satu per satu:

```powershell
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler secret put LITELLM_BASE_URL
npx wrangler secret put LITELLM_SECRET_KEY
```

Saat terminal meminta value:

- `SUPABASE_URL`: isi `https://PROJECT-REF.supabase.co`
- `SUPABASE_SERVICE_ROLE_KEY`: isi service role key dari Supabase `Project Settings > API`
- `LITELLM_BASE_URL`: isi URL LiteLLM, contoh `https://litellm.domain-anda.com` atau `https://litellm.domain-anda.com/v1`
- `LITELLM_SECRET_KEY`: isi secret key LiteLLM

`AI_IMAGE_MODEL` sudah ada di `cloudflare-worker/wrangler.toml` sebagai non-secret var. Default-nya `gpt-image-2`.

### 4.3 Deploy Worker

Deploy:

```powershell
npm run deploy
```

Simpan URL Worker, contoh:

```text
https://design-mudah.USERNAME.workers.dev
```

Test cepat:

```powershell
curl https://design-mudah.USERNAME.workers.dev/api/me/balance
```

Jika hasilnya error `Login dibutuhkan.`, itu normal. Artinya Worker hidup dan endpoint API sudah merespons.

Endpoint yang tersedia:

```text
POST /api/ai-redraw
POST /api/jobs/quote
POST /api/jobs/commit
GET  /api/me/balance
GET  /api/admin/users
POST /api/admin/users
POST /api/admin/credits
POST /api/admin/manual-payments/:id/approve
```

## 5. Deploy Frontend ke Cloudflare Pages

Frontend sebaiknya dideploy setelah Worker, karena `VITE_API_BASE_URL` perlu memakai URL Worker.

### 5.1 Hubungkan Cloudflare ke GitHub

Di Cloudflare Dashboard:

1. Workers & Pages > Create application > Pages.
2. Pilih `Connect to Git`.
3. Pilih GitHub.
4. Jika diminta, authorize Cloudflare Pages untuk mengakses GitHub.
5. Pilih repository aplikasi ini.
6. Pilih branch produksi, biasanya `main`.

Jika repository belum muncul, klik konfigurasi akses GitHub dan beri akses ke repository ini.

### 5.2 Isi Build Settings

Di halaman konfigurasi Pages:

1. Project name: bebas, contoh `vectorizer`.
2. Framework preset: `Vite`.
3. Root directory:

```text
frontend
```

4. Build command:

```text
npm run build
```

5. Build output directory:

```text
dist
```

6. Environment variables:

```text
VITE_SUPABASE_URL=https://PROJECT-REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_... atau anon key
VITE_API_BASE_URL=https://design-mudah.USERNAME.workers.dev
VITE_GOOGLE_OAUTH_REDIRECT_TO=https://DOMAIN-CLOUDFLARE-ANDA.pages.dev
```

Masukkan env tersebut minimal untuk `Production`. Jika Cloudflare menyediakan tab `Preview`, isi juga dengan value yang sama agar preview deploy tetap bisa login.

7. Klik `Save and Deploy`.

Cloudflare akan menjalankan install dependency, build Vite, lalu memberikan URL seperti:

```text
https://vectorizer.pages.dev
```

Deployment saat ini:

```text
https://5d95e1ef.designmudah.pages.dev
```

Jika Cloudflare juga memberi domain project yang lebih pendek seperti `https://designmudah.pages.dev`, gunakan domain pendek/stabil itu untuk `Site URL`, `Redirect URLs`, dan `VITE_GOOGLE_OAUTH_REDIRECT_TO`. URL yang diawali hash seperti `5d95e1ef...` biasanya URL deployment preview.

### 5.3 Update Redirect Setelah Pages Jadi

Setelah URL Pages muncul:

1. Buka Supabase Dashboard > Authentication > URL Configuration.
2. Set `Site URL` ke URL Pages produksi, contoh:

```text
https://vectorizer.pages.dev
```

3. Tambahkan ke `Redirect URLs`:

```text
http://localhost:5173
https://vectorizer.pages.dev
```

4. Buka Google Cloud Console > OAuth Client.
5. Tambahkan Authorized JavaScript origins:

```text
http://localhost:5173
https://vectorizer.pages.dev
```

6. Pastikan Authorized redirect URI tetap callback Supabase:

```text
https://PROJECT-REF.supabase.co/auth/v1/callback
```

7. Jika URL Pages berbeda dari env pertama, buka Cloudflare Pages > project Anda > Settings > Environment variables.
8. Update `VITE_GOOGLE_OAUTH_REDIRECT_TO` ke URL Pages yang benar.
9. Redeploy Pages dari menu Deployments.

## 6. Test Produksi

1. Buka domain Cloudflare Pages.
2. Register akun biasa.
3. Register/login `jho.j80@gmail.com`.
4. Pastikan akun `jho.j80@gmail.com` melihat menu Admin dan saldo `Unlimited`.
5. Dari Admin, tambahkan credit ke akun biasa.
6. Login akun biasa.
7. Upload gambar siap trace.
8. Pastikan output SVG/PDF/ZIP bisa didownload tanpa file muncul di Supabase Storage atau R2.
9. Coba mode AI redraw; pastikan credit Rp5.000 terdebit sebelum hasil AI diproses.
10. Coba sablon separasi; pastikan Rp1.000 per film terdebit saat commit job.

## 7. Catatan Cloudflare Always Free

Cloudflare Worker Free cocok untuk:

- validasi session
- debit credit
- admin API
- proxy request AI
- metadata kecil

Worker Free tidak cocok untuk menjalankan engine lama berbasis Node/Express, `sharp`, `potrace`, dan `puppeteer`, karena batas CPU/memory/bundle Cloudflare Workers Free terlalu kecil untuk processing gambar berat.

Karena itu workflow produksi baru memindahkan trace, SVG, PDF, dan ZIP ke browser user.

## 8. R2 Opsional

R2 tidak dipakai default karena targetnya file tetap di PC user.

R2 boleh ditambahkan nanti hanya untuk fitur arsip cloud opsional. Cloudflare R2 punya free tier, tetapi tetap berarti file disimpan di server/cloud.

## 9. Local Development

Frontend:

```powershell
cd frontend
npm install
npm run dev
```

Worker:

```powershell
cd cloudflare-worker
npm install
npm run dev
```

Env local frontend:

```text
VITE_SUPABASE_URL=...
VITE_SUPABASE_PUBLISHABLE_KEY=...
VITE_API_BASE_URL=http://localhost:8787
VITE_GOOGLE_OAUTH_REDIRECT_TO=http://localhost:5173
```

## 10. Troubleshooting

Google login balik ke error:

- Cek Redirect URLs di Supabase.
- Cek Authorized JavaScript origins di Google Cloud.
- Cek Client ID/Secret di Supabase Google provider.

Saldo tidak terbaca:

- Cek Worker secret `SUPABASE_SERVICE_ROLE_KEY`.
- Cek migration sudah dijalankan.
- Cek user sudah punya row di `profiles`.

AI redraw gagal:

- Cek `LITELLM_BASE_URL`.
- Cek `LITELLM_SECRET_KEY`.
- Cek model `gpt-image-2`.
- Cek LiteLLM mendukung endpoint `/v1/images/edits`.

Admin tidak muncul:

- Login dengan `jho.j80@gmail.com`.
- Pastikan row `profiles` punya `role='superuser'` dan `is_unlimited=true`.
