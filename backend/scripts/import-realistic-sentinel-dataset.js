require('../loadEnv');
const mongoose = require('../db');

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { execFileSync } = require('child_process');

const Category = require('../models/Category');
const Product = require('../models/Product');
const Supplier = require('../models/Supplier');
const PurchaseOrder = require('../models/PurchaseOrder');
const StockEntry = require('../models/StockEntry');
const StockExit = require('../models/StockExit');
const StockLot = require('../models/StockLot');
const Request = require('../models/Request');
const InventorySession = require('../models/InventorySession');
const InventoryCount = require('../models/InventoryCount');
const AIAlert = require('../models/AIAlert');
const Notification = require('../models/Notification');
const History = require('../models/History');
const User = require('../models/User');

const DATASET_FILES = Object.freeze({
  products: '01_products_catalogue.csv',
  suppliers: '02_suppliers.csv',
  stocklots: '03_stocklots.csv',
  purchaseorders: '04_purchaseorders.csv',
  stockentries: '05_stockentries.csv',
  stockexits: '06_stockexits.csv',
  requests: '07_requests.csv',
  inventories: '08_inventories.csv',
  aialerts: '09_aialerts.csv',
  notifications: '10_notifications.csv',
  stockout_training: '11_stockout_training.csv',
  consumption_training_daily: '12_consumption_training_daily.csv',
  anomaly_training: '13_anomaly_training.csv',
  threshold_training: '14_threshold_training.csv',
  decision_training: '15_decision_training.csv',
  dashboard_bi_daily: '16_dashboard_bi_daily.csv',
});

function stripBom(line) {
  if (!line) return line;
  if (line.charCodeAt(0) === 0xfeff) return line.slice(1);
  return line;
}

function parseCsvLine(line, sep = ',') {
  const out = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }
    if (!inQuotes && ch === sep) {
      out.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  out.push(current);
  return out.map((v) => String(v ?? '').trim());
}

function parseBool01(value) {
  const s = String(value ?? '').trim();
  if (!s) return false;
  return ['1', 'true', 'vrai', 'yes', 'y', 'oui'].includes(s.toLowerCase());
}

function asNonNegativeInt(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.floor(n));
}

function asNonNegativeFloat(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, n);
}

function parseDateTime(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  const withTime = s.includes(' ') ? s : `${s} 00:00:00`;
  const [datePart, timePart] = withTime.split(' ');
  const [y, m, d] = datePart.split('-').map((x) => Number(x));
  const [hh, mm, ss] = timePart.split(':').map((x) => Number(x));
  if (![y, m, d, hh, mm, ss].every((x) => Number.isFinite(x))) return null;
  const dt = new Date(y, m - 1, d, hh, mm, ss);
  if (Number.isNaN(dt.getTime())) return null;
  return dt;
}

function sanitizeKey(s) {
  return String(s || '').trim();
}

function normalizeFamilyGuess(category, name) {
  const hay = `${category || ''} ${name || ''}`.toLowerCase();
  if (hay.includes('gaz') || hay.includes('bouteille')) return 'gaz';
  if (
    hay.includes('chim') ||
    hay.includes('solvant') ||
    hay.includes('acide') ||
    hay.includes('alcool') ||
    hay.includes('degraissant') ||
    hay.includes('hydrocarbure') ||
    hay.includes('peinture') ||
    hay.includes('resine')
  ) return 'produit_chimique';
  if (
    hay.includes('labo') ||
    hay.includes('pipette') ||
    hay.includes('tube') ||
    hay.includes('reagent') ||
    hay.includes('microscope')
  ) return 'consommable_laboratoire';
  if (
    hay.includes('informat') ||
    hay.includes('toner') ||
    hay.includes('cartouche') ||
    hay.includes('clavier') ||
    hay.includes('souris') ||
    hay.includes('usb') ||
    hay.includes('ordinateur')
  ) return 'consommable_informatique';
  return 'economat';
}

function mapSupplierReliability(rate) {
  const r = Number(rate);
  if (!Number.isFinite(r)) return 'NON_EVALUE';
  if (r >= 0.9) return 'FIABLE';
  if (r >= 0.75) return 'MOYEN';
  if (r >= 0.6) return 'A_SURVEILLER';
  return 'NON_EVALUE';
}

function mapPurchaseOrderStatus(raw) {
  const s = String(raw ?? '').trim().toUpperCase();
  if (!s) return 'ordered';
  if (['RECEIVED', 'DELIVERED', 'LIVREE', 'LIVRE', 'RECU', 'RECUE'].includes(s)) return 'delivered';
  if (['CANCELLED', 'CANCELED', 'ANNULEE', 'ANNULE'].includes(s)) return 'cancelled';
  if (['DRAFT', 'BROUILLON'].includes(s)) return 'draft';
  return 'ordered';
}

function mapRequestStatus(raw) {
  const s = String(raw ?? '').trim().toUpperCase();
  if (!s) return 'pending';
  if (['PENDING', 'EN_ATTENTE'].includes(s)) return 'pending';
  if (['VALIDATED', 'VALIDE', 'ACCEPTE', 'ACCEPTED'].includes(s)) return 'validated';
  if (['PREPARING', 'EN_PREPARATION'].includes(s)) return 'preparing';
  if (['SERVED', 'SERVI', 'SERVIE'].includes(s)) return 'served';
  if (['RECEIVED', 'RECU', 'RECUE'].includes(s)) return 'received';
  if (['REJECTED', 'REJETE', 'REFUSED', 'REFUSE'].includes(s)) return 'rejected';
  if (['CANCELLED', 'CANCELED', 'ANNULEE', 'ANNULE'].includes(s)) return 'cancelled';
  // fallback: keep compatible with schema legacy enum (accepted/refused)
  if (['ACCEPTED'].includes(s)) return 'accepted';
  if (['REFUSED'].includes(s)) return 'refused';
  return 'pending';
}

function mapRequestPriority(raw) {
  const s = String(raw ?? '').trim().toLowerCase();
  if (!s) return 'normal';
  if (['critique', 'critical'].includes(s)) return 'critical';
  if (['urgent', 'urgente'].includes(s)) return 'urgent';
  return 'normal';
}

function mapInventorySessionStatus(raw) {
  const s = String(raw ?? '').trim().toUpperCase();
  if (!s) return 'counting';
  if (['BROUILLON', 'DRAFT'].includes(s)) return 'draft';
  if (['EN_COURS', 'COUNTING'].includes(s)) return 'counting';
  if (['SOUMIS', 'SUBMITTED', 'A_VALIDER', 'A_RECOMPTER', 'CLOSED'].includes(s)) return 'closed';
  if (['VALIDE', 'APPLIQUE', 'APPLIED'].includes(s)) return 'applied';
  if (['REJETE', 'CANCELLED', 'CANCELED'].includes(s)) return 'cancelled';
  return 'closed';
}

function mapAiAlertType(raw) {
  const s = String(raw ?? '').trim().toUpperCase();
  if (['RUPTURE', 'STOCKOUT'].includes(s)) return 'rupture';
  if (['SURCONSOMMATION', 'OVERCONSUMPTION'].includes(s)) return 'surconsommation';
  if (['ANOMALIE', 'ANOMALY'].includes(s)) return 'anomaly';
  return 'anomaly';
}

function mapAiRiskLevel(raw) {
  const s = String(raw ?? '').trim().toUpperCase();
  if (['CRITIQUE', 'CRITICAL', 'HIGH'].includes(s)) return 'high';
  if (['MOYEN', 'MEDIUM'].includes(s)) return 'medium';
  if (['FAIBLE', 'LOW'].includes(s)) return 'low';
  return 'low';
}

function mapAiAlertStatus(raw) {
  const s = String(raw ?? '').trim().toUpperCase();
  if (['NOUVELLE', 'NEW'].includes(s)) return 'new';
  return 'reviewed';
}

function mapNotificationType(title, message) {
  const hay = `${title || ''} ${message || ''}`.toLowerCase();
  if (hay.includes('action requise') || hay.includes('critique') || hay.includes('urgent')) return 'alert';
  if (hay.includes('surveiller') || hay.includes('alerte') || hay.includes('attention')) return 'warning';
  return 'info';
}

