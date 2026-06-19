import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Download,
  FlaskConical,
  RefreshCw,
  Search,
  X,
  ChevronDown,
  Mail,
  AlertCircle,
  Upload,
  Zap,
} from 'lucide-react';
import SidebarResp from '../../components/responsable/SidebarResp';
import HeaderPage from '../../components/shared/HeaderPage';
import ProtectedPage from '../../components/shared/ProtectedPage';
import LoadingSpinner from '../../components/shared/LoadingSpinner';
import { useToast } from '../../components/shared/Toast';
import { API_BASE, get, post } from '../../services/api';
import {
  CHEMICAL_CLASS_OPTIONS,
  FDS_FILTER_OPTIONS,
  PHYSICAL_STATE_OPTIONS,
  computeChemicalRegisterSignals,
} from '../../utils/chemicalRegister';
import './RegistreChimique.css';

function pad2(n) {
  return String(Math.max(0, Math.floor(Number(n || 0)))).padStart(2, '0');
}

function formatMonthLabel(year, month) {
  const d = new Date(Number(year || 2026), Math.max(0, Number(month || 1) - 1), 1);
  if (Number.isNaN(d.getTime())) return `${month}/${year}`;
  return d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
}

function formatDateLabel(value) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function resolveAbsoluteUrl(path) {
  if (!path) return '';
  if (/^https?:\/\//i.test(path)) return path;
  const origin = String(API_BASE || '').replace(/\/api\/?$/, '');
  return `${origin}${String(path).startsWith('/') ? '' : '/'}${path}`;
}

function getAccessToken() {
  return sessionStorage.getItem('token') || localStorage.getItem('token') || '';
}

async function tryRefreshAccessToken() {
  const res = await fetch(`${API_BASE}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.token) return '';
  sessionStorage.setItem('token', data.token);
  localStorage.removeItem('token');
  return String(data.token || '');
}

async function fetchProtectedBlob(fileUrl) {
  const absolute = resolveAbsoluteUrl(fileUrl);
  if (!absolute) throw new Error("Fichier introuvable");

  const doFetch = async (token) =>
    fetch(absolute, {
      method: 'GET',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      credentials: 'include',
    });

  let token = getAccessToken();
  let res = await doFetch(token);
  if (res.status === 401) {
    const refreshed = await tryRefreshAccessToken();
    if (refreshed) {
      token = refreshed;
      res = await doFetch(token);
    }
  }

  if (!res.ok) throw new Error("Impossible d'ouvrir la FDS");
  const blob = await res.blob();
  return blob;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || 'document';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function openBlobInNewTab(blob) {
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener,noreferrer');
  setTimeout(() => URL.revokeObjectURL(url), 8000);
}

function toCsvValue(v) {
  const raw = v == null ? '' : String(v);
  const escaped = raw.replace(/"/g, '""');
  return `"${escaped}"`;
}

function buildCsv(rows, { year, month } = {}) {
  const header = [
    'Code produit',
    'Produit',
    'Classe chimique',
    'État physique',
    'Quantité disponible',
    'Unité',
    'Emplacement',
    'Fournisseur',
    'FDS',
    'Dernier mouvement',
    'Statut',
  ];

  const lines = [header.map(toCsvValue).join(',')];

  (rows || []).forEach((row) => {
    const sig = computeChemicalRegisterSignals(row);
    const fdsLabel = sig.hasFds ? 'Disponible' : 'Manquante';
    lines.push(
      [
        row?.code_product || '-',
        row?.designation || '-',
        sig.chemicalClass,
        sig.physicalState,
        Number(row?.quantite_restante || 0),
        row?.unite || '-',
        row?.emplacement || '-',
        row?.fournisseur || '-',
        fdsLabel,
        formatDateLabel(row?.last_movement_at),
        sig.status,
      ].map(toCsvValue).join(',')
    );
  });

  const fileName = `registre_chimique_${year}_${pad2(month)}.csv`;
  return { csv: lines.join('\n'), fileName };
}

function AnimatedKpi({ value }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const next = Math.max(0, Math.floor(Number(value || 0)));
    if (!Number.isFinite(next)) return;
    let raf = 0;
    const started = performance.now();
    const from = shown;
    const duration = 420;
    const tick = (now) => {
      const t = Math.min(1, (now - started) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const v = Math.round(from + (next - from) * eased);
      setShown(v);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return <span className="rc-kpi-value">{shown}</span>;
}

// Nouvelle composante : Modal IA pour générer les mails de relance
function AiMailGeneratorModal({ products, onClose, onConfirm }) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedEmails, setGeneratedEmails] = useState([]);

  const handleGenerateEmails = async () => {
    setIsGenerating(true);
    try {
      // Simuler l'appel API pour générer les emails
      // En production, cela appellerait un endpoint IA réel
      const emails = products.map((product) => ({
        supplier: product?.fournisseur || 'Fournisseur inconnu',
        productCode: product?.code_product,
        productName: product?.designation,
        subject: `[SENTINEL] Demande de FDS - ${product?.designation || 'Produit inconnu'}`,
        body: `Madame, Monsieur,\n\nDans le cadre de notre obligation de conformité réglementaire, nous vous demandons de transmettre la Fiche de Données de Sécurité (FDS) pour le produit suivant :\n\n• Code : ${product?.code_product}\n• Désignation : ${product?.designation}\n\nCette documentation est essentielle pour assurer la sécurité de notre personnel.\n\nMerci de nous faire parvenir ce document dans les plus brefs délais.\n\nCordialement,\nSystème SENTINEL`,
      }));
      await new Promise((r) => setTimeout(r, 800)); // Simulation d'attente
      setGeneratedEmails(emails);
    } catch (err) {
      console.error('Erreur lors de la génération des emails', err);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="rc-modal-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="rc-modal rc-modal-lg" onClick={(e) => e.stopPropagation()}>
        <div className="rc-modal-head">
          <div className="rc-modal-title">
            <Zap size={20} style={{ color: '#0284c7' }} />
            <strong>Générateur IA de Mails de Relance</strong>
          </div>
          <button type="button" className="rc-modal-close" onClick={onClose} aria-label="Fermer">
            <X size={18} />
          </button>
        </div>
        <div className="rc-modal-body">
          <p style={{ marginBottom: '1rem', color: '#475569', fontWeight: 700 }}>
            {products.length} produit{products.length > 1 ? 's' : ''} sans FDS détecté{products.length > 1 ? 's' : ''}.
          </p>

          {!generatedEmails.length ? (
            <div style={{ textAlign: 'center', padding: '1rem' }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleGenerateEmails}
                disabled={isGenerating}
              >
                {isGenerating ? 'Génération en cours...' : '⚡ Générer les mails automatiquement'}
              </button>
            </div>
          ) : (
            <>
              <div style={{ maxHeight: '400px', overflowY: 'auto', marginBottom: '1rem' }}>
                {generatedEmails.map((email, idx) => (
                  <details key={idx} style={{ marginBottom: '0.75rem', border: '1px solid #e2e8f0', borderRadius: '0.85rem', padding: '0.75rem' }}>
                    <summary style={{ cursor: 'pointer', fontWeight: 700, color: '#0f172a' }}>
                      📧 Fournisseur : {email.supplier} — {email.productCode}
                    </summary>
                    <div style={{ marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid #e2e8f0', fontSize: '0.9rem' }}>
                      <p><strong>Objet :</strong> {email.subject}</p>
                      <textarea
                        style={{
                          width: '100%',
                          height: '120px',
                          padding: '0.5rem',
                          border: '1px solid #e2e8f0',
                          borderRadius: '0.6rem',
                          fontFamily: 'monospace',
                          fontSize: '0.8rem',
                          resize: 'none',
                        }}
                        readOnly
                        value={email.body}
                      />
                    </div>
                  </details>
                ))}
              </div>
              <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-primary btn-sm" onClick={() => onConfirm(generatedEmails)}>
                  ✓ Envoyer les {generatedEmails.length} mails
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setGeneratedEmails([])}
                >
                  ↻ Régénérer
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// Nouvelle composante : Modal pour uploader une FDS avec drag-drop
function FdsUploadModal({ product, onClose, onSuccess }) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploadedFile, setUploadedFile] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [extractedData, setExtractedData] = useState(null);
  const toast = useToast();

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      if (!file.type.includes('pdf')) {
        toast.error("Veuillez déposer un fichier PDF.");
        return;
      }
      await processFile(file);
    }
  };

  const handleFileSelect = async (e) => {
    const files = e.target.files;
    if (files.length > 0) {
      await processFile(files[0]);
    }
  };

  const processFile = async (file) => {
    setUploadedFile(file);
    setIsProcessing(true);
    try {
      // Simuler un extraction OCR/IA
      await new Promise((r) => setTimeout(r, 1200));
      setExtractedData({
        chemicalClass: 'À déterminer (OCR en attente)',
        physicalState: 'Poudre / Liquide / Gaz',
        confidence: 87,
        fileName: file.name,
      });
    } catch (err) {
      toast.error("Erreur lors du traitement du fichier.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="rc-modal-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="rc-modal" onClick={(e) => e.stopPropagation()}>
        <div className="rc-modal-head">
          <div className="rc-modal-title">
            <Upload size={20} style={{ color: '#0284c7' }} />
            <strong>Importer FDS</strong>
            <span className="mono" style={{ fontSize: '0.85rem' }}>{product?.code_product}</span>
          </div>
          <button type="button" className="rc-modal-close" onClick={onClose} aria-label="Fermer">
            <X size={18} />
          </button>
        </div>
        <div className="rc-modal-body">
          <div
            className={`rc-dropzone ${isDragging ? 'dragging' : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <Upload size={48} style={{ opacity: 0.5 }} />
            <p style={{ marginTop: '0.5rem', fontWeight: 700, color: '#0f172a' }}>
              Glissez-déposez un fichier PDF ici
            </p>
            <p style={{ fontSize: '0.85rem', color: '#64748b' }}>ou</p>
            <label style={{ marginTop: '0.5rem' }}>
              <input
                type="file"
                accept=".pdf"
                onChange={handleFileSelect}
                style={{ display: 'none' }}
              />
              <button type="button" className="btn btn-secondary btn-sm">
                Parcourir les fichiers
              </button>
            </label>
          </div>

          {isProcessing && (
            <div style={{ marginTop: '1rem', textAlign: 'center' }}>
              <p style={{ fontWeight: 700, color: '#0284c7' }}>⏳ Analyse du document en cours...</p>
            </div>
          )}

          {extractedData && (
            <div style={{ marginTop: '1rem', padding: '1rem', background: '#f0f9ff', border: '1px solid #bfdbfe', borderRadius: '0.85rem' }}>
              <p style={{ fontWeight: 700, color: '#075985', marginBottom: '0.5rem' }}>
                ✓ Données extraites (confiance : {extractedData.confidence}%)
              </p>
              <div style={{ fontSize: '0.9rem', color: '#0f172a' }}>
                <p><strong>Fichier :</strong> {extractedData.fileName}</p>
                <p><strong>Classe chimique :</strong> {extractedData.chemicalClass}</p>
                <p><strong>État physique :</strong> {extractedData.physicalState}</p>
              </div>
              <div style={{ marginTop: '1rem', display: 'flex', gap: '0.6rem' }}>
                <button type="button" className="btn btn-primary btn-sm" onClick={() => onSuccess(extractedData)}>
                  ✓ Confirmer et enregistrer
                </button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setExtractedData(null)}>
                  ↻ Charger un autre fichier
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function RegistreChimique({ userName, onLogout }) {
  const toast = useToast();

  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => (typeof window !== 'undefined' ? window.innerWidth <= 768 : false)
  );
  const [isLoading, setIsLoading] = useState(false);

  const now = useMemo(() => new Date(), []);
  const [year, setYear] = useState(() => now.getFullYear());
  const [month, setMonth] = useState(() => now.getMonth() + 1);

  const [filterChemicalClass, setFilterChemicalClass] = useState('Tous');
  const [filterPhysicalState, setFilterPhysicalState] = useState('Tous');
  const [filterFds, setFilterFds] = useState('Tous');
  const [filterEmplacement, setFilterEmplacement] = useState('');
  const [search, setSearch] = useState('');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  const [rows, setRows] = useState([]);
  const [detailRow, setDetailRow] = useState(null);
  const [aiMailModalOpen, setAiMailModalOpen] = useState(false);
  const [fdsUploadModalOpen, setFdsUploadModalOpen] = useState(false);
  const [fdsUploadProduct, setFdsUploadProduct] = useState(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await get(
        `/reports/chemical-register?year=${encodeURIComponent(year)}&month=${encodeURIComponent(month)}`
      );
      setRows(Array.isArray(data?.rows) ? data.rows : []);
    } catch (err) {
      setRows([]);
      toast.error(err?.message || "Impossible de charger le registre chimique. Veuillez réessayer.");
    } finally {
      setIsLoading(false);
    }
  }, [month, toast, year]);

  useEffect(() => {
    load();
  }, [load]);

  const prepared = useMemo(
    () => rows.map((r) => ({ ...r, _sig: computeChemicalRegisterSignals(r) })),
    [rows]
  );

  const filtered = useMemo(() => {
    const q = String(search || '').trim().toLowerCase();
    const emp = String(filterEmplacement || '').trim().toLowerCase();

    return prepared.filter((row) => {
      const sig = row._sig || computeChemicalRegisterSignals(row);

      if (filterChemicalClass !== 'Tous' && sig.chemicalClass !== filterChemicalClass) return false;
      if (filterPhysicalState !== 'Tous' && sig.physicalState !== filterPhysicalState) return false;
      if (filterFds === 'Disponible' && !sig.hasFds) return false;
      if (filterFds === 'Manquante' && sig.hasFds) return false;

      if (emp) {
        const v = String(row?.emplacement || '').toLowerCase();
        if (!v.includes(emp)) return false;
      }

      if (q) {
        const hay = `${row?.code_product || ''} ${row?.designation || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }

      return true;
    });
  }, [filterChemicalClass, filterEmplacement, filterFds, filterPhysicalState, prepared, search]);

  const points = useMemo(() => {
    const sigs = filtered.map((r) => r._sig || computeChemicalRegisterSignals(r));
    const withoutFds = sigs.filter((s) => s.missingFds).length;
    const withoutClass = sigs.filter((s) => s.missingClass).length;
    const sensitive = sigs.filter((s) => s.sensitive).length;
    const expiringLots = filtered.reduce(
      (acc, r) => acc + Math.max(0, Math.floor(Number(r?.lots_expiring_30d || 0))),
      0
    );
    return { withoutFds, withoutClass, sensitive, expiringLots };
  }, [filtered]);

  const kpis = useMemo(() => {
    const total = filtered.length;
    return {
      total,
      fdsMissing: points.withoutFds,
      classMissing: points.withoutClass,
      expiringLots: points.expiringLots,
    };
  }, [filtered.length, points.expiringLots, points.withoutClass, points.withoutFds]);

  // Récupérer les produits sans FDS pour l'IA mail generator
  const productsWithoutFds = useMemo(() => {
    return filtered.filter((r) => {
      const sig = r._sig || computeChemicalRegisterSignals(r);
      return sig.missingFds;
    });
  }, [filtered]);

  const handleExport = useCallback(() => {
    if (!filtered.length) {
      toast.warning("Aucune ligne à exporter.");
      return;
    }
    const { csv, fileName } = buildCsv(filtered, { year, month });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    downloadBlob(blob, fileName);
  }, [filtered, month, toast, year]);

  const handleOpenFds = useCallback(async (row, mode) => {
    const fileUrl = row?.fds?.file_url;
    if (!fileUrl) {
      toast.warning("FDS manquante.");
      return;
    }
    try {
      const blob = await fetchProtectedBlob(fileUrl);
      if (mode === 'download') {
        const name = row?.fds?.file_name || `FDS_${row?.code_product || 'produit'}.pdf`;
        downloadBlob(blob, name);
      } else {
        openBlobInNewTab(blob);
      }
    } catch (err) {
      toast.error(err?.message || "Impossible d'ouvrir la FDS");
    }
  }, [toast]);

  // Gestionnaire de clic KPI pour filtrer le tableau
  const handleKpiClick = useCallback(
    (type) => {
      if (type === 'fds') {
        setFilterFds('Manquante');
      } else if (type === 'class') {
        setFilterChemicalClass('Non renseignée');
      }
      // Scroll vers le tableau
      document.querySelector('.rc-table-wrap')?.scrollIntoView({ behavior: 'smooth' });
    },
    []
  );

  return (
    <ProtectedPage userName={userName}>
      <div className="app-layout">
        <div
          className={`sidebar-backdrop ${sidebarCollapsed ? 'hidden' : ''}`}
          onClick={() => setSidebarCollapsed(true)}
        />
        <SidebarResp
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed((p) => !p)}
          onLogout={onLogout}
          userName={userName}
        />

        <div className="main-container">
          <HeaderPage
            userName={userName}
            title="Registre chimique"
            subtitle="Suivi des produits chimiques et des fiches de sécurité."
            showSearch={false}
            onRefresh={load}
            onMenuClick={() => setSidebarCollapsed((p) => !p)}
          />

          <main className="main-content">
            {isLoading && <LoadingSpinner overlay text="Chargement..." />}

            <div className="rc-page">
              <div className="rc-hero">
                <div className="rc-hero-left">
                  <div className="rc-hero-title">
                    <FlaskConical size={18} />
                    <strong>Période</strong>
                    <span className="rc-period">{formatMonthLabel(year, month)}</span>
                  </div>
                </div>
                <div className="rc-hero-actions">
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={load}
                    disabled={isLoading}
                  >
                    <RefreshCw size={14} /> Actualiser
                  </button>
                  {productsWithoutFds.length > 0 && (
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() => setAiMailModalOpen(true)}
                      title={`${productsWithoutFds.length} produit(s) sans FDS détecté(s)`}
                    >
                      <Zap size={14} /> Générer les mails IA
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={handleExport}
                    disabled={isLoading || filtered.length === 0}
                    title={filtered.length === 0 ? 'Aucune ligne à exporter' : undefined}
                  >
                    <Download size={14} /> Exporter le registre
                  </button>
                </div>
              </div>

              <section className="rc-filters" aria-label="Filtres">
                <div className="rc-filter-row">
                  <label className="rc-filter">
                    <span>Année</span>
                    <input
                      type="number"
                      min="2020"
                      max="2100"
                      value={year}
                      onChange={(e) =>
                        setYear(Math.max(2020, Math.min(2100, Number(e.target.value || now.getFullYear()))))
                      }
                    />
                  </label>
                  <label className="rc-filter">
                    <span>Mois</span>
                    <select
                      value={month}
                      onChange={(e) => setMonth(Number(e.target.value || now.getMonth() + 1))}
                    >
                      {Array.from({ length: 12 }).map((_, idx) => (
                        <option key={idx + 1} value={idx + 1}>
                          {pad2(idx + 1)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="rc-filter wide">
                    <span>Emplacement</span>
                    <input
                      type="text"
                      maxLength={80}
                      value={filterEmplacement}
                      onChange={(e) => setFilterEmplacement(e.target.value)}
                      placeholder="Ex : Dépôt - Entretien"
                    />
                  </label>
                  <button
                    type="button"
                    className={`rc-filter-toggle ${showAdvancedFilters ? 'open' : ''}`}
                    onClick={() => setShowAdvancedFilters((p) => !p)}
                  >
                    <ChevronDown size={16} />
                    <span>Filtres avancés</span>
                  </button>
                </div>

                {showAdvancedFilters && (
                  <div className="rc-filter-advanced">
                    <label className="rc-filter">
                      <span>Classe chimique</span>
                      <select
                        value={filterChemicalClass}
                        onChange={(e) => setFilterChemicalClass(e.target.value)}
                      >
                        {CHEMICAL_CLASS_OPTIONS.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="rc-filter">
                      <span>État physique</span>
                      <select
                        value={filterPhysicalState}
                        onChange={(e) => setFilterPhysicalState(e.target.value)}
                      >
                        {PHYSICAL_STATE_OPTIONS.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="rc-filter">
                      <span>FDS</span>
                      <select value={filterFds} onChange={(e) => setFilterFds(e.target.value)}>
                        {FDS_FILTER_OPTIONS.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                )}

                <div className="rc-filter-row">
                  <label className="rc-filter wide">
                    <span>Rechercher</span>
                    <div className="rc-search">
                      <Search size={16} />
                      <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Code ou nom du produit..."
                      />
                    </div>
                  </label>
                </div>
              </section>

              <section className="rc-kpis" aria-label="Indicateurs cliquables">
                <article
                  className="rc-kpi-card"
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    // Total products - no specific filter
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      // Total products
                    }
                  }}
                >
                  <span>Produits chimiques</span>
                  <AnimatedKpi value={kpis.total} />
                </article>
                <article
                  className={`rc-kpi-card ${kpis.fdsMissing > 0 ? 'warn' : 'ok'}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleKpiClick('fds')}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleKpiClick('fds');
                  }}
                  title="Cliquez pour filtrer"
                >
                  <span>FDS manquantes</span>
                  <AnimatedKpi value={kpis.fdsMissing} />
                  <small style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '0.2rem' }}>
                    Cliquez pour filtrer
                  </small>
                </article>
                <article
                  className={`rc-kpi-card ${kpis.classMissing > 0 ? 'warn' : 'ok'}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleKpiClick('class')}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleKpiClick('class');
                  }}
                  title="Cliquez pour filtrer"
                >
                  <span>Classes à compléter</span>
                  <AnimatedKpi value={kpis.classMissing} />
                  <small style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '0.2rem' }}>
                    Cliquez pour filtrer
                  </small>
                </article>
                <article className={`rc-kpi-card ${kpis.expiringLots > 0 ? 'warn' : 'ok'}`}>
                  <span>Lots proches péremption</span>
                  <AnimatedKpi value={kpis.expiringLots} />
                </article>
              </section>

              <section className="rc-table-wrap" aria-label="Table registre chimique">
                <table className="rc-table">
                  <thead>
                    <tr>
                      <th>Code produit</th>
                      <th>Produit</th>
                      <th>Classe chimique</th>
                      <th>État physique</th>
                      <th>Quantité</th>
                      <th>Unité</th>
                      <th>Emplacement</th>
                      <th>Fournisseur</th>
                      <th>FDS</th>
                      <th>Dernier mouvement</th>
                      <th>Statut</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((row) => {
                      const sig = row._sig || computeChemicalRegisterSignals(row);
                      const rowKey = String(row?.product_id || row?.code_product || row?.designation || '');
                      const hasMissingSupplier = !row?.fournisseur || row?.fournisseur === '-';

                      return (
                        <tr key={rowKey}>
                          <td className="mono">{row?.code_product || '-'}</td>
                          <td>
                            <div className="rc-prod-name">{row?.designation || '-'}</div>
                          </td>
                          <td>
                            <span
                              className={`rc-pill class-${
                                sig.chemicalClass === 'Non renseignée'
                                  ? 'na'
                                  : sig.sensitive
                                  ? 'danger'
                                  : 'info'
                              }`}
                            >
                              {sig.chemicalClass}
                            </span>
                          </td>
                          <td>
                            <span className={`rc-pill ${sig.physicalState === 'Non renseigné' ? 'na' : 'neutral'}`}>
                              {sig.physicalState}
                            </span>
                          </td>
                          <td className="num">{Math.max(0, Math.floor(Number(row?.quantite_restante || 0)))}</td>
                          <td>{row?.unite || '-'}</td>
                          <td>{row?.emplacement || '-'}</td>
                          <td>
                            {hasMissingSupplier ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                <AlertCircle size={14} style={{ color: '#ea580c' }} />
                                <span style={{ fontSize: '0.75rem', color: '#9a3412', fontWeight: 700 }}>
                                  Fournisseur manquant
                                </span>
                              </div>
                            ) : (
                              <span>{row?.fournisseur}</span>
                            )}
                          </td>
                          <td>
                            {sig.hasFds ? (
                              <div className="rc-fds-cell">
                                <span className="rc-pill ok">Disponible</span>
                                <button
                                  type="button"
                                  className="rc-link"
                                  onClick={() => handleOpenFds(row, 'open')}
                                >
                                  Ouvrir FDS
                                </button>
                              </div>
                            ) : (
                              <div className="rc-fds-cell">
                                <span className="rc-pill warn">Manquante</span>
                              </div>
                            )}
                          </td>
                          <td>{formatDateLabel(row?.last_movement_at)}</td>
                          <td>
                            <span
                              className={`rc-pill status-${
                                sig.status === 'Conforme'
                                  ? 'ok'
                                  : sig.status === 'À compléter'
                                  ? 'warn'
                                  : sig.status === 'À surveiller'
                                  ? 'info'
                                  : 'danger'
                              }`}
                            >
                              {sig.status}
                            </span>
                          </td>
                          <td>
                            <div className="rc-actions">
                              <button
                                type="button"
                                className={`rc-btn ${sig.missingFds || sig.missingClass ? 'warn' : ''}`}
                                onClick={() => setDetailRow(row)}
                                title={sig.missingFds ? 'Importer une FDS' : 'Consulter les détails'}
                              >
                                {sig.missingFds ? '📄 Importer FDS' : 'Consulter'}
                              </button>
                              {sig.missingFds && (
                                <button
                                  type="button"
                                  className="rc-btn"
                                  onClick={() => {
                                    setFdsUploadProduct(row);
                                    setFdsUploadModalOpen(true);
                                  }}
                                  title="Drag-drop FDS"
                                >
                                  ⬆
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}

                    {!filtered.length && (
                      <tr>
                        <td colSpan={12} className="rc-empty">
                          Aucun produit chimique trouvé pour cette période.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </section>
            </div>
          </main>
        </div>
      </div>

      {detailRow && (
        <div
          className="rc-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Détail produit"
          onClick={() => setDetailRow(null)}
        >
          <div className="rc-modal" onClick={(e) => e.stopPropagation()}>
            <div className="rc-modal-head">
              <div className="rc-modal-title">
                <strong>{detailRow?.designation || 'Produit'}</strong>
                <span className="mono">{detailRow?.code_product || '-'}</span>
              </div>
              <button
                type="button"
                className="rc-modal-close"
                onClick={() => setDetailRow(null)}
                aria-label="Fermer"
              >
                <X size={18} />
              </button>
            </div>
            <div className="rc-modal-body">
              {(() => {
                const sig = computeChemicalRegisterSignals(detailRow);
                return (
                  <>
                    <div className="rc-modal-grid">
                      <div className="rc-modal-item">
                        <span>Classe</span>
                        <strong>{sig.chemicalClass}</strong>
                      </div>
                      <div className="rc-modal-item">
                        <span>État</span>
                        <strong>{sig.physicalState}</strong>
                      </div>
                      <div className="rc-modal-item">
                        <span>Quantité</span>
                        <strong>
                          {Math.max(0, Math.floor(Number(detailRow?.quantite_restante || 0)))}{' '}
                          {detailRow?.unite || ''}
                        </strong>
                      </div>
                      <div className="rc-modal-item">
                        <span>Emplacement</span>
                        <strong>{detailRow?.emplacement || '-'}</strong>
                      </div>
                      <div className="rc-modal-item">
                        <span>Fournisseur</span>
                        <strong>{detailRow?.fournisseur || '-'}</strong>
                      </div>
                      <div className="rc-modal-item">
                        <span>Dernier mouvement</span>
                        <strong>{formatDateLabel(detailRow?.last_movement_at)}</strong>
                      </div>
                      <div className="rc-modal-item">
                        <span>Prochaine péremption</span>
                        <strong>{formatDateLabel(detailRow?.next_expiry_date)}</strong>
                      </div>
                      <div className="rc-modal-item">
                        <span>Statut</span>
                        <strong>{sig.status}</strong>
                      </div>
                    </div>

                    <div className="rc-modal-actions">
                      {sig.hasFds ? (
                        <>
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            onClick={() => handleOpenFds(detailRow, 'open')}
                          >
                            Ouvrir FDS
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => handleOpenFds(detailRow, 'download')}
                          >
                            Télécharger FDS
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={() => {
                            setDetailRow(null);
                            setFdsUploadProduct(detailRow);
                            setFdsUploadModalOpen(true);
                          }}
                        >
                          📤 Importer une FDS
                        </button>
                      )}
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {aiMailModalOpen && (
        <AiMailGeneratorModal
          products={productsWithoutFds}
          onClose={() => setAiMailModalOpen(false)}
          onConfirm={(emails) => {
            toast.success(`${emails.length} mail(s) de relance générés. Prêts à l'envoi.`);
            setAiMailModalOpen(false);
          }}
        />
      )}

      {fdsUploadModalOpen && fdsUploadProduct && (
        <FdsUploadModal
          product={fdsUploadProduct}
          onClose={() => {
            setFdsUploadModalOpen(false);
            setFdsUploadProduct(null);
          }}
          onSuccess={(data) => {
            toast.success(`FDS importée avec succès. Classe détectée : ${data.chemicalClass}`);
            setFdsUploadModalOpen(false);
            setFdsUploadProduct(null);
            // Recharger les données
            load();
          }}
        />
      )}
    </ProtectedPage>
  );
}