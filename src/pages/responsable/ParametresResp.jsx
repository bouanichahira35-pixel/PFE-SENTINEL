import { useEffect, useMemo, useRef, useState } from 'react';
import { User, Lock, Moon, Sun, Camera, Save, Layers, Settings, Users, Bot, Globe, Bell, Eye, EyeOff } from 'lucide-react';
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
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

  const [aiSettings, setAiSettings] = useState({
    predictionsEnabled: true,
    alertesAuto: true,
    analyseConsommation: true,
  });

  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState('');
  const [magasiniers, setMagasiniers] = useState([]);
  const [userActionId, setUserActionId] = useState('');

  const [categories, setCategories] = useState([]);
  const [newCategoryName, setNewCategoryName] = useState('');

  const tabs = [
    { id: 'profil', label: ({ fr: 'Profil', en: 'Profile', ar: 'الملف الشخصي' }[uiLanguage]), icon: User },
    { id: 'securite', label: ({ fr: 'Securite', en: 'Security', ar: 'الأمان' }[uiLanguage]), icon: Lock },
    { id: 'apparence', label: ({ fr: 'Apparence', en: 'Appearance', ar: 'المظهر' }[uiLanguage]), icon: Moon },
    { id: 'langue', label: ({ fr: 'Langue', en: 'Language', ar: 'اللغة' }[uiLanguage]), icon: Globe },
    { id: 'notifications', label: ({ fr: 'Notifications', en: 'Notifications', ar: 'الإشعارات' }[uiLanguage]), icon: Bell },
    { id: 'categories', label: ({ fr: 'Categories', en: 'Categories', ar: 'التصنيفات' }[uiLanguage]), icon: Layers },
    { id: 'regles', label: ({ fr: 'Regles Stock', en: 'Stock Rules', ar: 'قواعد المخزون' }[uiLanguage]), icon: Settings },
    { id: 'utilisateurs', label: ({ fr: 'Utilisateurs', en: 'Users', ar: 'المستخدمون' }[uiLanguage]), icon: Users },
    { id: 'ia', label: ({ fr: 'Intelligence Artificielle', en: 'Artificial Intelligence', ar: 'الذكاء الاصطناعي' }[uiLanguage]), icon: Bot },
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

  const loadCategories = async () => {
    try {
      const data = await get('/categories');
      setCategories(data || []);
    } catch {
      setCategories([]);
    }
  };

  const loadSettings = async () => {
    setIsLoading(true);
    try {
      const [me, rules, ai] = await Promise.all([
        get('/settings/me'),
        get('/settings/stock-rules/config').catch(() => ({ value: {} })),
        get('/settings/ai/config').catch(() => ({ value: {} })),
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

      setAiSettings({
        predictionsEnabled: Boolean(ai?.value?.predictionsEnabled ?? true),
        alertesAuto: Boolean(ai?.value?.alertesAuto ?? true),
        analyseConsommation: Boolean(ai?.value?.analyseConsommation ?? true),
      });

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
    if (activeTab === 'utilisateurs') loadMagasiniers();
    if (activeTab === 'categories') loadCategories();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

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
      await loadMagasiniers();
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
      await loadMagasiniers();
    } catch (e) {
      toast.error(e.message || 'Erreur');
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
      await post('/categories', { name, description: `${name} (cree via parametres)` });
      setNewCategoryName('');
      await loadCategories();
      toast.success('Categorie ajoutee');
    } catch (err) {
      toast.error(err.message || 'Erreur ajout categorie');
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

  return (
    <div className="app-layout">
      <SidebarResp
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        onLogout={onLogout}
        userName={userName}
      />

      <div className="main-container">
        <HeaderPage userName={userName} title={i18n.title} showSearch={false} onRefresh={loadSettings} />

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
                        <Layers size={16} />
                        <span>{cat.name}</span>
                      </div>
                    ))}
                  </div>
                  <div className="add-category">
                    <input type="text" placeholder="Nouvelle categorie..." value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} />
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
                      <p className="users-subtitle">Magasiniers connectes: <strong>{onlineMagasiniers.length}</strong> / {magasiniers.length}</p>
                    </div>
                    <button className="btn-refresh" type="button" onClick={loadMagasiniers}>Actualiser</button>
                  </div>

                  {usersLoading && <div className="users-empty">Chargement...</div>}
                  {!usersLoading && usersError && <div className="users-error">{usersError}</div>}

                  {!usersLoading && !usersError && (
                    <div className="users-list">
                      {magasiniers.map((u) => (
                        <div key={u._id} className="user-item">
                          <div className="user-avatar mag"><User size={18} /></div>
                          <div className="user-info">
                            <span className="user-name">{u.username}</span>
                            <span className="user-role">{roleLabel(u.role)} - {u.email}</span>
                          </div>
                          <div className="user-meta">
                            <span className={`user-status ${u.status === 'active' ? 'online' : 'blocked'}`}>{u.status === 'active' ? 'Actif' : 'Bloque'}</span>
                            <span className={`session-pill ${(u.activeSessionsCount || 0) > 0 ? 'on' : 'off'}`}>Sessions: {u.activeSessionsCount || 0}</span>
                          </div>
                          <div className="user-actions">
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

                      {magasiniers.length === 0 && <div className="users-empty">Aucun magasinier.</div>}
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'ia' && (
                <div className="param-section">
                  <h2>Parametres Intelligence Artificielle</h2>
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
