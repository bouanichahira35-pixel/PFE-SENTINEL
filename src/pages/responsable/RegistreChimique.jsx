// BLOC 1 - Role du fichier.
// Ce fichier affiche la page responsable du registre chimique.
// Point de vigilance: les actions FDS doivent rester branchees sur les vrais endpoints fichiers/produits.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  ChevronDown,
  Download,
  Eye,
  FlaskConical,
  Mail,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import SidebarResp from '../../components/responsable/SidebarResp';
import HeaderPage from '../../components/shared/HeaderPage';
import ProtectedPage from '../../components/shared/ProtectedPage';
import LoadingSpinner from '../../components/shared/LoadingSpinner';
import { useToast } from '../../components/shared/Toast';
import { API_BASE, get, patch, put, uploadFile } from '../../services/api';
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

function getProductId(row) {
  return String(row?.product_id || row?._id || row?.id || '').trim();
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
  if (!absolute) throw new Error('Fichier introuvable');

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
    if (refreshed) res = await doFetch(refreshed);
  }

  if (!res.ok) throw new Error("Impossible d'ouvrir la FDS");
  return res.blob();
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

function toCsvValue(value) {
  const raw = value == null ? '' : String(value);
  return `"${raw.replace(/"/g, '""')}"`;
}

function buildCsv(rows, { year, month } = {}) {
  const header = [
    'Code produit',
    'Produit',
    'Classe chimique',
    'Etat physique',
    'Quantite disponible',
    'Unite',
    'Emplacement',
    'Fournisseur',
    'Email fournisseur',
    'FDS',
    'Dernier mouvement',
    'Statut',
  ];

  const lines = [header.map(toCsvValue).join(',')];
  (rows || []).forEach((row) => {
    const sig = computeChemicalRegisterSignals(row);
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
        row?.supplier_email || '-',
        sig.hasFds ? 'Disponible' : 'Manquante',
        formatDateLabel(row?.last_movement_at),
        sig.status,
      ].map(toCsvValue).join(',')
    );
  });

  return {
    csv: lines.join('\n'),
    fileName: `registre_chimique_${year}_${pad2(month)}.csv`,
  };
}

function buildSupplierFdsMail(row) {
  const subject = `[SENTINEL] Demande de FDS - ${row?.designation || 'Produit chimique'}`;
  const body = [
    'Madame, Monsieur,',
    '',
    'Dans le cadre du suivi de notre registre chimique, merci de nous transmettre la Fiche de Donnees de Securite (FDS) du produit suivant :',
    '',
    `Code produit : ${row?.code_product || '-'}`,
    `Designation : ${row?.designation || '-'}`,
    '',
    'Ce document est necessaire pour maintenir notre conformite securite et completer le dossier produit.',
    '',
    'Cordialement,',
    'Equipe SENTINEL',
  ].join('\n');
  return { subject, body };
}

