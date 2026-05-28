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

process.env.GEMINI_ANALYSIS_MODEL ||= 'gemini-3.1-pro-preview';
process.env.GEMINI_IMAGE_MODEL ||= 'gemini-3.1-flash-image-preview';
process.env.GEMINI_IMAGE_SIZE ||= '2K';
process.env.AI_IMAGE_MODEL ||= process.env.GEMINI_IMAGE_MODEL;
