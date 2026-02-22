const mongoose = require('../db');
const Category = require('../models/Category');
const Product = require('../models/Product');

const LEGACY_FAMILY = 'consommable_informatique';
const TARGET_FAMILY = 'consommable_laboratoire';
const LEGACY_CATEGORY_REGEX = /^informatique$/i;
const TARGET_CATEGORY_REGEX = /^operationnel$/i;
const TARGET_CATEGORY_NAME = 'Operationnel';

function waitForMongoConnection(timeoutMs = 15000) {
  if (mongoose.connection.readyState === 1) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Mongo connection timeout during domain cleanup'));
    }, timeoutMs);

    function cleanup() {
      clearTimeout(timer);
      mongoose.connection.off('connected', onConnected);
      mongoose.connection.off('error', onError);
    }

    function onConnected() {
      cleanup();
      resolve();
    }

    function onError(err) {
      cleanup();
      reject(err);
    }

    mongoose.connection.on('connected', onConnected);
    mongoose.connection.on('error', onError);
  });
}

async function removeInformatiqueDomain() {
  await waitForMongoConnection();

  const summary = {
    family_migrated: 0,
    products_relinked_to_operationnel: 0,
    categories_removed: 0,
    operationnel_category_created: false,
  };

  const familyResult = await Product.updateMany(
    { family: LEGACY_FAMILY },
    { $set: { family: TARGET_FAMILY } }
  );
  summary.family_migrated = Number(familyResult?.modifiedCount || 0);

  const legacyCategories = await Category.find({ name: LEGACY_CATEGORY_REGEX }).select('_id').lean();
  if (!legacyCategories.length) return summary;

  let targetCategory = await Category.findOne({ name: TARGET_CATEGORY_REGEX }).select('_id').lean();
  if (!targetCategory) {
    const created = await Category.create({
      name: TARGET_CATEGORY_NAME,
      description: 'Categorie operationnelle (migration automatique)',
    });
    targetCategory = { _id: created._id };
    summary.operationnel_category_created = true;
  }

  for (const legacyCategory of legacyCategories) {
    if (String(legacyCategory._id) === String(targetCategory._id)) continue;

    const relinked = await Product.updateMany(
      { category: legacyCategory._id },
      { $set: { category: targetCategory._id } }
    );
    summary.products_relinked_to_operationnel += Number(relinked?.modifiedCount || 0);

    const deleted = await Category.deleteOne({ _id: legacyCategory._id });
    summary.categories_removed += Number(deleted?.deletedCount || 0);
  }

  return summary;
}

module.exports = {
  removeInformatiqueDomain,
};
