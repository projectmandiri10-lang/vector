import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import fs from 'fs-extra';
import { PNG } from 'pngjs';
import request from 'supertest';

const storageDir = path.join(os.tmpdir(), `vectorizer-test-${Date.now()}`);
process.env.NODE_ENV = 'test';
process.env.AI_REDRAW_MOCK = '1';
process.env.STORAGE_DIR = storageDir;
process.env.MAX_UPLOAD_MB = '10';
process.env.OPENROUTER_ANALYSIS_MODEL = '';
process.env.OPENROUTER_IMAGE_MODEL = 'black-forest-labs/flux.2-klein-4b';
process.env.OPENROUTER_IMAGE_MODEL_FALLBACK = 'sourceful/riverflow-v2-fast';
process.env.OPENROUTER_SAFETY_MODEL = 'nvidia/nemotron-3.5-content-safety:free';
process.env.OPENROUTER_PROMPT_PROFILE = 'generic_trace_clone';
process.env.OPENROUTER_IMAGE_QUALITY = 'high';
process.env.OPENROUTER_IMAGE_SIZE = '1K';
process.env.OPENROUTER_REASONING_EFFORT = 'low';
process.env.OPENROUTER_BACKGROUND_MODE = 'transparent';
process.env.OPENROUTER_SAFETY_ENABLED = '1';

const { app } = await import('../server.js');
const { ensureJobDir, safeJobPath, writeJobMeta } = await import('../utils/file.js');
const { hybridRedrawBuffer } = await import('../services/aiRedraw.service.js');

function makePngBuffer() {
  const png = new PNG({ width: 8, height: 8 });
  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      const idx = (png.width * y + x) << 2;
      png.data[idx] = x < 4 ? 0 : 255;
      png.data[idx + 1] = y < 4 ? 120 : 255;
      png.data[idx + 2] = 220;
      png.data[idx + 3] = 255;
    }
  }
  return PNG.sync.write(png);
}

function makeReadyTracePngBuffer() {
  const png = new PNG({ width: 640, height: 640 });
  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      const idx = (png.width * y + x) << 2;
      const inLogo = x > 120 && x < 520 && y > 170 && y < 470;
      png.data[idx] = inLogo ? 245 : 10;
      png.data[idx + 1] = inLogo ? 245 : 10;
      png.data[idx + 2] = inLogo ? 245 : 12;
      png.data[idx + 3] = 255;
    }
  }
  return PNG.sync.write(png);
}

test.after(async () => {
  await fs.remove(storageDir);
});

test('POST /api/jobs rejects invalid upload type', async () => {
  const response = await request(app)
    .post('/api/jobs')
    .attach('image', Buffer.from('not image'), {
      filename: 'file.txt',
      contentType: 'text/plain'
    });

  assert.equal(response.status, 400);
  assert.match(response.body.error, /JPG, PNG, atau WebP/);
});

test('POST /api/jobs accepts upload and exposes full PNG result in mock mode', async () => {
  const createResponse = await request(app)
    .post('/api/jobs')
    .field('projectName', 'Test Logo')
    .field('productionType', 'sticker')
    .field('inputMode', 'ready_trace')
    .field('makeVector', 'false')
    .field('separateColors', 'false')
    .field('maxColors', '3')
    .field('whiteAsBackground', 'true')
    .field('aiQuality', 'standard')
    .attach('image', makeReadyTracePngBuffer(), {
      filename: 'logo.png',
      contentType: 'image/png'
    });

  assert.equal(createResponse.status, 202);
  assert.match(createResponse.body.jobId, /^[0-9a-f-]{36}$/);

  let job;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const statusResponse = await request(app).get(`/api/jobs/${createResponse.body.jobId}`);
    job = statusResponse.body;
    if (job.status === 'done' || job.status === 'failed') break;
    await new Promise((resolve) => setTimeout(resolve, 120));
  }

  assert.equal(job.status, 'done', job.error);
  assert.equal(job.settings.priceIdr, 20000);
  assert.equal(job.settings.paymentStatus, 'skipped_mvp');
  assert.ok(job.files.fullPng);
  assert.ok(job.files.zip);
  assert.equal(job.traceRefinement.enabled, true);
  assert.equal(job.traceRefinement.mode, 'ready_trace');
  assert.equal(job.aiRedraw, undefined);
  assert.equal(await fs.pathExists(safeJobPath(createResponse.body.jobId, 'ai-redraw.png')), false);
  assert.equal(await fs.pathExists(safeJobPath(createResponse.body.jobId, 'trace-source.png')), true);

  const pngResponse = await request(app).get(`/api/jobs/${createResponse.body.jobId}/download/full-png`);
  assert.equal(pngResponse.status, 200);
  assert.match(pngResponse.headers['content-type'], /image\/png/);

  const archiveResponse = await request(app).get('/api/jobs');
  assert.equal(archiveResponse.status, 200);
  assert.ok(archiveResponse.body.jobs.some((archiveJob) => archiveJob.jobId === createResponse.body.jobId));

  const deleteResponse = await request(app).delete(`/api/jobs/${createResponse.body.jobId}`);
  assert.equal(deleteResponse.status, 200);
  assert.equal(deleteResponse.body.ok, true);

  const missingDownload = await request(app).get(`/api/jobs/${createResponse.body.jobId}/download/full-png`);
  assert.equal(missingDownload.status, 404);
});

