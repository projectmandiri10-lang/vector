# AI Redraw Price Comparison

Tanggal cek: 2026-06-10.

## Sumber

- OpenRouter image generation docs: https://openrouter.ai/docs/guides/overview/multimodal/image-generation
- OpenRouter pricing: https://openrouter.ai/pricing
- OpenRouter model API: https://openrouter.ai/api/v1/models
- Gemini pricing: https://ai.google.dev/gemini-api/docs/pricing

## Ringkasan

Runtime eksperimen project sekarang memakai OpenRouter:

- Safety gate: `nvidia/nemotron-3.5-content-safety:free`
- Generator utama: `black-forest-labs/flux.2-klein-4b`
- Fallback: `sourceful/riverflow-v2-fast`
- Provider runtime: `openrouter_image`
- Output size: `1K`
- Prompt profile: `generic_trace_clone`

Catatan penting: FLUX.2 Klein dipilih karena halaman model OpenRouter mencatat harga fixed `$0.014/megapixel`, dengan megapixel pertama juga `$0.014`. OpenRouter docs menyatakan model image-only seperti Sourceful/Flux memakai `modalities: ["image"]`, sedangkan model text+image seperti Gemini memakai `["image","text"]`. Model ID tetap env-editable; jika model tidak tersedia atau kualitas turun, ganti `OPENROUTER_IMAGE_MODEL` atau fallback tanpa mengubah kode.

## Tabel Perbandingan

| Provider/model | Fungsi di project | Pricing basis | Estimasi biaya per redraw | Risiko biaya | Catatan kualitas logo/sablon/sticker |
|---|---|---:|---:|---|---|
| OpenRouter `nvidia/nemotron-3.5-content-safety:free` | Safety gate visual sebelum redraw | Free di katalog OpenRouter | $0 untuk safety gate selama model free tersedia | Bisa berubah, rate limit free, atau output terlalu konservatif | Tidak dipakai untuk analisis desain, hanya blok konten berisiko |
| OpenRouter `black-forest-labs/flux.2-klein-4b` | Default AI redraw trace-clone 1K | `$0.014/megapixel`; megapixel pertama `$0.014` | Kira-kira `$0.014` untuk output 1K | Model image-only, prompt harus ringkas dan ketat; kualitas logo perlu diuji real | Default hemat untuk menjiplak shape, membuang texture, dan lanjut ke processor trace |
| OpenRouter `sourceful/riverflow-v2-fast` | Fallback jika FLUX gagal/no image | Mulai sekitar `$0.02/image` 1K menurut model page saat dicek sebelumnya | Kira-kira `$0.02` per fallback 1K | Fallback bisa lebih mahal dan parameter Sourceful-only berbeda | Dipakai sekali saja saat primary gagal, bukan default |
| OpenRouter `google/gemini-3.1-flash-image-preview` | Alternatif non-default | OpenRouter model billing | Perlu dipantau dari usage OpenRouter setelah test nyata | Preview model dapat berubah; output dibatasi 1K bila dipakai | Bisa dipakai lagi jika FLUX kurang patuh pada teks sebagai shape |
| OpenRouter Qwen VL/Image | Alternatif non-default | Bergantung model Qwen aktif di OpenRouter | Perlu cek model ID final dan billing aktual | Model image-output Qwen bisa berubah/tidak tampil di katalog publik | Bisa dipakai ulang sebagai fallback jika Gemini preview tidak stabil |
| Gemini native image models | Referensi harga native Google | Google native image pricing per output image/token | Contoh Google pricing: Gemini 3.1 Flash image sekitar $0.067 per 1K, $0.101 per 2K, $0.151 per 4K; Gemini 3 Pro Image sekitar $0.134 per 1K/2K dan $0.24 per 4K | Harga native bisa berbeda dari OpenRouter billing | Kualitas bagus untuk logo/sticker jika prompt ketat dan postprocess tetap dipakai |

## Rekomendasi Operasional

1. Jalankan 10-20 redraw test nyata dan catat hasil serta kegagalan safety/generator.
2. Jika FLUX tidak stabil atau kurang patuh, ganti `OPENROUTER_IMAGE_MODEL` ke image-to-image model OpenRouter lain.
3. Update `estimatedUsdPerImage` di `app_settings.ai_redraw_model` dari billing aktual bila berpindah ke model berbayar.
4. Pertahankan harga user flat sampai data biaya nyata cukup stabil.
