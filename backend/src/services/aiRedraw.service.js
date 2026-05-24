import fs from 'fs-extra';
import { editImageWithGPTImage2 } from './litellm.service.js';

const basePrompt = `Redraw the uploaded image as a clean flat vector-style illustration suitable for screen printing, sticker production, and automatic vector tracing.

Preserve the main shape, composition, and recognizable design from the uploaded image.
Simplify small details while keeping the design recognizable.
Use solid flat colors only.
No gradients.
No shadows.
No texture.
No blur.
No photo noise.
No realistic rendering.
No unnecessary new elements.
No complex background.

Use clean edges, high contrast, smooth shapes, and clearly separated color regions.
Make the result suitable for vector tracing and spot color separation.
Keep colors limited, distinct, and easy to separate.
Use a plain white or transparent background.
The final image should look like a clean professional redraw ready for sticker printing or screen printing.`;

export function buildRedrawPrompt(settings) {
  const lines = [basePrompt];

  if (settings.productionType === 'sticker') {
    lines.push(
      'Optimize for full-color sticker production. A clean outline is allowed. Do not create screen-printing film output. Keep the design attractive as a finished sticker.'
    );
  }

  if (settings.productionType === 'sablon') {
    lines.push(
      'Optimize for manual screen printing. Use spot-color style flat color areas. Avoid gradients, tiny details, halftone textures, and complicated shapes. Make each color region clean and separable for film output.'
    );
  }

  if (settings.maxColors) {
    lines.push(
      `Limit the artwork to approximately ${settings.maxColors} solid colors, excluding transparent background if possible.`
    );
  }

  if (settings.aiQuality === 'ultra') {
    lines.push(
      'Use extra strict shape cleanup: crisp closed regions, cleaner outlines, minimal artifacts, and stronger separation between adjacent colors.'
    );
  }

  return lines.join('\n\n');
}

export function qualityToImageOption(aiQuality) {
  if (aiQuality === 'premium' || aiQuality === 'ultra') return 'high';
  return 'medium';
}

export async function redrawWithAI(inputImagePath, outputPath, settings) {
  if (process.env.NODE_ENV === 'test' && process.env.AI_REDRAW_MOCK === '1') {
    await fs.copy(inputImagePath, outputPath);
    return { outputPath, mocked: true };
  }

  const prompt = buildRedrawPrompt(settings);
  const imageBuffer = await editImageWithGPTImage2(inputImagePath, prompt, {
    model: process.env.AI_IMAGE_MODEL || 'gpt-image-2',
    quality: qualityToImageOption(settings.aiQuality),
    size: '1024x1024'
  });

  await fs.writeFile(outputPath, imageBuffer);
  return { outputPath, mocked: false };
}
