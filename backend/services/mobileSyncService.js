const Product = require('../models/Product');
const StockEntry = require('../models/StockEntry');
const StockExit = require('../models/StockExit');
const StockLot = require('../models/StockLot');
const InventorySession = require('../models/InventorySession');
const InventoryCount = require('../models/InventoryCount');
const History = require('../models/History');
const Sequence = require('../models/Sequence');
const SyncEvent = require('../models/SyncEvent');
const { Inventory } = require('../models/Inventory');
const { PERMISSIONS } = require('../constants/permissions');
const { getRolePermissions } = require('./rbacPolicyService');
const { runInTransaction } = require('./transactionService');
const { evaluateProductAlerts } = require('./alertService');
const {
  asDate,
  asNonNegativeNumber,
  asOptionalString,
  asPositiveNumber,
  isSafeText,
  isValidObjectIdLike,
} = require('../utils/validation');

const ACTIVE_INVENTORY_STATUSES = ['A_FAIRE', 'EN_COURS', 'A_VALIDER', 'A_RECOMPTER'];

const EVENT_PERMISSIONS = {
  stock_entry_create: PERMISSIONS.STOCK_ENTRY_CREATE,
  stock_exit_create: PERMISSIONS.STOCK_EXIT_CREATE,
  delivery_signed: PERMISSIONS.STOCK_EXIT_CREATE,
  inventory_count: PERMISSIONS.INVENTORY_MANAGE,
};

class SyncBusinessError extends Error {
  constructor(message, { code = 'validation_failed', status = 400 } = {}) {
    super(message);
    this.name = 'SyncBusinessError';
    this.code = code;
    this.status = status;
  }
}

async function processMobileSyncBatch({ user, events }) {
  const accepted = [];
  const rejected = [];
  const list = Array.isArray(events) ? events.slice(0, 50) : [];

  if (!list.length) {
    throw new SyncBusinessError('Aucun evenement a synchroniser', { code: 'empty_batch', status: 400 });
  }

  for (const rawEvent of list) {
    let normalized;
    try {
      normalized = normalizeEvent(rawEvent);
      const result = await runInTransaction((session) => processOneEvent({ user, event: normalized, session }));
      if (result.accepted) accepted.push(result.accepted);
      if (result.rejected) rejected.push(result.rejected);
    } catch (err) {
      rejected.push({
        id: String(normalized?.id || rawEvent?.id || ''),
        type: String(normalized?.type || rawEvent?.type || ''),
        error: err.message || 'Evenement invalide',
        code: err.code || 'invalid_event',
      });
    }
  }

  return { accepted, rejected };
}

async function processOneEvent({ user, event, session }) {
  const existing = await findSyncEvent(user.id, event.id, session);
  if (existing?.status === 'accepted') {
    return { accepted: acceptedPayload(event, existing.result || { duplicate: true }) };
  }
  if (existing?.status === 'rejected') {
    return { rejected: rejectedPayload(event, existing.error || 'Evenement deja rejete', existing.error_code || 'rejected') };
  }

  const eventDoc = existing || await createSyncEvent({ user, event, session });

  try {
    const recovered = await recoverAcceptedEvent(user.id, event, session);
    if (recovered) {
      await markSyncEvent(eventDoc, 'accepted', recovered, null, null, session);
      return { accepted: acceptedPayload(event, recovered) };
    }

    await assertEventPermission(user, event.type);
    const result = await dispatchEvent({ user, event, session });
    await markSyncEvent(eventDoc, 'accepted', result, null, null, session);
    return { accepted: acceptedPayload(event, result) };
  } catch (err) {
    const code = err.code || 'processing_failed';
    await markSyncEvent(eventDoc, 'rejected', null, err.message || 'Traitement impossible', code, session);
    return { rejected: rejectedPayload(event, err.message || 'Traitement impossible', code) };
  }
}

function normalizeEvent(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new SyncBusinessError('Evenement invalide', { code: 'invalid_event' });
  }
  const id = asOptionalString(raw.id);
  const type = asOptionalString(raw.type);
  if (!id || !isSafeText(id, { min: 8, max: 140 })) {
    throw new SyncBusinessError('event id invalide', { code: 'invalid_event_id' });
  }
  if (!type || !EVENT_PERMISSIONS[type]) {
    throw new SyncBusinessError('type evenement non supporte', { code: 'unsupported_event' });
  }
  const payload = raw.payload && typeof raw.payload === 'object' && !Array.isArray(raw.payload)
    ? raw.payload
    : {};

  return {
    id,
    type,
    site: cleanText(raw.site || payload.site, 80),
    payload,
    eventTimeDevice: normalizeDate(raw.event_time_device || payload?.meta?.time?.createdAtDeviceIso),
    createdAtLocal: normalizeDate(raw.createdAtLocal || payload?.createdAtLocal),
  };
}

