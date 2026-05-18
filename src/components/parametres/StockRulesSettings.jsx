import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Save, Settings, Sparkles } from 'lucide-react';
import { useToast } from '../shared/Toast';

import StockRulesGeneralCard from './StockRulesGeneralCard';
import StockValidationRulesCard from './StockValidationRulesCard';
import StockAlertRulesCard from './StockAlertRulesCard';
import StockRulesImpactPreview from './StockRulesImpactPreview';
import StockRulesSimulationModal from './StockRulesSimulationModal';
import ApplyGlobalThresholdModal from './ApplyGlobalThresholdModal';
import StockRulesHistory from './StockRulesHistory';

import {
  STOCK_RULES_DEFAULT,
  applyGlobalThresholdToProductsWithoutThreshold,
  loadStockRulesConfig,
  loadStockRulesHistory,
  loadStockRulesImpact,
  resetStockRulesToDefault,
  saveStockRulesConfig,
  sanitizeStockRulesConfig,
  simulateStockRulesImpact,
} from '../../services/stockRulesService';

import './stockRulesSettings.css';

function isValidConfig(cfg) {
  const seuil = Number(cfg?.seuilAlerte);
  const jours = Number(cfg?.joursInactivite);
  if (!Number.isFinite(seuil) || seuil < 0) return { ok: false, reason: "Le seuil d’alerte doit être un nombre >= 0." };
  if (!Number.isFinite(jours) || jours < 1) return { ok: false, reason: "Les jours d’inactivité doivent être >= 1." };
  return { ok: true };
}

function hasHighImpact(currentImpact, nextImpact) {
  const cur = Number(currentImpact?.alerts?.total || 0);
  const next = Number(nextImpact?.alerts?.total || 0);
  if (next >= 50) return true;
  if (next - cur >= 20) return true;
  return false;
}

