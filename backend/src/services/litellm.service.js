import fs from 'fs-extra';

function litellmHeaders(contentType) {
  const headers = {
    Authorization: `Bearer ${process.env.LITELLM_API_KEY || process.env.LITELLM_SECRET_KEY || 'sk-1234'}`
  };
  if (contentType) headers['Content-Type'] = contentType;
  return headers;
}

function baseUrl() {
  return (process.env.LITELLM_BASE_URL || 'http://localhost:4000').replace(/\/+$/, '');
}

function litellmUrl(endpoint) {
  const base = baseUrl();
  const cleanEndpoint = endpoint.replace(/^\/+/, '');
  if (base.endsWith('/v1') && cleanEndpoint.startsWith('v1/')) {
    return `${base}/${cleanEndpoint.slice(3)}`;
  }
  return `${base}/${cleanEndpoint}`;
}

function imageModelCandidates(options = {}) {
  const configured = options.model || process.env.LITELLM_IMAGE_MODEL || process.env.AI_IMAGE_MODEL || 'gpt-image-2';
  const candidates = [configured];

  if (configured === 'gpt-image-2') candidates.push('openai/gpt-image-2');
  if (configured === 'openai/gpt-image-2') candidates.push('gpt-image-2');

  return [...new Set(candidates)];
}

function assertGPTImage2Model(model) {
  if (!['gpt-image-2', 'openai/gpt-image-2'].includes(model)) {
    throw new Error('Konfigurasi tidak valid: model gambar harus gpt-image-2 atau alias LiteLLM openai/gpt-image-2.');
  }
}

function extractImageBufferFromImagesResponse(payload) {
  const image = payload?.data?.find?.((item) => item?.b64_json || item?.url) || payload?.data?.[0];
  if (!image?.b64_json) {
    throw new Error('LiteLLM tidak mengembalikan b64_json dari endpoint image edit.');
  }
  return Buffer.from(image.b64_json, 'base64');
}

function extractImageBufferFromResponses(payload) {
  const output = Array.isArray(payload?.output) ? payload.output : [];
  const imageCall = output.find((item) => item?.type === 'image_generation_call' && item?.result);
  if (imageCall?.result) return Buffer.from(imageCall.result, 'base64');

  for (const item of output) {
    const content = Array.isArray(item?.content) ? item.content : [];
    const image = content.find((part) => part?.type?.includes?.('image') && (part?.result || part?.b64_json));
    if (image?.result || image?.b64_json) return Buffer.from(image.result || image.b64_json, 'base64');
  }

  throw new Error('LiteLLM tidak mengembalikan output gambar dari endpoint responses.');
}

async function parseError(response) {
  const text = await response.text();
  try {
    const json = JSON.parse(text);
    return json?.error?.message || json?.message || text;
  } catch {
    return text || response.statusText;
  }
}

export async function callLiteLLMImagesEdit(inputImagePath, prompt, options = {}) {
  assertGPTImage2Model(options.model || process.env.LITELLM_IMAGE_MODEL || process.env.AI_IMAGE_MODEL || 'gpt-image-2');
  const form = new FormData();
  const imageBuffer = await fs.readFile(inputImagePath);
  form.append('model', options.model || process.env.LITELLM_IMAGE_MODEL || process.env.AI_IMAGE_MODEL || 'gpt-image-2');
  form.append('prompt', prompt);
  form.append('image', new Blob([imageBuffer], { type: 'image/png' }), 'clean-input.png');
  form.append('quality', options.quality || 'medium');
  form.append('size', options.size || '1024x1024');
  form.append('output_format', 'png');

  const response = await fetch(litellmUrl('/v1/images/edits'), {
    method: 'POST',
    headers: litellmHeaders(),
    body: form
  });

  if (!response.ok) {
    throw new Error(`Endpoint /v1/images/edits gagal: ${await parseError(response)}`);
  }

  return extractImageBufferFromImagesResponse(await response.json());
}

export async function callLiteLLMResponsesFallback(inputImagePath, prompt, options = {}) {
  assertGPTImage2Model(options.model || process.env.LITELLM_IMAGE_MODEL || process.env.AI_IMAGE_MODEL || 'gpt-image-2');
  const imageBase64 = await fs.readFile(inputImagePath, 'base64');
  const payload = {
    model: options.model || process.env.LITELLM_IMAGE_MODEL || process.env.AI_IMAGE_MODEL || 'gpt-image-2',
    input: [
      {
        role: 'user',
        content: [
          { type: 'input_text', text: prompt },
          { type: 'input_image', image_url: `data:image/png;base64,${imageBase64}` }
        ]
      }
    ],
    tools: [
      {
        type: 'image_generation',
        quality: options.quality || 'medium',
        size: options.size || '1024x1024',
        output_format: 'png',
        action: 'edit'
      }
    ],
    tool_choice: { type: 'image_generation' }
  };

  const response = await fetch(litellmUrl('/v1/responses'), {
    method: 'POST',
    headers: litellmHeaders('application/json'),
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`Endpoint /v1/responses gagal: ${await parseError(response)}`);
  }

  return extractImageBufferFromResponses(await response.json());
}

export async function editImageWithGPTImage2(inputImagePath, prompt, options = {}) {
  const candidates = imageModelCandidates(options);
  candidates.forEach(assertGPTImage2Model);

  const errors = [];

  for (const model of candidates) {
    try {
      return await callLiteLLMImagesEdit(inputImagePath, prompt, { ...options, model });
    } catch (imageEditError) {
      try {
        return await callLiteLLMResponsesFallback(inputImagePath, prompt, { ...options, model });
      } catch (responsesError) {
        errors.push(`${model} -> Images edit: ${imageEditError.message}. Responses: ${responsesError.message}`);
      }
    }
  }

  throw new Error(`GPT Image 2 via LiteLLM gagal. Tidak ada fallback ke model lain. ${errors.join(' | ')}`);
}