async function dispatchEvent({ user, event, session }) {
  if (event.type === 'stock_entry_create') return processStockEntry({ user, event, session });
  if (event.type === 'stock_exit_create') return processStockExit({ user, event, session });
  if (event.type === 'delivery_signed') return processDeliverySignature({ event });
  if (event.type === 'inventory_count') return processInventoryCount({ user, event, session });
  throw new SyncBusinessError('type evenement non supporte', { code: 'unsupported_event' });
}

async function assertEventPermission(user, eventType) {
  const permission = EVENT_PERMISSIONS[eventType];
  if (!permission) throw new SyncBusinessError('Permission refusee', { code: 'permission_denied', status: 403 });

  const rolePerms = await getRolePermissions(user.role);
  const override = Array.isArray(user.rbac_permissions)
    ? new Set(user.rbac_permissions.map((p) => String(p || '').trim()).filter(Boolean))
    : null;

  if (!rolePerms?.has(permission)) {
    throw new SyncBusinessError('Permission refusee', { code: 'permission_denied', status: 403 });
  }
  if (override && !override.has(permission)) {
    throw new SyncBusinessError('Permission refusee', { code: 'permission_denied', status: 403 });
  }
}

async function ensureStockMovementsAllowed(session) {
  const locked = await Inventory.findOne({
    movement_blocked: true,
    status: { $in: ACTIVE_INVENTORY_STATUSES },
  })
    .select('_id reference type_inventaire')
    .session(session)
    .lean();

  if (locked) {
    throw new SyncBusinessError(
      `Mouvements stock bloques par inventaire ${locked.reference || locked._id}`,
      { code: 'stock_locked', status: 409 }
    );
  }
}

async function processStockEntry({ user, event, session }) {
  await ensureStockMovementsAllowed(session);

  const payload = event.payload || {};
  const productId = String(payload.productId || payload.product_id || payload.product || '').trim();
  if (!isValidObjectIdLike(productId)) {
    throw new SyncBusinessError('productId invalide', { code: 'invalid_product' });
  }

  const quantity = asPositiveNumber(payload.quantity);
  if (Number.isNaN(quantity) || quantity === undefined) {
    throw new SyncBusinessError('Quantite invalide', { code: 'invalid_quantity' });
  }

  const product = await Product.findById(productId).session(session);
  if (!product) throw new SyncBusinessError('Produit introuvable', { code: 'product_not_found', status: 404 });
  if (String(product.lifecycle_status || 'active') !== 'active') {
    throw new SyncBusinessError('Produit archive / indisponible', { code: 'product_archived', status: 409 });
  }

  const dateEntry = event.eventTimeDevice || new Date();
  const lotNumber = await getNextLotNumber(dateEntry);
  const unitPrice = asNonNegativeNumber(payload.unit_price);
  if (Number.isNaN(unitPrice)) throw new SyncBusinessError('Prix unitaire invalide', { code: 'invalid_unit_price' });

  const entryPayload = {
    entry_number: await getNextEntryNumber(),
    product: product._id,
    quantity,
    unit_price: unitPrice,
    delivery_note_number: cleanText(payload.delivery_note_number || payload.deliveryNoteNumber || `MOB-${event.id.slice(0, 12)}`, 80),
    supplier: cleanText(payload.supplier || event.site || 'Mobile terrain', 90),
    lot_number: lotNumber,
    lot_qr_value: lotNumber,
    entry_mode: 'manual',
    date_entry: dateEntry,
    observation: buildEntryObservation(payload),
    magasinier: user.id,
  };

  const entry = await createOne(StockEntry, entryPayload, session);
  await createOne(StockLot, {
    product: product._id,
    entry: entry._id,
    lot_number: entry.lot_number,
    qr_code_value: entry.lot_qr_value || entry.lot_number || entry.entry_number,
    date_entry: entry.date_entry || new Date(),
    quantity_initial: quantity,
    quantity_available: quantity,
    unit_price: unitPrice,
    status: 'open',
  }, session);

  product.quantity_current = Number(product.quantity_current || 0) + quantity;
  product.status = computeProductStatus(product.quantity_current, product.seuil_minimum);
  await product.save({ session });

  await createOne(History, {
    action_type: 'entry',
    user: user.id,
    product: product._id,
    quantity,
    source: 'ui',
    description: `Entree mobile synchronisee (${entry.entry_number})`,
    actor_role: user.role,
    correlation_id: event.id,
    tags: ['mobile_sync', 'entry'],
    context: { sync_event_id: event.id, entry_id: String(entry._id), entry_number: entry.entry_number },
  }, session);

  await evaluateProductAlerts(product, session);
  return { entity: 'stock_entry', id: String(entry._id), number: entry.entry_number };
}

