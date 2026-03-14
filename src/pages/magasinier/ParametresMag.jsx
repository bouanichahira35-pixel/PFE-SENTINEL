import { useEffect, useRef, useState } from 'react';
import { User, Lock, Moon, Sun, Globe, Bell, Camera, Save, Eye, EyeOff } from 'lucide-react';
import SidebarMag from '../../components/magasinier/SidebarMag';
import HeaderPage from '../../components/shared/HeaderPage';
import useTheme from '../../hooks/useTheme';
import useProtectedFileUrl from '../../hooks/useProtectedFileUrl';
import { get, patch, post, uploadFile } from '../../services/api';
import { useToast } from '../../components/shared/Toast';
import { setUiLanguage, useUiLanguage } from '../../utils/uiLanguage';
import './ParametresMag.css';
const MAX_AVATAR_SIZE_BYTES = 5 * 1024 * 1024;

const ParametresMag = ({ userName, onLogout }) => {
  const toast = useToast();
  const uiLanguage = useUiLanguage();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { isDarkMode, toggleTheme } = useTheme();
  const [activeTab, setActiveTab] = useState('profil');
  const initializedThemeRef = useRef(false);

  const [isLoading, setIsLoading] = useState(false); 
  const [isSaving, setIsSaving] = useState(false); 
  const [avatarFile, setAvatarFile] = useState(null); 
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState('');

  const [profileData, setProfileData] = useState({
    nom: userName || '',
    email: '',
    telephone: '',
    imageProfile: '',
  });

  const [notifications, setNotifications] = useState({
    email: true,
    push: false,
    stockAlerts: true,
    demandesAlerts: true,
  });

  const [langue, setLangue] = useState('fr');

  const [securityData, setSecurityData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [showPasswords, setShowPasswords] = useState({
    current: false,
    next: false,
    confirm: false,
  });

  const tabs = [
    { id: 'profil', label: ({ fr: 'Profil', en: 'Profile', ar: 'الملف الشخصي' }[uiLanguage]), icon: User },
    { id: 'securite', label: ({ fr: 'Securite', en: 'Security', ar: 'الأمان' }[uiLanguage]), icon: Lock },
    { id: 'apparence', label: ({ fr: 'Apparence', en: 'Appearance', ar: 'المظهر' }[uiLanguage]), icon: Moon },
    { id: 'notifications', label: ({ fr: 'Notifications', en: 'Notifications', ar: 'الإشعارات' }[uiLanguage]), icon: Bell },
    { id: 'langue', label: ({ fr: 'Langue', en: 'Language', ar: 'اللغة' }[uiLanguage]), icon: Globe },
  ];
  const i18n = {
    fr: {
      title: 'Parametres',
      loading: 'Chargement...',
      languageSaved: 'Langue enregistree',
    },
    en: {
      title: 'Settings',
      loading: 'Loading...',
      languageSaved: 'Language saved',
    },
    ar: {
      title: 'الإعدادات',
      loading: 'جار التحميل...',
      languageSaved: 'تم حفظ اللغة',
    },
  }[uiLanguage];

  const avatarUrl = useProtectedFileUrl(profileData.imageProfile);
  const displayAvatarUrl = avatarPreviewUrl || avatarUrl;

  useEffect(() => {
    return () => {
      if (avatarPreviewUrl) URL.revokeObjectURL(avatarPreviewUrl);
    };
  }, [avatarPreviewUrl]);

  const loadSettings = async () => {
    setIsLoading(true);
    try {
      const data = await get('/settings/me');
      const user = data?.user || {};
      const preferences = data?.preferences || {};

      setProfileData((prev) => ({
        ...prev,
        nom: user.username || prev.nom,
        email: user.email || '',
        telephone: user.telephone || '',
        imageProfile: user.image_profile || '',
      }));
      if (user.username) sessionStorage.setItem('userName', user.username);
      if (user.image_profile) sessionStorage.setItem('imageProfile', user.image_profile);

      setNotifications({
        email: preferences.notifications?.email ?? true,
        push: preferences.notifications?.push ?? false,
        stockAlerts: preferences.notifications?.stockAlerts ?? true,
        demandesAlerts: preferences.notifications?.demandesAlerts ?? true,
      });

      setLangue(preferences.language || 'fr');
      setUiLanguage(preferences.language || 'fr');

      if (!initializedThemeRef.current) {
        const darkFromServer = Boolean(preferences.dark_mode);
        if (darkFromServer !== isDarkMode) toggleTheme();
        initializedThemeRef.current = true;
      }
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

      setProfileData((prev) => ({
        ...prev,
        imageProfile: updated?.user?.image_profile || imageProfile || '',
      }));
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

  const setThemeMode = async (dark) => {
    if (dark !== isDarkMode) toggleTheme();
    await savePreferences({ dark_mode: dark });
  };

  const setLanguageValue = async (value) => { 
    setLangue(value); 
    setUiLanguage(value); 
    await savePreferences({ language: value }); 
    toast.success(i18n.languageSaved); 
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
      <SidebarMag
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
                  <button
                    key={tab.id}
                    className={`param-tab ${activeTab === tab.id ? 'active' : ''}`}
                    onClick={() => setActiveTab(tab.id)}
                  >
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
                    <div className="avatar-large"> 
                      {displayAvatarUrl ? <img src={displayAvatarUrl} alt="Profil" style={{ width: '100%', height: '100%', borderRadius: '50%' }} /> : <User size={40} />} 
                    </div> 
                    <label className="avatar-btn"> 
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
                    <input
                      type="text"
                      value={profileData.nom}
                      onChange={(e) => setProfileData({ ...profileData, nom: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label>Email</label>
                    <input
                      type="email"
                      value={profileData.email}
                      onChange={(e) => setProfileData({ ...profileData, email: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label>Telephone</label>
                    <input
                      type="tel"
                      value={profileData.telephone}
                      onChange={(e) => setProfileData({ ...profileData, telephone: e.target.value })}
                    />
                  </div>
                  <button className="btn-save" onClick={saveProfile} disabled={isSaving}>
                    <Save size={16} />
                    Enregistrer
                  </button>
                </div>
              )}

              {activeTab === 'securite' && (
                <div className="param-section">
                  <h2>Securite du compte</h2>
                  <div className="form-group">
                    <label>Mot de passe actuel</label>
                    <div className="password-input-wrap">
                      <input
                        type={showPasswords.current ? 'text' : 'password'}
                        value={securityData.currentPassword}
                        onChange={(e) => setSecurityData({ ...securityData, currentPassword: e.target.value })}
                        placeholder="********"
                      />
                      <button type="button" className="password-toggle-btn" onClick={() => setShowPasswords((p) => ({ ...p, current: !p.current }))}>
                        {showPasswords.current ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>
                  <div className="form-group">
                    <label>Nouveau mot de passe</label>
                    <div className="password-input-wrap">
                      <input
                        type={showPasswords.next ? 'text' : 'password'}
                        value={securityData.newPassword}
                        onChange={(e) => setSecurityData({ ...securityData, newPassword: e.target.value })}
                        placeholder="Nouveau mot de passe"
                      />
                      <button type="button" className="password-toggle-btn" onClick={() => setShowPasswords((p) => ({ ...p, next: !p.next }))}>
                        {showPasswords.next ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>
                  <div className="form-group">
                    <label>Confirmer le mot de passe</label>
                    <div className="password-input-wrap">
                      <input
                        type={showPasswords.confirm ? 'text' : 'password'}
                        value={securityData.confirmPassword}
                        onChange={(e) => setSecurityData({ ...securityData, confirmPassword: e.target.value })}
                        placeholder="Confirmer"
                      />
                      <button type="button" className="password-toggle-btn" onClick={() => setShowPasswords((p) => ({ ...p, confirm: !p.confirm }))}>
                        {showPasswords.confirm ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>
                  <button className="btn-save" onClick={savePassword} disabled={isSaving}>
                    <Lock size={16} />
                    Changer le mot de passe
                  </button>
                </div>
              )}

              {activeTab === 'apparence' && (
                <div className="param-section">
                  <h2>Apparence</h2>
                  <div className="theme-selector">
                    <button
                      className={`theme-option ${!isDarkMode ? 'active' : ''}`}
                      onClick={() => setThemeMode(false)}
                    >
                      <Sun size={24} />
                      <span>Mode clair</span>
                    </button>
                    <button
                      className={`theme-option ${isDarkMode ? 'active' : ''}`}
                      onClick={() => setThemeMode(true)}
                    >
                      <Moon size={24} />
                      <span>Mode sombre</span>
                    </button>
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
                        <input
                          type="checkbox"
                          checked={notifications.email}
                          onChange={(e) => setNotifications({ ...notifications, email: e.target.checked })}
                        />
                        <span className="toggle-slider"></span>
                      </label>
                    </div>
                    <div className="toggle-item">
                      <div>
                        <span className="toggle-label">Alertes de stock</span>
                        <span className="toggle-desc">Notification quand le stock est bas</span>
                      </div>
                      <label className="toggle-switch">
                        <input
                          type="checkbox"
                          checked={notifications.stockAlerts}
                          onChange={(e) => setNotifications({ ...notifications, stockAlerts: e.target.checked })}
                        />
                        <span className="toggle-slider"></span>
                      </label>
                    </div>
                    <div className="toggle-item">
                      <div>
                        <span className="toggle-label">Alertes de demandes</span>
                        <span className="toggle-desc">Notification pour nouvelles demandes</span>
                      </div>
                      <label className="toggle-switch">
                        <input
                          type="checkbox"
                          checked={notifications.demandesAlerts}
                          onChange={(e) => setNotifications({ ...notifications, demandesAlerts: e.target.checked })}
                        />
                        <span className="toggle-slider"></span>
                      </label>
                    </div>
                  </div>
                  <button className="btn-save" onClick={() => savePreferences({ notifications })} disabled={isSaving}>
                    <Save size={16} />
                    Enregistrer
                  </button>
                  <button
                    className="btn-save"
                    onClick={sendTestEmail}
                    disabled={isSaving || !notifications.email}
                    title={!notifications.email ? 'Activez d abord Notifications par email' : ''}
                  >
                    <Bell size={16} />
                    Tester email
                  </button>
                </div>
              )}

              {activeTab === 'langue' && (
                <div className="param-section">
                  <h2>Langue</h2>
                  <div className="langue-selector">
                    <button
                      className={`langue-option ${langue === 'fr' ? 'active' : ''}`}
                      onClick={() => setLanguageValue('fr')}
                    >
                      Francais
                    </button>
                    <button
                      className={`langue-option ${langue === 'ar' ? 'active' : ''}`}
                      onClick={() => setLanguageValue('ar')}
                    >
                      Arabe
                    </button>
                    <button
                      className={`langue-option ${langue === 'en' ? 'active' : ''}`}
                      onClick={() => setLanguageValue('en')}
                    >
                      English
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default ParametresMag;
