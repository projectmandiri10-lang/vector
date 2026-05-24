import fs from 'fs-extra';
import { editImageWithGPTImage2 } from './litellm.service.js';

const basePrompt = `Faithfully redraw the uploaded image as a clean flat vector-style illustration suitable for screen printing, sticker production, and automatic vector tracing.

This is a faithful redraw and cleanup task, not a redesign.
Preserve the main shape, composition, proportions, layout, text, letters, symbols, and recognizable design from the uploaded image.
Preserve all important visible colors from the uploaded image, including dark or black backgrounds, colored accents, text colors, and small color regions.
Keep each original color in the same visual region as the source image.
Do not recolor the artwork.
Do not change a dark background to white.
Do not remove colored accents.
Do not omit readable text or brand-like lettering if present.
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
The final image should look like a clean professional redraw ready for sticker printing or screen printing.`;

function backgroundInstruction(settings) {
  if (settings.whiteAsBackground) {
    return 'If the uploaded image has a white or near-white empty background, it may be treated as background. Preserve any non-white background color, including black or dark backgrounds, as part of the artwork.';
  }

  return 'Treat white as a real printable artwork color when it appears in the design. Preserve black, dark, white, and colored regions from the uploaded image as visible flat colors.';
}

export function buildRedrawPrompt(settings) {
  const lines = [basePrompt, backgroundInstruction(settings)];

  if (settings.aiQuality === 'standard') {
    lines.push(
      'For Standard quality, prioritize accurate color matching, original composition, and faithful redraw over beautification or stylized interpretation.'
    );
  }

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
      `Use approximately ${settings.maxColors} solid colors as a target for simplifying close color variations. Do not drop distinct important source colors; include the real background color if it is visibly part of the uploaded design.`
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
