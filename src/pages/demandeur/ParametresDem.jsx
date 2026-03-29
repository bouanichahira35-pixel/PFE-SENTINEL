import { useEffect, useMemo, useRef, useState } from 'react';
import { User, Lock, Bell, Globe, Camera, Save, Eye, EyeOff } from 'lucide-react';
import SidebarDem from '../../components/demandeur/SidebarDem';
import HeaderPage from '../../components/shared/HeaderPage';
import LoadingSpinner from '../../components/shared/LoadingSpinner';
import useProtectedFileUrl from '../../hooks/useProtectedFileUrl';
import { get, patch, post, uploadFile } from '../../services/api';
import { useToast } from '../../components/shared/Toast';
import { setUiLanguage, useUiLanguage } from '../../utils/uiLanguage';
import './ParametresDem.css';

const MAX_AVATAR_SIZE_BYTES = 5 * 1024 * 1024;

const ParametresDem = ({ userName, onLogout }) => {
  const toast = useToast();
  const uiLanguage = useUiLanguage();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= 768 : false));
  const [activeTab, setActiveTab] = useState('profil');
  const fileInputRef = useRef(null);

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

  const tabs = useMemo(() => ([
    { id: 'profil', label: ({ fr: 'Profil', en: 'Profile', ar: 'Profil' }[uiLanguage]), icon: User },
    { id: 'securite', label: ({ fr: 'Securite', en: 'Security', ar: 'Securite' }[uiLanguage]), icon: Lock },
    { id: 'notifications', label: ({ fr: 'Notifications', en: 'Notifications', ar: 'Notifications' }[uiLanguage]), icon: Bell },
    { id: 'langue', label: ({ fr: 'Langue', en: 'Language', ar: 'Langue' }[uiLanguage]), icon: Globe },
  ]), [uiLanguage]);

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
        demandesAlerts: preferences.notifications?.demandesAlerts ?? true,
      });

      const nextLang = preferences.language || 'fr';
      setLangue(nextLang);
      setUiLanguage(nextLang);
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

  const onPickAvatar = (e) => {
    const file = e.target.files?.[0] || null;
    if (!file) return;
    if (file.size > MAX_AVATAR_SIZE_BYTES) {
      toast.error('Image trop grande (max 5 MB)');
      return;
    }
    if (avatarPreviewUrl) URL.revokeObjectURL(avatarPreviewUrl);
    setAvatarFile(file);
    setAvatarPreviewUrl(URL.createObjectURL(file));
  };

  const saveProfile = async () => {
    setIsSaving(true);
    try {
      let imageProfile = profileData.imageProfile;
      if (avatarFile) {
        const uploaded = await uploadFile('/files/upload', avatarFile);
        imageProfile = uploaded?.file_url || imageProfile;
      }

      const updated = await patch('/settings/me/profile', {
        username: profileData.nom,
        email: profileData.email,
        telephone: profileData.telephone,
        image_profile: imageProfile,
      });

      const nextName = updated?.user?.username || profileData.nom;
      const nextImage = updated?.user?.image_profile || imageProfile;
      sessionStorage.setItem('userName', nextName);
      if (nextImage) sessionStorage.setItem('imageProfile', nextImage);

      setProfileData((prev) => ({ ...prev, imageProfile: nextImage || prev.imageProfile, nom: nextName }));
      window.dispatchEvent(new Event('profile-updated'));
      setAvatarFile(null);
      if (avatarPreviewUrl) URL.revokeObjectURL(avatarPreviewUrl);
      setAvatarPreviewUrl('');
      toast.success('Profil mis a jour');
    } catch (err) {
      toast.error(err.message || 'Erreur enregistrement profil');
    } finally {
      setIsSaving(false);
    }
  };

  const savePassword = async () => {
    if (!securityData.currentPassword || !securityData.newPassword || !securityData.confirmPassword) {
      toast.error('Champs mot de passe obligatoires');
      return;
    }
    if (securityData.newPassword !== securityData.confirmPassword) {
      toast.error('Confirmation mot de passe incorrecte');
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
      toast.success('Mot de passe mis a jour');
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
  };

  const sendTestEmail = async () => {
    setIsSaving(true);
    try {
      await post('/settings/me/test-email', {});
      toast.success('Email de test envoye');
    } catch (err) {
      toast.error(err.message || 'Echec envoi email');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="app-layout">
      <div className={`sidebar-backdrop ${sidebarCollapsed ? 'hidden' : ''}`} onClick={() => setSidebarCollapsed(true)} />
      <SidebarDem collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} onLogout={onLogout} userName={userName} />

      <div className="main-container">
        <HeaderPage
          userName={userName}
          title="Parametres"
          showSearch={false}
          onMenuClick={() => setSidebarCollapsed((prev) => !prev)}
        />

        <main className="main-content">
          {isLoading && <LoadingSpinner overlay text="Chargement..." />}

          <div className="param-page">
            <div className="param-sidebar">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    className={`param-tab ${activeTab === tab.id ? 'active' : ''}`}
                    onClick={() => setActiveTab(tab.id)}
                  >
                    <Icon size={18} />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="param-content">
              {activeTab === 'profil' && (
                <div className="param-section">
                  <h2>Informations personnelles</h2>
                  <div className="profile-avatar-row">
                    <div className="profile-avatar">
                      {displayAvatarUrl ? <img src={displayAvatarUrl} alt="Profil" /> : <div className="profile-avatar-fallback" />}
                    </div>
                    <div>
                      <button className="btn-secondary" type="button" onClick={() => fileInputRef.current?.click()} disabled={isSaving}>
                        <Camera size={16} /> Changer la photo
                      </button>
                      <div className="profile-avatar-hint">Formats: png, jpg, jpeg, webp (max 5 MB).</div>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/jpg,image/webp"
                        style={{ display: 'none' }}
                        onChange={onPickAvatar}
                      />
                    </div>
                  </div>

                  <div className="profile-form">
                    <div className="form-group">
                      <label>Nom complet</label>
                      <input value={profileData.nom} onChange={(e) => setProfileData((p) => ({ ...p, nom: e.target.value }))} />
                    </div>
                    <div className="form-group">
                      <label>Email</label>
                      <input value={profileData.email} onChange={(e) => setProfileData((p) => ({ ...p, email: e.target.value }))} />
                    </div>
                    <div className="form-group">
                      <label>Telephone</label>
                      <input value={profileData.telephone} onChange={(e) => setProfileData((p) => ({ ...p, telephone: e.target.value }))} />
                    </div>

                    <button className="btn-save" type="button" onClick={saveProfile} disabled={isSaving}>
                      <Save size={16} /> Enregistrer
                    </button>
                  </div>
                </div>
              )}

              {activeTab === 'securite' && (
                <div className="param-section">
                  <h2>Securite</h2>
                  <div className="security-form">
                    <div className="form-group">
                      <label>Mot de passe actuel</label>
                      <div className="password-field">
                        <input
                          type={showPasswords.current ? 'text' : 'password'}
                          value={securityData.currentPassword}
                          onChange={(e) => setSecurityData((p) => ({ ...p, currentPassword: e.target.value }))}
                        />
                        <button type="button" className="btn-icon" onClick={() => setShowPasswords((p) => ({ ...p, current: !p.current }))}>
                          {showPasswords.current ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                    </div>
                    <div className="form-group">
                      <label>Nouveau mot de passe</label>
                      <div className="password-field">
                        <input
                          type={showPasswords.next ? 'text' : 'password'}
                          value={securityData.newPassword}
                          onChange={(e) => setSecurityData((p) => ({ ...p, newPassword: e.target.value }))}
                        />
                        <button type="button" className="btn-icon" onClick={() => setShowPasswords((p) => ({ ...p, next: !p.next }))}>
                          {showPasswords.next ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                    </div>
                    <div className="form-group">
                      <label>Confirmer</label>
                      <div className="password-field">
                        <input
                          type={showPasswords.confirm ? 'text' : 'password'}
                          value={securityData.confirmPassword}
                          onChange={(e) => setSecurityData((p) => ({ ...p, confirmPassword: e.target.value }))}
                        />
                        <button type="button" className="btn-icon" onClick={() => setShowPasswords((p) => ({ ...p, confirm: !p.confirm }))}>
                          {showPasswords.confirm ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                    </div>
                    <button className="btn-save" type="button" onClick={savePassword} disabled={isSaving}>
                      <Save size={16} /> Mettre a jour
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
                        <span className="toggle-desc">Recevoir des notifications par email</span>
                      </div>
                      <label className="toggle-switch">
                        <input
                          type="checkbox"
                          checked={notifications.email}
                          onChange={(e) => setNotifications((p) => ({ ...p, email: e.target.checked }))}
                        />
                        <span className="toggle-slider" />
                      </label>
                    </div>

                    <div className="toggle-item">
                      <div>
                        <span className="toggle-label">Alertes demandes</span>
                        <span className="toggle-desc">Recevoir un email lors des mises a jour de statut</span>
                      </div>
                      <label className="toggle-switch">
                        <input
                          type="checkbox"
                          checked={notifications.demandesAlerts}
                          onChange={(e) => setNotifications((p) => ({ ...p, demandesAlerts: e.target.checked }))}
                        />
                        <span className="toggle-slider" />
                      </label>
                    </div>
                  </div>

                  <div className="pref-actions">
                    <button className="btn-save" type="button" onClick={() => savePreferences({ notifications })} disabled={isSaving}>
                      <Save size={16} /> Enregistrer
                    </button>
                    <button className="btn-secondary" type="button" onClick={sendTestEmail} disabled={isSaving || !notifications.email}>
                      <Bell size={16} /> Tester email
                    </button>
                  </div>
                </div>
              )}

              {activeTab === 'langue' && (
                <div className="param-section">
                  <h2>Langue</h2>
                  <div className="langue-selector">
                    <button className={`langue-option ${langue === 'fr' ? 'active' : ''}`} type="button" onClick={() => saveLanguage('fr')}>
                      Francais
                    </button>
                    <button className={`langue-option ${langue === 'en' ? 'active' : ''}`} type="button" onClick={() => saveLanguage('en')}>
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

export default ParametresDem;