async function processStockExit({ user, event, session }) {
  await ensureStockMovementsAllowed(session);

  const payload = event.payload || {};
  const productId = String(payload.productId || payload.product_id || payload.product || '').trim();
  if (!isValidObjectIdLike(productId)) {
    throw new SyncBusinessError('productId invalide', { code: 'invalid_product' });
  }

  const quantity = asPositiveNumber(payload.quantity);
  if (Number.isNaN(quantity) || quantity === undefined) {
    throw new SyncBusinessError('Quantite invalide', { code: 'invalid_quantity' });
  }

  const product = await Product.findById(productId).session(session);
  if (!product) throw new SyncBusinessError('Produit introuvable', { code: 'product_not_found', status: 404 });
  if (String(product.lifecycle_status || 'active') !== 'active') {
    throw new SyncBusinessError('Produit archive / indisponible', { code: 'product_archived', status: 409 });
  }

  const currentStock = Number(product.quantity_current || 0);
  if (currentStock < quantity) {
    throw new SyncBusinessError('Stock insuffisant', { code: 'stock_insufficient', status: 409 });
  }

  await ensureLegacyOpenLot(product, session);
  const lots = await StockLot.find({ product: product._id, quantity_available: { $gt: 0 } }).session(session);
  const sortedLots = sortLotsForStrategy(lots, chooseLotStrategy(lots));
  const consumedLots = [];
  let remaining = quantity;

  for (const lot of sortedLots) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, Number(lot.quantity_available || 0));
    if (take <= 0) continue;
    lot.quantity_available -= take;
    lot.status = lot.quantity_available <= 0 ? 'empty' : 'open';
    await lot.save({ session });
    remaining -= take;
    consumedLots.push({
      lot: lot._id,
      lot_number: lot.lot_number,
      quantity: take,
      expiry_date: lot.expiry_date,
    });
  }

  if (remaining > 0) {
    throw new SyncBusinessError('Stock insuffisant pour FIFO par lots', { code: 'fifo_insufficient', status: 409 });
  }

  const exitPayload = {
    exit_number: await getNextExitNumber(),
    product: product._id,
    quantity,
    direction_laboratory: cleanText(payload.directionLaboratory || payload.direction_laboratory, 80),
    beneficiary: cleanText(payload.beneficiary, 80),
    date_exit: event.eventTimeDevice || new Date(),
    fifo_reference: consumedLots.map((x) => x.lot_number || 'N/A').join(', '),
    consumed_lots: consumedLots,
    note: buildExitNote(payload),
    exit_mode: 'manual',
    magasinier: user.id,
  };

  const exit = await createOne(StockExit, exitPayload, session);
  product.quantity_current = Number(product.quantity_current || 0) - quantity;
  product.status = computeProductStatus(product.quantity_current, product.seuil_minimum);
  await product.save({ session });

  await createOne(History, {
    action_type: 'exit',
    user: user.id,
    product: product._id,
    quantity,
    source: 'ui',
    description: `Sortie mobile synchronisee (${exit.exit_number})`,
    actor_role: user.role,
    correlation_id: event.id,
    tags: ['mobile_sync', 'exit'],
    context: { sync_event_id: event.id, exit_id: String(exit._id), exit_number: exit.exit_number },
  }, session);

  await evaluateProductAlerts(product, session);
  return { entity: 'stock_exit', id: String(exit._id), number: exit.exit_number };
}

async function processDeliverySignature({ event }) {
  const payload = event.payload || {};
  const receiptId = cleanText(payload.receiptId, 120);
  return {
    entity: 'delivery_signature',
    receipt_id: receiptId || null,
    stored_in_sync_event: true,
  };
}