test('DELETE /api/jobs/:jobId rejects missing and active jobs', async () => {
  const missingId = randomUUID();
  const missingResponse = await request(app).delete(`/api/jobs/${missingId}`);
  assert.equal(missingResponse.status, 404);

  const activeId = randomUUID();
  await ensureJobDir(activeId);
  await writeJobMeta(activeId, {
    jobId: activeId,
    status: 'processing_ai',
    progress: 30,
    message: 'Sedang diproses',
    settings: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
  await fs.writeFile(safeJobPath(activeId, 'placeholder.txt'), 'x');

  const activeResponse = await request(app).delete(`/api/jobs/${activeId}`);
  assert.equal(activeResponse.status, 409);
});

test('processor API key protects job routes when configured', async () => {
  process.env.PROCESSOR_API_KEY = 'test-processor-key';

  try {
    const rejected = await request(app).get('/api/jobs');
    assert.equal(rejected.status, 401);

    const accepted = await request(app).get('/api/jobs').set('x-processor-api-key', 'test-processor-key');
    assert.equal(accepted.status, 200);
  } finally {
    delete process.env.PROCESSOR_API_KEY;
  }
});

test('POST /api/redraw/hybrid returns png and redraw metadata in mock mode', async () => {
  process.env.PROCESSOR_API_KEY = 'test-processor-key';

  try {
    const response = await request(app)
      .post('/api/redraw/hybrid')
      .set('x-processor-api-key', 'test-processor-key')
      .field(
        'settings',
        JSON.stringify({
          projectName: 'Hybrid Test',
          productionType: 'sablon',
          inputMode: 'ai_redraw',
          colorLimitMode: 'manual',
          maxColors: 3,
          whiteAsBackground: true
        })
      )
      .attach('image', makePngBuffer(), {
        filename: 'logo.png',
        contentType: 'image/png'
      });

    assert.equal(response.status, 200);
    assert.match(response.headers['content-type'], /image\/png/);
    assert.ok(response.headers['x-ai-redraw-metadata']);
    const metadata = JSON.parse(Buffer.from(response.headers['x-ai-redraw-metadata'], 'base64url').toString('utf8'));
    assert.equal(metadata.provider, 'openrouter_image');
    assert.equal(metadata.analysisModel, '');
    assert.equal(metadata.generationModel, 'black-forest-labs/flux.2-klein-4b');
    assert.equal(metadata.fallbackModel, 'sourceful/riverflow-v2-fast');
    assert.equal(metadata.fallbackUsed, false);
    assert.equal(metadata.safetyModel, 'nvidia/nemotron-3.5-content-safety:free');
    assert.equal(metadata.promptProfile, 'generic_trace_clone');
    assert.equal(metadata.generationQuality, 'high');
    assert.equal(metadata.imageSize, '1K');
    assert.equal(metadata.reasoningEffort, 'low');
    assert.equal(metadata.backgroundMode, 'transparent');
  } finally {
    delete process.env.PROCESSOR_API_KEY;
  }
});

test('OpenRouter API key mode reports clear missing key error', async () => {
  const previousMock = process.env.AI_REDRAW_MOCK;
  const previousKey = process.env.OPENROUTER_API_KEY;
  delete process.env.AI_REDRAW_MOCK;
  delete process.env.OPENROUTER_API_KEY;

  try {
    await assert.rejects(
      () => hybridRedrawBuffer(makePngBuffer(), { productionType: 'sablon', inputMode: 'ai_redraw' }),
      /OPENROUTER_API_KEY belum dikonfigurasi/
    );
  } finally {
    process.env.AI_REDRAW_MOCK = previousMock;
    if (previousKey) process.env.OPENROUTER_API_KEY = previousKey;
  }
});

test('processor routes fail closed when processor auth is required but key is missing', async () => {
  delete process.env.PROCESSOR_API_KEY;
  process.env.REQUIRE_PROCESSOR_AUTH = '1';

  try {
    const response = await request(app).post('/api/redraw/hybrid').attach('image', makePngBuffer(), {
      filename: 'logo.png',
      contentType: 'image/png'
    });

    assert.equal(response.status, 503);
    assert.match(response.body.error, /Processor auth belum dikonfigurasi/);
  } finally {
    delete process.env.REQUIRE_PROCESSOR_AUTH;
  }
});

test('unsafe safety gate blocks before OpenRouter image generator', async () => {
  const previousMock = process.env.AI_REDRAW_MOCK;
  const previousKey = process.env.OPENROUTER_API_KEY;
  const previousLogoRestore = process.env.LOGO_RESTORE_ENABLED;
  const previousFetch = global.fetch;
  delete process.env.AI_REDRAW_MOCK;
  process.env.OPENROUTER_API_KEY = 'test-openrouter-key';
  process.env.LOGO_RESTORE_ENABLED = '0';
  let calls = 0;
  global.fetch = async () => {
    calls += 1;
    return new Response(JSON.stringify({ choices: [{ message: { content: '{"safe":false,"reason":"blocked test image"}' } }] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  };

  try {
    await assert.rejects(
      () => hybridRedrawBuffer(makePngBuffer(), { productionType: 'sablon', inputMode: 'ai_redraw' }),
      /safety gate OpenRouter\/Nemotron/
    );
    assert.equal(calls, 1);
  } finally {
    process.env.AI_REDRAW_MOCK = previousMock;
    if (previousKey) process.env.OPENROUTER_API_KEY = previousKey;
    else delete process.env.OPENROUTER_API_KEY;
    if (previousLogoRestore === undefined) delete process.env.LOGO_RESTORE_ENABLED;
    else process.env.LOGO_RESTORE_ENABLED = previousLogoRestore;
    global.fetch = previousFetch;
  }
});

test('OpenRouter image generation retries FLUX failure with fallback model', async () => {
  const previousMock = process.env.AI_REDRAW_MOCK;
  const previousKey = process.env.OPENROUTER_API_KEY;
  const previousLogoRestore = process.env.LOGO_RESTORE_ENABLED;
  const previousFetch = global.fetch;
  delete process.env.AI_REDRAW_MOCK;
  process.env.OPENROUTER_API_KEY = 'test-openrouter-key';
  process.env.LOGO_RESTORE_ENABLED = '0';
  const seenModels = [];
  const outputDataUrl = `data:image/png;base64,${makePngBuffer().toString('base64')}`;

  global.fetch = async (_url, options = {}) => {
    const body = JSON.parse(options.body || '{}');
    seenModels.push(body.model);
    if (body.model === 'nvidia/nemotron-3.5-content-safety:free') {
      return new Response(JSON.stringify({ choices: [{ message: { content: '{"safe":true,"reason":"ordinary logo"}' } }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    if (body.model === 'black-forest-labs/flux.2-klein-4b') {
      return new Response(JSON.stringify({ error: { message: 'model unavailable' } }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    return new Response(JSON.stringify({ choices: [{ message: { images: [{ image_url: { url: outputDataUrl } }] } }] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  };

  try {
    const result = await hybridRedrawBuffer(makePngBuffer(), { productionType: 'sablon', inputMode: 'ai_redraw' });
    assert.equal(result.metadata.generationModel, 'sourceful/riverflow-v2-fast');
    assert.equal(result.metadata.fallbackUsed, true);
    assert.equal(result.metadata.fallbackModel, 'sourceful/riverflow-v2-fast');
    assert.equal(result.metadata.promptProfile, 'generic_trace_clone');
    assert.deepEqual(result.metadata.modalities, ['image']);
    assert.deepEqual(seenModels, [
      'nvidia/nemotron-3.5-content-safety:free',
      'black-forest-labs/flux.2-klein-4b',
      'sourceful/riverflow-v2-fast'
    ]);
  } finally {
    process.env.AI_REDRAW_MOCK = previousMock;
    if (previousKey) process.env.OPENROUTER_API_KEY = previousKey;
    else delete process.env.OPENROUTER_API_KEY;
    if (previousLogoRestore === undefined) delete process.env.LOGO_RESTORE_ENABLED;
    else process.env.LOGO_RESTORE_ENABLED = previousLogoRestore;
    global.fetch = previousFetch;
  }
});

test('legacy provider override still reports OpenRouter FLUX metadata in mock mode', async () => {
  const result = await hybridRedrawBuffer(
    makePngBuffer(),
    { productionType: 'sablon', inputMode: 'ai_redraw' },
    { mode: 'legacy_quality', provider: 'old-provider', analysisModel: 'old-analysis', generationModel: 'old-generation' }
  );

  assert.equal(result.metadata.provider, 'openrouter_image');
  assert.equal(result.metadata.analysisModel, '');
  assert.equal(result.metadata.generationModel, 'black-forest-labs/flux.2-klein-4b');
  assert.equal(result.metadata.fallbackModel, 'sourceful/riverflow-v2-fast');
  assert.equal(result.metadata.safetyModel, 'nvidia/nemotron-3.5-content-safety:free');
  assert.equal(result.metadata.promptProfile, 'generic_trace_clone');
});
