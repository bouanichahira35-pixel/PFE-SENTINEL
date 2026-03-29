import { useEffect, useMemo, useRef, useState } from 'react';
import { User, Lock, Moon, Sun, Camera, Save, Layers, Settings, Users, Bot, Globe, Bell, Eye, EyeOff, Truck, RefreshCw } from 'lucide-react';
import SidebarResp from '../../components/responsable/SidebarResp';
import HeaderPage from '../../components/shared/HeaderPage';
import useTheme from '../../hooks/useTheme';
import useProtectedFileUrl from '../../hooks/useProtectedFileUrl';
import { get, patch, post, uploadFile } from '../../services/api';
import { useToast } from '../../components/shared/Toast';
import { setUiLanguage, useUiLanguage } from '../../utils/uiLanguage';
import './ParametresResp.css';

const MAX_AVATAR_SIZE_BYTES = 5 * 1024 * 1024;
const STOCK_RULES_FRONT_DEFAULT = Object.freeze({
  seuilAlerte: 10,
  joursInactivite: 30,
  validationObligatoire: true,
});

const roleLabel = (role) => {
  if (role === 'magasinier') return 'Magasinier';
  if (role === 'demandeur') return 'Demandeur';
  if (role === 'responsable') return 'Responsable';
  return role;
};

const DEMANDEUR_PROFILES = [
  { id: 'bureautique', label: 'Bureautique' },
  { id: 'menage', label: 'Menage' },
  { id: 'petrole', label: 'Site petrole' },
];