async function processInventoryCount({ user, event, session }) {
  const payload = event.payload || {};
  const lines = Array.isArray(payload.lines) ? payload.lines : [];
  if (!lines.length) throw new SyncBusinessError('Inventaire vide', { code: 'empty_inventory' });

  const validLines = [];
  for (const line of lines.slice(0, 500)) {
    const productId = String(line.productId || line.product_id || line.product || '').trim();
    if (!isValidObjectIdLike(productId)) continue;

    const counted = asNonNegativeNumber(line.countedQty ?? line.counted_quantity);
    if (Number.isNaN(counted) || counted === undefined) continue;

    const product = await Product.findById(productId).select('_id quantity_current').session(session).lean();
    if (!product) continue;

    validLines.push({
      product,
      counted: Math.max(0, Math.floor(Number(counted))),
      note: cleanText(line.note, 600),
    });
  }

  if (!validLines.length) {
    throw new SyncBusinessError('Aucune ligne inventaire valide', { code: 'invalid_inventory_lines' });
  }

  const reference = await getNextInventoryReference();
  const sessionDoc = await createOne(InventorySession, {
    title: cleanText(payload.title, 100) || `Inventaire mobile ${new Date().toLocaleDateString('fr-FR')}`,
    reference,
    status: 'closed',
    notes: cleanText(payload.note || payload.notes || `Synchronise depuis mobile${event.site ? ` - ${event.site}` : ''}`, 600),
    created_by: user.id,
    created_at: event.eventTimeDevice || new Date(),
    closed_at: new Date(),
    closed_by: user.id,
  }, session);

  let savedLines = 0;
  for (const line of validLines) {
    await createOne(InventoryCount, {
      session: sessionDoc._id,
      product: line.product._id,
      counted_quantity: line.counted,
      system_quantity_at_count: Math.max(0, Math.floor(Number(line.product.quantity_current || 0))),
      note: line.note,
      counted_by: user.id,
      counted_at: event.eventTimeDevice || new Date(),
    }, session);
    savedLines += 1;
  }

  await createOne(History, {
    action_type: 'inventory',
    user: user.id,
    source: 'ui',
    description: `Inventaire mobile synchronise (${reference})`,
    actor_role: user.role,
    correlation_id: event.id,
    tags: ['mobile_sync', 'inventory'],
    context: { sync_event_id: event.id, session_id: String(sessionDoc._id), reference, lines: savedLines },
  }, session);

  return { entity: 'inventory_session', id: String(sessionDoc._id), reference, lines: savedLines };
}

async function createOne(Model, payload, session) {
  if (session) {
    const [created] = await Model.create([payload], { session });
    return created;
  }
  return Model.create(payload);
}

async function findSyncEvent(userId, eventId, session) {
  return SyncEvent.findOne({ user: userId, event_id: eventId }).session(session);
}

async function createSyncEvent({ user, event, session }) {
  return createOne(SyncEvent, {
    event_id: event.id,
    type: event.type,
    user: user.id,
    site: event.site,
    payload: event.payload,
    status: 'processing',
    event_time_device: event.eventTimeDevice,
    created_at_local: event.createdAtLocal,
  }, session);
}

async function markSyncEvent(eventDoc, status, result, error, errorCode, session) {
  eventDoc.status = status;
  eventDoc.result = result || undefined;
  eventDoc.error = error || undefined;
  eventDoc.error_code = errorCode || undefined;
  eventDoc.processed_at = new Date();
  await eventDoc.save({ session });
}

async function recoverAcceptedEvent(userId, event, session) {
  const existing = await History.findOne({ user: userId, correlation_id: event.id })
    .select('_id action_type description context')
    .session(session)
    .lean();
  if (!existing) return null;
  return {
    recovered: true,
    entity: existing.action_type,
    history_id: String(existing._id),
    context: existing.context || {},
  };
}

function acceptedPayload(event, result) {
  return { id: event.id, type: event.type, result };
}

function rejectedPayload(event, error, code) {
  return { id: event.id, type: event.type, error, code };
}

function cleanText(value, max = 200) {
  const text = asOptionalString(value);
  if (text === undefined) return undefined;
  const sliced = text.slice(0, max);
  if (!isSafeText(sliced, { min: 0, max })) return undefined;
  return sliced;
}

function normalizeDate(value) {
  const parsed = asDate(value);
  return parsed instanceof Date ? parsed : undefined;
}

