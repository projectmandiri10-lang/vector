import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const configDir = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.resolve(configDir, '../..');
const projectRoot = path.resolve(backendDir, '..');

process.env.PROJECT_ROOT ||= projectRoot;
process.env.BACKEND_DIR ||= backendDir;
dotenv.config({ path: path.join(projectRoot, '.env'), override: false });
dotenv.config({ path: path.join(backendDir, '.env'), override: false });

process.env.GEMINI_ANALYSIS_MODEL ||= 'gemini-3-pro-preview';
process.env.IMAGEN_GENERATION_MODEL ||= 'imagen-3.0-generate-002';
process.env.AI_REDRAW_PRESET ||= 'quality';
process.env.VERTEX_AI_LOCATION ||= process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';
process.env.VERTEX_AI_PROJECT ||= process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || '';
