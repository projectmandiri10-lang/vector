# Backup Infrastruktur Cloudflare

Snapshot ini dibuat sebelum penambahan jalur Google Cloud Run.

Isi backup:

- `cloudflare-worker/`: source Worker, `package.json`, `package-lock.json`, dan `wrangler.toml`.
- `DEPLOY_CLOUDFLARE_SUPABASE.md`: panduan deploy Cloudflare + Supabase yang aktif sebelum migrasi.
- `wrangler.toml.snapshot`: salinan cepat konfigurasi Worker.

Yang sengaja tidak disalin:

- `.dev.vars` dan file environment lokal.
- `.wrangler/`.
- `node_modules/`.

Gunakan folder ini hanya sebagai referensi rollback/perbandingan kode, bukan sebagai sumber secret produksi.
