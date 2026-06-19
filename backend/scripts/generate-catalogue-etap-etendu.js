const fs = require('fs');
const path = require('path');
const { HUMANIZED_PRODUCTS } = require('../data/humanizedCatalogue');

function esc(value) {
  const text = String(value ?? '').replace(/\r?\n/g, ' ').trim();
  if (text.includes(';') || text.includes('"')) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function rowToLine(row) {
  return [
    'category_name',
    'category_description',
    'category_audiences',
    'product_name',
    'product_description',
    'family',
    'unite',
    'seuil_minimum',
    'emplacement',
  ].map((key) => esc(row[key])).join(';');
}

function audienceFor(category) {
  const normalized = String(category || '').toLowerCase();
  if (normalized.includes('bureautique')) return 'bureautique';
  if (normalized.includes('exploitation') || normalized.includes('tuyauterie') || normalized.includes('instrumentation')) return 'petrole';
  return '';
}

function main() {
  const rows = HUMANIZED_PRODUCTS.map((product) => ({
    category_name: product.category,
    category_description: `Catalogue operationnel ${String(product.category || '').toLowerCase()}`,
    category_audiences: audienceFor(product.category),
    product_name: product.name,
    product_description: `Article catalogue humanise: ${product.name}.`,
    family: product.family,
    unite: product.unit,
    seuil_minimum: product.threshold,
    emplacement: product.location,
  }));

  const header = [
    'category_name',
    'category_description',
    'category_audiences',
    'product_name',
    'product_description',
    'family',
    'unite',
    'seuil_minimum',
    'emplacement',
  ].join(';');

  const csv = [header, ...rows.map(rowToLine)].join('\n') + '\n';
  const outPath = path.join(__dirname, '..', '..', 'docs', 'catalogue_produits_petrolier_etap_humanise.csv');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, csv, 'utf8');

  // eslint-disable-next-line no-console
  console.log('CATALOGUE_GENERATED_OK', { out: path.basename(outPath), lines: rows.length });
}

main();
