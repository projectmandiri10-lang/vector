import { timingSafeEqual } from 'node:crypto';

function safeEqual(leftValue, rightValue) {
  const left = Buffer.from(String(leftValue || ''));
  const right = Buffer.from(String(rightValue || ''));
  return left.length === right.length && timingSafeEqual(left, right);
}

export function processorAuthEnabled() {
  return Boolean(process.env.PROCESSOR_API_KEY);
}

export function processorAuth(req, res, next) {
  const expectedKey = process.env.PROCESSOR_API_KEY;
  if (!expectedKey) {
    next();
    return;
  }

  const bearer = req.get('authorization')?.replace(/^Bearer\s+/i, '');
  const providedKey = req.get('x-processor-api-key') || bearer;
  if (providedKey && safeEqual(providedKey, expectedKey)) {
    next();
    return;
  }

  res.status(401).json({ error: 'Akses processor tidak valid.' });
}