function computeProductStatus(quantity, seuilMinimum) {
  if (Number(quantity) <= 0) return 'rupture';
  if (Number(quantity) <= Number(seuilMinimum || 0)) return 'sous_seuil';
  return 'ok';
}

async function getNextEntryNumber() {
  const year = new Date().getFullYear();
  const counter = await Sequence.findOneAndUpdate(
    { counter_name: `stock_entry_${year}` },
    { $inc: { seq: 1 } },
    { returnDocument: 'after', upsert: true }
  );
  return `BE-${year}-${String(counter.seq).padStart(5, '0')}`;
}

async function getNextExitNumber() {
  const year = new Date().getFullYear();
  const counter = await Sequence.findOneAndUpdate(
    { counter_name: `stock_exit_${year}` },
    { $inc: { seq: 1 } },
    { returnDocument: 'after', upsert: true }
  );
  return `BP-${year}-${String(counter.seq).padStart(5, '0')}`;
}

async function getNextInventoryReference() {
  const year = new Date().getFullYear();
  const counter = await Sequence.findOneAndUpdate(
    { counter_name: `inventory_${year}` },
    { $inc: { seq: 1 } },
    { returnDocument: 'after', upsert: true }
  );
  return `INV-${year}-${String(counter.seq).padStart(5, '0')}`;
}

function formatYYYYMMDD(date) {
  const d = date instanceof Date ? date : new Date(date);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}${mm}${dd}`;
}

async function getNextLotNumber(dateEntry) {
  const yyyymmdd = formatYYYYMMDD(dateEntry || new Date());
  const counter = await Sequence.findOneAndUpdate(
    { counter_name: `stock_lot_${yyyymmdd}` },
    { $inc: { seq: 1 } },
    { returnDocument: 'after', upsert: true }
  );
  return `LOT-${yyyymmdd}-${String(counter.seq).padStart(3, '0')}`;
}

async function ensureLegacyOpenLot(product, session) {
  const lotsAgg = await StockLot.aggregate([
    { $match: { product: product._id } },
    { $group: { _id: null, total_available: { $sum: '$quantity_available' } } },
  ]).session(session);

  const lotsAvailable = Number(lotsAgg[0]?.total_available || 0);
  const currentStock = Number(product.quantity_current || 0);
  const missingForFifo = currentStock - lotsAvailable;
  if (missingForFifo <= 0) return;

  await createOne(StockLot, {
    product: product._id,
    lot_number: `LEGACY-RECOVERY-${Date.now()}`,
    qr_code_value: `LEGACY-RECOVERY-${Date.now()}`,
    date_entry: product.createdAt || new Date(),
    quantity_initial: missingForFifo,
    quantity_available: missingForFifo,
    unit_price: 0,
    status: 'open',
  }, session);
}

function chooseLotStrategy(lots) {
  if (!Array.isArray(lots) || lots.length === 0) return 'fifo';
  return lots.some((lot) => Boolean(lot?.expiry_date)) ? 'fefo' : 'fifo';
}

function sortLotsForStrategy(lots, strategy) {
  const toTime = (d) => (d ? new Date(d).getTime() : Number.POSITIVE_INFINITY);
  return [...(lots || [])].sort((a, b) => {
    if (strategy === 'fefo') {
      const expDiff = toTime(a?.expiry_date) - toTime(b?.expiry_date);
      if (expDiff !== 0) return expDiff;
    }
    return toTime(a?.date_entry || a?.createdAt) - toTime(b?.date_entry || b?.createdAt);
  });
}

function buildEntryObservation(payload) {
  const parts = [];
  const note = cleanText(payload.note || payload.observation, 500);
  if (note) parts.push(note);
  if (payload.site) parts.push(`Site mobile: ${cleanText(payload.site, 80)}`);
  return parts.join(' | ') || 'Entree saisie depuis mobile';
}

function buildExitNote(payload) {
  const parts = [];
  const note = cleanText(payload.note, 400);
  if (note) parts.push(note);
  if (payload.hse_confirmed) parts.push('HSE confirme mobile');
  if (payload.hse_ack?.riskLevel) parts.push(`Risque HSE: ${cleanText(payload.hse_ack.riskLevel, 40)}`);
  if (payload.photos?.length) parts.push('Photo terrain presente dans evenement mobile');
  return parts.join(' | ') || 'Sortie saisie depuis mobile';
}

module.exports = {
  SyncBusinessError,
  processMobileSyncBatch,
};
