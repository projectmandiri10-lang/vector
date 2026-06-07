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

process.env.GLM_API_BASE_URL ||= 'https://api.z.ai/api/paas/v4';
process.env.GLM_ANALYSIS_MODEL ||= 'glm-5v-turbo';
process.env.GLM_IMAGE_MODEL ||= 'glm-image';
process.env.GEMINI_ANALYSIS_MODEL ||= 'gemini-3.1-flash-lite-preview';
process.env.GEMINI_IMAGE_MODEL ||= 'gemini-3.1-flash-image-preview';
process.env.AI_REDRAW_PRESET ||= 'quality';
process.env.SUPABASE_PUBLISHABLE_KEY ||= process.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';
