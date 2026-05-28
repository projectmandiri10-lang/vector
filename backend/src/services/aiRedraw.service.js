import fs from 'fs-extra';
import { editImageWithGPTImage2 } from './litellm.service.js';

const basePrompt = `Faithfully redraw only the actual artwork from the uploaded image as a fresh clean cartoon/vector illustration suitable for screen printing, sticker production, and automatic vector tracing.

This is a faithful redraw and cleanup task, not a redesign.
This is a true redraw from shapes and colors, not pixel repair, not upscaling, not sharpening, and not automatic photo cleanup.
Rebuild the artwork with smooth intentional vector-like shapes.
Preserve the main shape, composition, proportions, layout, text, letters, symbols, and recognizable design from the uploaded image.
Treat the uploaded image as a reference photo. Separate the real design from camera background, paper, table, shadows, glare, uneven lighting, light gradients, blur, compression noise, and dirt.
Preserve all important visible colors from the actual artwork, including dark or black intentional shapes, colored accents, text colors, and small color regions.
Keep each original color in the same visual region as the source image.
Do not recolor the artwork.
Any broad color or gradient that touches the image border is capture background unless it is a deliberate closed artwork shape with a clear boundary.
Do not turn border-touching photo background into a printable color region.
Preserve a dark or colored background only when it is clearly an intentional bounded shape inside the artwork, not a photo backdrop.
Do not remove colored accents.
Do not omit readable text or brand-like lettering if present.
Simplify small details while keeping the design recognizable.
Use solid flat colors only.
No gradients.
No shadows.
No texture.
No blur.
No photo noise.
No photographic lighting gradient.
No paper, table, wall, camera background, glow, or cast shadow outside the artwork.
No realistic rendering.
No unnecessary new elements.
No complex background.

Use clean edges, high contrast, smooth shapes, and clearly separated color regions.
Make the outermost artwork silhouette smooth, clean, closed, continuous, and easy to trace into vector shapes.
Use rounded, intentional contours instead of rough pixel-like edges.
For text and logos, redraw the letterforms as clean bold shapes with smooth contours.
Do not preserve pixel damage, rough source edges, gray anti-alias dust, or lighting artifacts.
Avoid jagged outer contours, wavy borders, broken outlines, fringing, glow, anti-aliased halos, and rough noisy edge artifacts.
Make the result suitable for vector tracing and spot color separation.
Keep colors limited, distinct, and easy to separate.
The final image should look like a clean professional redraw ready for sticker printing or screen printing.`;

function backgroundInstruction(settings) {
  if (settings.whiteAsBackground) {
    return 'Treat empty background as non-printing. Replace white, near-white, light gray, colored paper, table, shadows, glare, and uneven lighting gradients outside the artwork with clean pure white. Preserve a dark or colored background only if it is an intentional bounded design shape.';
  }

  return 'Treat white as a real printable artwork color when it appears inside the design. Preserve black, dark, white, and colored artwork regions as visible flat colors, but still remove external photo background, lighting gradients, paper, table, and shadows outside the artwork.';
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
      'Optimize for full-color sticker production. A clean outline is allowed. Keep the outer silhouette crisp and smooth. Do not create screen-printing film output. Keep the design attractive as a finished sticker.'
    );
  }

  if (settings.productionType === 'sablon') {
    lines.push(
      'Optimize for manual screen printing. Use spot-color style flat color areas. Avoid gradients, tiny details, halftone textures, and complicated shapes. Make each color region clean and separable for film output, with a smooth outer silhouette. Do not create any separate film color for the photo background or lighting gradient.'
    );
  }

  if (settings.colorLimitMode === 'auto') {
    lines.push(
      'Automatically keep only intentional visible solid colors from the artwork. Reject photo background gradients, shadows, and camera lighting as colors. Do not force the artwork into a fixed color count unless colors are visually redundant.'
    );
  }

  if (settings.colorLimitMode !== 'auto' && settings.maxColors) {
    lines.push(
      `Use at most approximately ${settings.maxColors} printable solid artwork colors, excluding the non-printing background. Merge redundant shading and lighting artifacts first. Do not drop distinct important artwork colors; include a background color only if it is a deliberate bounded part of the uploaded design, never if it is just photo lighting or empty backdrop.`
    );
  }

  return lines.join('\n\n');
}

export function qualityToImageOption(aiQuality) {
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
