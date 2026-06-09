# AI Redraw Price Comparison

Tanggal cek: 2026-06-09.

## Sumber

- OpenRouter image generation docs: https://openrouter.ai/docs/guides/overview/multimodal/image-generation
- OpenRouter pricing: https://openrouter.ai/pricing
- OpenRouter model API: https://openrouter.ai/api/v1/models
- Gemini pricing: https://ai.google.dev/gemini-api/docs/pricing

## Ringkasan

Runtime project sekarang memakai OpenRouter Qwen saja:

- Analyzer: `qwen/qwen3-vl-235b-a22b-instruct`
- Generator default env: `qwen/qwen-image-2512`
- Provider runtime: `openrouter_qwen_image`

Catatan penting: saat pengecekan katalog publik OpenRouter pada 2026-06-09, `qwen/qwen3-vl-235b-a22b-instruct` tersedia sebagai `text,image -> text`, tetapi katalog publik belum menampilkan model Qwen dengan `output_modalities=image`. Karena itu, harga final Qwen Image 2.0/2512 harus dikunci dari halaman model OpenRouter yang benar setelah `OPENROUTER_IMAGE_MODEL` final tersedia/aktif.

## Tabel Perbandingan

| Provider/model | Fungsi di project | Pricing basis | Estimasi biaya per redraw | Risiko biaya | Catatan kualitas logo/sablon/sticker |
|---|---|---:|---:|---|---|
| OpenRouter `qwen/qwen3-vl-235b-a22b-instruct` | Analisis gambar: baca original + cleaned trace target | $0.20/M input tokens, $0.88/M output tokens | Biasanya kecil dibanding biaya generator gambar | Token naik bila prompt/metadata panjang atau gambar dihitung sebagai banyak token | Bagus sebagai analis visual untuk teks, layout, warna, dan prompt teknis ketat |
| OpenRouter `qwen/qwen-image-2512` | Redraw image-to-image | Belum terverifikasi di katalog publik OpenRouter saat cek | Belum bisa dihitung akurat; gunakan billing OpenRouter setelah model ID benar | Risiko utama: model ID berubah, tidak tersedia, atau harga image-output berbeda antar provider | Dipilih karena hasil test prompt ketat lebih cocok untuk redraw logo daripada pipeline sebelumnya |
| Gemini image models | Referensi harga saja, bukan runtime | Google native image pricing per output image/token | Contoh Google pricing: Gemini 3.1 Flash image sekitar $0.067 per 1K, $0.101 per 2K, $0.151 per 4K; Gemini 3 Pro Image sekitar $0.134 per 1K/2K dan $0.24 per 4K | Harga lebih mudah diprediksi per image, tetapi runtime project tidak lagi memakai Gemini | Kualitas bagus untuk beberapa image generation, tetapi dihapus dari runtime agar stack fokus ke Qwen/OpenRouter |

## Rekomendasi Operasional

1. Tetapkan `OPENROUTER_IMAGE_MODEL` dari model Qwen image-output yang benar di OpenRouter.
2. Jalankan 10-20 redraw test nyata dan catat usage OpenRouter per job.
3. Update `estimatedUsdPerImage` di `app_settings.ai_redraw_model` dari angka billing aktual, bukan perkiraan.
4. Pertahankan harga user flat sampai data biaya nyata cukup stabil.
