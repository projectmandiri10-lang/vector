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
process.env.GEMINI_IMAGE_MODEL = 'gemini-3.1-flash-image-preview';

const { app } = await import('../server.js');
const { ensureJobDir, safeJobPath, writeJobMeta } = await import('../utils/file.js');

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
    .attach('image', makePngBuffer(), {
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
