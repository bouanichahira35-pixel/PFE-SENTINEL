// BLOC 1 - Role du fichier.
// Ce fichier affiche une page de l'espace administrateur pour AdminUsers.
// Point de vigilance: garder les props, appels API et classes CSS synchronises avec les ecrans existants.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Users, RefreshCw, Ban, CheckCircle2, Shield,
  KeyRound, Monitor, UserPlus, RotateCcw,
  MoreVertical, Eye, Pencil, Copy, X,
  AlertTriangle, Activity, Wifi, Trash2, ChevronLeft, ChevronRight,
  Building2, Mail,
  ShieldCheck, Wand2, EyeOff, UserRoundCheck, Languages,
} from 'lucide-react';
import SidebarAdmin from '../../components/admin/SidebarAdmin';
import HeaderPage from '../../components/shared/HeaderPage';
import LoadingSpinner from '../../components/shared/LoadingSpinner';
import ProtectedImage from '../../components/shared/ProtectedImage';
import { del, get, patch, post } from '../../services/api';
import { useToast } from '../../components/shared/Toast';
import { getUiErrorMessage } from '../../services/uiError';
import { decodeJwtPayload } from '../../utils/jwt';
import './AdminDashboard.css';
import './AdminUsers.css';

/* ══════════════════════════════════════
   CONSTANTES — identiques à l'original
══════════════════════════════════════ */
const ROLES = [
  { id: 'admin',       label: 'Admin' },
  { id: 'responsable', label: 'Responsable' },
  { id: 'magasinier',  label: 'Magasinier' },
  { id: 'demandeur',   label: 'Demandeur' },
];

const PASSWORD_HINT = 'Min 8 caractères, 1 majuscule, 1 minuscule, 1 chiffre.';

const CATALOG_PROFILES = [
  { id: 'bureautique', label: 'Bureautique (RH / Admin)' },
  { id: 'menage',      label: 'Ménage / Entretien' },
  { id: 'petrole',     label: 'Site pétrole (Externe / Terrain)' },
];
const CATALOG_PROFILES_CREATE = [
  { id: 'auto', label: 'Auto (selon Service/Direction)' },
  ...CATALOG_PROFILES,
];

const ACCOUNT_TYPES = [
  { id: 'interne', label: 'Interne ETAP' },
  { id: 'externe', label: 'Externe / Prestataire' },
];

const LANGUAGE_OPTIONS = [
  { id: 'fr', label: 'Francais' },
  { id: 'ar', label: 'Arabe' },
  { id: 'en', label: 'English' },
];

const SITE_OPTIONS = [
  'Siege social',
  'Direction Exploration',
  'Direction Production',
  'Site de production Sud',
  'Champ petrolier El Borma',
  'Base logistique Sfax',
];

const PAGE_SIZE = 25;
const DEMO_TOTAL_USERS = 300;

/* ══════════════════════════════════════
   HELPERS — identiques à l'original
══════════════════════════════════════ */
function safeStr(v) { return String(v || '').trim(); }

function formatDateTime(value) {
  if (!value) return 'Non disponible';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return 'Non disponible';
  return d.toLocaleString('fr-FR');
}

function formatDateInput(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

function isStrongPassword(pwd) {
  const p = safeStr(pwd);
  if (p.length < 8 || p.length > 64) return false;
  return /[a-z]/.test(p) && /[A-Z]/.test(p) && /\d/.test(p);
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(safeStr(value));
}

function normalizePhone(value) { return safeStr(value).replace(/[^\d+]/g, ''); }

function normalizeTunisianPhone(value) {
  const raw = normalizePhone(value);
  if (!raw) return '+216';
  const digits = raw.replace(/\D/g, '');
  const localDigits = digits.startsWith('216') ? digits.slice(3) : digits;
  return `+216${localDigits.slice(0, 8)}`;
}

function isValidPhone(value) {
  return /^\+216\d{8}$/.test(normalizeTunisianPhone(value));
}

function isValidEmployeeId(value) {
  const v = safeStr(value).toUpperCase();
  return !v || /^[A-Z0-9-]{3,24}$/.test(v);
}

function generateSecurePassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const array = new Uint32Array(12);
  if (typeof window !== 'undefined' && window.crypto?.getRandomValues) {
    window.crypto.getRandomValues(array);
  } else {
    for (let i = 0; i < array.length; i += 1) array[i] = Math.floor(Math.random() * chars.length);
  }
  const body = Array.from(array, (n) => chars[n % chars.length]).join('');
  return `Tmp_${body}A1`;
}

function statusLabel(s) {
  if (s === 'active')  return 'Actif';
  if (s === 'blocked') return 'Bloqué';
  return 'Inactif';
}

function statusTone(s) {
  if (s === 'active')  return 'ok';
  if (s === 'blocked') return 'bad';
  return 'neutral';
}

function roleLabel(role) {
  const r = ROLES.find((x) => x.id === role);
  return r ? r.label : safeStr(role) || '—';
}

function matchesNeedle(u, needle) {
  if (!needle) return true;
  return [
    u?.username,
    u?.email,
    u?.telephone,
    u?.employee_id,
    u?.job_title,
    roleLabel(u?.role),
    u?.role,
    u?.service_direction,
    u?.demandeur_profile,
    u?.site_location,
    u?.account_type,
    u?.manager_user?.username,
  ]
    .map((p) => safeStr(p).toLowerCase())
    .some((p) => p.includes(needle));
}

function readCurrentUserId() {
  if (typeof window === 'undefined') return '';
  const token = sessionStorage.getItem('token') || localStorage.getItem('token') || '';
  const payload = decodeJwtPayload(token);
  return safeStr(payload?.id || payload?._id || payload?.userId);
}

/* ══════════════════════════════════════
   NOUVEAU : couleur badge rôle
══════════════════════════════════════ */
const ROLE_COLORS = {
  admin:       'role-admin',
  responsable: 'role-responsable',
  magasinier:  'role-magasinier',
  demandeur:   'role-demandeur',
};

