import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Bot, FileText, RefreshCw, Search, ShieldCheck, Users } from 'lucide-react';
import SidebarAdmin from '../../components/admin/SidebarAdmin';
import HeaderPage from '../../components/shared/HeaderPage';
import LoadingSpinner from '../../components/shared/LoadingSpinner';
import { get } from '../../services/api';
import { useToast } from '../../components/shared/Toast';
import { getUiErrorMessage } from '../../services/uiError';
import './AdminDashboard.css';
import './AdminAudit.css';

function safeStr(value) {
  return String(value || '').trim();
}

function formatDateTime(value) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString('fr-FR');
}

function describeAction(item) {
  const type = safeStr(item?.action_type);
  const tags = Array.isArray(item?.tags) ? item.tags : [];
  if (type === 'user_create') return 'Création utilisateur';
  if (type === 'block') return 'Blocage / Déblocage';
  if (type === 'user_update') {
    if (tags.includes('role_change')) return 'Changement de rôle';
    if (tags.includes('password_reset')) return 'Réinitialisation mot de passe';
    if (tags.includes('service_direction')) return 'Mise à jour service/direction';
    if (tags.includes('demandeur_profile')) return 'Mise à jour profil catalogue';
    return 'Mise à jour utilisateur';
  }
  if (type === 'ai_admin') return 'Action IA admin';
  if (type === 'inventory') return 'Inventaire';
  if (type === 'purchase_order') return 'Commande fournisseur';
  if (type === 'supplier') return 'Fournisseur';
  if (type === 'stock_rules_apply') return 'Application règles stock';
  if (type === 'stock_rules_update') return 'Mise à jour règles stock';
  if (type === 'stock_rules_reset') return 'Réinitialisation règles stock';
  if (type === 'validation') return 'Validation';
  if (type === 'entry') return 'Entrée stock';
  if (type === 'exit') return 'Sortie stock';
  if (type === 'request') return 'Demande';
  if (type === 'decision') return 'Décision';
  return type || '-';
}

function isUserAction(type) {
  return ['user_create', 'user_update', 'block'].includes(safeStr(type));
}

function isStockAction(type) {
  return ['entry', 'exit', 'inventory', 'stock_rules_apply', 'stock_rules_update', 'stock_rules_reset'].includes(safeStr(type));
}

function isSensitiveAction(item) {
  const type = safeStr(item?.action_type);
  const tags = Array.isArray(item?.tags) ? item.tags : [];
  return ['block', 'user_update', 'ai_admin'].includes(type) || tags.includes('role_change') || tags.includes('password_reset');
}

