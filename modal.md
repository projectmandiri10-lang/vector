# Kalkulasi Modal AI per 1 Gambar

Tanggal kalkulasi: 24 Mei 2026

## Ringkasan

Aplikasi ini sekarang hanya memakai 1 mode AI:

- Model: `gpt-image-2` melalui LiteLLM Proxy
- Kualitas: `Standar`
- Quality request: `medium`
- Operasi: 1 kali image edit/redraw dari gambar upload user ke PNG clean redraw

Vectorization, pecah warna, registration mark, PDF, dan ZIP dibuat lokal oleh backend, jadi tidak menambah biaya AI.

## Harga Resmi GPT Image 2

Berdasarkan halaman pricing OpenAI API untuk GPT-Image-2:

- Image input: USD 8.00 / 1 juta token
- Image cached input: USD 2.00 / 1 juta token
- Image output: USD 30.00 / 1 juta token
- Text input: USD 5.00 / 1 juta token
- Text cached input: USD 1.25 / 1 juta token

Sumber:

- https://openai.com/api/pricing/
- https://developers.openai.com/api/docs/models/gpt-image-2

## Asumsi Kurs

Kurs estimasi operasional:

- 1 USD = Rp17.700

Update ulang jika kurs berubah signifikan.

## Rumus Modal AI

```text
Modal AI USD =
  (text_input_tokens / 1.000.000 * 5)
+ (image_input_tokens / 1.000.000 * 8)
+ (image_output_tokens / 1.000.000 * 30)
```

```text
Modal AI IDR = Modal AI USD * 17.700
```

## Estimasi Token per Request Standar

Karena biaya GPT Image 2 berbasis token, angka final bisa berubah mengikuti resolusi, kompleksitas input, dan detail output. Untuk MVP ini backend mengirim 1 gambar input dan menghasilkan output sekitar 1024x1024.

Asumsi estimasi operasional:

| Komponen | Estimasi token |
| --- | ---: |
| Prompt text redraw | 700 text token |
| Gambar input user | 1.500 image token |
| Output Standar / medium | 800 image output token |

## Modal per 1 Gambar

```text
Text input  = 700 / 1.000.000 * USD 5  = USD 0,0035
Image input = 1.500 / 1.000.000 * USD 8 = USD 0,0120
Image output medium = 800 / 1.000.000 * USD 30 = USD 0,0240

Total = USD 0,0395
Total IDR = USD 0,0395 * Rp17.700 = Rp699,15
```

Modal AI Standar dibulatkan:

```text
Rp700 per gambar
```

Dengan buffer 20%:

```text
Rp850 per gambar
```

## Simulasi Harga Jual Rp20.000

| Kualitas | Modal AI estimasi | Modal + buffer 20% | Laba kotor setelah AI | Margin kotor setelah AI |
| --- | ---: | ---: | ---: | ---: |
| Standar | Rp700 | Rp850 | Rp19.150 | 95,75% |

## Risiko Biaya

- Jika request AI diulang karena hasil kurang bagus, modal AI naik sesuai jumlah retry.
- Jika sekali retry penuh, Standar aman dihitung sekitar Rp1.700.
- LiteLLM remote bisa memiliki markup atau billing policy sendiri. Kalkulasi ini memakai harga dasar OpenAI, belum termasuk markup LiteLLM pihak ketiga.
- Hosting, bandwidth, storage, listrik, payment fee, dan biaya support belum dihitung.

## Rekomendasi Modal Operasional

Untuk harga jual Rp20.000 per gambar:

- Pakai modal internal Rp1.000 per gambar untuk 1 request.
- Pakai modal internal Rp2.000 per gambar jika ingin ruang untuk 1 retry.

Dengan margin bisnis tinggi dan prioritas kualitas, mode Standar masih sangat sehat untuk harga Rp20.000.
