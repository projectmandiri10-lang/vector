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

process.env.AI_IMAGE_MODEL ||= 'gpt-image-2';
process.env.LITELLM_IMAGE_MODEL ||= process.env.AI_IMAGE_MODEL;
process.env.LITELLM_API_KEY ||= process.env.LITELLM_SECRET_KEY || 'sk-1234';
