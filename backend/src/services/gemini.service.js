import fs from 'fs-extra';

function requireGeminiApiKey() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY belum dikonfigurasi.');
  return apiKey;
}

function geminiBaseUrl() {
  return (process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/+$/, '');
}

function imageModelCandidates(model) {
  const configured = model || process.env.GEMINI_IMAGE_MODEL || process.env.AI_IMAGE_MODEL || 'gemini-3.1-flash-image-preview';
  const candidates = [configured];
  if (configured === 'imagen-3.0-generate-002') candidates.push('gemini-3.1-flash-image-preview');
  return [...new Set(candidates)];
}

function findGeminiInlineImage(payload) {
  const parts = payload?.candidates?.flatMap((candidate) => candidate?.content?.parts || []) || payload?.parts || [];
  return parts.find((part) => part?.inlineData?.data || part?.inline_data?.data);
}

async function parseGeminiError(response) {
  const text = await response.text();
  try {
    const json = JSON.parse(text);
    return json?.error?.message || json?.message || text;
  } catch {
    return text || response.statusText;
  }
}

export async function editImageWithGemini(inputImagePath, prompt, options = {}) {
  const imageBase64 = await fs.readFile(inputImagePath, 'base64');
  const apiKey = requireGeminiApiKey();
  const errors = [];

  for (const model of imageModelCandidates(options.model)) {
    if (model.startsWith('imagen-')) {
      errors.push(`${model}: Imagen tidak mendukung redraw dari gambar upload melalui endpoint Gemini ini.`);
      continue;
    }

    const response = await fetch(`${geminiBaseUrl()}/models/${model}:generateContent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              { text: prompt },
              {
                inline_data: {
                  mime_type: options.mimeType || 'image/png',
                  data: imageBase64
                }
              }
            ]
          }
        ],
        generationConfig: {
          responseModalities: ['IMAGE'],
          responseFormat: {
            image: {
              aspectRatio: '1:1',
              imageSize: process.env.GEMINI_IMAGE_SIZE || '2K'
            }
          }
        }
      })
    });

    if (!response.ok) {
      errors.push(`${model}: ${await parseGeminiError(response)}`);
      continue;
    }

    const payload = await response.json();
    const imagePart = findGeminiInlineImage(payload);
    const b64 = imagePart?.inlineData?.data || imagePart?.inline_data?.data;
    if (!b64) {
      const text = payload?.candidates?.flatMap((candidate) => candidate?.content?.parts || []).find((part) => part?.text)?.text;
      errors.push(`${model}: Gemini tidak mengembalikan gambar.${text ? ` Respons teks: ${text}` : ''}`);
      continue;
    }

    return Buffer.from(b64, 'base64');
  }

  throw new Error(`Gemini redraw gagal. ${errors.join(' | ')}`);
}