export default function AdminAudit({ userName, onLogout }) {
  const toast = useToast();
  const toastRef = useRef(toast);
  const errorNotifiedRef = useRef(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= 768 : false));
  const [isLoading, setIsLoading] = useState(false);
  const [items, setItems] = useState([]);
  const [q, setQ] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');

  useEffect(() => {
    toastRef.current = toast;
  }, [toast]);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await get('/admin/audit-history?limit=200&page=1');
      const rows = Array.isArray(res?.items) ? res.items : [];
      setItems(rows);
      errorNotifiedRef.current = false;
    } catch (err) {
      if (!errorNotifiedRef.current) {
        toastRef.current.error(getUiErrorMessage(err, 'Historique admin indisponible pour le moment.'));
        errorNotifiedRef.current = true;
      }
      setItems([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const needle = safeStr(q).toLowerCase();
    return (items || []).filter((x) => {
      const t = safeStr(x?.action_type);
      if (typeFilter === 'user' && !isUserAction(t)) return false;
      if (typeFilter === 'ia' && t !== 'ai_admin') return false;
      if (typeFilter === 'stock' && !isStockAction(t)) return false;
      if (typeFilter === 'security' && !isSensitiveAction(x)) return false;
      if (typeFilter && !['all', 'user', 'ia', 'stock', 'security'].includes(typeFilter) && t !== typeFilter) return false;

      if (!needle) return true;
      const ctx = x?.context && typeof x.context === 'object' ? x.context : {};
      const parts = [
        x?.description,
        x?.action_type,
        describeAction(x),
        x?.actor_role,
        x?.user?.username,
        x?.user?.email,
        ctx?.target_username,
        ctx?.target_email,
        ctx?.reason,
      ]
        .map((p) => safeStr(p).toLowerCase())
        .filter(Boolean);
      return parts.some((p) => p.includes(needle));
    });
  }, [items, q, typeFilter]);

  const summary = useMemo(() => {
    const rows = Array.isArray(items) ? items : [];
    return {
      total: rows.length,
      visible: filtered.length,
      userActions: rows.filter((x) => isUserAction(x?.action_type)).length,
      aiActions: rows.filter((x) => safeStr(x?.action_type) === 'ai_admin').length,
      sensitive: rows.filter((x) => isSensitiveAction(x)).length,
    };
  }, [filtered.length, items]);

  const rows = useMemo(() => filtered.map((x) => {
    const ctx = x?.context && typeof x.context === 'object' ? x.context : {};
    const actor = x?.user?.username || x?.user?.email || x?.actor_role || '-';
    const target = ctx?.target_username || ctx?.target_email || ctx?.target_user_id || x?.product?.name || x?.request?._id || '-';
    const reason = safeStr(ctx?.reason) || safeStr(ctx?.result) || '-';
    return {
      id: String(x?._id || `${x?.action_type}-${x?.date_action}`),
      date: x?.date_action || x?.createdAt || null,
      action: describeAction(x),
      target,
      actor,
      details: safeStr(x?.description) || '-',
      reason,
    };
  }), [filtered]);

  return (
    <div className="admin-layout">
      <SidebarAdmin
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((p) => !p)}
        onLogout={onLogout}
        userName={userName}
      />
      <div className={`admin-main ${sidebarCollapsed ? 'collapsed' : ''}`}>
        <HeaderPage
          userName={userName}
          title="Historique / Audit"
          subtitle="Traçabilité des actions sensibles et des opérations métier"
          icon={<FileText size={24} />}
          showSearch={false}
          onRefresh={load}
        />
        {isLoading && <LoadingSpinner overlay text="Chargement..." />}

        <div className="admin-page">
          <div className="admin-audit-summary">
            <div className="admin-audit-kpi">
              <FileText size={18} />
              <div><strong>{summary.total}</strong><span>Actions chargées</span></div>
            </div>
            <div className="admin-audit-kpi">
              <Users size={18} />
              <div><strong>{summary.userActions}</strong><span>Actions comptes</span></div>
            </div>
            <div className="admin-audit-kpi">
              <Bot size={18} />
              <div><strong>{summary.aiActions}</strong><span>Actions IA</span></div>
            </div>
            <div className="admin-audit-kpi danger">
              <AlertTriangle size={18} />
              <div><strong>{summary.sensitive}</strong><span>Actions sensibles</span></div>
            </div>
          </div>

          <div className="admin-audit-toolbar">
            <div className="admin-audit-search">
              <Search size={16} />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher acteur, cible, motif ou action..." />
            </div>

            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} disabled={isLoading}>
              <option value="all">Toutes les actions</option>
              <option value="security">Actions sensibles</option>
              <option value="user">Utilisateurs</option>
              <option value="ia">IA admin</option>
              <option value="stock">Stock & inventaires</option>
              <option value="user_create">Créations</option>
              <option value="user_update">Modifications</option>
              <option value="block">Blocages / Déblocages</option>
            </select>

            <button className="admin-btn" type="button" onClick={load} disabled={isLoading}>
              <RefreshCw size={16} />
              <span>Actualiser</span>
            </button>
          </div>

          <div className="admin-audit-table">
            <div className="admin-audit-caption">
              <ShieldCheck size={16} />
              <span>{summary.visible} action(s) affichée(s). Historique append-only, non modifiable depuis la console.</span>
            </div>
            <div className="admin-audit-head">
              <div>Date</div>
              <div>Action</div>
              <div>Cible</div>
              <div>Acteur</div>
              <div>Détails</div>
              <div>Motif / résultat</div>
            </div>
            {rows.map((r) => (
              <div key={r.id} className="admin-audit-row">
                <div className="mono">{formatDateTime(r.date)}</div>
                <div className="strong">{r.action}</div>
                <div>{r.target}</div>
                <div>{r.actor}</div>
                <div className="details" title={r.details}>{r.details}</div>
                <div className="details" title={r.reason}>{r.reason}</div>
              </div>
            ))}
            {!rows.length ? <div className="admin-audit-empty">Aucune entrée pour ce filtre.</div> : null}
          </div>
        </div>
      </div>
    </div>
  );
}
