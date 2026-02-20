require('dotenv').config();
require('../db');

const Request = require('../models/Request');
require('../models/User');

async function run() {
  const cursor = Request.find({
    $or: [
      { direction_laboratory: { $exists: false } },
      { direction_laboratory: null },
      { direction_laboratory: '' },
      { beneficiary: { $exists: false } },
      { beneficiary: null },
      { beneficiary: '' },
    ],
  })
    .populate('demandeur', 'username')
    .cursor();

  let scanned = 0;
  let updated = 0;

  for await (const reqDoc of cursor) {
    scanned += 1;
    const direction = String(reqDoc.direction_laboratory || '').trim();
    const beneficiary = String(reqDoc.beneficiary || '').trim();

    const nextDirection = direction || 'Non renseigne';
    const nextBeneficiary = beneficiary || String(reqDoc.demandeur?.username || 'Demandeur');

    if (nextDirection !== direction || nextBeneficiary !== beneficiary) {
      reqDoc.direction_laboratory = nextDirection;
      reqDoc.beneficiary = nextBeneficiary;
      await reqDoc.save();
      updated += 1;
    }
  }

  // eslint-disable-next-line no-console
  console.log(`BACKFILL_DONE scanned=${scanned} updated=${updated}`);
  process.exit(0);
}

run().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('BACKFILL_FAILED', err?.message || err);
  process.exit(1);
});
