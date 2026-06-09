# AI Redraw Price Comparison

Tanggal cek: 2026-06-09.

## Sumber

- OpenRouter image generation docs: https://openrouter.ai/docs/guides/overview/multimodal/image-generation
- OpenRouter pricing: https://openrouter.ai/pricing
- OpenRouter model API: https://openrouter.ai/api/v1/models
- Gemini pricing: https://ai.google.dev/gemini-api/docs/pricing

## Ringkasan

Runtime eksperimen project sekarang memakai OpenRouter:

- Safety gate: `nvidia/nemotron-3.5-content-safety:free`
- Generator: `sourceful/riverflow-v2.5-pro:free`
- Provider runtime: `openrouter_riverflow_image`

Catatan penting: Riverflow free dipakai sebagai eksperimen image-to-image dan model ID wajib tetap env-editable. Jika model free tidak tersedia atau berubah, ganti `OPENROUTER_IMAGE_MODEL` tanpa mengubah kode.

## Tabel Perbandingan

| Provider/model | Fungsi di project | Pricing basis | Estimasi biaya per redraw | Risiko biaya | Catatan kualitas logo/sablon/sticker |
|---|---|---:|---:|---|---|
| OpenRouter `nvidia/nemotron-3.5-content-safety:free` | Safety gate visual sebelum redraw | Free di katalog OpenRouter | $0 untuk safety gate selama model free tersedia | Bisa berubah, rate limit free, atau output terlalu konservatif | Tidak dipakai untuk analisis desain, hanya blok konten berisiko |
| OpenRouter `sourceful/riverflow-v2.5-pro:free` | Redraw direct image-to-image | Free di halaman/katalog OpenRouter saat percobaan | $0 selama model free tersedia | Model free dapat hilang/limit berubah; request image dibatasi sekitar 4.5 MB | Cocok dicoba untuk input rendah karena melihat gambar langsung tanpa analyzer terpisah |
| OpenRouter Qwen VL/Image | Alternatif non-default | Bergantung model Qwen aktif di OpenRouter | Perlu cek model ID final dan billing aktual | Model image-output Qwen bisa berubah/tidak tampil di katalog publik | Bisa dipakai ulang sebagai fallback jika Riverflow tidak stabil |
| Gemini image models | Referensi harga saja, bukan runtime | Google native image pricing per output image/token | Contoh Google pricing: Gemini 3.1 Flash image sekitar $0.067 per 1K, $0.101 per 2K, $0.151 per 4K; Gemini 3 Pro Image sekitar $0.134 per 1K/2K dan $0.24 per 4K | Harga lebih mudah diprediksi per image, tetapi runtime project tidak memakai Gemini | Kualitas bagus untuk beberapa image generation, tetapi sudah dihapus dari runtime |

## Rekomendasi Operasional

1. Jalankan 10-20 redraw test nyata dan catat hasil serta kegagalan safety/generator.
2. Jika Riverflow free hilang, ganti `OPENROUTER_IMAGE_MODEL` ke image-to-image model OpenRouter lain.
3. Update `estimatedUsdPerImage` di `app_settings.ai_redraw_model` dari billing aktual bila berpindah ke model berbayar.
4. Pertahankan harga user flat sampai data biaya nyata cukup stabil.