function formatTimeFr(value) {
  if (!value) return '';
  try {
    return new Date(value).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

const ParametresResp = ({ userName, onLogout }) => {
  const toast = useToast();
  const uiLanguage = useUiLanguage();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= 768 : false));
  const { isDarkMode, toggleTheme } = useTheme();
  const [activeTab, setActiveTab] = useState('profil');
  const initializedThemeRef = useRef(false);

  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [profileData, setProfileData] = useState({ nom: userName || 'Responsable', email: '', telephone: '', imageProfile: '' }); 
  const [securityData, setSecurityData] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' }); 
  const [avatarFile, setAvatarFile] = useState(null); 
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState('');
  const [showPasswords, setShowPasswords] = useState({
    current: false,
    next: false,
    confirm: false,
  });

  const [langue, setLangue] = useState('fr');
  const [notifications, setNotifications] = useState({
    email: true,
    push: false,
    stockAlerts: true,
    demandesAlerts: true,
  });

  const [stockRules, setStockRules] = useState({
    seuilAlerte: 10,
    joursInactivite: 30,
    validationObligatoire: true,
  });
  const [stockRulesSavedAt, setStockRulesSavedAt] = useState('');
  const [stockRulesImpact, setStockRulesImpact] = useState(null);
  const [stockRulesImpactLoading, setStockRulesImpactLoading] = useState(false);

  const [aiSettings, setAiSettings] = useState({
    predictionsEnabled: true,
    alertesAuto: true,
    analyseConsommation: true,
  });
  const [aiRuntimeLoading, setAiRuntimeLoading] = useState(false);
  const [assistantStatus, setAssistantStatus] = useState(null);
  const [geminiStatus, setGeminiStatus] = useState(null);
  const [pythonStatus, setPythonStatus] = useState(null);
  const [aiRuntimeError, setAiRuntimeError] = useState('');

  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState('');
  const [magasiniers, setMagasiniers] = useState([]);
  const [demandeurs, setDemandeurs] = useState([]);
  const [usersView, setUsersView] = useState('magasinier'); // magasinier | demandeur
  const [userActionId, setUserActionId] = useState('');
  const [demandeurProfileDraftById, setDemandeurProfileDraftById] = useState(() => ({}));

  const [categories, setCategories] = useState([]);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryAudiences, setNewCategoryAudiences] = useState([]);
  const [categoryAudiencesDraftById, setCategoryAudiencesDraftById] = useState(() => ({}));

  const [suppliersLoading, setSuppliersLoading] = useState(false);
  const [suppliersError, setSuppliersError] = useState('');
  const [suppliers, setSuppliers] = useState([]);
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [newSupplier, setNewSupplier] = useState({ name: '', email: '', phone: '', default_lead_time_days: 7 });
  const [approvedProducts, setApprovedProducts] = useState([]);
  const [expandedSupplierId, setExpandedSupplierId] = useState('');
  const [supplierLinksById, setSupplierLinksById] = useState(() => ({}));
  const [supplierMetricsById, setSupplierMetricsById] = useState(() => ({}));
  const [supplierOrdersById, setSupplierOrdersById] = useState(() => ({}));
  const [supplierDetailLoadingById, setSupplierDetailLoadingById] = useState(() => ({}));
  const [supplierLinkDraftById, setSupplierLinkDraftById] = useState(() => ({}));
  const [receivingPoId, setReceivingPoId] = useState('');
  const [receiveDraftByPoId, setReceiveDraftByPoId] = useState(() => ({}));

  const tabs = [
    { id: 'profil', label: ({ fr: 'Profil', en: 'Profile', ar: 'الملف الشخصي' }[uiLanguage]), icon: User },
    { id: 'securite', label: ({ fr: 'Securite', en: 'Security', ar: 'الأمان' }[uiLanguage]), icon: Lock },
    { id: 'apparence', label: ({ fr: 'Apparence', en: 'Appearance', ar: 'المظهر' }[uiLanguage]), icon: Moon },
    { id: 'langue', label: ({ fr: 'Langue', en: 'Language', ar: 'اللغة' }[uiLanguage]), icon: Globe },
    { id: 'notifications', label: ({ fr: 'Notifications', en: 'Notifications', ar: 'الإشعارات' }[uiLanguage]), icon: Bell },
    { id: 'categories', label: ({ fr: 'Categories', en: 'Categories', ar: 'التصنيفات' }[uiLanguage]), icon: Layers },
    { id: 'regles', label: ({ fr: 'Regles Stock', en: 'Stock Rules', ar: 'قواعد المخزون' }[uiLanguage]), icon: Settings },
    { id: 'fournisseurs', label: ({ fr: 'Fournisseurs', en: 'Suppliers', ar: 'Suppliers' }[uiLanguage]), icon: Truck },
  ];
  const i18n = {
    fr: { title: 'Parametres', loading: 'Chargement...', languageSaved: 'Langue enregistree' },
    en: { title: 'Settings', loading: 'Loading...', languageSaved: 'Language saved' },
    ar: { title: 'الإعدادات', loading: 'جار التحميل...', languageSaved: 'تم حفظ اللغة' },
  }[uiLanguage];

  const avatarUrl = useProtectedFileUrl(profileData.imageProfile);
  const displayAvatarUrl = avatarPreviewUrl || avatarUrl;

  useEffect(() => {
    return () => {
      if (avatarPreviewUrl) URL.revokeObjectURL(avatarPreviewUrl);
    };
  }, [avatarPreviewUrl]);

  const onlineMagasiniers = useMemo(
    () => magasiniers.filter((u) => (u.activeSessionsCount || 0) > 0),
    [magasiniers]
  );
  const stockRulesPreview = useMemo(() => {
    const seuil = Number(stockRules.seuilAlerte);
    const jours = Number(stockRules.joursInactivite);
    const validSeuil = Number.isFinite(seuil) && seuil >= 0;
    const validJours = Number.isFinite(jours) && jours >= 1;
    return {
      valid: validSeuil && validJours,
      seuil: validSeuil ? Math.round(seuil) : null,
      jours: validJours ? Math.round(jours) : null,
    };
  }, [stockRules.joursInactivite, stockRules.seuilAlerte]);

  const loadMagasiniers = async () => { 
    setUsersLoading(true); 
    setUsersError(''); 
    try { 
      const data = await get('/users?role=magasinier'); 
      setMagasiniers(data.users || []); 
    } catch (e) { 
      setUsersError(e.message || 'Erreur'); 
    } finally { 
      setUsersLoading(false); 
    } 
  }; 

  const loadDemandeurs = async () => {
    setUsersLoading(true);
    setUsersError('');
    try {
      const data = await get('/users?role=demandeur');
      const list = data.users || [];
      setDemandeurs(list);
      setDemandeurProfileDraftById(() => {
        const next = {};
        list.forEach((u) => {
          next[u._id] = u.demandeur_profile || 'bureautique';
        });
        return next;
      });
    } catch (e) {
      setUsersError(e.message || 'Erreur');
    } finally {
      setUsersLoading(false);
    }
  };

  const reloadUsers = async () => {
    if (usersView === 'demandeur') return loadDemandeurs();
    return loadMagasiniers();
  };
 
  const loadCategories = async () => { 
    try { 
      const data = await get('/categories'); 
      setCategories(data || []); 
      const list = Array.isArray(data) ? data : [];
      setCategoryAudiencesDraftById(() => {
        const next = {};
        list.forEach((c) => {
          next[c._id] = Array.isArray(c.audiences) ? c.audiences : [];
        });
        return next;
      });
    } catch { 
      setCategories([]); 
    } 
  }; 

  const loadSuppliersData = async () => {
    setSuppliersLoading(true);
    setSuppliersError('');
    try {
      const [supRes, poRes, prodRes] = await Promise.all([
        get('/suppliers').catch(() => ({ suppliers: [] })),
        get('/purchase-orders?limit=40').catch(() => ({ purchase_orders: [] })),
        get('/products').catch(() => []),
      ]);
      setSuppliers(Array.isArray(supRes?.suppliers) ? supRes.suppliers : []);
      setPurchaseOrders(Array.isArray(poRes?.purchase_orders) ? poRes.purchase_orders : []);
      const products = Array.isArray(prodRes) ? prodRes : [];
      setApprovedProducts(
        products
          .filter((p) => String(p?.validation_status || '').toLowerCase() === 'approved')
          .map((p) => ({ id: p._id, name: p.name || 'Produit', code: p.code_product || '-' }))
          .sort((a, b) => String(a.name).localeCompare(String(b.name)))
      );
    } catch (err) {
      setSuppliersError(err.message || 'Erreur chargement fournisseurs');
      setSuppliers([]);
      setPurchaseOrders([]);
      setApprovedProducts([]);
    } finally {
      setSuppliersLoading(false);
    }
  };

  const loadSettings = async () => {
    setIsLoading(true);
    try {
      const [me, rules] = await Promise.all([
        get('/settings/me'),
        get('/settings/stock-rules/config').catch(() => ({ value: {} })),
      ]);

      const user = me?.user || {};
      const preferences = me?.preferences || {};

      setProfileData((prev) => ({
        ...prev,
        nom: user.username || prev.nom,
        email: user.email || '',
        telephone: user.telephone || '',
        imageProfile: user.image_profile || '',
      }));
      if (user.username) sessionStorage.setItem('userName', user.username);
      if (user.image_profile) sessionStorage.setItem('imageProfile', user.image_profile);

      setLangue(preferences.language || 'fr');
      setUiLanguage(preferences.language || 'fr');
      setNotifications({
        email: preferences.notifications?.email ?? true,
        push: preferences.notifications?.push ?? false,
        stockAlerts: preferences.notifications?.stockAlerts ?? true,
        demandesAlerts: preferences.notifications?.demandesAlerts ?? true,
      });

      if (!initializedThemeRef.current) {
        const darkFromServer = Boolean(preferences.dark_mode);
        if (darkFromServer !== isDarkMode) toggleTheme();
        initializedThemeRef.current = true;
      }

      setStockRules({
        seuilAlerte: Number(rules?.value?.seuilAlerte ?? 10),
        joursInactivite: Number(rules?.value?.joursInactivite ?? 30),
        validationObligatoire: Boolean(rules?.value?.validationObligatoire ?? true),
      });
      setStockRulesSavedAt('');

      await loadCategories();
    } catch (err) {
      toast.error(err.message || 'Erreur chargement parametres');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { 
    if (activeTab === 'utilisateurs') reloadUsers(); 
    if (activeTab === 'categories') loadCategories(); 
    if (activeTab === 'regles') loadStockRulesImpact();
    if (activeTab === 'fournisseurs') loadSuppliersData(); 
    if (activeTab === 'ia') loadAiRuntimeStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps 
  }, [activeTab]); 

  const loadAiRuntimeStatus = async () => {
    setAiRuntimeLoading(true);
    setAiRuntimeError('');
    try {
      const [assistant, gemini, python] = await Promise.all([
        get('/ai/assistant/status'),
        get('/ai/gemini/status').catch(() => null),
        get('/ai/python/status').catch(() => null),
      ]);
      setAssistantStatus(assistant || null);
      setGeminiStatus(gemini || null);
      setPythonStatus(python || null);
    } catch (err) {
      setAssistantStatus(null);
      setGeminiStatus(null);
      setPythonStatus(null);
      setAiRuntimeError(err.message || 'Etat IA indisponible');
    } finally {
      setAiRuntimeLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab !== 'utilisateurs') return;
    reloadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usersView]);

  const handleToggleBlock = async (u) => {
    const nextStatus = u.status === 'active' ? 'blocked' : 'active';
    const isBlocking = nextStatus === 'blocked';
    const confirmed = window.confirm(
      isBlocking
        ? `Confirmer le blocage de ${u.username} ? Toutes ses sessions actives seront deconnectees.`
        : `Confirmer le deblocage de ${u.username} ?`
    );
    if (!confirmed) return;

    const reasonInput = window.prompt(
      isBlocking
        ? `Motif du blocage de ${u.username} (minimum 5 caracteres):`
        : `Motif du deblocage de ${u.username} (minimum 5 caracteres):`
    );
    const reason = String(reasonInput || '').trim();
    if (reason.length < 5) {
      toast.error('Motif obligatoire (minimum 5 caracteres)');
      return;
    }

    setUserActionId(`status-${u._id}`);
    try {
      await patch(`/users/${u._id}/status`, { status: nextStatus, reason });
      toast.success(nextStatus === 'blocked' ? 'Utilisateur bloque' : 'Utilisateur debloque');
      await reloadUsers(); 
    } catch (e) {
      toast.error(e.message || 'Erreur');
    } finally {
      setUserActionId('');
    }
  };

  const handleRevokeSessions = async (u) => { 
    const confirmed = window.confirm(`Deconnecter toutes les sessions actives de ${u.username} ?`);
    if (!confirmed) return;
    setUserActionId(`revoke-${u._id}`);
    try {
      await post(`/users/${u._id}/revoke-sessions`, { reason: 'revoked_by_responsable' });
      toast.success('Sessions deconnectees');
      await reloadUsers(); 
    } catch (e) {
      toast.error(e.message || 'Erreur');
    } finally {
      setUserActionId('');
    }
  }; 

  const saveDemandeurProfile = async (u) => {
    const draft = String(demandeurProfileDraftById[u._id] || '').trim().toLowerCase();
    if (!draft) {
      toast.error('Profil demandeur invalide');
      return;
    }
    setUserActionId(`profile-${u._id}`);
    try {
      await patch(`/users/${u._id}/demandeur-profile`, { demandeur_profile: draft });
      toast.success('Profil catalogue mis a jour');
      await reloadUsers();
    } catch (e) {
      toast.error(e.message || 'Erreur mise a jour profil');
    } finally {
      setUserActionId('');
    }
  };
 
  const saveProfile = async () => {  
    setIsSaving(true); 
    try { 
      let imageProfile = profileData.imageProfile; 
      if (avatarFile) {
        const uploaded = await uploadFile('/files/upload', avatarFile);
        imageProfile = uploaded.file_url;
      }

      const updated = await patch('/settings/me/profile', {
        username: profileData.nom,
        email: profileData.email,
        telephone: profileData.telephone,
        image_profile: imageProfile || undefined,
      });

      setProfileData((prev) => ({ ...prev, imageProfile: updated?.user?.image_profile || imageProfile || '' }));
      if (updated?.user?.username) sessionStorage.setItem('userName', updated.user.username);
      if (updated?.user?.image_profile || imageProfile) { 
        sessionStorage.setItem('imageProfile', updated?.user?.image_profile || imageProfile || ''); 
      } 
      window.dispatchEvent(new Event('profile-updated')); 
      if (avatarPreviewUrl) URL.revokeObjectURL(avatarPreviewUrl);
      setAvatarPreviewUrl('');
      setAvatarFile(null); 
      toast.success('Profil mis a jour'); 
    } catch (err) { 
      toast.error(err.message || 'Erreur mise a jour profil'); 
    } finally {
      setIsSaving(false);
    }
  };

  const savePassword = async () => {
    if (!securityData.currentPassword || !securityData.newPassword || !securityData.confirmPassword) {
      toast.error('Veuillez remplir tous les champs mot de passe');
      return;
    }

    setIsSaving(true);
    try {
      await patch('/settings/me/password', {
        current_password: securityData.currentPassword,
        new_password: securityData.newPassword,
        confirm_password: securityData.confirmPassword,
      });
      setSecurityData({ currentPassword: '', newPassword: '', confirmPassword: '' });
      toast.success('Mot de passe modifie');
    } catch (err) {
      toast.error(err.message || 'Erreur modification mot de passe');
    } finally {
      setIsSaving(false);
    }
  };

  const savePreferences = async (next = {}) => {
    setIsSaving(true);
    try {
      await patch('/settings/me/preferences', {
        language: next.language || langue,
        dark_mode: next.dark_mode !== undefined ? next.dark_mode : isDarkMode,
        notifications: next.notifications || notifications,
      });
      toast.success('Preferences enregistrees');
    } catch (err) {
      toast.error(err.message || 'Erreur enregistrement preferences');
    } finally {
      setIsSaving(false);
    }
  };

  const saveLanguage = async (value) => {
    setLangue(value);
    setUiLanguage(value);
    await savePreferences({ language: value });
    toast.success(i18n.languageSaved);
  };

  const setThemeMode = async (dark) => { 
    if (dark !== isDarkMode) toggleTheme(); 
    await savePreferences({ dark_mode: dark }); 
  }; 

  const loadStockRulesImpact = async () => {
    setStockRulesImpactLoading(true);
    try {
      const payload = await get('/settings/stock-rules/impact');
      setStockRulesImpact(payload || null);
    } catch (err) {
      setStockRulesImpact(null);
      toast.error(err.message || "Impact indisponible (verifiez que le backend est demarre).");
    } finally {
      setStockRulesImpactLoading(false);
    }
  };

  const applyDefaultThresholdToMissingProducts = async () => {
    const missing = Number(stockRulesImpact?.counts?.products_without_threshold || 0);
    const seuil = Number(stockRulesImpact?.config?.seuilAlerte ?? stockRules.seuilAlerte);
    const confirmed = window.confirm(
      missing > 0
        ? `Appliquer le seuil global (${seuil}) a ${missing} produit(s) sans seuil (seuil_minimum = 0) ?`
        : `Aucun produit sans seuil detecte. Voulez-vous quand meme continuer ?`
    );
    if (!confirmed) return;
    setIsSaving(true);
    try {
      const r = await post('/settings/stock-rules/apply-default-threshold', {});
      toast.success(`Seuil applique. Produits modifies: ${r?.modified ?? 0}`);
      await loadStockRulesImpact();
    } catch (err) {
      toast.error(err.message || 'Erreur application seuil');
    } finally {
      setIsSaving(false);
    }
  };
 
  const saveStockRules = async () => { 
    const seuilAlerte = Number(stockRules.seuilAlerte);
    const joursInactivite = Number(stockRules.joursInactivite);
    if (!Number.isFinite(seuilAlerte) || seuilAlerte < 0) {
      toast.error("Le seuil d'alerte doit etre un nombre >= 0.");
      return;
    }
    if (!Number.isFinite(joursInactivite) || joursInactivite < 1) {
      toast.error("Les jours d'inactivite doivent etre >= 1.");
      return;
    }

    setIsSaving(true); 
    try { 
      const payload = { 
        seuilAlerte: Math.round(seuilAlerte), 
        joursInactivite: Math.round(joursInactivite), 
        validationObligatoire: Boolean(stockRules.validationObligatoire), 
      }; 
      await patch('/settings/stock-rules/config', { 
        ...payload, 
      }); 
      setStockRules(payload); 
      setStockRulesSavedAt(new Date().toISOString()); 
      toast.success('Regles de stock enregistrees'); 
      try {
        await loadStockRulesImpact();
      } catch {
        // ignore impact refresh errors
      }
    } catch (err) { 
      toast.error(err.message || 'Erreur enregistrement regles'); 
    } finally { 
      setIsSaving(false); 
    } 
  }; 
  const resetStockRules = () => {
    setStockRules({ ...STOCK_RULES_FRONT_DEFAULT });
    toast.info('Valeurs par defaut chargees. Cliquez sur "Enregistrer les regles".');
  };

  const saveAiSettings = async () => {
    setIsSaving(true);
    try {
      await patch('/settings/ai/config', aiSettings);
      toast.success('Configuration IA enregistree');
    } catch (err) {
      toast.error(err.message || 'Erreur enregistrement IA');
    } finally {
      setIsSaving(false);
    }
  };

  const enableAiDefaults = async () => {
    const confirmed = window.confirm("Reinitialiser la configuration IA (valeurs recommandees) ?\n\n- Predictions de rupture: OUI\n- Alertes automatiques: OUI\n- Analyse de consommation: OUI");
    if (!confirmed) return;
    const next = { predictionsEnabled: true, alertesAuto: true, analyseConsommation: true };
    setAiSettings(next);
    setIsSaving(true);
    try {
      await patch('/settings/ai/config', next);
      toast.success('IA re-activee (valeurs recommandees)');
    } catch (err) {
      toast.error(err.message || "Erreur activation IA");
    } finally {
      setIsSaving(false);
    }
  };

  const sendTestEmail = async () => {
    setIsSaving(true);
    try {
      await post('/settings/me/test-email', {});
      toast.success('Email de test envoye');
    } catch (err) {
      toast.error(err.message || "Echec envoi email");
    } finally {
      setIsSaving(false);
    }
  };

  const addCategory = async () => {  
    const name = String(newCategoryName || '').trim(); 
    if (!name) { 
      toast.error('Nom categorie obligatoire'); 
      return; 
    } 
    setIsSaving(true); 
    try { 
      await post('/categories', {
        name,
        description: `${name} (cree via parametres)`,
        audiences: newCategoryAudiences,
      }); 
      setNewCategoryName(''); 
      setNewCategoryAudiences([]);
      await loadCategories(); 
      toast.success('Categorie ajoutee'); 
    } catch (err) { 
      toast.error(err.message || 'Erreur ajout categorie'); 
    } finally { 
      setIsSaving(false);
    }
  };  

  const toggleNewCategoryAudience = (id) => {
    setNewCategoryAudiences((prev) => {
      const current = new Set(prev || []);
      if (current.has(id)) current.delete(id);
      else current.add(id);
      return Array.from(current);
    });
  };

  const toggleCategoryAudience = (catId, id) => {
    setCategoryAudiencesDraftById((prev) => {
      const current = new Set(Array.isArray(prev[catId]) ? prev[catId] : []);
      if (current.has(id)) current.delete(id);
      else current.add(id);
      return { ...prev, [catId]: Array.from(current) };
    });
  };

  const saveCategoryAudiences = async (cat) => {
    setIsSaving(true);
    try {
      const draft = Array.isArray(categoryAudiencesDraftById[cat._id]) ? categoryAudiencesDraftById[cat._id] : [];
      await patch(`/categories/${cat._id}`, { audiences: draft });
      toast.success('Categorie mise a jour');
      await loadCategories();
    } catch (err) {
      toast.error(err.message || 'Erreur mise a jour categorie');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAvatarFileChange = (event) => {
    const file = event.target.files?.[0] || null;
    if (!file) return;
    if (file.size > MAX_AVATAR_SIZE_BYTES) {
      toast.error('Photo trop lourde (max 5 MB).');
      return;
    }
    if (!/^image\/(png|jpe?g|webp|heic|heif|jpg)$/i.test(file.type || '')) {
      toast.error('Format image non supporte (png/jpg/jpeg/webp/heic/heif).');
      return;
    }
    if (avatarPreviewUrl) URL.revokeObjectURL(avatarPreviewUrl);
    setAvatarPreviewUrl(URL.createObjectURL(file));
    setAvatarFile(file);
  };

  const createSupplier = async () => {
    const name = String(newSupplier.name || '').trim();
    if (!name) {
      toast.error('Nom fournisseur obligatoire');
      return;
    }

    const lead = Number(newSupplier.default_lead_time_days || 0);
    if (!Number.isFinite(lead) || lead < 0) {
      toast.error('Delai par defaut invalide');
      return;
    }

    setIsSaving(true);
    try {
      await post('/suppliers', {
        name,
        email: String(newSupplier.email || '').trim() || undefined,
        phone: String(newSupplier.phone || '').trim() || undefined,
        default_lead_time_days: Math.floor(lead),
        status: 'active',
      });
      setNewSupplier({ name: '', email: '', phone: '', default_lead_time_days: 7 });
      await loadSuppliersData();
      toast.success('Fournisseur ajoute');
    } catch (err) {
      toast.error(err.message || 'Erreur ajout fournisseur');
    } finally {
      setIsSaving(false);
    }
  };

  const loadSupplierDetails = async (supplierId) => {
    const sid = String(supplierId || '').trim();
    if (!sid) return;
    if (supplierDetailLoadingById[sid]) return;
    setSupplierDetailLoadingById((prev) => ({ ...prev, [sid]: true }));
    try {
      const [linksRes, metricsRes, poRes] = await Promise.all([
        get(`/suppliers/${encodeURIComponent(sid)}/products`).catch(() => ({ ok: false, links: [] })),
        get(`/suppliers/${encodeURIComponent(sid)}/metrics`).catch(() => ({ ok: false })),
        get(`/purchase-orders?supplier_id=${encodeURIComponent(sid)}&limit=30`).catch(() => ({ purchase_orders: [] })),
      ]);
      setSupplierLinksById((prev) => ({ ...prev, [sid]: Array.isArray(linksRes?.links) ? linksRes.links : [] }));
      setSupplierMetricsById((prev) => ({ ...prev, [sid]: metricsRes }));
      setSupplierOrdersById((prev) => ({ ...prev, [sid]: Array.isArray(poRes?.purchase_orders) ? poRes.purchase_orders : [] }));
    } finally {
      setSupplierDetailLoadingById((prev) => ({ ...prev, [sid]: false }));
    }
  };

  const toggleSupplierExpanded = async (supplierId) => {
    const sid = String(supplierId || '').trim();
    if (!sid) return;
    const next = expandedSupplierId === sid ? '' : sid;
    setExpandedSupplierId(next);
    if (next) {
      await loadSupplierDetails(next);
      setSupplierLinkDraftById((prev) => ({
        ...prev,
        [next]: prev[next] || { product_id: '', lead_time_days: '', unit_price: '', is_primary: false, supplier_sku: '' },
      }));
    }
  };

  const linkProductToSupplier = async (supplierId) => {
    const sid = String(supplierId || '').trim();
    const draft = supplierLinkDraftById[sid] || {};
    if (!sid) return;
    if (!draft.product_id) {
      toast.error('Choisissez un produit');
      return;
    }
    const payload = {
      product_id: draft.product_id,
      lead_time_days: draft.lead_time_days === '' ? undefined : Number(draft.lead_time_days),
      unit_price: draft.unit_price === '' ? undefined : Number(draft.unit_price),
      is_primary: Boolean(draft.is_primary),
      supplier_sku: String(draft.supplier_sku || '').trim() || undefined,
    };
    setIsSaving(true);
    try {
      await post(`/suppliers/${encodeURIComponent(sid)}/products`, payload);
      toast.success('Produit lie au fournisseur');
      await loadSupplierDetails(sid);
    } catch (err) {
      toast.error(err.message || 'Echec liaison produit');
    } finally {
      setIsSaving(false);
    }
  };

  const updatePurchaseOrderStatus = async (poId, status) => {
    const id = String(poId || '').trim();
    const st = String(status || '').trim();
    if (!id) return;
    setIsSaving(true);
    try {
      await patch(`/purchase-orders/${encodeURIComponent(id)}/status`, { status: st });
      toast.success('Commande mise a jour');
      await loadSuppliersData();
      if (expandedSupplierId) await loadSupplierDetails(expandedSupplierId);
    } catch (err) {
      toast.error(err.message || 'Echec mise a jour commande');
    } finally {
      setIsSaving(false);
    }
  };

  const startReceivePurchaseOrder = async (po) => {
    const id = String(po?._id || '').trim();
    if (!id) return;
    const alreadyOpen = receivingPoId === id;
    if (alreadyOpen) {
      setReceivingPoId('');
      return;
    }

    const lines = Array.isArray(po?.lines) ? po.lines : [];
    const draftLines = lines.map((l) => {
      const ordered = Number(l?.quantity || 0);
      const received = Number(l?.quantity_received || 0);
      const remaining = Math.max(0, ordered - received);
      return {
        product_id: l?.product?._id || l?.product || '',
        product_name: l?.product?.name || 'Produit',
        ordered,
        received,
        remaining,
        quantity: remaining,
      };
    }).filter((x) => x.product_id);

    setReceiveDraftByPoId((prev) => ({
      ...prev,
      [id]: prev[id] || {
        delivery_note_number: '',
        supplier_doc_qr_value: '',
        lot_prefix: '',
        lines: draftLines,
      },
    }));
    setReceivingPoId(id);
  };

  const confirmReceivePurchaseOrder = async (poId) => {
    const id = String(poId || '').trim();
    if (!id) return;
    const draft = receiveDraftByPoId[id] || {};
    const lines = Array.isArray(draft?.lines) ? draft.lines : [];

    const receivedLines = lines
      .map((l) => ({
        product_id: l.product_id,
        quantity: Number(l.quantity || 0),
      }))
      .filter((l) => l.product_id && Number.isFinite(l.quantity) && l.quantity >= 0);

    setIsSaving(true);
    try {
      const result = await post(`/purchase-orders/${encodeURIComponent(id)}/receive`, {
        delivery_note_number: String(draft.delivery_note_number || '').trim() || undefined,
        supplier_doc_qr_value: String(draft.supplier_doc_qr_value || '').trim() || undefined,
        lot_prefix: String(draft.lot_prefix || '').trim() || undefined,
        received_lines: receivedLines,
      });
      const fully = Boolean(result?.fully_received);
      toast.success(fully ? 'Reception terminee (commande complete)' : 'Reception partielle enregistree');
      setReceivingPoId('');
      await loadSuppliersData();
      if (expandedSupplierId) await loadSupplierDetails(expandedSupplierId);
    } catch (err) {
      toast.error(err.message || 'Echec reception commande');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="app-layout">
      <div
        className={`sidebar-backdrop ${sidebarCollapsed ? 'hidden' : ''}`}
        onClick={() => setSidebarCollapsed(true)}
      />
      <SidebarResp
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        onLogout={onLogout}
        userName={userName}
      />

      <div className="main-container">
        <HeaderPage
          userName={userName}
          title={i18n.title}
          showSearch={false}
          onRefresh={loadSettings}
          onMenuClick={() => setSidebarCollapsed((prev) => !prev)}
        />

        <main className="main-content">
          {isLoading && <div className="users-empty">{i18n.loading}</div>}
          <div className="parametres-page">
            <div className="parametres-sidebar">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button key={tab.id} className={`param-tab ${activeTab === tab.id ? 'active' : ''}`} onClick={() => setActiveTab(tab.id)}>
                    <Icon size={18} />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="parametres-content">
              {activeTab === 'profil' && (
                <div className="param-section">
                  <h2>Informations personnelles</h2> 
                  <div className="avatar-section"> 
                    <div className="avatar-large resp"> 
                      {displayAvatarUrl ? <img src={displayAvatarUrl} alt="Profil" style={{ width: '100%', height: '100%', borderRadius: '50%' }} /> : <User size={40} />} 
                    </div> 
                    <label className="avatar-btn" type="button"> 
                      <Camera size={16} /> 
                      Changer la photo 
                      <input 
                        type="file" 
                        accept=".png,.jpg,.jpeg,.webp" 
                        style={{ display: 'none' }} 
                        onChange={handleAvatarFileChange} 
                      /> 
                    </label> 
                  </div> 
                  <p className="avatar-hint">
                    {avatarFile ? `Photo selectionnee: ${avatarFile.name}. Cliquez sur Enregistrer.` : 'Formats: png, jpg, jpeg, webp (max 5 MB).'}
                  </p>
                  <div className="form-group">
                    <label>Nom complet</label>
                    <input type="text" value={profileData.nom} onChange={(e) => setProfileData({ ...profileData, nom: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label>Email</label>
                    <input type="email" value={profileData.email} onChange={(e) => setProfileData({ ...profileData, email: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label>Telephone</label>
                    <input type="tel" value={profileData.telephone} onChange={(e) => setProfileData({ ...profileData, telephone: e.target.value })} />
                  </div>
                  <button className="btn-save resp" type="button" onClick={saveProfile} disabled={isSaving}>
                    <Save size={16} /> Enregistrer
                  </button>
                </div>
              )}

              {activeTab === 'securite' && (
                <div className="param-section">
                  <h2>Securite du compte</h2>
                  <div className="form-group">
                    <label>Mot de passe actuel</label>
                    <div className="password-input-wrap">
                      <input type={showPasswords.current ? 'text' : 'password'} placeholder="********" value={securityData.currentPassword} onChange={(e) => setSecurityData({ ...securityData, currentPassword: e.target.value })} />
                      <button type="button" className="password-toggle-btn" onClick={() => setShowPasswords((p) => ({ ...p, current: !p.current }))}>
                        {showPasswords.current ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>
                  <div className="form-group">
                    <label>Nouveau mot de passe</label>
                    <div className="password-input-wrap">
                      <input type={showPasswords.next ? 'text' : 'password'} placeholder="Nouveau mot de passe" value={securityData.newPassword} onChange={(e) => setSecurityData({ ...securityData, newPassword: e.target.value })} />
                      <button type="button" className="password-toggle-btn" onClick={() => setShowPasswords((p) => ({ ...p, next: !p.next }))}>
                        {showPasswords.next ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>
                  <div className="form-group">
                    <label>Confirmer le mot de passe</label>
                    <div className="password-input-wrap">
                      <input type={showPasswords.confirm ? 'text' : 'password'} placeholder="Confirmer" value={securityData.confirmPassword} onChange={(e) => setSecurityData({ ...securityData, confirmPassword: e.target.value })} />
                      <button type="button" className="password-toggle-btn" onClick={() => setShowPasswords((p) => ({ ...p, confirm: !p.confirm }))}>
                        {showPasswords.confirm ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>
                  <button className="btn-save resp" type="button" onClick={savePassword} disabled={isSaving}>
                    <Lock size={16} /> Changer le mot de passe
                  </button>
                </div>
              )}

              {activeTab === 'apparence' && (
                <div className="param-section">
                  <h2>Apparence</h2>
                  <div className="theme-selector">
                    <button className={`theme-option ${!isDarkMode ? 'active' : ''}`} onClick={() => setThemeMode(false)} type="button">
                      <Sun size={24} /> <span>Mode clair</span>
                    </button>
                    <button className={`theme-option ${isDarkMode ? 'active' : ''}`} onClick={() => setThemeMode(true)} type="button">
                      <Moon size={24} /> <span>Mode sombre</span>
                    </button>
                  </div>
                </div>
              )}

              {activeTab === 'langue' && (
                <div className="param-section">
                  <h2>Langue</h2>
                  <div className="langue-selector">
                    <button className={`langue-option ${langue === 'fr' ? 'active' : ''}`} onClick={() => saveLanguage('fr')} type="button">Francais</button>
                    <button className={`langue-option ${langue === 'ar' ? 'active' : ''}`} onClick={() => saveLanguage('ar')} type="button">Arabe</button>
                    <button className={`langue-option ${langue === 'en' ? 'active' : ''}`} onClick={() => saveLanguage('en')} type="button">English</button>
                  </div>
                </div>
              )}

              {activeTab === 'notifications' && (
                <div className="param-section">
                  <h2>Notifications</h2>
                  <div className="toggle-list">
                    <div className="toggle-item">
                      <div>
                        <span className="toggle-label">Notifications par email</span>
                        <span className="toggle-desc">Recevoir les alertes par email</span>
                      </div>
                      <label className="toggle-switch">
                        <input type="checkbox" checked={notifications.email} onChange={(e) => setNotifications({ ...notifications, email: e.target.checked })} />
                        <span className="toggle-slider"></span>
                      </label>
                    </div>
                    <div className="toggle-item">
                      <div>
                        <span className="toggle-label">Notifications push</span>
                        <span className="toggle-desc">Activer les notifications push sur navigateur</span>
                      </div>
                      <label className="toggle-switch">
                        <input type="checkbox" checked={notifications.push} onChange={(e) => setNotifications({ ...notifications, push: e.target.checked })} />
                        <span className="toggle-slider"></span>
                      </label>
                    </div>
                    <div className="toggle-item">
                      <div>
                        <span className="toggle-label">Alertes de stock</span>
                        <span className="toggle-desc">Etre notifie quand le stock est bas</span>
                      </div>
                      <label className="toggle-switch">
                        <input type="checkbox" checked={notifications.stockAlerts} onChange={(e) => setNotifications({ ...notifications, stockAlerts: e.target.checked })} />
                        <span className="toggle-slider"></span>
                      </label>
                    </div>
                    <div className="toggle-item">
                      <div>
                        <span className="toggle-label">Alertes de demandes</span>
                        <span className="toggle-desc">Etre notifie des demandes entrantes</span>
                      </div>
                      <label className="toggle-switch">
                        <input type="checkbox" checked={notifications.demandesAlerts} onChange={(e) => setNotifications({ ...notifications, demandesAlerts: e.target.checked })} />
                        <span className="toggle-slider"></span>
                      </label>
                    </div>
                  </div>
                  <button className="btn-save resp" type="button" onClick={() => savePreferences({ notifications })} disabled={isSaving}>
                    <Save size={16} /> Enregistrer
                  </button>
                  <button className="btn-save resp" type="button" onClick={sendTestEmail} disabled={isSaving}>
                    <Bell size={16} /> Tester email
                  </button>
                </div>
              )}

              {activeTab === 'categories' && ( 
                <div className="param-section"> 
                  <h2>Gestion des categories</h2> 
                  <div className="categories-list"> 
                    {categories.map((cat) => ( 
                      <div key={cat._id} className="category-item"> 
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Layers size={16} /> 
                          <span style={{ fontWeight: 900 }}>{cat.name}</span>
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginTop: 8 }}>
                          <span style={{ fontSize: 12, color: '#64748b', fontWeight: 800 }}>Visible pour:</span>
                          {DEMANDEUR_PROFILES.map((p) => (
                            <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 800, color: '#0f172a' }}>
                              <input
                                type="checkbox"
                                checked={(categoryAudiencesDraftById[cat._id] || []).includes(p.id)}
                                onChange={() => toggleCategoryAudience(cat._id, p.id)}
                                disabled={isSaving}
                              />
                              {p.label}
                            </label>
                          ))}
                          <button className="btn-add" type="button" onClick={() => saveCategoryAudiences(cat)} disabled={isSaving}>
                            Enregistrer
                          </button>
                          <span style={{ fontSize: 12, color: '#64748b' }}>
                            (Si aucun n'est coche: visible pour tous les demandeurs)
                          </span>
                        </div>
                      </div> 
                    ))} 
                  </div> 
                  <div className="add-category"> 
                    <input type="text" placeholder="Nouvelle categorie..." value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} /> 
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginTop: 8 }}>
                      <span style={{ fontSize: 12, color: '#64748b', fontWeight: 800 }}>Audiences:</span>
                      {DEMANDEUR_PROFILES.map((p) => (
                        <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 800, color: '#0f172a' }}>
                          <input
                            type="checkbox"
                            checked={(newCategoryAudiences || []).includes(p.id)}
                            onChange={() => toggleNewCategoryAudience(p.id)}
                            disabled={isSaving}
                          />
                          {p.label}
                        </label>
                      ))}
                    </div>
                    <button className="btn-add" type="button" onClick={addCategory} disabled={isSaving}>Ajouter</button> 
                  </div> 
                </div> 
              )} 

              {activeTab === 'regles' && (
                <div className="param-section">
                  <h2>Regles de gestion du stock</h2>
                  <div className="rules-help-card"> 
                    <h3>A quoi sert cet onglet ?</h3> 
                    <p>Ces regles sont appliquees globalement sur tout le stock pour declencher les alertes et les validations.</p> 
                    <p style={{ marginTop: 8 }}>
                      Important: le seuil d&apos;un produit (seuil minimum) reste prioritaire. Le seuil global sert de valeur par defaut et d&apos;outil de normalisation.
                    </p>
                    <ol> 
                      <li>Definir le seuil global d'alerte stock.</li> 
                      <li>Definir la duree d'inactivite d'un produit.</li> 
                      <li>Activer ou non la validation des nouveaux produits.</li> 
                    </ol> 
                  </div> 
                  <div className="form-group">
                    <label>Seuil d'alerte par defaut</label>
                    <input type="number" value={stockRules.seuilAlerte} onChange={(e) => setStockRules({ ...stockRules, seuilAlerte: e.target.value })} />
                    <span className="input-hint">Quantite minimum avant alerte</span>
                  </div>
                  <div className="form-group">
                    <label>Jours d'inactivite</label>
                    <input type="number" value={stockRules.joursInactivite} onChange={(e) => setStockRules({ ...stockRules, joursInactivite: e.target.value })} />
                    <span className="input-hint">Produit considere inactif apres ce nombre de jours</span>
                  </div>
                  <div className="toggle-item">
                    <div>
                      <span className="toggle-label">Validation obligatoire des nouveaux produits</span>
                      <span className="toggle-desc">Les produits ajoutes par le magasinier doivent etre valides</span>
                    </div>
                    <label className="toggle-switch">
                      <input type="checkbox" checked={stockRules.validationObligatoire} onChange={(e) => setStockRules({ ...stockRules, validationObligatoire: e.target.checked })} />
                      <span className="toggle-slider"></span>
                    </label>
                  </div>
                  <div className="rules-preview"> 
                    <h3>Apercu operationnel</h3> 
                    {stockRulesPreview.valid ? ( 
                      <> 
                        <p>Le systeme classe un produit en alerte a partir de <strong>{stockRulesPreview.seuil}</strong> unite(s).</p> 
                        <p>Le systeme classe un produit inactif apres <strong>{stockRulesPreview.jours}</strong> jour(s) sans mouvement.</p> 
                        <p>Validation nouveaux produits: <strong>{stockRules.validationObligatoire ? 'obligatoire' : 'non obligatoire'}</strong>.</p> 
                      </> 
                    ) : ( 
                      <p>Valeurs invalides detectees. Corrigez les champs avant sauvegarde.</p> 
                    )} 
                    {stockRulesSavedAt && ( 
                      <p className="rules-saved-at">Derniere sauvegarde: {formatTimeFr(stockRulesSavedAt)}</p> 
                    )} 
                  </div> 

                  <div className="rules-preview"> 
                    <h3>Impact sur le catalogue</h3>
                    {stockRulesImpactLoading ? (
                      <p>Analyse en cours...</p>
                    ) : stockRulesImpact?.counts ? (
                      <>
                        <p>
                          Produits approuves: <strong>{stockRulesImpact.counts.total_approved_products}</strong>
                        </p>
                        <p>
                          Produits sans seuil (seuil_minimum = 0): <strong>{stockRulesImpact.counts.products_without_threshold}</strong>
                        </p>
                        <p>
                          Sous seuil (avec seuil specifique): <strong>{stockRulesImpact.counts.products_under_threshold}</strong>
                        </p>
                        <p>
                          En rupture: <strong>{stockRulesImpact.counts.products_in_rupture}</strong>
                        </p>
                        {stockRulesImpact.note ? (
                          <p style={{ marginTop: 8, color: '#64748b' }}>{stockRulesImpact.note}</p>
                        ) : null}
                        <div className="rules-actions" style={{ marginTop: 12 }}>
                          <button
                            className="btn-secondary"
                            type="button"
                            onClick={applyDefaultThresholdToMissingProducts}
                            disabled={isSaving || !stockRulesPreview.valid}
                          >
                            Appliquer le seuil global aux produits sans seuil
                          </button>
                        </div>
                      </>
                    ) : (
                      <p>Impact indisponible. Cliquez sur Actualiser ou reessayez plus tard.</p>
                    )}
                  </div>

                  <div className="rules-actions"> 
                    <button className="btn-save resp" type="button" onClick={saveStockRules} disabled={isSaving || !stockRulesPreview.valid}> 
                      <Save size={16} /> Enregistrer les regles 
                    </button> 
                    <button className="btn-secondary" type="button" onClick={resetStockRules} disabled={isSaving}>
                      Valeurs par defaut
                    </button>
                  </div>
                </div>
              )}

              {activeTab === 'utilisateurs' && ( 
                <div className="param-section"> 
                  <div className="users-header"> 
                    <div> 
                      <h2>Gestion des utilisateurs</h2> 
                      {usersView === 'magasinier' ? (
                        <p className="users-subtitle">Magasiniers connectes: <strong>{onlineMagasiniers.length}</strong> / {magasiniers.length}</p> 
                      ) : (
                        <p className="users-subtitle">Demandeurs: <strong>{demandeurs.length}</strong></p>
                      )}
                    </div> 
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <div style={{ display: 'flex', gap: 6, padding: 4, background: '#f1f5f9', borderRadius: 999 }}>
                        <button
                          type="button"
                          onClick={() => setUsersView('magasinier')}
                          disabled={usersLoading || isSaving}
                          style={{
                            border: 'none',
                            padding: '6px 10px',
                            borderRadius: 999,
                            fontWeight: 900,
                            cursor: 'pointer',
                            background: usersView === 'magasinier' ? '#0ea5e9' : 'transparent',
                            color: usersView === 'magasinier' ? '#fff' : '#0f172a',
                          }}
                        >
                          Magasiniers
                        </button>
                        <button
                          type="button"
                          onClick={() => setUsersView('demandeur')}
                          disabled={usersLoading || isSaving}
                          style={{
                            border: 'none',
                            padding: '6px 10px',
                            borderRadius: 999,
                            fontWeight: 900,
                            cursor: 'pointer',
                            background: usersView === 'demandeur' ? '#0ea5e9' : 'transparent',
                            color: usersView === 'demandeur' ? '#fff' : '#0f172a',
                          }}
                        >
                          Demandeurs
                        </button>
                      </div>
                      <button className="btn-refresh" type="button" onClick={reloadUsers} disabled={usersLoading || isSaving}>Actualiser</button> 
                    </div>
                  </div> 
 
                  {usersLoading && <div className="users-empty">Chargement...</div>} 
                  {!usersLoading && usersError && <div className="users-error">{usersError}</div>} 
 
                  {!usersLoading && !usersError && ( 
                    <div className="users-list"> 
                      {(usersView === 'magasinier' ? magasiniers : demandeurs).map((u) => ( 
                        <div key={u._id} className="user-item"> 
                          <div className="user-avatar mag"><User size={18} /></div> 
                          <div className="user-info"> 
                            <span className="user-name">{u.username}</span> 
                            <span className="user-role">{roleLabel(u.role)} - {u.email}</span> 
                            {usersView === 'demandeur' && (
                              <div style={{ marginTop: 6, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                                <span style={{ fontSize: 12, color: '#64748b', fontWeight: 800 }}>Catalogue:</span>
                                <select
                                  value={demandeurProfileDraftById[u._id] || u.demandeur_profile || 'bureautique'}
                                  onChange={(e) => setDemandeurProfileDraftById((p) => ({ ...p, [u._id]: e.target.value }))}
                                  disabled={Boolean(userActionId) || isSaving}
                                  style={{ padding: '6px 10px', borderRadius: 10, border: '1px solid #e2e8f0', fontWeight: 900 }}
                                >
                                  {DEMANDEUR_PROFILES.map((p) => (
                                    <option key={p.id} value={p.id}>
                                      {p.label}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            )}
                          </div> 
                          <div className="user-meta"> 
                            <span className={`user-status ${u.status === 'active' ? 'online' : 'blocked'}`}>{u.status === 'active' ? 'Actif' : 'Bloque'}</span> 
                            <span className={`session-pill ${(u.activeSessionsCount || 0) > 0 ? 'on' : 'off'}`}>Sessions: {u.activeSessionsCount || 0}</span> 
                          </div> 
                          <div className="user-actions"> 
                            {usersView === 'demandeur' && (
                              <button
                                className="btn-user secondary"
                                type="button"
                                onClick={() => saveDemandeurProfile(u)}
                                disabled={Boolean(userActionId) || isSaving}
                                title="Enregistrer le profil catalogue"
                              >
                                {userActionId === `profile-${u._id}` ? '...' : 'Enregistrer'}
                              </button>
                            )}
                            <button 
                              className="btn-user secondary" 
                              type="button" 
                              onClick={() => handleRevokeSessions(u)} 
                              disabled={(u.activeSessionsCount || 0) === 0 || Boolean(userActionId)} 
                              title="Deconnecter toutes les sessions"
                            >
                              {userActionId === `revoke-${u._id}` ? '...' : 'Deconnecter'}
                            </button>
                            <button
                              className={`btn-user ${u.status === 'active' ? 'danger' : 'success'}`}
                              type="button"
                              onClick={() => handleToggleBlock(u)}
                              disabled={Boolean(userActionId)}
                            >
                              {userActionId === `status-${u._id}` ? '...' : u.status === 'active' ? 'Bloquer' : 'Debloquer'}
                            </button>
                          </div> 
                        </div> 
                      ))} 
 
                      {usersView === 'magasinier' && magasiniers.length === 0 && <div className="users-empty">Aucun magasinier.</div>} 
                      {usersView === 'demandeur' && demandeurs.length === 0 && <div className="users-empty">Aucun demandeur.</div>} 
                    </div> 
                  )} 
                </div> 
              )} 

              {activeTab === 'fournisseurs' && (
                <div className="param-section">
                  <div className="users-header">
                    <div>
                      <h2>Fournisseurs</h2>
                      <p className="users-subtitle">Gérer les fournisseurs + voir les commandes récentes</p>
                    </div>
                    <button className="btn-refresh" type="button" onClick={loadSuppliersData} disabled={suppliersLoading}>
                      Actualiser
                    </button>
                  </div>

                  <div className="users-list" style={{ marginTop: 10 }}>
                    <div className="user-item" style={{ alignItems: 'flex-start' }}>
                      <div className="user-info" style={{ width: '100%' }}>
                        <span className="user-name">Ajouter un fournisseur</span>
                        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 0.8fr', gap: 10, marginTop: 10 }}>
                          <input
                            value={newSupplier.name}
                            onChange={(e) => setNewSupplier((p) => ({ ...p, name: e.target.value }))}
                            placeholder="Nom"
                          />
                          <input
                            value={newSupplier.email}
                            onChange={(e) => setNewSupplier((p) => ({ ...p, email: e.target.value }))}
                            placeholder="Email"
                          />
                          <input
                            value={newSupplier.phone}
                            onChange={(e) => setNewSupplier((p) => ({ ...p, phone: e.target.value }))}
                            placeholder="Telephone"
                          />
                          <input
                            type="number"
                            min="0"
                            value={newSupplier.default_lead_time_days}
                            onChange={(e) => setNewSupplier((p) => ({ ...p, default_lead_time_days: e.target.value }))}
                            placeholder="Delai (j)"
                          />
                        </div>
                        <div className="user-actions" style={{ marginTop: 10 }}>
                          <button className="btn-user success" type="button" onClick={createSupplier} disabled={isSaving}>
                            {isSaving ? '...' : 'Ajouter'}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {suppliersLoading && <div className="users-empty">Chargement...</div>}
                  {!suppliersLoading && suppliersError && <div className="users-error">{suppliersError}</div>}

                  {!suppliersLoading && !suppliersError && (
                    <div className="users-list">
                      {suppliers.map((s) => (
                        <div
                          key={s._id}
                          className="user-item"
                          style={expandedSupplierId === s._id ? { flexDirection: 'column', alignItems: 'stretch' } : undefined}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%' }}>
                          <div className="user-avatar mag"><Truck size={18} /></div>
                          <div className="user-info">
                            <span className="user-name">{s.name}</span>
                            <span className="user-role">Delai defaut: {Number(s.default_lead_time_days || 0)}j</span>
                          </div>
                          <div className="user-meta">
                            <span className={`user-status ${s.status === 'active' ? 'online' : 'blocked'}`}>{s.status === 'active' ? 'Actif' : 'Inactif'}</span>
                          </div>
                          <div className="user-actions" style={{ marginLeft: 'auto' }}>
                            <button className="btn-user" type="button" onClick={() => toggleSupplierExpanded(s._id)} disabled={suppliersLoading || isSaving}>
                              {expandedSupplierId === s._id ? 'Fermer' : 'Gérer'}
                            </button>
                          </div>
                          </div>

                          {expandedSupplierId === s._id && (
                            <div style={{ marginTop: 12, borderTop: '1px solid #e2e8f0', paddingTop: 12 }}>
                              {supplierDetailLoadingById[s._id] ? (
                                <div className="users-empty">Chargement details...</div>
                              ) : (
                                <>
                                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                    <div className="user-item" style={{ margin: 0 }}>
                                      <div className="user-info" style={{ width: '100%' }}>
                                        <span className="user-name">Score & KPIs</span>
                                        <span className="user-role">
                                          Score: <strong>{supplierMetricsById[s._id]?.score ?? '-'}</strong> / 100
                                          {' '}• A l'heure: {supplierMetricsById[s._id]?.kpis?.on_time_rate ?? '-'}%
                                          {' '}• Delai moyen: {supplierMetricsById[s._id]?.kpis?.avg_lead_time_days ?? '-'}j
                                          {' '}• Retard moyen: {supplierMetricsById[s._id]?.kpis?.avg_delay_days ?? '-'}j
                                        </span>
                                      </div>
                                    </div>

                                    <div className="user-item" style={{ margin: 0 }}>
                                      <div className="user-info" style={{ width: '100%' }}>
                                        <span className="user-name">Lier un produit</span>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 0.7fr 0.7fr 0.6fr', gap: 10, marginTop: 10 }}>
                                          <select
                                            value={supplierLinkDraftById[s._id]?.product_id || ''}
                                            onChange={(e) => setSupplierLinkDraftById((p) => ({ ...p, [s._id]: { ...(p[s._id] || {}), product_id: e.target.value } }))}
                                          >
                                            <option value="">Choisir produit...</option>
                                            {approvedProducts.map((p) => (
                                              <option key={p.id} value={p.id}>{p.name} ({p.code})</option>
                                            ))}
                                          </select>
                                          <input
                                            type="number"
                                            min="0"
                                            value={supplierLinkDraftById[s._id]?.lead_time_days ?? ''}
                                            onChange={(e) => setSupplierLinkDraftById((p) => ({ ...p, [s._id]: { ...(p[s._id] || {}), lead_time_days: e.target.value } }))}
                                            placeholder="Delai (j)"
                                          />
                                          <input
                                            type="number"
                                            min="0"
                                            value={supplierLinkDraftById[s._id]?.unit_price ?? ''}
                                            onChange={(e) => setSupplierLinkDraftById((p) => ({ ...p, [s._id]: { ...(p[s._id] || {}), unit_price: e.target.value } }))}
                                            placeholder="Prix"
                                          />
                                          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 900, color: '#334155' }}>
                                            <input
                                              type="checkbox"
                                              checked={Boolean(supplierLinkDraftById[s._id]?.is_primary)}
                                              onChange={(e) => setSupplierLinkDraftById((p) => ({ ...p, [s._id]: { ...(p[s._id] || {}), is_primary: e.target.checked } }))}
                                            />
                                            Principal
                                          </label>
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, marginTop: 10 }}>
                                          <input
                                            value={supplierLinkDraftById[s._id]?.supplier_sku ?? ''}
                                            onChange={(e) => setSupplierLinkDraftById((p) => ({ ...p, [s._id]: { ...(p[s._id] || {}), supplier_sku: e.target.value } }))}
                                            placeholder="SKU fournisseur (optionnel)"
                                          />
                                          <button className="btn-user success" type="button" onClick={() => linkProductToSupplier(s._id)} disabled={isSaving}>
                                            {isSaving ? '...' : 'Lier'}
                                          </button>
                                        </div>
                                      </div>
                                    </div>
                                  </div>

                                  <div style={{ marginTop: 12 }}>
                                    <span className="user-name">Produits lies</span>
                                    {!Array.isArray(supplierLinksById[s._id]) || supplierLinksById[s._id].length === 0 ? (
                                      <div className="users-empty">Aucun produit lie.</div>
                                    ) : (
                                      <div className="users-list" style={{ marginTop: 10 }}>
                                        {supplierLinksById[s._id].slice(0, 12).map((lnk) => (
                                          <div key={lnk._id} className="user-item">
                                            <div className="user-info">
                                              <span className="user-name">{lnk.product?.name || 'Produit'} <span className="user-role">{lnk.product?.code_product || ''}</span></span>
                                              <span className="user-role">
                                                Delai: {lnk.lead_time_days ?? '-'}j • Prix: {lnk.unit_price ?? '-'} • {lnk.is_primary ? 'Principal' : 'Secondaire'}
                                              </span>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>

                                  <div style={{ marginTop: 12 }}>
                                    <span className="user-name">Commandes fournisseur</span>
                                    {!Array.isArray(supplierOrdersById[s._id]) || supplierOrdersById[s._id].length === 0 ? (
                                      <div className="users-empty">Aucune commande pour ce fournisseur.</div>
                                    ) : (
                                      <div className="users-list" style={{ marginTop: 10 }}>
                                        {supplierOrdersById[s._id].slice(0, 10).map((po) => (
                                          <div key={po._id} className="user-item">
                                            <div className="user-info">
                                              <span className="user-name">PO {String(po._id).slice(-6).toUpperCase()}</span>
                                              <span className="user-role">
                                                Statut: {po.status} • {po.ordered_at ? new Date(po.ordered_at).toLocaleDateString('fr-FR') : '-'}
                                                {po.promised_at ? ` • Prevu: ${new Date(po.promised_at).toLocaleDateString('fr-FR')}` : ''}
                                              </span>
                                            </div>
                                            <div className="user-actions">
                                              {po.status !== 'delivered' && (
                                                <button className="btn-user success" type="button" onClick={() => startReceivePurchaseOrder(po)} disabled={isSaving}>
                                                  {receivingPoId === po._id ? 'Fermer' : 'Receptionner'}
                                                </button>
                                              )}
                                              {po.status !== 'cancelled' && po.status !== 'delivered' && (
                                                <button className="btn-user danger" type="button" onClick={() => updatePurchaseOrderStatus(po._id, 'cancelled')} disabled={isSaving}>
                                                  Annuler
                                                </button>
                                              )}
                                            </div>
                                            {receivingPoId === po._id && (
                                              <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px dashed #e2e8f0', width: '100%' }}>
                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                                                  <input
                                                    value={receiveDraftByPoId[po._id]?.delivery_note_number || ''}
                                                    onChange={(e) => setReceiveDraftByPoId((p) => ({ ...p, [po._id]: { ...(p[po._id] || {}), delivery_note_number: e.target.value } }))}
                                                    placeholder="Bon livraison (optionnel)"
                                                  />
                                                  <input
                                                    value={receiveDraftByPoId[po._id]?.supplier_doc_qr_value || ''}
                                                    onChange={(e) => setReceiveDraftByPoId((p) => ({ ...p, [po._id]: { ...(p[po._id] || {}), supplier_doc_qr_value: e.target.value } }))}
                                                    placeholder="QR fournisseur (optionnel)"
                                                  />
                                                  <input
                                                    value={receiveDraftByPoId[po._id]?.lot_prefix || ''}
                                                    onChange={(e) => setReceiveDraftByPoId((p) => ({ ...p, [po._id]: { ...(p[po._id] || {}), lot_prefix: e.target.value } }))}
                                                    placeholder="Prefix lot (optionnel)"
                                                  />
                                                </div>

                                                <div style={{ marginTop: 10 }}>
                                                  {(receiveDraftByPoId[po._id]?.lines || []).map((l, idx) => (
                                                    <div key={`${l.product_id}_${idx}`} style={{ display: 'grid', gridTemplateColumns: '1.6fr 0.6fr 0.6fr 0.8fr', gap: 10, alignItems: 'center', marginTop: 8 }}>
                                                      <div style={{ fontWeight: 900, color: '#0f172a' }}>{l.product_name}</div>
                                                      <div style={{ fontWeight: 900, color: '#334155', fontSize: 12 }}>Cmd: {l.ordered}</div>
                                                      <div style={{ fontWeight: 900, color: '#334155', fontSize: 12 }}>Recu: {l.received}</div>
                                                      <input
                                                        type="number"
                                                        min="0"
                                                        max={l.remaining}
                                                        value={receiveDraftByPoId[po._id]?.lines?.[idx]?.quantity ?? 0}
                                                        onChange={(e) => {
                                                          const raw = Number(e.target.value);
                                                          const safe = Number.isFinite(raw) ? Math.max(0, Math.min(l.remaining, Math.floor(raw))) : 0;
                                                          setReceiveDraftByPoId((p) => {
                                                            const current = p[po._id] || {};
                                                            const nextLines = Array.isArray(current.lines) ? [...current.lines] : [];
                                                            nextLines[idx] = { ...nextLines[idx], quantity: safe };
                                                            return { ...p, [po._id]: { ...current, lines: nextLines } };
                                                          });
                                                        }}
                                                        placeholder="A recevoir"
                                                      />
                                                    </div>
                                                  ))}
                                                </div>

                                                <div className="user-actions" style={{ marginTop: 10 }}>
                                                  <button className="btn-user success" type="button" onClick={() => confirmReceivePurchaseOrder(po._id)} disabled={isSaving}>
                                                    Confirmer reception
                                                  </button>
                                                </div>
                                              </div>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                      {suppliers.length === 0 && <div className="users-empty">Aucun fournisseur.</div>}
                    </div>
                  )}

                  <div style={{ marginTop: 18 }}>
                    <h2>Commandes recentes</h2>
                    {!purchaseOrders.length ? (
                      <div className="users-empty">Aucune commande.</div>
                    ) : (
                      <div className="users-list">
                        {purchaseOrders.slice(0, 18).map((po) => (
                          <div key={po._id} className="user-item">
                            <div className="user-info">
                              <span className="user-name">{po.supplier?.name || 'Fournisseur'}</span>
                              <span className="user-role">
                                Statut: {po.status} • Commande: {po.ordered_at ? new Date(po.ordered_at).toLocaleDateString('fr-FR') : '-'}
                                {po.promised_at ? ` • Prevu: ${new Date(po.promised_at).toLocaleDateString('fr-FR')}` : ''}
                              </span>
                            </div>
                            <div className="user-meta">
                              <span className={`session-pill ${po.status === 'delivered' ? 'on' : 'off'}`}>
                                {po.status === 'delivered' ? 'Recue' : 'En cours'}
                              </span>
                            </div>
                            <div className="user-actions">
                              {po.status !== 'delivered' && (
                                <button className="btn-user success" type="button" onClick={() => startReceivePurchaseOrder(po)} disabled={isSaving}>
                                  {receivingPoId === po._id ? 'Fermer' : 'Receptionner'}
                                </button>
                              )}
                              {po.status !== 'cancelled' && po.status !== 'delivered' && (
                                <button className="btn-user danger" type="button" onClick={() => updatePurchaseOrderStatus(po._id, 'cancelled')} disabled={isSaving}>
                                  Annuler
                                </button>
                              )}
                            </div>
                            {receivingPoId === po._id && (
                              <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px dashed #e2e8f0', width: '100%' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                                  <input
                                    value={receiveDraftByPoId[po._id]?.delivery_note_number || ''}
                                    onChange={(e) => setReceiveDraftByPoId((p) => ({ ...p, [po._id]: { ...(p[po._id] || {}), delivery_note_number: e.target.value } }))}
                                    placeholder="Bon livraison (optionnel)"
                                  />
                                  <input
                                    value={receiveDraftByPoId[po._id]?.supplier_doc_qr_value || ''}
                                    onChange={(e) => setReceiveDraftByPoId((p) => ({ ...p, [po._id]: { ...(p[po._id] || {}), supplier_doc_qr_value: e.target.value } }))}
                                    placeholder="QR fournisseur (optionnel)"
                                  />
                                  <input
                                    value={receiveDraftByPoId[po._id]?.lot_prefix || ''}
                                    onChange={(e) => setReceiveDraftByPoId((p) => ({ ...p, [po._id]: { ...(p[po._id] || {}), lot_prefix: e.target.value } }))}
                                    placeholder="Prefix lot (optionnel)"
                                  />
                                </div>

                                <div style={{ marginTop: 10 }}>
                                  {(receiveDraftByPoId[po._id]?.lines || []).map((l, idx) => (
                                    <div key={`${l.product_id}_${idx}`} style={{ display: 'grid', gridTemplateColumns: '1.6fr 0.6fr 0.6fr 0.8fr', gap: 10, alignItems: 'center', marginTop: 8 }}>
                                      <div style={{ fontWeight: 900, color: '#0f172a' }}>{l.product_name}</div>
                                      <div style={{ fontWeight: 900, color: '#334155', fontSize: 12 }}>Cmd: {l.ordered}</div>
                                      <div style={{ fontWeight: 900, color: '#334155', fontSize: 12 }}>Recu: {l.received}</div>
                                      <input
                                        type="number"
                                        min="0"
                                        max={l.remaining}
                                        value={receiveDraftByPoId[po._id]?.lines?.[idx]?.quantity ?? 0}
                                        onChange={(e) => {
                                          const raw = Number(e.target.value);
                                          const safe = Number.isFinite(raw) ? Math.max(0, Math.min(l.remaining, Math.floor(raw))) : 0;
                                          setReceiveDraftByPoId((p) => {
                                            const current = p[po._id] || {};
                                            const nextLines = Array.isArray(current.lines) ? [...current.lines] : [];
                                            nextLines[idx] = { ...nextLines[idx], quantity: safe };
                                            return { ...p, [po._id]: { ...current, lines: nextLines } };
                                          });
                                        }}
                                        placeholder="A recevoir"
                                      />
                                    </div>
                                  ))}
                                </div>

                                <div className="user-actions" style={{ marginTop: 10 }}>
                                  <button className="btn-user success" type="button" onClick={() => confirmReceivePurchaseOrder(po._id)} disabled={isSaving}>
                                    Confirmer reception
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'ia' && (
                <div className="param-section">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                    <h2 style={{ margin: 0 }}>Parametres Intelligence Artificielle</h2>
                    <button className="btn-refresh" type="button" onClick={loadAiRuntimeStatus} disabled={aiRuntimeLoading}>
                      <RefreshCw size={16} /> Actualiser etat
                    </button>
                  </div>

                  {aiRuntimeError ? (
                    <div className="users-empty" style={{ marginTop: 10 }}>
                      {aiRuntimeError}
                    </div>
                  ) : (
                    <div style={{ marginTop: 10 }}>
                      <div className="toggle-list">
                        <div className="toggle-item">
                          <div>
                            <span className="toggle-label">Etat IA</span>
                            <span className="toggle-desc">
                              {assistantStatus?.ai_config?.predictionsEnabled === false
                                ? "Predictions desactivees"
                                : "Predictions actives"}
                              {assistantStatus?.models?.trained ? " • Modele: entraine" : " • Modele: fallback (non entraine)"}
                            </span>
                          </div>
                          <div style={{ fontWeight: 900, color: assistantStatus?.ok ? '#15803d' : '#b91c1c' }}>
                            {aiRuntimeLoading ? '...' : assistantStatus?.ok ? 'OK' : 'N/A'}
                          </div>
                        </div>

                        <div className="toggle-item">
                          <div>
                            <span className="toggle-label">Python / Modeles</span>
                            <span className="toggle-desc">
                              {pythonStatus?.python?.ok ? 'Python pret' : (pythonStatus?.python?.user_message || 'Python indisponible')}
                            </span>
                          </div>
                          <div style={{ fontWeight: 900, color: pythonStatus?.python?.ok ? '#15803d' : '#b45309' }}>
                            {aiRuntimeLoading ? '...' : pythonStatus?.python?.ok ? 'OK' : 'WARN'}
                          </div>
                        </div>

                        <div className="toggle-item">
                          <div>
                            <span className="toggle-label">Gemini (chatbot)</span>
                            <span className="toggle-desc">
                              {geminiStatus?.configured
                                ? `Configure (modele: ${geminiStatus?.model_default || 'gemini'})`
                                : "Non configure (GEMINI_API_KEY manquante ou invalide)"}
                            </span>
                          </div>
                          <div style={{ fontWeight: 900, color: geminiStatus?.configured ? '#15803d' : '#b45309' }}>
                            {aiRuntimeLoading ? '...' : geminiStatus?.configured ? 'OK' : 'A CONFIGURER'}
                          </div>
                        </div>
                      </div>

                      {!geminiStatus?.configured ? (
                        <div style={{ marginTop: 10, fontSize: 12, color: '#64748b', fontWeight: 800 }}>
                          Astuce: connectez-vous en responsable puis configurez <strong>GEMINI_API_KEY</strong> dans <strong>backend/.env</strong> (format AIza...),
                          puis redemarrez le backend.
                        </div>
                      ) : null}
                    </div>
                  )}

                  <div className="toggle-list">
                    <div className="toggle-item">
                      <div>
                        <span className="toggle-label">Predictions de rupture</span>
                        <span className="toggle-desc">Anticiper les ruptures de stock basees sur l'historique</span>
                      </div>
                      <label className="toggle-switch">
                        <input type="checkbox" checked={aiSettings.predictionsEnabled} onChange={(e) => setAiSettings({ ...aiSettings, predictionsEnabled: e.target.checked })} />
                        <span className="toggle-slider"></span>
                      </label>
                    </div>
                    <div className="toggle-item">
                      <div>
                        <span className="toggle-label">Alertes automatiques</span>
                        <span className="toggle-desc">Generer des alertes IA automatiquement</span>
                      </div>
                      <label className="toggle-switch">
                        <input type="checkbox" checked={aiSettings.alertesAuto} onChange={(e) => setAiSettings({ ...aiSettings, alertesAuto: e.target.checked })} />
                        <span className="toggle-slider"></span>
                      </label>
                    </div>
                    <div className="toggle-item">
                      <div>
                        <span className="toggle-label">Analyse de consommation</span>
                        <span className="toggle-desc">Detecter les anomalies de consommation</span>
                      </div>
                      <label className="toggle-switch">
                        <input type="checkbox" checked={aiSettings.analyseConsommation} onChange={(e) => setAiSettings({ ...aiSettings, analyseConsommation: e.target.checked })} />
                        <span className="toggle-slider"></span>
                      </label>
                    </div>
                  </div>
                  <button className="btn-save resp" type="button" onClick={saveAiSettings} disabled={isSaving}>
                    <Save size={16} /> Enregistrer configuration IA
                  </button>
                  <button className="btn-save" type="button" onClick={enableAiDefaults} disabled={isSaving} style={{ marginLeft: 10 }}>
                    Re-activer IA (recommande)
                  </button>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default ParametresResp;
