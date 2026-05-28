import './config/env.js';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { pathToFileURL } from 'node:url';
import jobsRouter from './routes/jobs.routes.js';
import { cleanupOldJobs, ensureStorage, markInterruptedJobsFailed } from './utils/file.js';

export const app = express();

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' }
  })
);
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || ['http://localhost:5173', 'http://127.0.0.1:5173'],
    credentials: false
  })
);
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'ai-redraw-vector-backend',
    model: process.env.GEMINI_IMAGE_MODEL || process.env.AI_IMAGE_MODEL || 'gemini-3.1-flash-image-preview'
  });
});

app.use('/api/jobs', jobsRouter);

app.use((err, _req, res, _next) => {
  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    error: status >= 500 ? 'Terjadi kesalahan server.' : err.message,
    detail: process.env.NODE_ENV === 'production' ? undefined : err.message
  });
});

const shouldListen =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (shouldListen) {
  await ensureStorage();
  await markInterruptedJobsFailed();
  cleanupOldJobs().catch((error) => {
    console.warn('Gagal membersihkan job lama:', error.message);
  });

  const port = Number(process.env.PORT || 3001);
  app.listen(port, () => {
    console.log(`Backend berjalan di http://localhost:${port}`);
  });
}