function AnimatedKpi({ value }) {
  const [shown, setShown] = useState(0);

  useEffect(() => {
    const next = Math.max(0, Math.floor(Number(value || 0)));
    if (!Number.isFinite(next)) return undefined;
    let raf = 0;
    const started = performance.now();
    const from = shown;
    const duration = 420;
    const tick = (now) => {
      const t = Math.min(1, (now - started) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(Math.round(from + (next - from) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return <span className="rc-kpi-value">{shown}</span>;
}

function FdsUploadModal({ product, onClose, onSuccess }) {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const toast = useToast();

  const selectFile = useCallback(
    (file) => {
      const isPdf =
        String(file?.type || '').toLowerCase().includes('pdf') ||
        String(file?.name || '').toLowerCase().endsWith('.pdf');
      if (!isPdf) {
        toast.error('Veuillez choisir un fichier PDF.');
        return;
      }
      setSelectedFile(file);
    },
    [toast]
  );

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) selectFile(file);
  };

  const handleSubmit = async () => {
    const productId = getProductId(product);
    if (!productId) {
      toast.error('Produit introuvable pour enregistrer la FDS.');
      return;
    }
    if (!selectedFile) {
      toast.warning('Choisissez une FDS au format PDF.');
      return;
    }

    setIsSubmitting(true);
    try {
      const uploaded = await uploadFile('/files/upload', selectedFile);
      await put(`/products/${encodeURIComponent(productId)}`, {
        fds_attachment: {
          file_name: uploaded?.file_name || selectedFile.name,
          file_url: uploaded?.file_url,
        },
      });
      onSuccess(uploaded);
    } catch (err) {
      toast.error(err?.message || "Impossible d'enregistrer la FDS.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="rc-modal-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="rc-modal" onClick={(e) => e.stopPropagation()}>
        <div className="rc-modal-head">
          <div className="rc-modal-title">
            <Upload size={20} style={{ color: '#0284c7' }} />
            <strong>Importer FDS</strong>
            <span className="mono" style={{ fontSize: '0.85rem' }}>{product?.code_product || '-'}</span>
          </div>
          <button type="button" className="rc-modal-close" onClick={onClose} aria-label="Fermer">
            <X size={18} />
          </button>
        </div>
        <div className="rc-modal-body">
          <div
            className={`rc-dropzone ${isDragging ? 'dragging' : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
          >
            <Upload size={44} style={{ opacity: 0.5 }} />
            <p style={{ marginTop: '0.5rem', fontWeight: 700, color: '#0f172a' }}>
              Glissez-deposez un fichier PDF ici
            </p>
            <p style={{ fontSize: '0.85rem', color: '#64748b' }}>ou</p>
            <label className="rc-file-picker">
              <input
                type="file"
                accept=".pdf,application/pdf"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) selectFile(file);
                }}
                style={{ display: 'none' }}
              />
              <span className="btn btn-secondary btn-sm">Parcourir les fichiers</span>
            </label>
          </div>

          {selectedFile && (
            <div className="rc-upload-summary">
              <span>Fichier selectionne</span>
              <strong>{selectedFile.name}</strong>
            </div>
          )}

          <div className="rc-modal-actions">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={handleSubmit}
              disabled={!selectedFile || isSubmitting}
            >
              {isSubmitting ? 'Enregistrement...' : 'Enregistrer la FDS'}
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={onClose} disabled={isSubmitting}>
              Annuler
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AddProductToRegisterModal({ products, loading, search, onSearch, onAdd, onClose }) {
  const q = String(search || '').trim().toLowerCase();
  const visible = (products || []).filter((product) => {
    if (!q) return true;
    return `${product?.code_product || ''} ${product?.name || ''} ${product?.family || ''}`.toLowerCase().includes(q);
  });

  return (
    <div className="rc-modal-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="rc-modal rc-modal-lg" onClick={(e) => e.stopPropagation()}>
        <div className="rc-modal-head">
          <div className="rc-modal-title">
            <Plus size={20} style={{ color: '#0284c7' }} />
            <strong>Ajouter un produit au registre chimique</strong>
          </div>
          <button type="button" className="rc-modal-close" onClick={onClose} aria-label="Fermer">
            <X size={18} />
          </button>
        </div>
        <div className="rc-modal-body">
          <label className="rc-filter wide">
            <span>Produit existant</span>
            <div className="rc-search">
              <Search size={16} />
              <input
                type="text"
                value={search}
                onChange={(e) => onSearch(e.target.value)}
                placeholder="Chercher dans la liste magasinier..."
              />
            </div>
          </label>

          <div className="rc-candidate-list">
            {loading && <div className="rc-empty">Chargement des produits...</div>}
            {!loading && visible.map((product) => (
              <button
                type="button"
                key={String(product?._id)}
                className="rc-candidate-row"
                onClick={() => onAdd(product)}
              >
                <span className="mono">{product?.code_product || '-'}</span>
                <strong>{product?.name || 'Produit'}</strong>
                <small>{product?.family || '-'} - stock {Math.max(0, Math.floor(Number(product?.quantity_current || 0)))}</small>
              </button>
            ))}
            {!loading && visible.length === 0 && (
              <div className="rc-empty">Aucun produit disponible a ajouter.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function EditChemicalRowModal({ row, onClose, onSave }) {
  const sig = computeChemicalRegisterSignals(row);
  const [draft, setDraft] = useState(() => ({
    chemical_class: sig.chemicalClass === 'Non renseignée' ? '' : sig.chemicalClass,
    physical_state: sig.physicalState === 'Non renseigné' ? '' : sig.physicalState,
    supplier_name: row?.fournisseur || '',
    supplier_email: row?.supplier_email || '',
  }));
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    try {
      await onSave(draft);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rc-modal-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="rc-modal" onClick={(e) => e.stopPropagation()}>
        <div className="rc-modal-head">
          <div className="rc-modal-title">
            <strong>Modifier les infos HSE</strong>
            <span className="mono">{row?.code_product || '-'}</span>
          </div>
          <button type="button" className="rc-modal-close" onClick={onClose} aria-label="Fermer">
            <X size={18} />
          </button>
        </div>
        <div className="rc-modal-body">
          <div className="rc-edit-grid">
            <label className="rc-filter">
              <span>Classe chimique</span>
              <select
                value={draft.chemical_class}
                onChange={(e) => setDraft((prev) => ({ ...prev, chemical_class: e.target.value }))}
              >
                <option value="">Non renseignée</option>
                {CHEMICAL_CLASS_OPTIONS.filter((opt) => opt !== 'Tous' && !String(opt).startsWith('Non')).map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </label>
            <label className="rc-filter">
              <span>Etat physique</span>
              <select
                value={draft.physical_state}
                onChange={(e) => setDraft((prev) => ({ ...prev, physical_state: e.target.value }))}
              >
                <option value="">Non renseigné</option>
                {PHYSICAL_STATE_OPTIONS.filter((opt) => opt !== 'Tous' && !String(opt).startsWith('Non')).map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </label>
            <label className="rc-filter">
              <span>Fournisseur</span>
              <input
                type="text"
                maxLength={140}
                value={draft.supplier_name}
                onChange={(e) => setDraft((prev) => ({ ...prev, supplier_name: e.target.value }))}
                placeholder="Ex : Total Energies"
              />
            </label>
            <label className="rc-filter">
              <span>Email fournisseur</span>
              <input
                type="email"
                maxLength={140}
                value={draft.supplier_email}
                onChange={(e) => setDraft((prev) => ({ ...prev, supplier_email: e.target.value }))}
                placeholder="contact@fournisseur.com"
              />
            </label>
          </div>

          <div className="rc-modal-actions">
            <button type="button" className="btn btn-primary btn-sm" onClick={submit} disabled={saving}>
              {saving ? 'Enregistrement...' : 'Enregistrer'}
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={onClose} disabled={saving}>
              Annuler
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function RegistreChimique({ userName, onLogout }) {
  const navigate = useNavigate();
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
  const [fdsUploadProduct, setFdsUploadProduct] = useState(null);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [catalogProducts, setCatalogProducts] = useState([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [editRow, setEditRow] = useState(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await get(
        `/reports/chemical-register?year=${encodeURIComponent(year)}&month=${encodeURIComponent(month)}`
      );
      setRows(Array.isArray(data?.rows) ? data.rows : []);
    } catch (err) {
      setRows([]);
      toast.error(err?.message || 'Impossible de charger le registre chimique. Veuillez reessayer.');
    } finally {
      setIsLoading(false);
    }
  }, [month, toast, year]);

  useEffect(() => {
    load();
  }, [load]);

  const prepared = useMemo(
    () => rows.map((row) => ({ ...row, _sig: computeChemicalRegisterSignals(row) })),
    [rows]
  );

  const registeredProductIds = useMemo(
    () => new Set(rows.map((row) => getProductId(row)).filter(Boolean)),
    [rows]
  );

  const addCandidates = useMemo(
    () => (catalogProducts || []).filter((product) => {
      const id = getProductId(product);
      if (!id || registeredProductIds.has(id)) return false;
      if (String(product?.lifecycle_status || 'active') === 'archived') return false;
      return true;
    }),
    [catalogProducts, registeredProductIds]
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

      if (emp && !String(row?.emplacement || '').toLowerCase().includes(emp)) return false;

      if (q) {
        const hay = `${row?.code_product || ''} ${row?.designation || ''} ${row?.fournisseur || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }

      return true;
    });
  }, [filterChemicalClass, filterEmplacement, filterFds, filterPhysicalState, prepared, search]);

  const kpis = useMemo(() => {
    const sigs = filtered.map((row) => row._sig || computeChemicalRegisterSignals(row));
    return {
      total: filtered.length,
      fdsMissing: sigs.filter((sig) => sig.missingFds).length,
      classMissing: sigs.filter((sig) => sig.missingClass).length,
      expiringLots: filtered.reduce(
        (acc, row) => acc + Math.max(0, Math.floor(Number(row?.lots_expiring_30d || 0))),
        0
      ),
    };
  }, [filtered]);

  const handleExport = useCallback(() => {
    if (!filtered.length) {
      toast.warning('Aucune ligne a exporter.');
      return;
    }
    const { csv, fileName } = buildCsv(filtered, { year, month });
    downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), fileName);
  }, [filtered, month, toast, year]);

  const handleOpenFds = useCallback(
    async (row, mode) => {
      const fileUrl = row?.fds?.file_url;
      if (!fileUrl) {
        toast.warning('FDS manquante.');
        return;
      }
      try {
        const blob = await fetchProtectedBlob(fileUrl);
        if (mode === 'download') {
          downloadBlob(blob, row?.fds?.file_name || `FDS_${row?.code_product || 'produit'}.pdf`);
        } else {
          openBlobInNewTab(blob);
        }
      } catch (err) {
        toast.error(err?.message || "Impossible d'ouvrir la FDS.");
      }
    },
    [toast]
  );

  const handleMailSupplier = useCallback(
    (row) => {
      const email = String(row?.supplier_email || '').trim();
      if (!email) {
        toast.warning('Aucun email fournisseur disponible pour ce produit.');
        return;
      }
      const { subject, body } = buildSupplierFdsMail(row);
      window.location.href = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    },
    [toast]
  );

  const loadCatalogProducts = useCallback(async () => {
    setCatalogLoading(true);
    try {
      const data = await get('/products?include_archived=0');
      setCatalogProducts(Array.isArray(data) ? data : []);
    } catch (err) {
      setCatalogProducts([]);
      toast.error(err?.message || 'Impossible de charger les produits du magasinier.');
    } finally {
      setCatalogLoading(false);
    }
  }, [toast]);

  const openAddModal = useCallback(() => {
    setAddModalOpen(true);
    setCatalogSearch('');
    loadCatalogProducts();
  }, [loadCatalogProducts]);

  const handleAddProductToRegister = useCallback(
    async (product) => {
      const productId = getProductId(product);
      if (!productId) {
        toast.error('Produit introuvable.');
        return;
      }
      try {
        await patch(`/products/${encodeURIComponent(productId)}/chemical-register`, {
          included: true,
          excluded: false,
        });
        toast.success('Produit ajoute au registre chimique.');
        setAddModalOpen(false);
        await load();
      } catch (err) {
        toast.error(err?.message || "Impossible d'ajouter le produit au registre.");
      }
    },
    [load, toast]
  );

  const handleRemoveFromRegister = useCallback(
    async (row) => {
      const productId = getProductId(row);
      if (!productId) {
        toast.error('Produit introuvable.');
        return;
      }
      const ok = window.confirm(`Retirer ${row?.code_product || ''} - ${row?.designation || 'Produit'} du registre chimique ?`);
      if (!ok) return;
      try {
        await patch(`/products/${encodeURIComponent(productId)}/chemical-register`, {
          included: false,
          excluded: true,
        });
        toast.success('Produit retire du registre chimique.');
        load();
      } catch (err) {
        toast.error(err?.message || 'Impossible de retirer le produit du registre.');
      }
    },
    [load, toast]
  );

  const handleSaveChemicalInfo = useCallback(
    async (draft) => {
      const productId = getProductId(editRow);
      if (!productId) {
        toast.error('Produit introuvable.');
        return;
      }
      try {
        await patch(`/products/${encodeURIComponent(productId)}/chemical-register`, {
          included: true,
          excluded: false,
          chemical_class: draft.chemical_class || '',
          physical_state: draft.physical_state || '',
          supplier_name: draft.supplier_name || '',
          supplier_email: draft.supplier_email || '',
        });
        toast.success('Informations HSE enregistrees.');
        setEditRow(null);
        await load();
      } catch (err) {
        toast.error(err?.message || 'Impossible de sauvegarder les informations HSE.');
      }
    },
    [editRow, load, toast]
  );

  const handleKpiClick = useCallback((type) => {
    if (type === 'fds') setFilterFds('Manquante');
    if (type === 'class') setFilterChemicalClass('Non renseignée');
    document.querySelector('.rc-table-wrap')?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const openProductManager = useCallback(
    (row) => {
      const q = row?.code_product || row?.designation || '';
      navigate(`/responsable/produits${q ? `?q=${encodeURIComponent(q)}` : ''}`);
    },
    [navigate]
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
            subtitle="Suivi des produits chimiques et des fiches de securite."
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
                    <strong>Periode</strong>
                    <span className="rc-period">{formatMonthLabel(year, month)}</span>
                  </div>
                </div>
                <div className="rc-hero-actions">
                  <button type="button" className="btn btn-secondary btn-sm" onClick={load} disabled={isLoading}>
                    <RefreshCw size={14} /> Actualiser
                  </button>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={openAddModal}>
                    <Plus size={14} /> Ajouter produit
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={handleExport}
                    disabled={isLoading || filtered.length === 0}
                    title={filtered.length === 0 ? 'Aucune ligne a exporter' : undefined}
                  >
                    <Download size={14} /> Exporter le registre
                  </button>
                </div>
              </div>

              <section className="rc-filters" aria-label="Filtres">
                <div className="rc-filter-row">
                  <label className="rc-filter">
                    <span>Annee</span>
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
                    <select value={month} onChange={(e) => setMonth(Number(e.target.value || now.getMonth() + 1))}>
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
                      placeholder="Ex : Depot - Entretien"
                    />
                  </label>
                  <button
                    type="button"
                    className={`rc-filter-toggle ${showAdvancedFilters ? 'open' : ''}`}
                    onClick={() => setShowAdvancedFilters((p) => !p)}
                  >
                    <ChevronDown size={16} />
                    <span>Filtres avances</span>
                  </button>
                </div>

                {showAdvancedFilters && (
                  <div className="rc-filter-advanced">
                    <label className="rc-filter">
                      <span>Classe chimique</span>
                      <select value={filterChemicalClass} onChange={(e) => setFilterChemicalClass(e.target.value)}>
                        {CHEMICAL_CLASS_OPTIONS.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="rc-filter">
                      <span>Etat physique</span>
                      <select value={filterPhysicalState} onChange={(e) => setFilterPhysicalState(e.target.value)}>
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
                        placeholder="Code, nom ou fournisseur..."
                      />
                    </div>
                  </label>
                </div>
              </section>

              <section className="rc-kpis" aria-label="Indicateurs cliquables">
                <article className="rc-kpi-card">
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
                  <span>Classes a completer</span>
                  <AnimatedKpi value={kpis.classMissing} />
                </article>
                <article className={`rc-kpi-card ${kpis.expiringLots > 0 ? 'warn' : 'ok'}`}>
                  <span>Lots proches peremption</span>
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
                      <th>Etat physique</th>
                      <th>Quantite</th>
                      <th>Unite</th>
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
                      const rowKey = String(getProductId(row) || row?.code_product || row?.designation || '');
                      const hasMissingSupplier = !row?.fournisseur || row?.fournisseur === '-';
                      const supplierEmail = String(row?.supplier_email || '').trim();
                      const quantity = Math.max(0, Math.floor(Number(row?.quantite_restante || 0)));

                      return (
                        <tr key={rowKey}>
                          <td className="mono">{row?.code_product || '-'}</td>
                          <td>
                            <div className="rc-prod-name">{row?.designation || '-'}</div>
                          </td>
                          <td>
                            <span
                              className={`rc-pill ${
                                sig.chemicalClass === 'Non renseignée'
                                  ? 'na'
                                  : sig.sensitive
                                    ? 'status-danger'
                                    : 'status-info'
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
                          <td className="num">{quantity}</td>
                          <td>{row?.unite || '-'}</td>
                          <td>{row?.emplacement || '-'}</td>
                          <td>
                            {hasMissingSupplier ? (
                              <div className="rc-missing-supplier">
                                <AlertCircle size={14} />
                                <span>Fournisseur manquant</span>
                              </div>
                            ) : (
                              <button
                                type="button"
                                className="rc-supplier-link"
                                onClick={() =>
                                  row?.supplier_id
                                    ? navigate(`/responsable/fournisseurs/${encodeURIComponent(row.supplier_id)}`)
                                    : openProductManager(row)
                                }
                              >
                                {row?.fournisseur}
                              </button>
                            )}
                          </td>
                          <td>
                            <div className="rc-fds-cell">
                              {sig.hasFds ? (
                                <>
                                  <span className="rc-pill ok">Disponible</span>
                                  <button type="button" className="rc-icon-btn" onClick={() => handleOpenFds(row, 'open')} title="Voir le PDF FDS">
                                    <Eye size={14} />
                                    Voir PDF
                                  </button>
                                  <button type="button" className="rc-link" onClick={() => handleOpenFds(row, 'download')}>
                                    Telecharger
                                  </button>
                                </>
                              ) : (
                                <>
                                  <span className="rc-pill warn">Manquante</span>
                                  <button type="button" className="rc-btn warn" onClick={() => setFdsUploadProduct(row)}>
                                    <Upload size={14} />
                                    Importer PDF
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                          <td>{row?.last_movement_at ? formatDateLabel(row.last_movement_at) : 'Aucun mouvement'}</td>
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
                              <button type="button" className="rc-btn" onClick={() => setDetailRow(row)}>
                                Détails
                              </button>
                              <button type="button" className="rc-btn" onClick={() => setEditRow(row)}>
                                Modifier
                              </button>
                              <button
                                type="button"
                                className="rc-btn"
                                onClick={() => handleMailSupplier(row)}
                                disabled={!supplierEmail}
                                title={supplierEmail ? `Ecrire a ${supplierEmail}` : 'Email fournisseur manquant'}
                              >
                                <Mail size={14} />
                                Mail FDS
                              </button>
                              <button
                                type="button"
                                className="rc-btn danger"
                                onClick={() => handleRemoveFromRegister(row)}
                                title="Retirer du registre chimique sans supprimer du catalogue"
                              >
                                <Trash2 size={14} />
                                Retirer
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}

                    {!filtered.length && (
                      <tr>
                        <td colSpan={12} className="rc-empty">
                          Aucun produit chimique trouve pour cette periode.
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
          aria-label="Detail produit"
          onClick={() => setDetailRow(null)}
        >
          <div className="rc-modal" onClick={(e) => e.stopPropagation()}>
            <div className="rc-modal-head">
              <div className="rc-modal-title">
                <strong>{detailRow?.designation || 'Produit'}</strong>
                <span className="mono">{detailRow?.code_product || '-'}</span>
              </div>
              <button type="button" className="rc-modal-close" onClick={() => setDetailRow(null)} aria-label="Fermer">
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
                        <span>Etat</span>
                        <strong>{sig.physicalState}</strong>
                      </div>
                      <div className="rc-modal-item">
                        <span>Quantite</span>
                        <strong>
                          {Math.max(0, Math.floor(Number(detailRow?.quantite_restante || 0)))} {detailRow?.unite || ''}
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
                        <span>Email fournisseur</span>
                        <strong>{detailRow?.supplier_email || '-'}</strong>
                      </div>
                      <div className="rc-modal-item">
                        <span>Dernier mouvement</span>
                        <strong>{detailRow?.last_movement_at ? formatDateLabel(detailRow.last_movement_at) : 'Aucun mouvement'}</strong>
                      </div>
                      <div className="rc-modal-item">
                        <span>Prochaine peremption</span>
                        <strong>{formatDateLabel(detailRow?.next_expiry_date)}</strong>
                      </div>
                    </div>

                    <div className="rc-modal-actions">
                      {sig.hasFds ? (
                        <>
                          <button type="button" className="btn btn-primary btn-sm" onClick={() => handleOpenFds(detailRow, 'open')}>
                            Ouvrir FDS
                          </button>
                          <button type="button" className="btn btn-secondary btn-sm" onClick={() => handleOpenFds(detailRow, 'download')}>
                            Telecharger FDS
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={() => {
                            setDetailRow(null);
                            setFdsUploadProduct(detailRow);
                          }}
                        >
                          Importer une FDS
                        </button>
                      )}
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => handleMailSupplier(detailRow)}>
                        Demander au fournisseur
                      </button>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {addModalOpen && (
        <AddProductToRegisterModal
          products={addCandidates}
          loading={catalogLoading}
          search={catalogSearch}
          onSearch={setCatalogSearch}
          onAdd={handleAddProductToRegister}
          onClose={() => setAddModalOpen(false)}
        />
      )}

      {editRow && (
        <EditChemicalRowModal
          row={editRow}
          onClose={() => setEditRow(null)}
          onSave={handleSaveChemicalInfo}
        />
      )}

      {fdsUploadProduct && (
        <FdsUploadModal
          product={fdsUploadProduct}
          onClose={() => setFdsUploadProduct(null)}
          onSuccess={() => {
            toast.success('FDS importee et rattachee au produit.');
            setFdsUploadProduct(null);
            load();
          }}
        />
      )}
    </ProtectedPage>
  );
}
