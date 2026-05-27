import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decorateAdminJobs, exampleActivePath, exampleSourcePath, isSuperuserProfile, normalizeExampleJobsSetting, updateExampleJobsSetting } from './example-jobs.js';

test('decorateAdminJobs marks superadmin jobs with preview source as eligible examples', () => {
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
      manifest: { examplePreviewSourcePath: exampleSourcePath('job-1') }
    },
    {
      id: 'job-2',
      user_id: 'user-1',
      production_type: 'sablon',
      status: 'done',
      manifest: { examplePreviewSourcePath: exampleSourcePath('job-2') }
    },
    {
      id: 'job-3',
      user_id: 'super-1',
      production_type: 'sablon',
      status: 'pending',
      manifest: { examplePreviewSourcePath: exampleSourcePath('job-3') }
    }
  ];

  const decorated = decorateAdminJobs(jobs, profiles, {
    sticker: {
      jobId: 'job-1',
      imageUrl: 'https://example.com/sticker.png',
      storagePath: exampleActivePath('sticker'),
      updatedAt: '2026-05-28T00:00:00.000Z'
    }
  });

  assert.equal(decorated[0].user_email, 'boss@example.com');
  assert.equal(decorated[0].can_set_as_example, true);
  assert.equal(decorated[0].is_active_example, true);
  assert.equal(decorated[1].can_set_as_example, false);
  assert.equal(decorated[2].can_set_as_example, false);
});

test('updateExampleJobsSetting keeps other production examples untouched', () => {
  const current = normalizeExampleJobsSetting({
    sticker: {
      jobId: 'job-1',
      imageUrl: 'https://example.com/sticker.png',
      storagePath: exampleActivePath('sticker'),
      updatedAt: '2026-05-28T00:00:00.000Z'
    }
  });

  const next = updateExampleJobsSetting(current, 'sablon', {
    jobId: 'job-2',
    imageUrl: 'https://example.com/sablon.png',
    storagePath: exampleActivePath('sablon'),
    updatedAt: '2026-05-28T00:05:00.000Z'
  });

  assert.equal(next.sticker.jobId, 'job-1');
  assert.equal(next.sablon.jobId, 'job-2');
});

test('whitelist email still counts as superuser fallback', () => {
  assert.equal(isSuperuserProfile({ role: 'user' }, 'jho.j80@gmail.com'), true);
  assert.equal(isSuperuserProfile({ role: 'user' }, 'other@example.com'), false);
});
