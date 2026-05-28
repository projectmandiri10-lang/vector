import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  decorateAdminJobs,
  getExampleArtifactsFromManifest,
  hasCompleteExampleArtifacts,
  isSuperuserProfile,
  normalizeExampleJobsSetting,
  updateExampleJobsSetting
} from './example-jobs.js';

function completeArtifacts(productionType = 'sticker') {
  return {
    version: 1,
    projectName: `Contoh ${productionType}`,
    productionType,
    inputMode: 'ai_redraw',
    sourcePreviewPath: `jobs/job-1/source-preview.png`,
    resultPreviewPath: `jobs/job-1/preview-full-color.png`,
    manifestPath: `jobs/job-1/manifest.json`,
    files: {
      fullPng: 'https://example.com/full.png',
      fullSvg: 'https://example.com/full.svg',
      fullPdf: 'https://example.com/full.pdf',
      stickerCutlineSvg: '',
      stickerCutlinePdf: '',
      zip: 'https://example.com/result.zip',
      separationZip: productionType === 'sablon' ? 'https://example.com/separations.zip' : ''
    },
    separations:
      productionType === 'sablon'
        ? [
            {
              index: 1,
              kind: 'color',
              hex: '#000000',
              label: 'FILM 01 - #000000',
              svg: 'https://example.com/film-01.svg',
              pdf: 'https://example.com/film-01.pdf',
              preview: 'https://example.com/film-01-preview.png'
            }
          ]
        : [],
    updatedAt: '2026-05-28T00:00:00.000Z'
  };
}

test('decorateAdminJobs marks superadmin jobs with full artifact bundle as eligible examples', () => {
  const profiles = [
    { id: 'super-1', email: 'boss@example.com', role: 'superuser' },
    { id: 'user-1', email: 'user@example.com', role: 'user' }
  ];
  const jobs = [
    {
      id: 'job-1',
      user_id: 'super-1',
      production_type: 'sticker',
      status: 'done',
      is_example_public: true,
      deleted_at: null,
      manifest: { exampleArtifacts: completeArtifacts('sticker') }
    },
    {
      id: 'job-2',
      user_id: 'user-1',
      production_type: 'sablon',
      status: 'done',
      is_example_public: false,
      deleted_at: null,
      manifest: { exampleArtifacts: completeArtifacts('sablon') }
    },
    {
      id: 'job-3',
      user_id: 'super-1',
      production_type: 'sablon',
      status: 'done',
      is_example_public: false,
      deleted_at: null,
      manifest: {
        exampleArtifacts: {
          ...completeArtifacts('sablon'),
          files: { ...completeArtifacts('sablon').files, separationZip: '' },
          separations: []
        }
      }
    }
  ];

  const decorated = decorateAdminJobs(jobs, profiles, {
    sticker: {
      jobId: 'job-1',
      projectName: 'Contoh sticker',
      productionType: 'sticker',
      resultPreviewUrl: 'https://example.com/full.png',
      files: { fullPng: 'https://example.com/full.png' },
      updatedAt: '2026-05-28T00:00:00.000Z'
    }
  });

  assert.equal(decorated[0].user_email, 'boss@example.com');
  assert.equal(decorated[0].can_set_as_example, true);
  assert.equal(decorated[0].can_unset_example, true);
  assert.equal(decorated[0].is_active_example, true);
  assert.equal(decorated[0].is_example_public, true);
  assert.equal(decorated[1].can_set_as_example, false);
  assert.equal(decorated[1].can_unset_example, false);
  assert.equal(decorated[2].can_set_as_example, false);
});

test('decorateAdminJobs treats protected whitelist email as example-capable superadmin', () => {
  const decorated = decorateAdminJobs(
    [
      {
        id: 'job-whitelist',
        user_id: 'whitelist-1',
        production_type: 'sablon',
        status: 'done',
        is_example_public: false,
        deleted_at: null,
        manifest: { exampleArtifacts: completeArtifacts('sablon') }
      }
    ],
    [{ id: 'whitelist-1', email: 'jho.j80@gmail.com', role: 'user' }],
    {}
  );

  assert.equal(decorated[0].can_set_as_example, true);
  assert.equal(decorated[0].owner_role, 'user');
});

test('normalizeExampleJobsSetting keeps rich example fields and legacy imageUrl fallback', () => {
  const normalized = normalizeExampleJobsSetting({
    sticker: {
      jobId: 'job-1',
      projectName: 'Contoh lama',
      imageUrl: 'https://example.com/legacy.png',
      files: { fullSvg: 'https://example.com/full.svg' },
      updatedAt: '2026-05-28T00:00:00.000Z'
    }
  });

  assert.equal(normalized.sticker.resultPreviewUrl, 'https://example.com/legacy.png');
  assert.equal(normalized.sticker.files.fullSvg, 'https://example.com/full.svg');
});

test('updateExampleJobsSetting keeps other production examples untouched', () => {
  const current = normalizeExampleJobsSetting({
    sticker: {
      jobId: 'job-1',
      projectName: 'Contoh sticker',
      productionType: 'sticker',
      resultPreviewUrl: 'https://example.com/sticker.png',
      files: { fullPng: 'https://example.com/sticker.png' },
      updatedAt: '2026-05-28T00:00:00.000Z'
    }
  });

  const next = updateExampleJobsSetting(current, 'sablon', {
    jobId: 'job-2',
    projectName: 'Contoh sablon',
    productionType: 'sablon',
    resultPreviewUrl: 'https://example.com/sablon.png',
    files: { fullPng: 'https://example.com/sablon.png', separationZip: 'https://example.com/sablon.zip' },
    separations: [{ index: 1, kind: 'color', hex: '#000000', label: 'FILM 01', svg: 'a', pdf: 'b', preview: 'c' }],
    updatedAt: '2026-05-28T00:05:00.000Z'
  });

  assert.equal(next.sticker.jobId, 'job-1');
  assert.equal(next.sablon.jobId, 'job-2');
});

test('getExampleArtifactsFromManifest and completeness guard require full sablon bundle', () => {
  const stickerManifest = { exampleArtifacts: completeArtifacts('sticker') };
  const sablonManifest = { exampleArtifacts: completeArtifacts('sablon') };
  const brokenManifest = {
    exampleArtifacts: {
      ...completeArtifacts('sablon'),
      files: { ...completeArtifacts('sablon').files, separationZip: '' },
      separations: []
    }
  };

  assert.equal(getExampleArtifactsFromManifest(stickerManifest).projectName, 'Contoh sticker');
  assert.equal(hasCompleteExampleArtifacts(stickerManifest, 'sticker'), true);
  assert.equal(hasCompleteExampleArtifacts(sablonManifest, 'sablon'), true);
  assert.equal(hasCompleteExampleArtifacts(brokenManifest, 'sablon'), false);
});

test('whitelist email still counts as superuser fallback', () => {
  assert.equal(isSuperuserProfile({ role: 'user' }, 'jho.j80@gmail.com'), true);
  assert.equal(isSuperuserProfile({ role: 'user' }, 'other@example.com'), false);
});