export default function StockRulesSettings({ hideHeader = false } = {}) {
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [config, setConfig] = useState(() => ({ ...STOCK_RULES_DEFAULT }));
  const [impact, setImpact] = useState(null);
  const [history, setHistory] = useState([]);

  const [simulationOpen, setSimulationOpen] = useState(false);
  const [simulationImpact, setSimulationImpact] = useState(null);

  const [applyThresholdOpen, setApplyThresholdOpen] = useState(false);
  const [defaultsConfirmOpen, setDefaultsConfirmOpen] = useState(false);
  const [saveConfirmOpen, setSaveConfirmOpen] = useState(false);
  const [pendingSaveImpact, setPendingSaveImpact] = useState(null);

  const missingWithoutThreshold = useMemo(() => Number(impact?.counts?.products_without_threshold || 0), [impact]);
  const globalThreshold = useMemo(() => Number(config?.seuilAlerte || 0), [config]);

  const reloadAll = async ({ silent = false } = {}) => {
    if (!silent) setRefreshing(true);
    try {
      const [cfgRes, impactRes, histRes] = await Promise.all([
        loadStockRulesConfig(),
        loadStockRulesImpact(),
        loadStockRulesHistory({ limit: 60 }),
      ]);
      setConfig(sanitizeStockRulesConfig(cfgRes?.value || {}));
      setImpact(impactRes?.impact || null);
      setHistory(Array.isArray(histRes?.items) ? histRes.items : []);
      if (!silent) toast.success('Données actualisées.');
    } catch (err) {
      if (!silent) toast.error(err?.message || 'Erreur actualisation.');
    } finally {
      if (!silent) setRefreshing(false);
    }
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        await reloadAll({ silent: true });
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openSimulation = async () => {
    const validation = isValidConfig(config);
    if (!validation.ok) {
      toast.error(validation.reason);
      return;
    }
    setSaving(true);
    try {
      const res = await simulateStockRulesImpact(config);
      setSimulationImpact(res?.impact || null);
      setSimulationOpen(true);
    } catch (err) {
      toast.error(err?.message || 'Simulation indisponible.');
    } finally {
      setSaving(false);
    }
  };

  const doSave = async () => {
    const validation = isValidConfig(config);
    if (!validation.ok) {
      toast.error(validation.reason);
      return;
    }

    setSaving(true);
    try {
      const sim = await simulateStockRulesImpact(config);
      const nextImpact = sim?.impact || null;
      if (hasHighImpact(impact, nextImpact)) {
        setPendingSaveImpact(nextImpact);
        setSaveConfirmOpen(true);
        return;
      }
      const res = await saveStockRulesConfig(config);
      setConfig(res?.value || sanitizeStockRulesConfig(config));
      toast.success('Règles stock enregistrées avec succès.');
      setImpact(res?.impact || nextImpact);
      await reloadAll({ silent: true });
    } catch (err) {
      toast.error(err?.message || 'Erreur enregistrement règles.');
    } finally {
      setSaving(false);
    }
  };

  const confirmSaveAfterImpact = async () => {
    setSaveConfirmOpen(false);
    setSaving(true);
    try {
      const res = await saveStockRulesConfig(config);
      setConfig(res?.value || sanitizeStockRulesConfig(config));
      toast.success('Règles stock enregistrées avec succès.');
      setImpact(res?.impact || pendingSaveImpact);
      await reloadAll({ silent: true });
    } catch (err) {
      toast.error(err?.message || 'Erreur enregistrement règles.');
    } finally {
      setSaving(false);
    }
  };

  const confirmResetDefaults = async () => {
    setDefaultsConfirmOpen(false);
    setSaving(true);
    try {
      const res = await resetStockRulesToDefault();
      setConfig(res?.value || { ...STOCK_RULES_DEFAULT });
      setImpact(res?.impact || null);
      toast.success('Valeurs par défaut restaurées.');
      await reloadAll({ silent: true });
    } catch (err) {
      toast.error(err?.message || 'Erreur restauration valeurs par défaut.');
    } finally {
      setSaving(false);
    }
  };

  const confirmApplyThreshold = async () => {
    setApplyThresholdOpen(false);
    setSaving(true);
    try {
      const res = await applyGlobalThresholdToProductsWithoutThreshold();
      toast.success('Seuil global appliqué aux produits sans seuil.');
      setImpact((prev) => prev || null);
      await reloadAll({ silent: true });
      if (res?.modified !== undefined) {
        toast.info(`Produits modifiés: ${Number(res.modified || 0)}`);
      }
    } catch (err) {
      toast.error(err?.message || 'Erreur application seuil global.');
    } finally {
      setSaving(false);
    }
  };

  const validation = useMemo(() => isValidConfig(config), [config]);

  if (loading) {
    return (
      <div className="sr-wrap">
        <div className="sr-help">Chargement des règles stock…</div>
      </div>
    );
  }

  return (
    <div className="sr-wrap">
      {!hideHeader ? (
        <div className="sr-title">
          <div>
            <h2>Règles métier du stock</h2>
            <p className="sr-subtitle">
              Paramétrage des seuils, des alertes, des lots et des règles de gestion du stock.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <button className="btn-refresh" type="button" onClick={() => reloadAll()} disabled={refreshing || saving}>
              <RefreshCw size={16} /> Actualiser
            </button>
          </div>
        </div>
      ) : null}

      <div className="sr-card">
        <div className="sr-card-head">
          <div className="left">
            <Settings size={18} />
            <h3>À quoi sert cet onglet ?</h3>
          </div>
        </div>
        <div className="sr-card-body">
          <div className="sr-help">
            Ces règles déterminent le comportement automatique du système : alertes de seuil, inactivité produit, validation des nouveaux produits et contrôle des ruptures.
          </div>
        </div>
      </div>

      <StockRulesGeneralCard config={config} onChange={setConfig} disabled={saving} />
      <StockValidationRulesCard config={config} onChange={setConfig} disabled={saving} />
      <StockAlertRulesCard config={config} onChange={setConfig} disabled={saving} />

      <StockRulesImpactPreview
        impact={impact}
        loading={refreshing}
        onApplyGlobalThreshold={() => setApplyThresholdOpen(true)}
      />

      <div className="sr-card">
        <div className="sr-card-head">
          <div className="left">
            <Sparkles size={18} />
            <h3>Impact sur le catalogue</h3>
          </div>
        </div>
        <div className="sr-card-body">
          <div className="sr-help">
            {missingWithoutThreshold > 0 ? (
              <>
                <span style={{ fontWeight: 950 }}>{missingWithoutThreshold}</span> produit(s) approuvé(s) n’ont pas de seuil (
                <span className="sr-mono">seuil_minimum = 0/null</span>). En appliquant le seuil global (
                <span className="sr-mono">{Number(globalThreshold || 0)}</span>), ils commenceront à déclencher les alertes de seuil (sans écraser les seuils personnalisés).
              </>
            ) : (
              <>
                Aucun produit sans seuil détecté. Les produits restent personnalisés si un seuil spécifique est défini (prioritaire sur le seuil global).
              </>
            )}
          </div>
        </div>
      </div>

      <StockRulesHistory items={history} loading={refreshing} />

      <div className="sr-actions-bottom">
        <button className="btn-secondary" type="button" onClick={openSimulation} disabled={saving || refreshing || !validation.ok}>
          Simuler l’impact
        </button>
        <button className="btn-save resp" type="button" onClick={doSave} disabled={saving || refreshing || !validation.ok}>
          <Save size={16} /> Enregistrer les règles
        </button>
        <button className="btn-secondary" type="button" onClick={() => setDefaultsConfirmOpen(true)} disabled={saving || refreshing}>
          Valeurs par défaut
        </button>
      </div>

      <StockRulesSimulationModal
        open={simulationOpen}
        impact={simulationImpact}
        saving={saving}
        onClose={() => setSimulationOpen(false)}
        onConfirmSave={async () => {
          setSimulationOpen(false);
          await doSave();
        }}
      />

      <ApplyGlobalThresholdModal
        open={applyThresholdOpen}
        saving={saving}
        missingCount={missingWithoutThreshold}
        globalThreshold={globalThreshold}
        onClose={() => setApplyThresholdOpen(false)}
        onConfirm={confirmApplyThreshold}
      />

      {defaultsConfirmOpen ? (
        <div className="sr-modal-backdrop" onClick={() => setDefaultsConfirmOpen(false)} role="dialog" aria-modal="true">
          <div className="sr-modal" onClick={(e) => e.stopPropagation()} style={{ width: 'min(720px, 96vw)' }}>
            <div className="sr-modal-head">
              <div>
                <strong>Restaurer les valeurs par défaut</strong>
                <div className="sr-subtitle" style={{ marginTop: 4 }}>
                  Seuil global: 10 • Jours d’inactivité: 30 • Validation nouveaux produits: obligatoire • Alertes automatiques: activées
                </div>
              </div>
              <button className="btn-refresh" type="button" onClick={() => setDefaultsConfirmOpen(false)} disabled={saving}>
                Fermer
              </button>
            </div>
            <div className="sr-modal-body">
              <div className="sr-help">
                Cette action remplacera la configuration actuelle. Elle sera journalisée.
              </div>
            </div>
            <div className="sr-modal-footer">
              <button className="btn-secondary" type="button" onClick={() => setDefaultsConfirmOpen(false)} disabled={saving}>
                Annuler
              </button>
              <button className="btn-save resp" type="button" onClick={confirmResetDefaults} disabled={saving}>
                Confirmer
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {saveConfirmOpen ? (
        <div className="sr-modal-backdrop" onClick={() => setSaveConfirmOpen(false)} role="dialog" aria-modal="true">
          <div className="sr-modal" onClick={(e) => e.stopPropagation()} style={{ width: 'min(820px, 96vw)' }}>
            <div className="sr-modal-head">
              <div>
                <strong>Confirmer l’enregistrement (impact élevé)</strong>
                <div className="sr-subtitle" style={{ marginTop: 4 }}>
                  La simulation indique un impact important (alertes élevées). Voulez-vous continuer ?
                </div>
              </div>
              <button className="btn-refresh" type="button" onClick={() => setSaveConfirmOpen(false)} disabled={saving}>
                Fermer
              </button>
            </div>
            <div className="sr-modal-body">
              <div className="sr-badges">
                <span className="sr-badge danger">Impact élevé</span>
                <span className="sr-badge">Alertes prévues: {Number(pendingSaveImpact?.alerts?.total || 0)}</span>
              </div>
              <div className="sr-help">
                Conseil: utilisez « Simuler l’impact » pour inspecter les catégories (sous seuil, rupture, inactifs…).
              </div>
            </div>
            <div className="sr-modal-footer">
              <button className="btn-secondary" type="button" onClick={() => setSaveConfirmOpen(false)} disabled={saving}>
                Annuler
              </button>
              <button className="btn-save resp" type="button" onClick={confirmSaveAfterImpact} disabled={saving}>
                Confirmer l’enregistrement
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
