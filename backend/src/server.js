import './config/env.js';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { pathToFileURL } from 'node:url';
import { normalizeHybridRedrawConfig } from '../../shared/hybridRedrawConfig.js';
import { processorAuth, processorAuthEnabled } from './middleware/processorAuth.js';
import jobsRouter from './routes/jobs.routes.js';
import redrawRouter from './routes/redraw.routes.js';
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
  const redrawConfig = normalizeHybridRedrawConfig({}, process.env);
  res.json({
    ok: true,
    service: 'ai-redraw-vector-backend',
    runtime: process.env.K_SERVICE ? 'cloud-run' : 'node',
    processorAuth: processorAuthEnabled(),
    trace: {
      engine: 'potrace',
      maxDimension: Number.parseInt(process.env.PREPROCESS_MAX_DIMENSION || '2048', 10),
      threshold: Number.parseFloat(process.env.TRACE_THRESHOLD || '180'),
      turdSize: Number.parseFloat(process.env.TRACE_TURD_SIZE || '4'),
      optTolerance: Number.parseFloat(process.env.TRACE_OPT_TOLERANCE || '0.18')
    },
    redrawProvider: redrawConfig.provider,
    redrawAnalysisModel: redrawConfig.analysisModel,
    redrawGenerationModel: redrawConfig.generationModel,
    redrawPreset: redrawConfig.preset,
    redrawPreprocess: redrawConfig.preprocess,
    redrawScope: 'worker /api/image-retouch and backend /api/jobs inputMode=ai_redraw'
  });
});

app.use('/api/jobs', processorAuth, jobsRouter);
app.use('/api/redraw', processorAuth, redrawRouter);

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