function escapePsSingleQuotes(value) {
  return String(value || '').replace(/'/g, "''");
}

function parseArgs(argv) {
  const args = {
    zip: path.join('docs', 'sentinel_dataset_realiste_csv.zip'),
    dir: '',
    extractDir: path.join('.cache', 'realistic-dataset', 'extracted'),
    dryRun: false,
    withHistory: true,
    importTraining: true,
    recomputeStocks: false,
    resetScope: '',
    yesReset: false,
    allowDangerousReset: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--zip') args.zip = argv[i + 1] || '';
    if (a === '--dir') args.dir = argv[i + 1] || '';
    if (a === '--extract-dir') args.extractDir = argv[i + 1] || '';
    if (a === '--dry-run') args.dryRun = true;
    if (a === '--no-history') args.withHistory = false;
    if (a === '--no-training') args.importTraining = false;
    if (a === '--recompute-stocks') args.recomputeStocks = true;
    if (a === '--reset-scope') args.resetScope = String(argv[i + 1] || '').trim();
    if (a === '--yes-reset') args.yesReset = true;
    if (a === '--i-understand-this-will-delete-data') args.allowDangerousReset = true;
  }

  args.zip = String(args.zip || '').trim();
  args.dir = String(args.dir || '').trim();
  args.extractDir = String(args.extractDir || '').trim();

  return args;
}

function resolveWorkspacePath(p) {
  const raw = String(p || '').trim();
  if (!raw) return '';
  return path.isAbsolute(raw) ? raw : path.join(__dirname, '..', '..', raw);
}

function ensureDirSync(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function extractZipToDir(zipPath, destDir) {
  if (process.platform !== 'win32') {
    throw new Error('Extraction ZIP: plateforme non supportee. Dezippez manuellement et utilisez --dir <dossier>.');
  }

  ensureDirSync(destDir);
  const psZip = escapePsSingleQuotes(zipPath);
  const psDest = escapePsSingleQuotes(destDir);
  const command = `Expand-Archive -Path '${psZip}' -DestinationPath '${psDest}' -Force`;

  execFileSync('powershell.exe', ['-NoProfile', '-Command', command], { stdio: 'inherit' });
}

async function readSmallCsvToArray(filePath, { maxRows = 20000 } = {}) {
  if (!fs.existsSync(filePath)) throw new Error(`CSV introuvable: ${filePath}`);
  const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  let header = null;
  const rows = [];

  for await (const rawLine of rl) {
    const line = stripBom(String(rawLine ?? '').trimEnd());
    if (!line) continue;
    if (!header) {
      header = parseCsvLine(line);
      continue;
    }
    const cells = parseCsvLine(line);
    const row = {};
    for (let i = 0; i < header.length; i += 1) row[header[i]] = cells[i] ?? '';
    rows.push(row);
    if (rows.length >= maxRows) break;
  }

  return { header: header || [], rows };
}

async function forEachCsvRow(filePath, onRow) {
  if (!fs.existsSync(filePath)) throw new Error(`CSV introuvable: ${filePath}`);
  const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  let header = null;
  let count = 0;

  for await (const rawLine of rl) {
    const line = stripBom(String(rawLine ?? '').trimEnd());
    if (!line) continue;
    if (!header) {
      header = parseCsvLine(line);
      continue;
    }
    const cells = parseCsvLine(line);
    const row = {};
    for (let i = 0; i < header.length; i += 1) row[header[i]] = cells[i] ?? '';
    count += 1;
    onRow(row, count);
  }

  return { header: header || [], count };
}

async function bulkWriteInChunks(modelOrCollection, ops, { chunkSize = 1000, ordered = false } = {}) {
  const totals = {
    matched: 0,
    modified: 0,
    upserted: 0,
    inserted: 0,
    deleted: 0,
  };

  for (let i = 0; i < ops.length; i += chunkSize) {
    const slice = ops.slice(i, i + chunkSize);
    // eslint-disable-next-line no-await-in-loop
    const res = await modelOrCollection.bulkWrite(slice, { ordered });
    totals.matched += Number(res.matchedCount || 0);
    totals.modified += Number(res.modifiedCount || 0);
    totals.upserted += Number(res.upsertedCount || 0);
    totals.inserted += Number(res.insertedCount || 0);
    totals.deleted += Number(res.deletedCount || 0);
  }

  return totals;
}

async function requireActors() {
  const [responsable, magasinier, demandeur] = await Promise.all([
    User.findOne({ role: 'responsable', status: 'active' }).select('_id username role').lean(),
    User.findOne({ role: 'magasinier', status: 'active' }).select('_id username role').lean(),
    User.findOne({ role: 'demandeur', status: 'active' }).select('_id username role').lean(),
  ]);

  const missing = [];
  if (!responsable) missing.push('responsable');
  if (!magasinier) missing.push('magasinier');
  if (!demandeur) missing.push('demandeur');
  if (missing.length) {
    throw new Error(
      `Users manquants (${missing.join(', ')}). Seed requis: executez \`node backend/seed-human-users.js\` puis relancez l'import.`
    );
  }

  return { responsable, magasinier, demandeur };
}

async function resetScopeOrThrow({ scope, yesReset, allowDangerousReset }) {
  const normalized = String(scope || '').trim().toLowerCase();
  if (!normalized) return { resetDone: false, scope: '' };
  if (!yesReset) throw new Error('Reset demande mais --yes-reset absent.');

  if (normalized === 'training') {
    const collections = [
      'dataset_training_stockout_v1',
      'dataset_training_consumption_daily_v1',
      'dataset_training_anomaly_v1',
      'dataset_training_threshold_v1',
      'dataset_training_decision_v1',
      'dataset_training_dashboard_bi_daily_v1',
    ];
    for (const c of collections) {
      // eslint-disable-next-line no-await-in-loop
      await mongoose.connection.collection(c).deleteMany({});
    }
    return { resetDone: true, scope: 'training' };
  }

  if (['operational', 'all'].includes(normalized)) {
    if (!allowDangerousReset) {
      throw new Error(
        'Reset operational/all bloque par securite. Ajoutez --i-understand-this-will-delete-data si vous etes certain.'
      );
    }

    // Extremely dangerous: deletes data based on dataset external identifiers.
    // Only intended for local/dev databases.
    // eslint-disable-next-line no-await-in-loop
    await Promise.all([
      AIAlert.deleteMany({ external_alert_id: { $regex: /^ALT-\d+/ } }),
      Notification.deleteMany({ external_notification_id: { $regex: /^NOT-\d+/ } }),
      Request.deleteMany({ external_request_id: { $regex: /^REQ-\d+/ } }),
      StockExit.deleteMany({ exit_number: { $regex: /^SOR-\d+/ } }),
      StockEntry.deleteMany({ entry_number: { $regex: /^ENT-\d+/ } }),
      PurchaseOrder.deleteMany({ external_purchase_order_id: { $regex: /^PO-\d+/ } }),
      StockLot.deleteMany({ qr_code_value: { $regex: /^LOT-\d+/ } }),
      // products/suppliers are trickier: they can overlap with real data.
      Product.updateMany(
        { external_product_id: { $regex: /^P\d+/ } },
        { $unset: { external_product_id: '' } }
      ),
      Supplier.updateMany(
        { external_supplier_id: { $regex: /^SUP-\d+/ } },
        { $unset: { external_supplier_id: '' } }
      ),
    ]);

    if (normalized === 'all') {
      const collections = [
        'dataset_training_stockout_v1',
        'dataset_training_consumption_daily_v1',
        'dataset_training_anomaly_v1',
        'dataset_training_threshold_v1',
        'dataset_training_decision_v1',
        'dataset_training_dashboard_bi_daily_v1',
      ];
      for (const c of collections) {
        // eslint-disable-next-line no-await-in-loop
        await mongoose.connection.collection(c).deleteMany({});
      }
    }

    return { resetDone: true, scope: normalized };
  }

  throw new Error(`reset-scope invalide: ${scope} (attendu: training|operational|all)`);
}

async function upsertCategoriesFromProducts(productsRows, actorId, { dryRun }) {
  const categoryNames = Array.from(
    new Set(productsRows.map((r) => sanitizeKey(r.category)).filter(Boolean))
  );
  if (!categoryNames.length) return { createdOrExisting: 0 };

  if (dryRun) return { createdOrExisting: categoryNames.length };

  const ops = categoryNames.map((name) => ({
    updateOne: {
      filter: { name },
      update: {
        $setOnInsert: {
          name,
          description: '',
          audiences: [],
          created_by: actorId,
        },
      },
      upsert: true,
    },
  }));

  const totals = await bulkWriteInChunks(Category, ops, { chunkSize: 500, ordered: false });
  return { createdOrExisting: categoryNames.length, upserted: totals.upserted };
}

async function importSuppliers(suppliersRows, actorId, { dryRun }) {
  const idToName = new Map();
  const idToLead = new Map();

  suppliersRows.forEach((r) => {
    const supplierId = sanitizeKey(r.supplier_id);
    const name = sanitizeKey(r.supplier_name);
    if (!supplierId || !name) return;
    idToName.set(supplierId, name);
    idToLead.set(supplierId, asNonNegativeInt(r.lead_time_days, 7));
  });

  if (dryRun) {
    return {
      map: { idToName, idToLead },
      totals: { rows: suppliersRows.length, upserted: 0 },
    };
  }

  const ops = [];
  suppliersRows.forEach((r) => {
    const supplierId = sanitizeKey(r.supplier_id);
    const name = sanitizeKey(r.supplier_name);
    if (!supplierId || !name) return;
    const domain = sanitizeKey(r.category_focus);
    const address = sanitizeKey(r.city);
    const leadTime = asNonNegativeInt(r.lead_time_days, 7);
    const reliabilityLevel = mapSupplierReliability(r.reliability_rate);
    const status = sanitizeKey(r.status) || 'ACTIF';

    ops.push({
      updateOne: {
        filter: { external_supplier_id: supplierId },
        update: {
          $setOnInsert: {
            external_supplier_id: supplierId,
            name,
            domain: domain || undefined,
            address: address || undefined,
            default_lead_time_days: leadTime,
            reliability_level: reliabilityLevel,
            status,
            created_by: actorId,
          },
        },
        upsert: true,
      },
    });
  });

  const totals = await bulkWriteInChunks(Supplier, ops, { chunkSize: 500, ordered: false });
  return {
    map: { idToName, idToLead },
    totals: { rows: suppliersRows.length, upserted: totals.upserted, matched: totals.matched },
  };
}

async function buildCategoryMap() {
  const cats = await Category.find().select('_id name').lean();
  const map = new Map();
  cats.forEach((c) => map.set(String(c.name), c._id));
  return map;
}

async function importProducts(productsRows, actorId, { dryRun }) {
  const externalIdToCode = new Map();
  productsRows.forEach((r) => {
    const pid = sanitizeKey(r.product_id);
    const code = sanitizeKey(r.product_code);
    if (pid && code) externalIdToCode.set(pid, code);
  });

  if (dryRun) {
    return { map: { externalIdToCode }, totals: { rows: productsRows.length, upserted: 0 } };
  }

  const categoryMap = await buildCategoryMap();

  const ops = [];
  productsRows.forEach((r) => {
    const externalProductId = sanitizeKey(r.product_id);
    const codeProduct = sanitizeKey(r.product_code).toUpperCase();
    const name = sanitizeKey(r.product_name);
    if (!externalProductId || !codeProduct || !name) return;

    const categoryName = sanitizeKey(r.category);
    const categoryId = categoryName ? categoryMap.get(categoryName) : null;
    const unite = sanitizeKey(r.unit) || 'Unite';
    const seuilMin = asNonNegativeInt(r.minimum_threshold, 0);
    const initialStock = asNonNegativeInt(r.initial_stock, 0);
    const currentStock = asNonNegativeInt(r.current_stock, 0);
    const emplacement = sanitizeKey(r.default_location) || '';
    const isActive = parseBool01(r.is_active);
    const createdAt = parseDateTime(r.created_at);
    const family = normalizeFamilyGuess(r.category, r.product_name);

    const status =
      currentStock <= 0 ? 'rupture' : (currentStock < seuilMin ? 'sous_seuil' : 'ok');

    ops.push({
      updateOne: {
        filter: { code_product: codeProduct },
        update: {
          $setOnInsert: {
            external_product_id: externalProductId,
            code_product: codeProduct,
            name,
            description: '',
            category: categoryId || undefined,
            category_proposal: categoryName || '',
            family,
            unite,
            emplacement,
            stock_initial_year: initialStock,
            quantity_current: currentStock,
            seuil_minimum: seuilMin,
            status,
            lifecycle_status: isActive ? 'active' : 'archived',
            archived_at: isActive ? undefined : (createdAt || new Date()),
            archived_reason: isActive ? undefined : 'Imported as inactive from realistic dataset',
            qr_code_value: `QR-${codeProduct}`,
            created_by: actorId,
            validated_by: actorId,
            validation_status: 'approved',
          },
        },
        upsert: true,
      },
    });
  });

  const totals = await bulkWriteInChunks(Product, ops, { chunkSize: 500, ordered: false });
  return { map: { externalIdToCode }, totals: { rows: productsRows.length, upserted: totals.upserted, matched: totals.matched } };
}

async function buildProductMaps() {
  const products = await Product.find().select('_id code_product external_product_id seuil_minimum').lean();
  const byCode = new Map();
  const byExternal = new Map();
  products.forEach((p) => {
    if (p.code_product) byCode.set(String(p.code_product).toUpperCase(), p);
    if (p.external_product_id) byExternal.set(String(p.external_product_id), p);
  });
  return { byCode, byExternal };
}

async function buildSupplierMaps() {
  const suppliers = await Supplier.find().select('_id external_supplier_id name default_lead_time_days').lean();
  const byExternal = new Map();
  const byName = new Map();
  suppliers.forEach((s) => {
    if (s.external_supplier_id) byExternal.set(String(s.external_supplier_id), s);
    if (s.name) byName.set(String(s.name), s);
  });
  return { byExternal, byName };
}

async function importPurchaseOrders(filePath, { productMaps, supplierMaps, supplierIdToName, actorId, dryRun }) {
  const grouped = new Map();

  await forEachCsvRow(filePath, (row) => {
    const poId = sanitizeKey(row.purchase_order_id);
    const productCode = sanitizeKey(row.product_code).toUpperCase();
    const supplierExternal = sanitizeKey(row.supplier_id);
    if (!poId || !productCode || !supplierExternal) return;
    const quantity = asNonNegativeInt(row.quantity_ordered, 0);
    const status = mapPurchaseOrderStatus(row.status);
    const orderedAt = parseDateTime(row.order_date);
    const promisedAt = parseDateTime(row.expected_delivery_date);
    const deliveredAt = parseDateTime(row.received_date);

    const existing = grouped.get(poId) || {
      poId,
      supplierExternal,
      status,
      orderedAt,
      promisedAt,
      deliveredAt,
      lines: [],
    };

    existing.status = status || existing.status;
    if (orderedAt && (!existing.orderedAt || orderedAt < existing.orderedAt)) existing.orderedAt = orderedAt;
    if (promisedAt && (!existing.promisedAt || promisedAt > existing.promisedAt)) existing.promisedAt = promisedAt;
    if (deliveredAt && (!existing.deliveredAt || deliveredAt > existing.deliveredAt)) existing.deliveredAt = deliveredAt;
    existing.lines.push({ productCode, quantity });

    grouped.set(poId, existing);
  });

  if (dryRun) return { totals: { rows: grouped.size, upserted: 0 } };

  const ops = [];
  grouped.forEach((po) => {
    const supplierName = supplierIdToName.get(po.supplierExternal) || '';
    const supplierDoc = supplierMaps.byExternal.get(po.supplierExternal) || supplierMaps.byName.get(supplierName);
    if (!supplierDoc?._id) return;

    const lines = po.lines
      .map((l) => {
        const p = productMaps.byCode.get(l.productCode);
        if (!p?._id) return null;
        return { product: p._id, quantity: l.quantity, unit_price: 0, quantity_received: po.status === 'delivered' ? l.quantity : 0 };
      })
      .filter(Boolean);

    if (!lines.length) return;

    ops.push({
      updateOne: {
        filter: { external_purchase_order_id: po.poId },
        update: {
          $setOnInsert: {
            external_purchase_order_id: po.poId,
            supplier: supplierDoc._id,
            status: po.status,
            ordered_at: po.orderedAt || new Date(),
            promised_at: po.promisedAt || undefined,
            delivered_at: po.deliveredAt || undefined,
            received_at: po.deliveredAt || undefined,
            receive_count: po.status === 'delivered' ? 1 : 0,
            note: 'Imported from realistic dataset',
            created_by: actorId,
            lines,
          },
        },
        upsert: true,
      },
    });
  });

  const totals = await bulkWriteInChunks(PurchaseOrder, ops, { chunkSize: 500, ordered: false });
  return { totals: { rows: grouped.size, upserted: totals.upserted, matched: totals.matched } };
}

async function importRequests(filePath, { productMaps, actors, dryRun }) {
  const ops = [];
  const stats = { rows: 0 };

  await forEachCsvRow(filePath, (row) => {
    stats.rows += 1;
    const requestId = sanitizeKey(row.request_id);
    const productCode = sanitizeKey(row.product_code).toUpperCase();
    if (!requestId || !productCode) return;
    const productDoc = productMaps.byCode.get(productCode);
    if (!productDoc?._id) return;

    const dateRequest = parseDateTime(row.date) || new Date();
    const qty = asNonNegativeInt(row.quantity_requested, 0);
    const status = mapRequestStatus(row.status);
    const priority = mapRequestPriority(row.priority);
    const requesterName = sanitizeKey(row.requester);
    const direction = sanitizeKey(row.direction);
    const site = sanitizeKey(row.site);
    const comment = sanitizeKey(row.comment);

    const directionCombined = [direction, site].filter(Boolean).join(' - ');

    ops.push({
      updateOne: {
        filter: { external_request_id: requestId },
        update: {
          $setOnInsert: {
            external_request_id: requestId,
            demandeur: actors.demandeur._id,
            product: productDoc._id,
            quantity_requested: qty,
            direction_laboratory: directionCombined || undefined,
            beneficiary: requesterName || undefined,
            priority,
            status,
            date_request: dateRequest,
            note: comment || undefined,
            validated_by: status !== 'pending' ? actors.responsable._id : undefined,
            validated_at: status !== 'pending' ? dateRequest : undefined,
            prepared_by: ['preparing', 'served', 'received'].includes(status) ? actors.magasinier._id : undefined,
            prepared_at: ['preparing', 'served', 'received'].includes(status) ? dateRequest : undefined,
            served_by: ['served', 'received'].includes(status) ? actors.magasinier._id : undefined,
            date_served: ['served', 'received'].includes(status) ? dateRequest : undefined,
            received_by: status === 'received' ? actors.demandeur._id : undefined,
            received_at: status === 'received' ? dateRequest : undefined,
            processed_by: undefined,
            date_processing: undefined,
          },
        },
        upsert: true,
      },
    });
  });

  if (dryRun) return { totals: { rows: stats.rows, upserted: 0 } };

  const totals = await bulkWriteInChunks(Request, ops, { chunkSize: 1000, ordered: false });
  return { totals: { rows: stats.rows, upserted: totals.upserted, matched: totals.matched } };
}

async function buildRequestMap() {
  const rows = await Request.find({ external_request_id: { $exists: true, $ne: '' } })
    .select('_id external_request_id')
    .lean();
  const map = new Map();
  rows.forEach((r) => map.set(String(r.external_request_id), r._id));
  return map;
}

async function importStockEntries(filePath, { productMaps, supplierIdToName, actors, dryRun }) {
  const ops = [];
  const stats = { rows: 0 };

  await forEachCsvRow(filePath, (row) => {
    stats.rows += 1;
    const entryId = sanitizeKey(row.stock_entry_id);
    const productCode = sanitizeKey(row.product_code).toUpperCase();
    if (!entryId || !productCode) return;
    const productDoc = productMaps.byCode.get(productCode);
    if (!productDoc?._id) return;

    const dateEntry = parseDateTime(row.date) || new Date();
    const qty = asNonNegativeFloat(row.quantity, 0);
    const supplierExternal = sanitizeKey(row.supplier_id);
    const supplierName = supplierIdToName.get(supplierExternal) || '';
    const createdBy = String(row.created_by || '').trim().toLowerCase();
    const actorId = createdBy === 'responsable' ? actors.responsable._id : actors.magasinier._id;

    ops.push({
      updateOne: {
        filter: { entry_number: entryId },
        update: {
          $setOnInsert: {
            entry_number: entryId,
            product: productDoc._id,
            quantity: qty,
            unit_price: 0,
            submission_duration_ms: undefined,
            purchase_order_number: undefined,
            purchase_voucher_number: undefined,
            delivery_note_number: undefined,
            supplier_doc_qr_value: undefined,
            entry_mode: 'manual',
            delivery_date: dateEntry,
            service_requester: sanitizeKey(row.source) || undefined,
            supplier: supplierName || undefined,
            commercial_name: sanitizeKey(row.product_name) || undefined,
            reference_code: productCode,
            lot_number: undefined,
            lot_qr_value: undefined,
            observation: 'Imported from realistic dataset',
            date_entry: dateEntry,
            magasinier: actorId,
            canceled: false,
          },
        },
        upsert: true,
      },
    });
  });

  if (dryRun) return { totals: { rows: stats.rows, upserted: 0 } };

  const totals = await bulkWriteInChunks(StockEntry, ops, { chunkSize: 1000, ordered: false });
  return { totals: { rows: stats.rows, upserted: totals.upserted, matched: totals.matched } };
}

async function importStockLots(filePath, { productMaps, dryRun }) {
  const ops = [];
  const stats = { rows: 0 };

  await forEachCsvRow(filePath, (row) => {
    stats.rows += 1;
    const lotId = sanitizeKey(row.lot_id);
    const productCode = sanitizeKey(row.product_code).toUpperCase();
    if (!lotId || !productCode) return;
    const productDoc = productMaps.byCode.get(productCode);
    if (!productDoc?._id) return;

    const createdAt = parseDateTime(row.created_at) || new Date();
    const expiryDate = parseDateTime(row.expiry_date);
    const qtyInit = asNonNegativeFloat(row.quantity_initial, 0);
    const qtyAvail = asNonNegativeFloat(row.quantity_available, 0);

    let status = 'open';
    const now = new Date();
    if (qtyAvail <= 0) status = 'empty';
    if (expiryDate && expiryDate.getTime() < now.getTime()) status = 'expired';

    ops.push({
      updateOne: {
        filter: { product: productDoc._id, qr_code_value: lotId },
        update: {
          $setOnInsert: {
            product: productDoc._id,
            entry: undefined,
            lot_number: sanitizeKey(row.lot_number) || undefined,
            qr_code_value: lotId,
            expiry_date: expiryDate || undefined,
            date_entry: createdAt,
            quantity_initial: qtyInit,
            quantity_available: qtyAvail,
            unit_price: 0,
            status,
          },
        },
        upsert: true,
      },
    });
  });

  if (dryRun) return { totals: { rows: stats.rows, upserted: 0 } };
  const totals = await bulkWriteInChunks(StockLot, ops, { chunkSize: 1000, ordered: false });
  return { totals: { rows: stats.rows, upserted: totals.upserted, matched: totals.matched } };
}

async function importStockExits(filePath, { productMaps, requestIdToObjectId, actors, dryRun }) {
  const ops = [];
  const stats = { rows: 0, linkedToRequest: 0 };

  await forEachCsvRow(filePath, (row) => {
    stats.rows += 1;
    const exitId = sanitizeKey(row.stock_exit_id);
    const productCode = sanitizeKey(row.product_code).toUpperCase();
    if (!exitId || !productCode) return;
    const productDoc = productMaps.byCode.get(productCode);
    if (!productDoc?._id) return;

    const dateExit = parseDateTime(row.date) || new Date();
    const qty = asNonNegativeFloat(row.quantity, 0);
    const requestExternal = sanitizeKey(row.request_id);
    const requestObjId = requestExternal ? requestIdToObjectId.get(requestExternal) : null;
    if (requestObjId) stats.linkedToRequest += 1;

    const createdBy = String(row.created_by || '').trim().toLowerCase();
    const actorId = createdBy === 'responsable' ? actors.responsable._id : actors.magasinier._id;

    ops.push({
      updateOne: {
        filter: { exit_number: exitId },
        update: {
          $setOnInsert: {
            exit_number: exitId,
            withdrawal_paper_number: undefined,
            exit_context: 'internal',
            external_destination: undefined,
            external_company: undefined,
            delivery_note_number: undefined,
            delivery_note_date: undefined,
            product: productDoc._id,
            quantity: qty,
            submission_duration_ms: undefined,
            direction_laboratory: sanitizeKey(row.destination) || undefined,
            beneficiary: undefined,
            demandeur: actors.demandeur._id,
            request: requestObjId || undefined,
            date_exit: dateExit,
            scanned_lot_qr: undefined,
            internal_bond_token: undefined,
            internal_bond_id: undefined,
            exit_mode: 'manual',
            fifo_reference: undefined,
            consumed_lots: [],
            note: sanitizeKey(row.movement_reason) || undefined,
            magasinier: actorId,
            canceled: false,
          },
        },
        upsert: true,
      },
    });
  });

  if (dryRun) return { totals: { rows: stats.rows, upserted: 0, linkedToRequest: stats.linkedToRequest } };

  const totals = await bulkWriteInChunks(StockExit, ops, { chunkSize: 1000, ordered: false });
  return { totals: { rows: stats.rows, upserted: totals.upserted, matched: totals.matched, linkedToRequest: stats.linkedToRequest } };
}

async function backfillRequestStockExitLinks() {
  const exits = await StockExit.find({ request: { $ne: null } })
    .select('_id request')
    .limit(100000)
    .lean();
  if (!exits.length) return { linked: 0 };

  const ops = exits.map((x) => ({
    updateOne: {
      filter: { _id: x.request, stock_exit: { $in: [null, undefined] } },
      update: { $set: { stock_exit: x._id } },
    },
  }));
  const totals = await bulkWriteInChunks(Request, ops, { chunkSize: 1000, ordered: false });
  return { linked: totals.modified };
}

async function importInventories(filePath, { productMaps, actors, dryRun }) {
  const sessionByRef = new Map();
  const counts = [];
  const stats = { rows: 0, sessions: 0 };

  await forEachCsvRow(filePath, (row) => {
    stats.rows += 1;
    const invId = sanitizeKey(row.inventory_id);
    const productCode = sanitizeKey(row.product_code).toUpperCase();
    if (!invId || !productCode) return;
    const productDoc = productMaps.byCode.get(productCode);
    if (!productDoc?._id) return;

    const date = parseDateTime(row.date) || new Date();
    const location = sanitizeKey(row.location) || '';
    const status = mapInventorySessionStatus(row.status);

    if (!sessionByRef.has(invId)) {
      sessionByRef.set(invId, {
        reference: invId,
        title: location ? `Inventaire (${location})` : `Inventaire ${invId}`,
        status,
        created_by: actors.magasinier._id,
        created_at: date,
      });
    }

    counts.push({
      session_ref: invId,
      product: productDoc._id,
      counted_quantity: asNonNegativeFloat(row.counted_stock, 0),
      system_quantity_at_count: asNonNegativeFloat(row.system_stock, 0),
      counted_by: actors.magasinier._id,
      counted_at: date,
      note: sanitizeKey(row.gap) ? `Gap: ${sanitizeKey(row.gap)}` : undefined,
    });
  });

  stats.sessions = sessionByRef.size;

  if (dryRun) {
    return { totals: { rows: stats.rows, sessions: stats.sessions, counts: counts.length, upserted_sessions: 0, upserted_counts: 0 } };
  }

  const sessionOps = Array.from(sessionByRef.values()).map((s) => ({
    updateOne: {
      filter: { reference: s.reference },
      update: { $setOnInsert: s },
      upsert: true,
    },
  }));
  const sessionTotals = await bulkWriteInChunks(InventorySession, sessionOps, { chunkSize: 500, ordered: false });

  const sessions = await InventorySession.find({ reference: { $in: Array.from(sessionByRef.keys()) } })
    .select('_id reference')
    .lean();
  const refToId = new Map(sessions.map((s) => [String(s.reference), s._id]));

  const countOps = counts
    .map((c) => {
      const sid = refToId.get(c.session_ref);
      if (!sid) return null;
      return {
        updateOne: {
          filter: { session: sid, product: c.product },
          update: {
            $setOnInsert: {
              session: sid,
              product: c.product,
              counted_quantity: c.counted_quantity,
              system_quantity_at_count: c.system_quantity_at_count,
              note: c.note,
              counted_by: c.counted_by,
              counted_at: c.counted_at,
            },
          },
          upsert: true,
        },
      };
    })
    .filter(Boolean);
  const countTotals = await bulkWriteInChunks(InventoryCount, countOps, { chunkSize: 1000, ordered: false });

  return {
    totals: {
      rows: stats.rows,
      sessions: stats.sessions,
      counts: counts.length,
      upserted_sessions: sessionTotals.upserted,
      upserted_counts: countTotals.upserted,
    },
  };
}

async function importAiAlerts(filePath, { productMaps, actors, dryRun }) {
  const ops = [];
  const stats = { rows: 0 };

  await forEachCsvRow(filePath, (row) => {
    stats.rows += 1;
    const alertId = sanitizeKey(row.alert_id);
    const productCode = sanitizeKey(row.product_code).toUpperCase();
    if (!alertId || !productCode) return;
    const productDoc = productMaps.byCode.get(productCode);
    if (!productDoc?._id) return;

    const detectedAt = parseDateTime(row.date) || new Date();
    const alertType = mapAiAlertType(row.alert_type);
    const riskLevel = mapAiRiskLevel(row.level);
    const status = mapAiAlertStatus(row.status);
    const why = sanitizeKey(row.why);
    const action = sanitizeKey(row.recommended_action);
    const risk = sanitizeKey(row.risk);

    const message = [
      why ? `Pourquoi: ${why}` : '',
      action ? `Action: ${action}` : '',
      risk ? `Risque: ${risk}` : '',
    ].filter(Boolean).join('\n');

    ops.push({
      updateOne: {
        filter: { external_alert_id: alertId },
        update: {
          $setOnInsert: {
            external_alert_id: alertId,
            product: productDoc._id,
            alert_type: alertType,
            risk_level: riskLevel,
            message: message || undefined,
            detected_at: detectedAt,
            status,
            action_taken: status === 'reviewed' ? 'Imported (reviewed)' : undefined,
            reviewed_by: status === 'reviewed' ? actors.responsable._id : undefined,
          },
        },
        upsert: true,
      },
    });
  });

  if (dryRun) return { totals: { rows: stats.rows, upserted: 0 } };
  const totals = await bulkWriteInChunks(AIAlert, ops, { chunkSize: 1000, ordered: false });
  return { totals: { rows: stats.rows, upserted: totals.upserted, matched: totals.matched } };
}

async function importNotifications(filePath, { actors, dryRun }) {
  const ops = [];
  const stats = { rows: 0 };

  await forEachCsvRow(filePath, (row) => {
    stats.rows += 1;
    const notifId = sanitizeKey(row.notification_id);
    if (!notifId) return;

    const title = sanitizeKey(row.title);
    const message = sanitizeKey(row.message);
    const role = String(row.target_role || '').trim().toLowerCase();
    const userId =
      role === 'magasinier' ? actors.magasinier._id :
      role === 'responsable' ? actors.responsable._id :
      role === 'admin' ? actors.responsable._id :
      actors.demandeur._id;

    ops.push({
      updateOne: {
        filter: { external_notification_id: notifId },
        update: {
          $setOnInsert: {
            external_notification_id: notifId,
            user: userId,
            title: title || undefined,
            message: message || undefined,
            type: mapNotificationType(title, message),
            is_read: parseBool01(row.is_read),
            event_type: 'dataset_import',
            inventory_id: null,
          },
        },
        upsert: true,
      },
    });
  });

  if (dryRun) return { totals: { rows: stats.rows, upserted: 0 } };
  const totals = await bulkWriteInChunks(Notification, ops, { chunkSize: 1000, ordered: false });
  return { totals: { rows: stats.rows, upserted: totals.upserted, matched: totals.matched } };
}

async function importTrainingCollections(dirPath, { productMaps, dryRun }) {
  const out = {};
  if (dryRun) {
    // Still count rows quickly to provide a meaningful summary.
    for (const [key, file] of Object.entries(DATASET_FILES)) {
      if (!String(key).includes('training') && key !== 'dashboard_bi_daily') continue;
      const p = path.join(dirPath, file);
      // eslint-disable-next-line no-await-in-loop
      const { count } = await forEachCsvRow(p, () => {});
      out[key] = { rows: count, upserted: 0 };
    }
    return out;
  }

  const collections = {
    stockout_training: mongoose.connection.collection('dataset_training_stockout_v1'),
    consumption_training_daily: mongoose.connection.collection('dataset_training_consumption_daily_v1'),
    anomaly_training: mongoose.connection.collection('dataset_training_anomaly_v1'),
    threshold_training: mongoose.connection.collection('dataset_training_threshold_v1'),
    decision_training: mongoose.connection.collection('dataset_training_decision_v1'),
    dashboard_bi_daily: mongoose.connection.collection('dataset_training_dashboard_bi_daily_v1'),
  };

  // 11_stockout_training.csv
  {
    const ops = [];
    let rows = 0;
    // eslint-disable-next-line no-await-in-loop
    await forEachCsvRow(path.join(dirPath, DATASET_FILES.stockout_training), (r) => {
      rows += 1;
      const productCode = sanitizeKey(r.product_code).toUpperCase();
      const p = productMaps.byCode.get(productCode);
      const doc = {
        product_code: productCode,
        product: p?._id || undefined,
        product_id: sanitizeKey(r.product_id),
        product_name: sanitizeKey(r.product_name),
        category: sanitizeKey(r.category),
        current_stock: asNonNegativeFloat(r.current_stock, 0),
        minimum_threshold: asNonNegativeFloat(r.minimum_threshold, 0),
        maximum_threshold: asNonNegativeFloat(r.maximum_threshold, 0),
        total_entries_7d: asNonNegativeFloat(r.total_entries_7d, 0),
        total_entries_30d: asNonNegativeFloat(r.total_entries_30d, 0),
        total_exits_7d: asNonNegativeFloat(r.total_exits_7d, 0),
        total_exits_30d: asNonNegativeFloat(r.total_exits_30d, 0),
        avg_daily_consumption_7d: asNonNegativeFloat(r.avg_daily_consumption_7d, 0),
        avg_daily_consumption_30d: asNonNegativeFloat(r.avg_daily_consumption_30d, 0),
        stock_balance_30d: Number(r.stock_balance_30d || 0),
        days_cover: Number(r.days_cover || 0),
        pending_requests_qty: asNonNegativeFloat(r.pending_requests_qty, 0),
        supplier_lead_time_days: asNonNegativeInt(r.supplier_lead_time_days, 7),
        has_pending_purchase_order: parseBool01(r.has_pending_purchase_order),
        is_stockout: parseBool01(r.is_stockout),
        is_below_threshold: parseBool01(r.is_below_threshold),
        risk_level: sanitizeKey(r.risk_level),
        recommended_order_qty: asNonNegativeFloat(r.recommended_order_qty, 0),
        imported_at: new Date(),
      };

      ops.push({
        updateOne: {
          filter: { product_code: productCode },
          update: { $set: doc },
          upsert: true,
        },
      });
    });
    const totals = await bulkWriteInChunks(collections.stockout_training, ops, { chunkSize: 500, ordered: false });
    out.stockout_training = { rows, upserted: totals.upserted, modified: totals.modified };
  }

  // 12_consumption_training_daily.csv
  {
    const ops = [];
    let rows = 0;
    // eslint-disable-next-line no-await-in-loop
    await forEachCsvRow(path.join(dirPath, DATASET_FILES.consumption_training_daily), (r) => {
      rows += 1;
      const productCode = sanitizeKey(r.product_code).toUpperCase();
      const date = parseDateTime(r.date);
      const key = `${productCode}::${date ? date.toISOString().slice(0, 10) : sanitizeKey(r.date)}`;
      const p = productMaps.byCode.get(productCode);
      ops.push({
        updateOne: {
          filter: { key },
          update: {
            $set: {
              key,
              date: date || undefined,
              product_code: productCode,
              product: p?._id || undefined,
              product_id: sanitizeKey(r.product_id),
              product_name: sanitizeKey(r.product_name),
              category: sanitizeKey(r.category),
              quantity_in: Number(r.quantity_in || 0),
              quantity_out: Number(r.quantity_out || 0),
              stock_after: r.stock_after === '' ? null : Number(r.stock_after),
              requests_count: asNonNegativeInt(r.requests_count, 0),
              pending_requests_count: asNonNegativeInt(r.pending_requests_count, 0),
              day_of_week: sanitizeKey(r.day_of_week),
              month: asNonNegativeInt(r.month, 0),
              is_weekend: parseBool01(r.is_weekend),
              is_high_consumption_day: parseBool01(r.is_high_consumption_day),
              imported_at: new Date(),
            },
          },
          upsert: true,
        },
      });
    });
    const totals = await bulkWriteInChunks(collections.consumption_training_daily, ops, { chunkSize: 1000, ordered: false });
    out.consumption_training_daily = { rows, upserted: totals.upserted, modified: totals.modified };
  }

  // 13_anomaly_training.csv
  {
    const ops = [];
    let rows = 0;
    // eslint-disable-next-line no-await-in-loop
    await forEachCsvRow(path.join(dirPath, DATASET_FILES.anomaly_training), (r) => {
      rows += 1;
      const transactionId = sanitizeKey(r.transaction_id);
      if (!transactionId) return;
      const productCode = sanitizeKey(r.product_code).toUpperCase();
      const p = productMaps.byCode.get(productCode);
      ops.push({
        updateOne: {
          filter: { transaction_id: transactionId },
          update: {
            $set: {
              transaction_id: transactionId,
              date: parseDateTime(r.date) || undefined,
              product_code: productCode,
              product: p?._id || undefined,
              product_id: sanitizeKey(r.product_id),
              product_name: sanitizeKey(r.product_name),
              movement_type: sanitizeKey(r.movement_type),
              quantity: Number(r.quantity || 0),
              stock_before: Number(r.stock_before || 0),
              stock_after: Number(r.stock_after || 0),
              user_role: sanitizeKey(r.user_role),
              created_by: sanitizeKey(r.created_by),
              related_request_id: sanitizeKey(r.related_request_id),
              lot_id: sanitizeKey(r.lot_id),
              is_blocked_lot: parseBool01(r.is_blocked_lot),
              is_quarantine_lot: parseBool01(r.is_quarantine_lot),
              is_large_quantity: parseBool01(r.is_large_quantity),
              is_negative_stock: parseBool01(r.is_negative_stock),
              is_weekend_operation: parseBool01(r.is_weekend_operation),
              anomaly_label: sanitizeKey(r.anomaly_label),
              imported_at: new Date(),
            },
          },
          upsert: true,
        },
      });
    });
    const totals = await bulkWriteInChunks(collections.anomaly_training, ops, { chunkSize: 1000, ordered: false });
    out.anomaly_training = { rows, upserted: totals.upserted, modified: totals.modified };
  }

  // 14_threshold_training.csv
  {
    const ops = [];
    let rows = 0;
    // eslint-disable-next-line no-await-in-loop
    await forEachCsvRow(path.join(dirPath, DATASET_FILES.threshold_training), (r) => {
      rows += 1;
      const productCode = sanitizeKey(r.product_code).toUpperCase();
      const p = productMaps.byCode.get(productCode);
      ops.push({
        updateOne: {
          filter: { product_code: productCode },
          update: {
            $set: {
              product_code: productCode,
              product: p?._id || undefined,
              product_id: sanitizeKey(r.product_id),
              product_name: sanitizeKey(r.product_name),
              category: sanitizeKey(r.category),
              current_stock: asNonNegativeFloat(r.current_stock, 0),
              current_threshold: asNonNegativeFloat(r.current_threshold, 0),
              avg_daily_consumption_7d: asNonNegativeFloat(r.avg_daily_consumption_7d, 0),
              avg_daily_consumption_30d: asNonNegativeFloat(r.avg_daily_consumption_30d, 0),
              max_daily_consumption_30d: asNonNegativeFloat(r.max_daily_consumption_30d, 0),
              consumption_variation: Number(r.consumption_variation || 0),
              supplier_lead_time_days: asNonNegativeInt(r.supplier_lead_time_days, 7),
              safety_days: asNonNegativeInt(r.safety_days, 0),
              recommended_threshold: Number(r.recommended_threshold || 0),
              threshold_action: sanitizeKey(r.threshold_action),
              imported_at: new Date(),
            },
          },
          upsert: true,
        },
      });
    });
    const totals = await bulkWriteInChunks(collections.threshold_training, ops, { chunkSize: 500, ordered: false });
    out.threshold_training = { rows, upserted: totals.upserted, modified: totals.modified };
  }

  // 15_decision_training.csv
  {
    const ops = [];
    let rows = 0;
    // eslint-disable-next-line no-await-in-loop
    await forEachCsvRow(path.join(dirPath, DATASET_FILES.decision_training), (r) => {
      rows += 1;
      const itemType = sanitizeKey(r.item_type).toUpperCase();
      const itemId = sanitizeKey(r.item_id);
      if (!itemType || !itemId) return;
      const productCode = sanitizeKey(r.product_code).toUpperCase();
      const p = productMaps.byCode.get(productCode);
      const key = `${itemType}:${itemId}`;
      ops.push({
        updateOne: {
          filter: { key },
          update: {
            $set: {
              key,
              item_type: itemType,
              item_id: itemId,
              product_code: productCode,
              product: p?._id || undefined,
              product_id: sanitizeKey(r.product_id),
              product_name: sanitizeKey(r.product_name),
              current_stock: Number(r.current_stock || 0),
              minimum_threshold: Number(r.minimum_threshold || 0),
              pending_requests_qty: Number(r.pending_requests_qty || 0),
              critical_alerts_count: Number(r.critical_alerts_count || 0),
              near_expiry_lots_count: Number(r.near_expiry_lots_count || 0),
              supplier_delay_count: Number(r.supplier_delay_count || 0),
              inventory_issue_count: Number(r.inventory_issue_count || 0),
              risk_level: sanitizeKey(r.risk_level),
              recommended_action: sanitizeKey(r.recommended_action),
              priority: sanitizeKey(r.priority),
              imported_at: new Date(),
            },
          },
          upsert: true,
        },
      });
    });
    const totals = await bulkWriteInChunks(collections.decision_training, ops, { chunkSize: 500, ordered: false });
    out.decision_training = { rows, upserted: totals.upserted, modified: totals.modified };
  }

  // 16_dashboard_bi_daily.csv
  {
    const ops = [];
    let rows = 0;
    // eslint-disable-next-line no-await-in-loop
    await forEachCsvRow(path.join(dirPath, DATASET_FILES.dashboard_bi_daily), (r) => {
      rows += 1;
      const d = parseDateTime(r.date);
      const key = d ? d.toISOString().slice(0, 10) : sanitizeKey(r.date);
      ops.push({
        updateOne: {
          filter: { key },
          update: {
            $set: {
              key,
              date: d || undefined,
              total_products: asNonNegativeInt(r.total_products, 0),
              active_products: asNonNegativeInt(r.active_products, 0),
              inactive_products: asNonNegativeInt(r.inactive_products, 0),
              critical_products: asNonNegativeInt(r.critical_products, 0),
              stockout_products: asNonNegativeInt(r.stockout_products, 0),
              below_threshold_products: asNonNegativeInt(r.below_threshold_products, 0),
              pending_requests: asNonNegativeInt(r.pending_requests, 0),
              urgent_requests: asNonNegativeInt(r.urgent_requests, 0),
              inventory_sessions_pending: asNonNegativeInt(r.inventory_sessions_pending, 0),
              stock_movements: asNonNegativeInt(r.stock_movements, 0),
              stock_entries_count: asNonNegativeInt(r.stock_entries_count, 0),
              stock_exits_count: asNonNegativeInt(r.stock_exits_count, 0),
              supplier_delays: asNonNegativeInt(r.supplier_delays, 0),
              near_expiry_lots: asNonNegativeInt(r.near_expiry_lots, 0),
              alerts_count: asNonNegativeInt(r.alerts_count, 0),
              critical_alerts_count: asNonNegativeInt(r.critical_alerts_count, 0),
              stock_availability_rate: Number(r.stock_availability_rate || 0),
              imported_at: new Date(),
            },
          },
          upsert: true,
        },
      });
    });
    const totals = await bulkWriteInChunks(collections.dashboard_bi_daily, ops, { chunkSize: 500, ordered: false });
    out.dashboard_bi_daily = { rows, upserted: totals.upserted, modified: totals.modified };
  }

  return out;
}

async function importHistoryFromOperational({ actors, withHistory, dryRun }) {
  if (!withHistory) return { enabled: false, inserted: 0, skipped_existing: 0 };

  const buildHistoryOpsForModel = async ({
    model,
    filter,
    actionType,
    dateField,
    numberField,
    quantityField = 'quantity',
    actorRole,
  }) => {
    const cursor = model
      .find(filter || {})
      .select(`_id ${dateField} ${numberField} ${quantityField} product demandeur magasinier user request`)
      .lean()
      .cursor();
    let inserted = 0;
    let skipped = 0;
    const batch = [];

    const flushBatch = async () => {
      if (!batch.length) return;
      const correlationIds = batch.map((x) => x.correlation_id);
      const existing = await History.find({ correlation_id: { $in: correlationIds } }).select('correlation_id').lean();
      const existingSet = new Set(existing.map((x) => String(x.correlation_id)));
      const toInsert = batch.filter((x) => !existingSet.has(String(x.correlation_id)));
      skipped += batch.length - toInsert.length;
      if (!toInsert.length) {
        batch.length = 0;
        return;
      }
      if (dryRun) {
        inserted += toInsert.length;
        batch.length = 0;
        return;
      }
      await History.insertMany(toInsert, { ordered: false });
      inserted += toInsert.length;
      batch.length = 0;
    };

    for await (const doc of cursor) {
      const correlationId = `dataset_realistic_v1:${actionType}:${String(doc[numberField] || doc._id)}`;
      const dateAction = doc[dateField] ? new Date(doc[dateField]) : new Date();
      const userId = doc.magasinier || doc.user || doc.demandeur || actors.magasinier._id;
      const qty = Number(doc[quantityField] || 0);
      batch.push({
        action_type: actionType,
        user: userId,
        product: doc.product || undefined,
        request: doc.request || undefined,
        quantity: qty || undefined,
        date_action: dateAction,
        source: 'system',
        description: `Import dataset realistic (${actionType})`,
        status_before: undefined,
        status_after: undefined,
        actor_role: actorRole,
        correlation_id: correlationId,
        tags: ['dataset_import', 'realistic_v1', actionType],
        context: {
          import_source: 'sentinel_dataset_realiste_csv.zip',
          external_id: String(doc[numberField] || ''),
        },
      });

      if (batch.length >= 800) {
        // eslint-disable-next-line no-await-in-loop
        await flushBatch();
      }
    }

    await flushBatch();
    return { inserted, skipped };
  };

  const [entries, exits, requests] = await Promise.all([
    buildHistoryOpsForModel({
      model: StockEntry,
      filter: { entry_number: { $regex: /^ENT-\d+/ } },
      actionType: 'entry',
      dateField: 'date_entry',
      numberField: 'entry_number',
      actorRole: 'magasinier',
    }),
    buildHistoryOpsForModel({
      model: StockExit,
      filter: { exit_number: { $regex: /^SOR-\d+/ } },
      actionType: 'exit',
      dateField: 'date_exit',
      numberField: 'exit_number',
      actorRole: 'magasinier',
    }),
    buildHistoryOpsForModel({
      model: Request,
      filter: { external_request_id: { $regex: /^REQ-\d+/ } },
      actionType: 'request',
      dateField: 'date_request',
      numberField: 'external_request_id',
      quantityField: 'quantity_requested',
      actorRole: 'demandeur',
    }),
  ]);

  return {
    enabled: true,
    inserted: entries.inserted + exits.inserted + requests.inserted,
    skipped_existing: entries.skipped + exits.skipped + requests.skipped,
  };
}

async function recomputeStocksIfRequested({ recomputeStocks, dryRun }) {
  if (!recomputeStocks) return { enabled: false };

  const products = await Product.find().select('_id stock_initial_year').lean();
  const productIds = products.map((p) => p._id);
  const initialByProduct = new Map(products.map((p) => [String(p._id), Number(p.stock_initial_year || 0)]));

  const [entryAgg, exitAgg] = await Promise.all([
    StockEntry.aggregate([
      { $match: { canceled: false, product: { $in: productIds } } },
      { $group: { _id: '$product', qty: { $sum: '$quantity' } } },
    ]),
    StockExit.aggregate([
      { $match: { canceled: false, product: { $in: productIds } } },
      { $group: { _id: '$product', qty: { $sum: '$quantity' } } },
    ]),
  ]);

  const entriesBy = new Map(entryAgg.map((x) => [String(x._id), Number(x.qty || 0)]));
  const exitsBy = new Map(exitAgg.map((x) => [String(x._id), Number(x.qty || 0)]));

  const ops = [];
  products.forEach((p) => {
    const pid = String(p._id);
    const initial = initialByProduct.get(pid) || 0;
    const computed = initial + (entriesBy.get(pid) || 0) - (exitsBy.get(pid) || 0);
    const qty = Math.max(0, Math.floor(computed));
    ops.push({
      updateOne: {
        filter: { _id: p._id },
        update: { $set: { quantity_current: qty } },
      },
    });
  });

  if (dryRun) return { enabled: true, updated_products: ops.length };
  const totals = await bulkWriteInChunks(Product, ops, { chunkSize: 1000, ordered: false });
  return { enabled: true, updated_products: totals.modified };
}

async function run() {
  const startedAt = Date.now();
  const args = parseArgs(process.argv.slice(2));

  const zipPath = resolveWorkspacePath(args.zip);
  const dirPathArg = resolveWorkspacePath(args.dir);
  const extractDir = resolveWorkspacePath(args.extractDir);

  if (!dirPathArg) {
    if (!zipPath) throw new Error('Dataset introuvable: specifiez --zip <path> ou --dir <path>.');
    if (!fs.existsSync(zipPath)) throw new Error(`ZIP introuvable: ${zipPath}`);
    extractZipToDir(zipPath, extractDir);
  }

  const datasetDir = dirPathArg || extractDir;
  const required = [
    DATASET_FILES.products,
    DATASET_FILES.suppliers,
    DATASET_FILES.stocklots,
    DATASET_FILES.purchaseorders,
    DATASET_FILES.stockentries,
    DATASET_FILES.stockexits,
    DATASET_FILES.requests,
    DATASET_FILES.inventories,
    DATASET_FILES.aialerts,
    DATASET_FILES.notifications,
  ];
  for (const f of required) {
    const fp = path.join(datasetDir, f);
    if (!fs.existsSync(fp)) throw new Error(`Fichier manquant dans dataset: ${fp}`);
  }

  const actors = await requireActors();
  const reset = await resetScopeOrThrow({
    scope: args.resetScope,
    yesReset: args.yesReset,
    allowDangerousReset: args.allowDangerousReset,
  });

  const { rows: suppliersRows } = await readSmallCsvToArray(path.join(datasetDir, DATASET_FILES.suppliers), { maxRows: 1000 });
  const { rows: productsRows } = await readSmallCsvToArray(path.join(datasetDir, DATASET_FILES.products), { maxRows: 5000 });

  const categoriesRes = await upsertCategoriesFromProducts(productsRows, actors.responsable._id, { dryRun: args.dryRun });
  const suppliersRes = await importSuppliers(suppliersRows, actors.responsable._id, { dryRun: args.dryRun });
  const productsRes = await importProducts(productsRows, actors.responsable._id, { dryRun: args.dryRun });

  const productMaps = await buildProductMaps();
  const supplierMaps = await buildSupplierMaps();

  const requestsRes = await importRequests(path.join(datasetDir, DATASET_FILES.requests), {
    productMaps,
    actors,
    dryRun: args.dryRun,
  });

  const requestIdToObjectId = args.dryRun ? new Map() : await buildRequestMap();

  const purchaseOrdersRes = await importPurchaseOrders(path.join(datasetDir, DATASET_FILES.purchaseorders), {
    productMaps,
    supplierMaps,
    supplierIdToName: suppliersRes.map.idToName,
    actorId: actors.responsable._id,
    dryRun: args.dryRun,
  });

  const stockEntriesRes = await importStockEntries(path.join(datasetDir, DATASET_FILES.stockentries), {
    productMaps,
    supplierIdToName: suppliersRes.map.idToName,
    actors,
    dryRun: args.dryRun,
  });

  const stockLotsRes = await importStockLots(path.join(datasetDir, DATASET_FILES.stocklots), {
    productMaps,
    dryRun: args.dryRun,
  });

  const stockExitsRes = await importStockExits(path.join(datasetDir, DATASET_FILES.stockexits), {
    productMaps,
    requestIdToObjectId,
    actors,
    dryRun: args.dryRun,
  });

  const linkRes = args.dryRun ? { linked: 0 } : await backfillRequestStockExitLinks();

  const inventoriesRes = await importInventories(path.join(datasetDir, DATASET_FILES.inventories), {
    productMaps,
    actors,
    dryRun: args.dryRun,
  });

  const aiAlertsRes = await importAiAlerts(path.join(datasetDir, DATASET_FILES.aialerts), {
    productMaps,
    actors,
    dryRun: args.dryRun,
  });

  const notificationsRes = await importNotifications(path.join(datasetDir, DATASET_FILES.notifications), {
    actors,
    dryRun: args.dryRun,
  });

  const trainingRes = args.importTraining
    ? await importTrainingCollections(datasetDir, { productMaps, dryRun: args.dryRun })
    : { disabled: true };

  const historyRes = await importHistoryFromOperational({
    actors,
    withHistory: args.withHistory,
    dryRun: args.dryRun,
  });

  const recomputeRes = await recomputeStocksIfRequested({ recomputeStocks: args.recomputeStocks, dryRun: args.dryRun });

  const tookMs = Date.now() - startedAt;

  // eslint-disable-next-line no-console
  console.log('IMPORT_REALISTIC_DATASET_OK', {
    dry_run: args.dryRun,
    dataset_dir: datasetDir,
    zip: dirPathArg ? null : zipPath,
    reset,
    categories: categoriesRes,
    suppliers: suppliersRes.totals,
    products: productsRes.totals,
    requests: requestsRes.totals,
    purchase_orders: purchaseOrdersRes.totals,
    stock_entries: stockEntriesRes.totals,
    stock_lots: stockLotsRes.totals,
    stock_exits: stockExitsRes.totals,
    request_exit_links_set: linkRes,
    inventories: inventoriesRes.totals,
    ai_alerts: aiAlertsRes.totals,
    notifications: notificationsRes.totals,
    training: trainingRes,
    history: historyRes,
    recompute_stocks: recomputeRes,
    took_ms: tookMs,
  });
}

run()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('IMPORT_REALISTIC_DATASET_FAILED', err?.message || err);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await mongoose.connection.close();
    } catch (_) {
      // ignore
    }
  });
