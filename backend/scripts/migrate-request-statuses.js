require('../loadEnv');
require('../db');

const Request = require('../models/Request');

async function run() {
  const startedAt = Date.now();

  const [acceptedCount, refusedCount] = await Promise.all([
    Request.countDocuments({ status: 'accepted' }),
    Request.countDocuments({ status: 'refused' }),
  ]);

  const result = await Request.updateMany(
    { status: { $in: ['accepted', 'refused'] } },
    [
      {
        $set: {
          status: {
            $switch: {
              branches: [
                { case: { $eq: ['$status', 'accepted'] }, then: 'validated' },
                { case: { $eq: ['$status', 'refused'] }, then: 'rejected' },
              ],
              default: '$status',
            },
          },
        },
      },
    ]
  );

  // eslint-disable-next-line no-console
  console.log(
    [
      'MIGRATE_REQUEST_STATUSES_DONE',
      `accepted_before=${acceptedCount}`,
      `refused_before=${refusedCount}`,
      `matched=${result?.matchedCount ?? result?.n ?? 0}`,
      `modified=${result?.modifiedCount ?? result?.nModified ?? 0}`,
      `ms=${Date.now() - startedAt}`,
    ].join(' ')
  );

  process.exit(0);
}

run().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('MIGRATE_REQUEST_STATUSES_FAILED', err?.message || err);
  process.exit(1);
});