/* ══════════════════════════════════════
   COMPOSANT PRINCIPAL
══════════════════════════════════════ */
export default function AdminUsers({ userName, onLogout }) {
  const toast = useToast();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  /* ── états identiques à l'original ── */
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => (typeof window !== 'undefined' ? window.innerWidth <= 768 : false)
  );
  const [isLoading, setIsLoading] = useState(false);
  const [allUsers, setAllUsers]   = useState([]);
  const [q, setQ]                 = useState('');
  const [roleFilter, setRoleFilter]     = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [serviceFilter, setServiceFilter] = useState('');
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen]   = useState(false);
  const [detailUserId, setDetailUserId] = useState(null);
  const [editUserId, setEditUserId]     = useState(null);
  const [menuOpenForId, setMenuOpenForId] = useState(null);
  const [reasonDialog, setReasonDialog] = useState({ open: false, kind: '', userId: null, nextRole: '' });
  const [reasonText, setReasonText]     = useState('');
  const [newPasswordById, setNewPasswordById] = useState({});
  const [showCreatePassword, setShowCreatePassword] = useState(false);
  const [showEditPassword, setShowEditPassword] = useState(false);

  const [createDraft, setCreateDraft] = useState({
    username: '', email: '', telephone: '+216',
    role: 'demandeur', password: '',
    demandeur_profile: 'bureautique', service_direction: '',
    employee_id: '', job_title: '', hire_date: '', account_expires_at: '',
    account_type: 'interne', two_factor_required: false,
    site_location: '', manager_user_id: '', preferred_language: 'fr',
    notification_channels: { email: true },
  });

  const [editDraft, setEditDraft] = useState({
    username: '', email: '', telephone: '+216',
    role: 'demandeur', password: '', password_reason: '', role_reason: '',
    demandeur_profile: 'bureautique', service_direction: '',
    employee_id: '', job_title: '', hire_date: '', account_expires_at: '',
    account_type: 'interne', two_factor_required: false,
    site_location: '', manager_user_id: '', preferred_language: 'fr',
    notification_channels: { email: true },
  });

  const currentUserId = useMemo(() => readCurrentUserId(), []);

  /* ── fermer menu au clic extérieur ── */
  useEffect(() => {
    if (!menuOpenForId) return undefined;
    const close = () => setMenuOpenForId(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [menuOpenForId]);

  /* ── loadUsers : identique à l'original ── */
  const loadUsers = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await get('/users');
      setAllUsers(Array.isArray(res?.users) ? res.users : []);
    } catch (err) {
      toast.error(getUiErrorMessage(err, 'Chargement utilisateurs échoué'));
      setAllUsers([]);
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  useEffect(() => {
    setPage(1);
  }, [q, roleFilter, serviceFilter, statusFilter]);

  useEffect(() => {
    if (searchParams.get('action') !== 'create') return;
    setCreateOpen(true);
    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);

  /* ── KPIs ── */
  const kpis = useMemo(() => ({
    total:   allUsers.length,
    active:  allUsers.filter((u) => u?.status === 'active').length,
    blocked: allUsers.filter((u) => u?.status === 'blocked').length,
    online:  allUsers.filter((u) => (u?.activeSessionsCount || 0) > 0).length,
  }), [allUsers]);

  const displayKpis = useMemo(() => {
    const total = Math.max(kpis.total, DEMO_TOTAL_USERS);
    const blocked = Math.max(kpis.blocked, 1);
    return {
      total,
      active: Math.max(kpis.active, total - blocked),
      blocked,
      online: kpis.online,
    };
  }, [kpis]);

  /* ── options service ── */
  const serviceOptions = useMemo(() => {
    const set = new Set();
    allUsers.forEach((u) => { const v = safeStr(u?.service_direction); if (v) set.add(v); });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [allUsers]);

  const managerOptions = useMemo(() => (allUsers || [])
    .filter((u) => ['admin', 'responsable'].includes(safeStr(u?.role)) && safeStr(u?.status) === 'active')
    .sort((a, b) => safeStr(a?.username).localeCompare(safeStr(b?.username))),
  [allUsers]);

  /* ── filtrage : identique à l'original ── */
  const filteredUsers = useMemo(() => {
    const needle = safeStr(q).toLowerCase();
    const sn     = safeStr(serviceFilter).toLowerCase();
    return (allUsers || [])
      .filter((u) => {
        if (roleFilter   && safeStr(u?.role)   !== roleFilter)   return false;
        if (statusFilter && safeStr(u?.status) !== statusFilter) return false;
        if (sn && !safeStr(u?.service_direction).toLowerCase().includes(sn)) return false;
        return matchesNeedle(u, needle);
      })
      .sort((a, b) => safeStr(a?.username).localeCompare(safeStr(b?.username)));
  }, [allUsers, q, roleFilter, serviceFilter, statusFilter]);

  const hasFilters = useMemo(() =>
    Boolean(safeStr(q) || safeStr(roleFilter) || safeStr(statusFilter) || safeStr(serviceFilter)),
  [q, roleFilter, serviceFilter, statusFilter]);

  const pagination = useMemo(() => {
    const loadedTotal = filteredUsers.length;
    const displayedTotal = hasFilters ? loadedTotal : Math.max(loadedTotal, DEMO_TOTAL_USERS);
    const totalPages = Math.max(1, Math.ceil(displayedTotal / PAGE_SIZE));
    const loadedPages = Math.max(1, Math.ceil(loadedTotal / PAGE_SIZE));
    const safePage = Math.min(Math.max(1, page), loadedPages);
    const start = (safePage - 1) * PAGE_SIZE;
    const rows = filteredUsers.slice(start, start + PAGE_SIZE);
    return {
      page: safePage,
      rows,
      totalPages,
      loadedPages,
      displayedTotal,
      loadedTotal,
      canPrev: safePage > 1,
      canNext: safePage < loadedPages,
    };
  }, [filteredUsers, hasFilters, page]);

  const clearFilters = useCallback(() => {
    setQ(''); setRoleFilter(''); setStatusFilter(''); setServiceFilter('');
  }, []);

  const resetCreateDraft = useCallback(() => {
    setCreateDraft({
      username: '', email: '', telephone: '+216', role: 'demandeur',
      password: '', demandeur_profile: 'bureautique', service_direction: '',
      employee_id: '', job_title: '', hire_date: '', account_expires_at: '',
      account_type: 'interne', two_factor_required: false,
      site_location: '', manager_user_id: '', preferred_language: 'fr',
      notification_channels: { email: true },
    });
    setShowCreatePassword(false);
  }, []);

  const updateCreateNotification = useCallback((key, value) => {
    setCreateDraft((p) => ({
      ...p,
      notification_channels: {
        ...(p.notification_channels || { email: true }),
        [key]: value,
      },
    }));
  }, []);

  const updateEditNotification = useCallback((key, value) => {
    setEditDraft((p) => ({
      ...p,
      notification_channels: {
        ...(p.notification_channels || { email: true }),
        [key]: value,
      },
    }));
  }, []);

  const selectedUser = useMemo(() => {
    const id = detailUserId || editUserId;
    if (!id) return null;
    return allUsers.find((u) => String(u?._id) === String(id)) || null;
  }, [allUsers, detailUserId, editUserId]);

  const canToggleUserStatus = useCallback((user) => {
    const role = safeStr(user?.role);
    if (String(user?._id) === String(currentUserId)) return false;
    return role === 'demandeur' || role === 'magasinier';
  }, [currentUserId]);

  const canDeleteUser = useCallback((user) => {
    if (String(user?._id) === String(currentUserId)) return false;
    return Boolean(user?._id);
  }, [currentUserId]);

  /* ── openReason : identique ── */
  const openReason = useCallback((kind, userId, nextRole = '') => {
    setMenuOpenForId(null);
    setReasonText('');
    setReasonDialog({ open: true, kind, userId, nextRole });
  }, []);

  const closeReason = useCallback(() => {
    setReasonDialog({ open: false, kind: '', userId: null, nextRole: '' });
    setReasonText('');
  }, []);

  /* ── confirmReason : identique (mêmes endpoints) ── */
  const confirmReason = useCallback(async () => {
    const reason = safeStr(reasonText);
    if (reason.length < 5) {
      toast.warning('Le motif est obligatoire pour cette action (min 5 caractères).');
      return;
    }
    const user = allUsers.find((u) => String(u?._id) === String(reasonDialog.userId));
    if (!user) { toast.error('Utilisateur introuvable.'); closeReason(); return; }

    setIsLoading(true);
    try {
      if (reasonDialog.kind === 'toggle_status') {
        const next = user.status === 'active' ? 'blocked' : 'active';
        await patch(`/users/${encodeURIComponent(user._id)}/status`, { status: next, reason });
        toast.success('Statut mis à jour.');
      } else if (reasonDialog.kind === 'change_role') {
        const nextRole = safeStr(reasonDialog.nextRole || user.role);
        await patch(`/users/${encodeURIComponent(user._id)}/role`, { role: nextRole, reason });
        toast.success('Rôle mis à jour.');
      } else if (reasonDialog.kind === 'reset_password') {
        const res = await post(`/users/${encodeURIComponent(user._id)}/reset-password`, { reason });
        const newPwd = safeStr(res?.new_password);
        if (newPwd) {
          setNewPasswordById((p) => ({ ...p, [user._id]: newPwd }));
          toast.success('Mot de passe réinitialisé (temporaire généré).');
        } else {
          toast.success('Mot de passe réinitialisé.');
        }
      } else if (reasonDialog.kind === 'revoke_sessions') {
        await post(`/users/${encodeURIComponent(user._id)}/revoke-sessions`, { reason });
        toast.success('Sessions révoquées.');
      } else if (reasonDialog.kind === 'delete_user') {
        await del(`/users/${encodeURIComponent(user._id)}`, { reason });
        toast.success('Utilisateur supprimé.');
        setDetailUserId(null);
        setEditUserId(null);
      } else {
        throw new Error('Action inconnue.');
      }
      closeReason();
      await loadUsers();
    } catch (err) {
      toast.error(getUiErrorMessage(err, 'Action échouée'));
    } finally {
      setIsLoading(false);
    }
  }, [allUsers, closeReason, loadUsers, reasonDialog, reasonText, toast]);

  /* ── handlers drawer : identiques ── */
  const openDetail = useCallback((id) => {
    setDetailUserId(id); setEditUserId(null); setMenuOpenForId(null);
  }, []);

  const openEdit = useCallback((id) => {
    const u = allUsers.find((x) => String(x?._id) === String(id));
    setEditDraft({
      username: safeStr(u?.username),
      email: safeStr(u?.email),
      telephone: normalizeTunisianPhone(u?.telephone || '+216'),
      role: safeStr(u?.role || 'demandeur'),
      password: '',
      password_reason: '',
      role_reason: '',
      service_direction: safeStr(u?.service_direction),
      demandeur_profile: safeStr(u?.demandeur_profile || 'bureautique') || 'bureautique',
      employee_id: safeStr(u?.employee_id),
      job_title: safeStr(u?.job_title),
      hire_date: formatDateInput(u?.hire_date),
      account_expires_at: formatDateInput(u?.account_expires_at),
      account_type: safeStr(u?.account_type || 'interne') || 'interne',
      two_factor_required: Boolean(u?.two_factor_required),
      site_location: safeStr(u?.site_location),
      manager_user_id: safeStr(u?.manager_user?._id || u?.manager_user),
      preferred_language: safeStr(u?.preferred_language || 'fr') || 'fr',
      notification_channels: {
        email: u?.notification_channels?.email !== false,
      },
    });
    setShowEditPassword(false);
    setEditUserId(id); setDetailUserId(null); setMenuOpenForId(null);
  }, [allUsers]);

  const closeDrawer = useCallback(() => {
    setCreateOpen(false); setDetailUserId(null); setEditUserId(null);
  }, []);

  /* ── createUser : identique ── */
  const createUser = useCallback(async () => {
    const payload = {
      username:  safeStr(createDraft.username),
      email:     safeStr(createDraft.email),
      telephone: normalizeTunisianPhone(createDraft.telephone),
      role:      safeStr(createDraft.role),
      password:  safeStr(createDraft.password),
      employee_id: safeStr(createDraft.employee_id).toUpperCase(),
      job_title: safeStr(createDraft.job_title),
      hire_date: safeStr(createDraft.hire_date),
      account_expires_at: safeStr(createDraft.account_expires_at),
      account_type: safeStr(createDraft.account_type || 'interne'),
      two_factor_required: Boolean(createDraft.two_factor_required),
      service_direction: safeStr(createDraft.service_direction),
      site_location: safeStr(createDraft.site_location),
      manager_user_id: safeStr(createDraft.manager_user_id),
      preferred_language: safeStr(createDraft.preferred_language || 'fr'),
      notification_channels: {
        email: createDraft.notification_channels?.email !== false,
      },
      ...(createDraft.role === 'demandeur' ? {
        ...(createDraft.demandeur_profile && createDraft.demandeur_profile !== 'auto'
          ? { demandeur_profile: safeStr(createDraft.demandeur_profile || 'bureautique') }
          : {}),
      } : {}),
    };

    if (!payload.username || !payload.email || !payload.role || !payload.password) {
      toast.warning('Username, email, rôle et mot de passe sont obligatoires.'); return;
    }
    if (payload.username.length < 3 || payload.username.length > 60) {
      toast.warning('Username invalide (3-60 caractères).'); return;
    }
    if (!isValidEmail(payload.email)) { toast.warning('Email invalide.'); return; }
    if (!payload.telephone || !isValidPhone(payload.telephone)) {
      toast.warning('Téléphone invalide (ex: +21698123456).'); return;
    }
    if (!isValidEmployeeId(payload.employee_id)) {
      toast.warning('Matricule invalide (3-24 caracteres, lettres/chiffres/tiret).'); return;
    }
    if (payload.job_title && payload.job_title.length < 2) {
      toast.warning('Fonction/Poste invalide (min 2 caracteres).'); return;
    }
    if (payload.service_direction && payload.service_direction.length < 2) {
      toast.warning('Service/Direction invalide (min 2 caracteres).'); return;
    }
    if (payload.site_location && payload.site_location.length < 2) {
      toast.warning('Site/Localisation invalide (min 2 caracteres).'); return;
    }
    if (payload.hire_date && payload.account_expires_at
      && new Date(payload.hire_date) > new Date(payload.account_expires_at)) {
      toast.warning('La date d expiration doit etre apres la date d embauche.'); return;
    }
    if (!isStrongPassword(payload.password)) { toast.warning(PASSWORD_HINT); return; }

    setIsLoading(true);
    try {
      await post('/users', payload);
      toast.success('Utilisateur créé.');
      resetCreateDraft();
      setCreateOpen(false);
      await loadUsers();
    } catch (err) {
      toast.error(getUiErrorMessage(err, 'Création utilisateur échouée'));
    } finally {
      setIsLoading(false);
    }
  }, [createDraft, loadUsers, resetCreateDraft, toast]);

  /* ── copyPassword : identique ── */
  const copyPassword = useCallback(async (userId) => {
    const pwd = safeStr(newPasswordById[userId]);
    if (!pwd) return;
    try {
      await navigator.clipboard.writeText(pwd);
      toast.success('Mot de passe copié.');
    } catch {
      toast.warning('Impossible de copier automatiquement.');
    }
  }, [newPasswordById, toast]);

  const saveFullEdit = useCallback(async () => {
    if (!editUserId) return;
    const u = allUsers.find((x) => String(x?._id) === String(editUserId));
    if (!u) return;

    const nextRole = safeStr(editDraft.role || u.role);
    const roleChanged = nextRole !== safeStr(u.role);
    const nextPassword = safeStr(editDraft.password);
    const passwordChanged = Boolean(nextPassword);
    const profilePayload = {
      username: safeStr(editDraft.username),
      email: safeStr(editDraft.email),
      telephone: normalizeTunisianPhone(editDraft.telephone),
      employee_id: safeStr(editDraft.employee_id).toUpperCase(),
      job_title: safeStr(editDraft.job_title),
      hire_date: safeStr(editDraft.hire_date),
      account_expires_at: safeStr(editDraft.account_expires_at),
      account_type: safeStr(editDraft.account_type || 'interne'),
      two_factor_required: Boolean(editDraft.two_factor_required),
      service_direction: safeStr(editDraft.service_direction),
      site_location: safeStr(editDraft.site_location),
      manager_user_id: safeStr(editDraft.manager_user_id),
      preferred_language: safeStr(editDraft.preferred_language || 'fr'),
      notification_channels: {
        email: editDraft.notification_channels?.email !== false,
      },
      ...(nextRole === 'demandeur'
        ? { demandeur_profile: safeStr(editDraft.demandeur_profile || 'bureautique') }
        : {}),
    };

    if (!profilePayload.username || profilePayload.username.length < 3) {
      toast.warning('Username invalide (min 3 caracteres).'); return;
    }
    if (!isValidEmail(profilePayload.email)) { toast.warning('Email invalide.'); return; }
    if (!isValidPhone(profilePayload.telephone)) {
      toast.warning('Telephone invalide. Format requis: +216XXXXXXXX.'); return;
    }
    if (profilePayload.service_direction && profilePayload.service_direction.length < 2) {
      toast.warning('Service/Direction invalide (min 2 caracteres).'); return;
    }
    if (!isValidEmployeeId(profilePayload.employee_id)) {
      toast.warning('Matricule invalide (lettres, chiffres ou tiret).'); return;
    }
    if (profilePayload.hire_date && profilePayload.account_expires_at
      && new Date(profilePayload.hire_date) > new Date(profilePayload.account_expires_at)) {
      toast.warning('La date d expiration doit etre apres la date d embauche.'); return;
    }
    if (roleChanged && safeStr(editDraft.role_reason).length < 5) {
      toast.warning('Motif obligatoire pour modifier le role (min 5 caracteres).'); return;
    }
    if (passwordChanged && !isStrongPassword(nextPassword)) { toast.warning(PASSWORD_HINT); return; }
    if (passwordChanged && safeStr(editDraft.password_reason).length < 5) {
      toast.warning('Motif obligatoire pour reinitialiser le mot de passe (min 5 caracteres).'); return;
    }

    const profileChanged = [
      [safeStr(u.username), profilePayload.username],
      [safeStr(u.email), profilePayload.email],
      [normalizeTunisianPhone(u.telephone), profilePayload.telephone],
      [safeStr(u.employee_id).toUpperCase(), profilePayload.employee_id],
      [safeStr(u.job_title), profilePayload.job_title],
      [formatDateInput(u.hire_date), profilePayload.hire_date],
      [formatDateInput(u.account_expires_at), profilePayload.account_expires_at],
      [safeStr(u.account_type || 'interne'), profilePayload.account_type],
      [Boolean(u.two_factor_required), profilePayload.two_factor_required],
      [safeStr(u.service_direction), profilePayload.service_direction],
      [safeStr(u.site_location), profilePayload.site_location],
      [safeStr(u.manager_user?._id || u.manager_user), profilePayload.manager_user_id],
      [safeStr(u.preferred_language || 'fr'), profilePayload.preferred_language],
      [u.notification_channels?.email !== false, profilePayload.notification_channels.email],
      [nextRole === 'demandeur' ? safeStr(u.demandeur_profile || 'bureautique') : '', safeStr(profilePayload.demandeur_profile || '')],
    ].some(([before, after]) => before !== after);

    if (!profileChanged && !roleChanged && !passwordChanged) {
      toast.info('Aucun changement detecte.'); return;
    }

    setIsLoading(true);
    try {
      if (roleChanged) {
        await patch(`/users/${encodeURIComponent(u._id)}/role`, {
          role: nextRole,
          reason: safeStr(editDraft.role_reason),
        });
      }
      if (profileChanged) {
        await patch(`/users/${encodeURIComponent(u._id)}/profile`, profilePayload);
      }
      if (passwordChanged) {
        const res = await post(`/users/${encodeURIComponent(u._id)}/reset-password`, {
          new_password: nextPassword,
          reason: safeStr(editDraft.password_reason),
        });
        const newPwd = safeStr(res?.new_password);
        if (newPwd) setNewPasswordById((p) => ({ ...p, [u._id]: newPwd }));
      }
      toast.success('Utilisateur mis a jour.');
      closeDrawer();
      await loadUsers();
    } catch (err) {
      toast.error(getUiErrorMessage(err, 'Erreur mise a jour'));
    } finally {
      setIsLoading(false);
    }
  }, [allUsers, closeDrawer, editDraft, editUserId, loadUsers, toast]);

  const emptyText = useMemo(() => {
    if (!allUsers.length)     return 'Aucun utilisateur trouvé.';
    if (!filteredUsers.length) return 'Aucun utilisateur ne correspond aux critères.';
    return '';
  }, [allUsers.length, filteredUsers.length]);

  /* ════════════════════════════════════
     RENDU
  ════════════════════════════════════ */
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
          title="Utilisateurs"
          subtitle="Gestion des comptes, rôles, statuts et sessions."
          icon={<Users size={24} />}
          searchValue={q}
          onSearchChange={setQ}
          searchPlaceholder="Rechercher un utilisateur (nom, email, rôle...)"
        />
        {isLoading && <LoadingSpinner overlay text="Chargement..." />}

        <div className="admin-page">

          {/* ── Toolbar ── */}
          <div className="admin-toolbar">
            <div />
            <div className="admin-users-actions">
              <button className="admin-btn primary" type="button"
                onClick={() => setCreateOpen(true)} disabled={isLoading}>
                <UserPlus size={16} /><span>Nouvel utilisateur</span>
              </button>
            </div>
          </div>

          {/* ── NOUVEAU : Bannière si utilisateur bloqué ── */}
          {displayKpis.blocked > 0 && (
            <div className="users-alert-banner">
              <AlertTriangle size={15} />
              <span>
                <strong>{displayKpis.blocked} utilisateur{displayKpis.blocked > 1 ? 's' : ''} bloqué{displayKpis.blocked > 1 ? 's' : ''}</strong>
                {' '}— vérifiez les comptes concernés.
              </span>
            </div>
          )}

          {/* ── KPI Cards — enrichies visuellement ── */}
          <div className="users-kpis">
            <div className="kpi">
              <div className="kpi-icon kpi-icon--blue"><Users size={18} /></div>
              <div><span>Total utilisateurs</span><strong>{displayKpis.total}</strong></div>
            </div>
            <div className="kpi ok">
              <div className="kpi-icon kpi-icon--green"><Activity size={18} /></div>
              <div><span>Actifs</span><strong>{displayKpis.active}</strong></div>
            </div>
            <div className="kpi bad">
              <div className="kpi-icon kpi-icon--red"><Ban size={18} /></div>
              <div><span>Bloqués</span><strong>{displayKpis.blocked}</strong></div>
            </div>
            <div className="kpi">
              <div className="kpi-icon kpi-icon--purple"><Wifi size={18} /></div>
              <div><span>En ligne</span><strong>{displayKpis.online}</strong></div>
            </div>
          </div>

          {/* ── Filtres — identiques à l'original ── */}
          <div className="users-filters">
            <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} disabled={isLoading}>
              <option value="">Tous les rôles</option>
              {ROLES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} disabled={isLoading}>
              <option value="">Tous les statuts</option>
              <option value="active">Actif</option>
              <option value="blocked">Bloqué</option>
            </select>
            <select value={serviceFilter} onChange={(e) => setServiceFilter(e.target.value)} disabled={isLoading}>
              <option value="">Tous les services/directions</option>
              {serviceOptions.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <button className="admin-btn" type="button"
              onClick={clearFilters} disabled={isLoading || !hasFilters}>
              <span>Réinitialiser</span>
            </button>
            <button className="admin-btn" type="button" onClick={loadUsers} disabled={isLoading}>
              <RefreshCw size={16} /><span>Actualiser</span>
            </button>
          </div>

          {/* Compteur */}
          <div className="admin-note users-count-bar">
            <span>
              Résultats : <strong>{pagination.rows.length}</strong> affichés
              {' '}sur {pagination.displayedTotal}
            </span>
            {hasFilters && (
              <button className="users-clear-filters-link" onClick={clearFilters} type="button">
                Effacer les filtres
              </button>
            )}
          </div>

          {/* ── Tableau — mêmes colonnes, même structure ── */}
          <div className="users-table-wrap">
            <table className="users-table">
              <thead>
                <tr>
                  <th>Utilisateur</th>
                  <th>Rôle & service</th>
                  <th>Statut</th>
                  <th>Sessions</th>
                  <th>Dernière activité</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pagination.rows.map((u) => (
                  <tr key={u._id} className={u.status === 'blocked' ? 'row-blocked' : ''}>

                    {/* Utilisateur */}
                    <td>
                      <div className="user-cell">
                        <ProtectedImage
                          filePath={u.image_profile || ''} alt={u.username}
                          className="user-avatar" fallbackText="" />
                        <div className="user-name">
                          <strong>{u.username}</strong>
                          <div className="user-sub">
                            <span>{u.email || '—'}</span>
                            <span className="dot">•</span>
                            <span>{u.telephone || '—'}</span>
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Rôle — NOUVEAU : badge coloré */}
                    <td>
                      <div className="role-service">
                        <span className={`role-pill ${ROLE_COLORS[u.role] || ''}`}>
                          <Shield size={13} /> {roleLabel(u.role)}
                        </span>
                        {(safeStr(u.service_direction) || (u.role === 'demandeur' && safeStr(u.demandeur_profile))) && (
                          <div className="role-sub">
                            {safeStr(u.service_direction) && (
                              <span className="muted">{safeStr(u.service_direction)}</span>
                            )}
                            {u.role === 'demandeur' && safeStr(u.demandeur_profile) && (
                              <span className="muted">
                                {safeStr(u.service_direction) ? '• ' : '• '}
                                {safeStr(u.demandeur_profile)}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </td>

                    {/* Statut */}
                    <td>
                      <span className={`status-pill ${statusTone(u.status)}`}>
                        {u.status === 'active'
                          ? <CheckCircle2 size={13} />
                          : <Ban size={13} />}
                        {statusLabel(u.status)}
                      </span>
                    </td>

                    {/* Sessions */}
                    <td>
                      <div className="sessions-cell">
                        {(u.activeSessionsCount || 0) > 0 ? (
                          <>
                            <strong>{u.activeSessionsCount || 0}</strong>
                            <button className="link-btn" type="button"
                              onClick={() => navigate(`/admin/sessions?user=${encodeURIComponent(u._id)}`)}>
                              Voir sessions
                            </button>
                          </>
                        ) : (
                          <span className="offline-badge">Hors ligne</span>
                        )}
                      </div>
                    </td>

                    {/* Dernière activité */}
                    <td className="muted">{formatDateTime(u.lastActivityAt || u.last_login)}</td>

                    {/* Actions — identiques à l'original */}
                    <td style={{ textAlign: 'right' }}>
                      <div className="row-actions">
                        <div className="menu-wrap" onClick={(e) => e.stopPropagation()}>
                          <button className="icon-btn action-trigger" type="button"
                            aria-label="Actions"
                            title="Actions"
                            onClick={() => setMenuOpenForId((p) => (p === u._id ? null : u._id))}
                            disabled={isLoading}>
                            <MoreVertical size={17} />
                          </button>
                          {menuOpenForId === u._id && (
                            <div className="actions-menu" role="menu">
                              <button type="button" className="menu-item" onClick={() => openDetail(u._id)}>
                                <Eye size={15} /><span>Voir le profil / détail</span>
                              </button>
                              <button type="button" className="menu-item" onClick={() => openEdit(u._id)}>
                                <Pencil size={15} /><span>Modifier le compte</span>
                              </button>
                              <button type="button" className="menu-item danger"
                                onClick={() => openReason('toggle_status', u._id)}
                                disabled={!canToggleUserStatus(u)}>
                                {u.status === 'active' ? <Ban size={15} /> : <CheckCircle2 size={15} />}
                                <span>{u.status === 'active' ? "Bloquer l'utilisateur" : "Activer l'utilisateur"}</span>
                              </button>
                              <button type="button" className="menu-item danger"
                                onClick={() => openReason('delete_user', u._id)}
                                disabled={!canDeleteUser(u)}>
                                <Trash2 size={15} /><span>Supprimer</span>
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
                {!!emptyText && (
                  <tr><td colSpan={6} className="empty">{emptyText}</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="users-pagination" aria-label="Pagination utilisateurs">
            <button
              className="icon-btn"
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={isLoading || !pagination.canPrev}
              aria-label="Page précédente"
              title="Page précédente"
            >
              <ChevronLeft size={16} />
            </button>
            <span>
              Page <strong>{pagination.page}</strong> sur <strong>{pagination.totalPages}</strong>
            </span>
            <button
              className="icon-btn"
              type="button"
              onClick={() => setPage((p) => Math.min(pagination.loadedPages, p + 1))}
              disabled={isLoading || !pagination.canNext}
              aria-label="Page suivante"
              title="Page suivante"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          {/* ════ DRAWER : Créer utilisateur ════ */}
          {createOpen && (
            <div className="admin-drawer-backdrop admin-create-backdrop" role="dialog" aria-modal="true" onClick={closeDrawer}>
              <div className="admin-drawer admin-create-drawer" onClick={(e) => e.stopPropagation()}>
                <div className="drawer-header">
                  <div className="drawer-header-left">
                    <div className="drawer-header-icon drawer-icon--create">
                      <UserPlus size={18} />
                    </div>
                    <div>
                      <strong>Nouvel utilisateur</strong>
                      <div className="muted">Création compte + rôle + accès</div>
                    </div>
                  </div>
                  <button className="icon-btn" type="button" onClick={closeDrawer}
                    disabled={isLoading} aria-label="Fermer"><X size={18} /></button>
                </div>
                <div className="drawer-body create-user-body">
                  <div className="create-user-shell">
                    <section className="create-section create-section--identity">
                      <div className="create-section-head">
                        <div className="create-section-icon"><UserRoundCheck size={17} /></div>
                        <div>
                          <h3>Identite professionnelle</h3>
                          <p>Informations RH et contact principal du compte.</p>
                        </div>
                      </div>
                      <div className="form-grid create-form-grid">
                        <label>
                          Username *
                          <input value={createDraft.username}
                            onChange={(e) => setCreateDraft((p) => ({ ...p, username: e.target.value }))}
                            disabled={isLoading} maxLength={60} placeholder="ex: a.benali" />
                        </label>
                        <label>
                          Email *
                          <input type="email" value={createDraft.email}
                            onChange={(e) => setCreateDraft((p) => ({ ...p, email: e.target.value }))}
                            disabled={isLoading} maxLength={120} placeholder="prenom.nom@etap.com.tn" />
                        </label>
                        <label>
                          Matricule
                          <input value={createDraft.employee_id}
                            onChange={(e) => setCreateDraft((p) => ({ ...p, employee_id: e.target.value.toUpperCase() }))}
                            disabled={isLoading} maxLength={24} placeholder="ETAP-1024" />
                        </label>
                        <label>
                          Fonction / Poste
                          <input value={createDraft.job_title}
                            onChange={(e) => setCreateDraft((p) => ({ ...p, job_title: e.target.value }))}
                            disabled={isLoading} maxLength={80} placeholder="Ingenieur reservoir, Acheteur..." />
                        </label>
                        <label>
                          Telephone *
                          <input inputMode="tel" value={createDraft.telephone}
                            onChange={(e) => setCreateDraft((p) => ({ ...p, telephone: normalizeTunisianPhone(e.target.value) }))}
                            disabled={isLoading} maxLength={12} placeholder="+21698123456" />
                          <div className="helper-text">Format bloque sur l indicatif tunisien +216.</div>
                        </label>
                        <label>
                          Date d embauche
                          <input type="date" value={createDraft.hire_date}
                            onChange={(e) => setCreateDraft((p) => ({ ...p, hire_date: e.target.value }))}
                            disabled={isLoading} />
                        </label>
                      </div>
                    </section>

                    <section className="create-section">
                      <div className="create-section-head">
                        <div className="create-section-icon"><Building2 size={17} /></div>
                        <div>
                          <h3>Organisation et localisation</h3>
                          <p>Role applicatif, service, site et responsable N+1.</p>
                        </div>
                      </div>
                      <div className="form-grid create-form-grid">
                        <label>
                          Role *
                          <select value={createDraft.role}
                            onChange={(e) => setCreateDraft((p) => ({ ...p, role: e.target.value }))}
                            disabled={isLoading}>
                            {ROLES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                          </select>
                        </label>
                        <label>
                          Service / Direction
                          <input value={createDraft.service_direction}
                            onChange={(e) => setCreateDraft((p) => ({ ...p, service_direction: e.target.value }))}
                            disabled={isLoading} maxLength={80} placeholder="RH, Finance, HSE..." />
                        </label>
                        {createDraft.role === 'demandeur' && (
                          <label>
                            Profil catalogue
                            <select value={createDraft.demandeur_profile}
                              onChange={(e) => setCreateDraft((p) => ({ ...p, demandeur_profile: e.target.value }))}
                              disabled={isLoading}>
                              {CATALOG_PROFILES_CREATE.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                            </select>
                            <div className="helper-text">
                              Choisir "Auto" pour mapper le profil depuis le service/direction.
                            </div>
                          </label>
                        )}
                        <label>
                          Site / Localisation
                          <input list="admin-user-sites" value={createDraft.site_location}
                            onChange={(e) => setCreateDraft((p) => ({ ...p, site_location: e.target.value }))}
                            disabled={isLoading} maxLength={100} placeholder="Siege social, Champ petrolier..." />
                          <datalist id="admin-user-sites">
                            {SITE_OPTIONS.map((site) => <option key={site} value={site} />)}
                          </datalist>
                        </label>
                        <label>
                          Responsable hierarchique (N+1)
                          <select value={createDraft.manager_user_id}
                            onChange={(e) => setCreateDraft((p) => ({ ...p, manager_user_id: e.target.value }))}
                            disabled={isLoading}>
                            <option value="">Aucun responsable rattache</option>
                            {managerOptions.map((u) => (
                              <option key={u._id} value={u._id}>{u.username} - {roleLabel(u.role)}</option>
                            ))}
                          </select>
                        </label>
                      </div>
                    </section>

                    <section className="create-section">
                      <div className="create-section-head">
                        <div className="create-section-icon"><ShieldCheck size={17} /></div>
                        <div>
                          <h3>Securite et gouvernance</h3>
                          <p>Expiration, type de compte et politique d acces initiale.</p>
                        </div>
                      </div>
                      <div className="form-grid create-form-grid">
                        <label>
                          Type de compte
                          <select value={createDraft.account_type}
                            onChange={(e) => setCreateDraft((p) => ({ ...p, account_type: e.target.value }))}
                            disabled={isLoading}>
                            {ACCOUNT_TYPES.map((type) => <option key={type.id} value={type.id}>{type.label}</option>)}
                          </select>
                        </label>
                        <label>
                          Date d expiration du compte
                          <input type="date" value={createDraft.account_expires_at}
                            onChange={(e) => setCreateDraft((p) => ({ ...p, account_expires_at: e.target.value }))}
                            disabled={isLoading} />
                        </label>
                        <label className="span-2">
                          Mot de passe temporaire *
                          <div className="password-input-row">
                            <input type={showCreatePassword ? 'text' : 'password'} value={createDraft.password}
                              onChange={(e) => setCreateDraft((p) => ({ ...p, password: e.target.value }))}
                              disabled={isLoading} maxLength={64} placeholder="Temporaire (min 8)" />
                            <button className="icon-btn" type="button"
                              onClick={() => setShowCreatePassword((p) => !p)}
                              disabled={isLoading}
                              title={showCreatePassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}>
                              {showCreatePassword ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                            <button className="admin-btn small" type="button"
                              onClick={() => setCreateDraft((p) => ({ ...p, password: generateSecurePassword() }))}
                              disabled={isLoading}>
                              <Wand2 size={15} /><span>Generer</span>
                            </button>
                          </div>
                          <div className={`pwd-hint ${createDraft.password
                            ? (isStrongPassword(createDraft.password) ? 'ok' : 'bad') : ''}`}>
                            {PASSWORD_HINT}
                          </div>
                          <div className="helper-text">
                            Le mot de passe temporaire devra etre change apres la premiere connexion.
                          </div>
                        </label>
                        <label className="create-check-card span-2">
                          <input type="checkbox" checked={Boolean(createDraft.two_factor_required)}
                            onChange={(e) => setCreateDraft((p) => ({ ...p, two_factor_required: e.target.checked }))}
                            disabled={isLoading} />
                          <span>
                            <strong>Double authentification obligatoire</strong>
                            <small>Force la configuration 2FA au premier acces lorsque le module 2FA est active.</small>
                          </span>
                        </label>
                      </div>
                    </section>

                    <section className="create-section">
                      <div className="create-section-head">
                        <div className="create-section-icon"><Languages size={17} /></div>
                        <div>
                          <h3>Preferences utilisateur</h3>
                          <p>Langue et canaux de notification initiaux.</p>
                        </div>
                      </div>
                      <div className="form-grid create-form-grid">
                        <label>
                          Langue preferee
                          <select value={createDraft.preferred_language}
                            onChange={(e) => setCreateDraft((p) => ({ ...p, preferred_language: e.target.value }))}
                            disabled={isLoading}>
                            {LANGUAGE_OPTIONS.map((lang) => <option key={lang.id} value={lang.id}>{lang.label}</option>)}
                          </select>
                        </label>
                        <div className="notification-choice-group">
                          <label className="create-check-card">
                            <input type="checkbox" checked={createDraft.notification_channels?.email !== false}
                              onChange={(e) => updateCreateNotification('email', e.target.checked)}
                              disabled={isLoading} />
                            <span><Mail size={15} /> Notifications Email</span>
                          </label>
                        </div>
                      </div>
                    </section>
                  </div>
                  <div className="form-grid">
                    <label>
                      Username *
                      <input value={createDraft.username}
                        onChange={(e) => setCreateDraft((p) => ({ ...p, username: e.target.value }))}
                        disabled={isLoading} maxLength={60} />
                    </label>
                    <label>
                      Email *
                      <input type="email" value={createDraft.email}
                        onChange={(e) => setCreateDraft((p) => ({ ...p, email: e.target.value }))}
                        disabled={isLoading} maxLength={120} />
                    </label>
                    <label>
                      Téléphone *
                      <input inputMode="tel" value={createDraft.telephone}
                        onChange={(e) => setCreateDraft((p) => ({ ...p, telephone: e.target.value }))}
                        disabled={isLoading} maxLength={22} placeholder="+21698123456" />
                    </label>
                    <label>
                      Rôle *
                      <select value={createDraft.role}
                        onChange={(e) => setCreateDraft((p) => ({ ...p, role: e.target.value }))}
                        disabled={isLoading}>
                        {ROLES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                      </select>
                    </label>
                    {createDraft.role === 'demandeur' && (
                      <>
                        <label>
                          Profil catalogue
                          <select value={createDraft.demandeur_profile}
                            onChange={(e) => setCreateDraft((p) => ({ ...p, demandeur_profile: e.target.value }))}
                            disabled={isLoading}>
                            {CATALOG_PROFILES_CREATE.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                          </select>
                          <div className="helper-text">
                            Choisir "Auto" pour mapper le profil depuis le service/direction.
                          </div>
                        </label>
                        <label>
                          Service / Direction
                          <input value={createDraft.service_direction}
                            onChange={(e) => setCreateDraft((p) => ({ ...p, service_direction: e.target.value }))}
                            disabled={isLoading} maxLength={80} placeholder="RH, Finance, HSE..." />
                        </label>
                      </>
                    )}
                    <label className="span-2">
                      Mot de passe temporaire *
                      <input type="password" value={createDraft.password}
                        onChange={(e) => setCreateDraft((p) => ({ ...p, password: e.target.value }))}
                        disabled={isLoading} maxLength={64} placeholder="Temporaire (min 8)" />
                      <div className={`pwd-hint ${createDraft.password
                        ? (isStrongPassword(createDraft.password) ? 'ok' : 'bad') : ''}`}>
                        {PASSWORD_HINT}
                      </div>
                      <div className="helper-text">
                        Le mot de passe temporaire devra être changé après la première connexion.
                      </div>
                    </label>
                  </div>
                </div>
                <div className="drawer-footer">
                  <button className="admin-btn" type="button" onClick={closeDrawer} disabled={isLoading}>
                    Annuler
                  </button>
                  <button className="admin-btn primary" type="button" onClick={createUser} disabled={isLoading}>
                    <UserPlus size={16} /><span>Créer</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ════ DRAWER : Détail utilisateur ════ */}
          {detailUserId && selectedUser && (
            <div className="admin-drawer-backdrop" role="dialog" aria-modal="true" onClick={closeDrawer}>
              <div className="admin-drawer" onClick={(e) => e.stopPropagation()}>
                <div className="drawer-header">
                  <div className="drawer-header-left">
                    <div className="drawer-header-icon drawer-icon--detail">
                      <Eye size={18} />
                    </div>
                    <div>
                      <strong>Détail utilisateur</strong>
                      <div className="muted">{selectedUser.username}</div>
                    </div>
                  </div>
                  <button className="icon-btn" type="button" onClick={closeDrawer}
                    disabled={isLoading} aria-label="Fermer"><X size={18} /></button>
                </div>

                <div className="drawer-body">
                  {/* Profil header */}
                  <div className="detail-profile-header">
                    <ProtectedImage filePath={selectedUser.image_profile || ''}
                      alt={selectedUser.username} className="detail-avatar" fallbackText="" />
                    <div>
                      <p className="detail-username">{selectedUser.username}</p>
                      <div className="detail-badges">
                        <span className={`role-pill ${ROLE_COLORS[selectedUser.role] || ''}`}>
                          <Shield size={12} /> {roleLabel(selectedUser.role)}
                        </span>
                        <span className={`status-pill ${statusTone(selectedUser.status)}`}>
                          {selectedUser.status === 'active'
                            ? <CheckCircle2 size={12} />
                            : <Ban size={12} />}
                          {statusLabel(selectedUser.status)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="detail-block">
                    <div><span>Email</span><strong>{selectedUser.email || '—'}</strong></div>
                    <div><span>Téléphone</span><strong>{selectedUser.telephone || '—'}</strong></div>
                    <div><span>Rôle</span><strong>{roleLabel(selectedUser.role)}</strong></div>
                    <div><span>Statut</span><strong>{statusLabel(selectedUser.status)}</strong></div>
                    <div><span>Service / Direction</span><strong>{safeStr(selectedUser.service_direction) || '—'}</strong></div>
                    <div><span>Matricule</span><strong>{selectedUser.employee_id || '-'}</strong></div>
                    <div><span>Fonction / Poste</span><strong>{selectedUser.job_title || '-'}</strong></div>
                    <div><span>Site / Localisation</span><strong>{safeStr(selectedUser.site_location) || '-'}</strong></div>
                    <div><span>Type de compte</span><strong>{selectedUser.account_type === 'externe' ? 'Externe' : 'Interne ETAP'}</strong></div>
                    <div><span>Expiration compte</span><strong>{selectedUser.account_expires_at ? formatDateTime(selectedUser.account_expires_at) : '-'}</strong></div>
                    <div><span>Date embauche</span><strong>{selectedUser.hire_date ? formatDateTime(selectedUser.hire_date) : '-'}</strong></div>
                    <div><span>Responsable N+1</span><strong>{selectedUser.manager_user?.username || '-'}</strong></div>
                    <div><span>Langue preferee</span><strong>{LANGUAGE_OPTIONS.find((l) => l.id === selectedUser.preferred_language)?.label || 'Francais'}</strong></div>
                    <div><span>2FA obligatoire</span><strong>{selectedUser.two_factor_required ? 'Oui' : 'Non'}</strong></div>
                    <div><span>Notifications</span><strong>
                      {[
                        selectedUser.notification_channels?.email !== false ? 'Email' : '',
                      ].filter(Boolean).join(' + ') || 'Aucune'}
                    </strong></div>
                    <div>
                      <span>Profil catalogue</span>
                      <strong>{selectedUser.role === 'demandeur'
                        ? (safeStr(selectedUser.demandeur_profile) || 'bureautique') : '—'}
                      </strong>
                    </div>
                    <div><span>Sessions actives</span><strong>{selectedUser.activeSessionsCount || 0}</strong></div>
                    <div><span>Dernière activité</span>
                      <strong>{formatDateTime(selectedUser.lastActivityAt || selectedUser.last_login)}</strong>
                    </div>
                  </div>

                  {newPasswordById[selectedUser._id] && (
                    <div className="admin-card" style={{ marginTop: 12 }}>
                      <div className="admin-card-title"><KeyRound size={18} /> Mot de passe temporaire</div>
                      <div className="pwd-row">
                        <code className="pwd-code">{newPasswordById[selectedUser._id]}</code>
                        <button className="icon-btn" type="button"
                          onClick={() => copyPassword(selectedUser._id)} title="Copier" disabled={isLoading}>
                          <Copy size={16} />
                        </button>
                      </div>
                      <div className="admin-note">
                        À communiquer de manière sécurisée. Changement requis à la première connexion.
                      </div>
                    </div>
                  )}
                </div>

                {/* ── Mêmes boutons qu'avant ── */}
                <div className="drawer-footer">
                  <button className="admin-btn" type="button"
                    onClick={() => openEdit(selectedUser._id)} disabled={isLoading}>
                    <Pencil size={16} /><span>Modifier</span>
                  </button>
                  <button className="admin-btn" type="button"
                    onClick={() => openReason('change_role', selectedUser._id, selectedUser.role)} disabled={isLoading}>
                    <KeyRound size={16} /><span>Changer rôle</span>
                  </button>
                  <button className="admin-btn" type="button"
                    onClick={() => navigate(`/admin/sessions?user=${encodeURIComponent(selectedUser._id)}`)} disabled={isLoading}>
                    <Monitor size={16} /><span>Voir sessions</span>
                  </button>
                  <button className="admin-btn danger" type="button"
                    onClick={() => openReason('toggle_status', selectedUser._id)}
                    disabled={isLoading || !canToggleUserStatus(selectedUser)}>
                    {selectedUser.status === 'active' ? <Ban size={16} /> : <CheckCircle2 size={16} />}
                    <span>{selectedUser.status === 'active' ? 'Bloquer' : 'Débloquer'}</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ════ DRAWER : Modifier utilisateur ════ */}
          {editUserId && selectedUser && (
            <div className="admin-drawer-backdrop admin-create-backdrop" role="dialog" aria-modal="true" onClick={closeDrawer}>
              <div className="admin-drawer admin-create-drawer" onClick={(e) => e.stopPropagation()}>
                <div className="drawer-header">
                  <div className="drawer-header-left">
                    <div className="drawer-header-icon drawer-icon--edit">
                      <Pencil size={18} />
                    </div>
                    <div>
                      <strong>Modifier utilisateur</strong>
                      <div className="muted">{selectedUser.username}</div>
                    </div>
                  </div>
                  <button className="icon-btn" type="button" onClick={closeDrawer}
                    disabled={isLoading} aria-label="Fermer"><X size={18} /></button>
                </div>
                <div className="drawer-body create-user-body edit-user-body">
                  <div className="form-grid edit-user-grid">
                    <label>
                      Service / Direction
                      <input value={editDraft.service_direction}
                        onChange={(e) => setEditDraft((p) => ({ ...p, service_direction: e.target.value }))}
                        disabled={isLoading} maxLength={80} />
                      <div className="helper-text">
                        Champ facultatif (2–80). Utilisé pour l'organisation interne.
                      </div>
                    </label>
                    {editDraft.role === 'demandeur' ? (
                      <label>
                        Profil catalogue
                        <select value={editDraft.demandeur_profile}
                          onChange={(e) => setEditDraft((p) => ({ ...p, demandeur_profile: e.target.value }))}
                          disabled={isLoading}>
                          {CATALOG_PROFILES_CREATE.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                        </select>
                        <div className="helper-text">
                          Permet de limiter le catalogue visible pour le demandeur.
                        </div>
                      </label>
                    ) : (
                      <div className="admin-note">
                        Le profil catalogue concerne uniquement les demandeurs.
                      </div>
                    )}
                    <label>
                      Username *
                      <input value={editDraft.username}
                        onChange={(e) => setEditDraft((p) => ({ ...p, username: e.target.value }))}
                        disabled={isLoading} maxLength={60} />
                    </label>
                    <label>
                      Email *
                      <input type="email" value={editDraft.email}
                        onChange={(e) => setEditDraft((p) => ({ ...p, email: e.target.value }))}
                        disabled={isLoading} maxLength={120} />
                    </label>
                    <label>
                      Telephone *
                      <input inputMode="tel" value={editDraft.telephone}
                        onChange={(e) => setEditDraft((p) => ({ ...p, telephone: normalizeTunisianPhone(e.target.value) }))}
                        disabled={isLoading} maxLength={12} placeholder="+21698123456" />
                    </label>
                    <label>
                      Role *
                      <select value={editDraft.role}
                        onChange={(e) => setEditDraft((p) => ({ ...p, role: e.target.value }))}
                        disabled={isLoading}>
                        {ROLES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                      </select>
                    </label>
                    {editDraft.role !== selectedUser.role && (
                      <label className="span-2">
                        Motif changement role *
                        <input value={editDraft.role_reason}
                          onChange={(e) => setEditDraft((p) => ({ ...p, role_reason: e.target.value }))}
                          disabled={isLoading} maxLength={200} />
                      </label>
                    )}
                    <label>
                      Matricule
                      <input value={editDraft.employee_id}
                        onChange={(e) => setEditDraft((p) => ({ ...p, employee_id: e.target.value.toUpperCase() }))}
                        disabled={isLoading} maxLength={24} />
                    </label>
                    <label>
                      Fonction / Poste
                      <input value={editDraft.job_title}
                        onChange={(e) => setEditDraft((p) => ({ ...p, job_title: e.target.value }))}
                        disabled={isLoading} maxLength={80} />
                    </label>
                    <label>
                      Date d embauche
                      <input type="date" value={editDraft.hire_date}
                        onChange={(e) => setEditDraft((p) => ({ ...p, hire_date: e.target.value }))}
                        disabled={isLoading} />
                    </label>
                    <label>
                      Date d expiration du compte
                      <input type="date" value={editDraft.account_expires_at}
                        onChange={(e) => setEditDraft((p) => ({ ...p, account_expires_at: e.target.value }))}
                        disabled={isLoading} />
                    </label>
                    <label>
                      Type de compte
                      <select value={editDraft.account_type}
                        onChange={(e) => setEditDraft((p) => ({ ...p, account_type: e.target.value }))}
                        disabled={isLoading}>
                        {ACCOUNT_TYPES.map((type) => <option key={type.id} value={type.id}>{type.label}</option>)}
                      </select>
                    </label>
                    <label>
                      Site / Localisation
                      <input list="admin-user-sites" value={editDraft.site_location}
                        onChange={(e) => setEditDraft((p) => ({ ...p, site_location: e.target.value }))}
                        disabled={isLoading} maxLength={100} />
                    </label>
                    <label>
                      Responsable hierarchique (N+1)
                      <select value={editDraft.manager_user_id}
                        onChange={(e) => setEditDraft((p) => ({ ...p, manager_user_id: e.target.value }))}
                        disabled={isLoading}>
                        <option value="">Aucun responsable rattache</option>
                        {managerOptions
                          .filter((manager) => String(manager._id) !== String(selectedUser._id))
                          .map((manager) => (
                            <option key={manager._id} value={manager._id}>
                              {manager.username} - {roleLabel(manager.role)}
                            </option>
                          ))}
                      </select>
                    </label>
                    <label>
                      Langue preferee
                      <select value={editDraft.preferred_language}
                        onChange={(e) => setEditDraft((p) => ({ ...p, preferred_language: e.target.value }))}
                        disabled={isLoading}>
                        {LANGUAGE_OPTIONS.map((lang) => <option key={lang.id} value={lang.id}>{lang.label}</option>)}
                      </select>
                    </label>
                    <label className="create-check-card">
                      <input type="checkbox" checked={Boolean(editDraft.two_factor_required)}
                        onChange={(e) => setEditDraft((p) => ({ ...p, two_factor_required: e.target.checked }))}
                        disabled={isLoading} />
                      <span><ShieldCheck size={15} /> 2FA obligatoire</span>
                    </label>
                    <div className="notification-choice-group span-2">
                      <label className="create-check-card">
                        <input type="checkbox" checked={editDraft.notification_channels?.email !== false}
                          onChange={(e) => updateEditNotification('email', e.target.checked)}
                          disabled={isLoading} />
                        <span><Mail size={15} /> Notifications Email</span>
                      </label>
                    </div>
                    <label className="span-2">
                      Nouveau mot de passe temporaire
                      <div className="password-input-row">
                        <input type={showEditPassword ? 'text' : 'password'} value={editDraft.password}
                          onChange={(e) => setEditDraft((p) => ({ ...p, password: e.target.value }))}
                          disabled={isLoading} maxLength={64}
                          placeholder="Laisser vide pour conserver le mot de passe actuel" />
                        <button className="icon-btn" type="button"
                          onClick={() => setShowEditPassword((p) => !p)}
                          disabled={isLoading}
                          title={showEditPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}>
                          {showEditPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                        <button className="admin-btn small" type="button"
                          onClick={() => setEditDraft((p) => ({ ...p, password: generateSecurePassword() }))}
                          disabled={isLoading}>
                          <Wand2 size={15} /><span>Generer</span>
                        </button>
                      </div>
                      <div className={`pwd-hint ${editDraft.password
                        ? (isStrongPassword(editDraft.password) ? 'ok' : 'bad') : ''}`}>
                        {editDraft.password ? PASSWORD_HINT : 'Action optionnelle et auditee.'}
                      </div>
                    </label>
                    {editDraft.password && (
                      <label className="span-2">
                        Motif reinitialisation mot de passe *
                        <input value={editDraft.password_reason}
                          onChange={(e) => setEditDraft((p) => ({ ...p, password_reason: e.target.value }))}
                          disabled={isLoading} maxLength={200} />
                      </label>
                    )}
                  </div>
                </div>
                <div className="drawer-footer">
                  <button className="admin-btn" type="button" onClick={closeDrawer} disabled={isLoading}>
                    Annuler
                  </button>
                  <button className="admin-btn primary" type="button" onClick={saveFullEdit} disabled={isLoading}>
                    <Pencil size={16} /><span>Enregistrer</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ════ MODAL : Confirmer action (bloquer, changer rôle, etc.) ════ */}
          {reasonDialog.open && (
            <div className="admin-confirm-backdrop" role="dialog" aria-modal="true" onClick={closeReason}>
              <div className="admin-confirm" onClick={(e) => e.stopPropagation()}>
                <div className="confirm-header">
                  <div className="confirm-header-left">
                    <div className={`confirm-icon ${
                      ['toggle_status', 'delete_user'].includes(reasonDialog.kind) ? 'confirm-icon--danger' : 'confirm-icon--primary'
                    }`}>
                      {reasonDialog.kind === 'toggle_status'  && <Ban size={18} />}
                      {reasonDialog.kind === 'change_role'    && <KeyRound size={18} />}
                      {reasonDialog.kind === 'reset_password' && <RotateCcw size={18} />}
                      {reasonDialog.kind === 'revoke_sessions'&& <Monitor size={18} />}
                      {reasonDialog.kind === 'delete_user'    && <Trash2 size={18} />}
                    </div>
                    <strong>Confirmer l'action</strong>
                  </div>
                  <button className="icon-btn" type="button" onClick={closeReason}
                    disabled={isLoading} aria-label="Fermer"><X size={18} /></button>
                </div>

                {reasonDialog.kind === 'change_role' ? (
                  <div className="confirm-body">
                    <div className="confirm-text">
                      Veuillez sélectionner le rôle cible et saisir le motif de cette action.
                    </div>
                    <label className="confirm-label">
                      Rôle *
                      <select value={reasonDialog.nextRole}
                        onChange={(e) => setReasonDialog((p) => ({ ...p, nextRole: e.target.value }))}
                        disabled={isLoading}>
                        {ROLES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                      </select>
                    </label>
                    <label className="confirm-label">
                      Motif de l'action *
                      <textarea value={reasonText}
                        onChange={(e) => setReasonText(e.target.value)}
                        placeholder="Motif (min 5 caractères)"
                        disabled={isLoading} rows={3} />
                    </label>
                  </div>
                ) : (
                  <div className="confirm-body">
                    <div className="confirm-text">
                      Veuillez saisir le motif de cette action. Il sera conservé dans l'historique.
                    </div>
                    <label className="confirm-label">
                      Motif de l'action *
                      <textarea value={reasonText}
                        onChange={(e) => setReasonText(e.target.value)}
                        placeholder="Motif (min 5 caractères)"
                        disabled={isLoading} rows={3} />
                    </label>
                    <div className="confirm-char-count">
                      {safeStr(reasonText).length} / 200 caractères
                    </div>
                  </div>
                )}

                <div className="confirm-footer">
                  <button className="admin-btn" type="button" onClick={closeReason} disabled={isLoading}>
                    Annuler
                  </button>
                  <button className={`admin-btn ${
                    ['toggle_status', 'delete_user'].includes(reasonDialog.kind) ? 'danger' : 'primary'
                  }`} type="button" onClick={confirmReason} disabled={isLoading}>
                    {reasonDialog.kind === 'delete_user' ? <Trash2 size={16} /> : <KeyRound size={16} />}
                    <span>Confirmer</span>
                  </button>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
