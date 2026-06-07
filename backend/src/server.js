import './config/env.js';
import cors from 'cors';
import express from 'express';
import fs from 'fs-extra';
import helmet from 'helmet';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { normalizeHybridRedrawConfig } from '../../shared/hybridRedrawConfig.js';
import { processorAuth, processorAuthEnabled } from './middleware/processorAuth.js';
import jobsRouter from './routes/jobs.routes.js';
import redrawRouter from './routes/redraw.routes.js';
import saasRouter from './routes/saas.routes.js';
import { cleanupOldJobs, ensureStorage, markInterruptedJobsFailed } from './utils/file.js';

export const app = express();

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        connectSrc: ["'self'", 'https://*.supabase.co', 'wss://*.supabase.co'],
        fontSrc: ["'self'", 'https:', 'data:'],
        formAction: ["'self'"],
        frameAncestors: ["'self'"],
        imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
        objectSrc: ["'none'"],
        scriptSrc: ["'self'"],
        scriptSrcAttr: ["'none'"],
        styleSrc: ["'self'", 'https:', "'unsafe-inline'"]
      }
    }
  })
);
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || ['http://localhost:5173', 'http://127.0.0.1:5173'],
    credentials: false
  })
);
app.use(express.json({ limit: '1mb' }));

app.get('/api/runtime-config.js', (_req, res) => {
  res.type('application/javascript').send(
    `window.__APP_CONFIG__=${JSON.stringify({
      supabaseUrl: process.env.SUPABASE_URL || '',
      supabasePublishableKey: process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || '',
      googleOAuthRedirectTo: process.env.GOOGLE_OAUTH_REDIRECT_TO || ''
    })};`
  );
});

app.get('/api/health', (_req, res) => {
  const redrawConfig = normalizeHybridRedrawConfig({}, process.env);
  res.json({
    ok: true,
    service: 'ai-redraw-vector-backend',
    runtime: process.env.FLY_APP_NAME ? 'fly' : process.env.K_SERVICE ? 'cloud-run' : 'node',
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
    redrawScope: 'backend /api/image-retouch and /api/jobs inputMode=ai_redraw'
  });
});

app.use(saasRouter);
app.use('/api/jobs', processorAuth, jobsRouter);
app.use('/api/redraw', processorAuth, redrawRouter);

const frontendDist = path.resolve(process.env.PROJECT_ROOT || process.cwd(), 'frontend/dist');
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist, { index: false }));
  app.get('*', (_req, res, next) => {
    const indexPath = path.join(frontendDist, 'index.html');
    if (!fs.existsSync(indexPath)) {
      next();
      return;
    }
    res.sendFile(indexPath);
  });
}

app.use((err, _req, res, _next) => {
  const status = err.status || err.statusCode || 500;
  const message = err.expose || status < 500 ? err.message : 'Terjadi kesalahan server.';
  res.status(status).json({
    error: message,
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
