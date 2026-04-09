require('../loadEnv');
require('../db');

const User = require('../models/User');

async function run() {
  const startedAt = Date.now();

  const missingCreatedAt = await User.countDocuments({ createdAt: { $exists: false } });
  const missingUpdatedAt = await User.countDocuments({ updatedAt: { $exists: false } });

  const result = await User.updateMany(
    {
      $or: [{ createdAt: { $exists: false } }, { updatedAt: { $exists: false } }],
    },
    [
      {
        $set: {
          createdAt: {
            $ifNull: ['$createdAt', { $ifNull: ['$date_creation', '$last_login'] }],
          },
          updatedAt: {
            $ifNull: ['$updatedAt', { $ifNull: ['$last_login', '$date_creation'] }],
          },
        },
      },
    ],
    { updatePipeline: true }
  );

  // eslint-disable-next-line no-console
  console.log(
    [
      'BACKFILL_USER_TIMESTAMPS_DONE',
      `missingCreatedAt_before=${missingCreatedAt}`,
      `missingUpdatedAt_before=${missingUpdatedAt}`,
      `matched=${result?.matchedCount ?? result?.n ?? 0}`,
      `modified=${result?.modifiedCount ?? result?.nModified ?? 0}`,
      `ms=${Date.now() - startedAt}`,
    ].join(' ')
  );

  process.exit(0);
}

run().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('BACKFILL_USER_TIMESTAMPS_FAILED', err?.message || err);
  process.exit(1);
});
