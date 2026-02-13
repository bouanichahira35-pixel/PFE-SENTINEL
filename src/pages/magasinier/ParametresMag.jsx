 import { useState } from 'react';
 import { User, Lock, Moon, Sun, Globe, Bell, Camera, Save } from 'lucide-react';
 import SidebarMag from '../../components/magasinier/SidebarMag';
 import HeaderPage from '../../components/shared/HeaderPage';
 import useTheme from '../../hooks/useTheme';
 import './ParametresMag.css';

 const ParametresMag = ({ userName, onLogout }) => {
   const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
   const { isDarkMode, toggleTheme } = useTheme();
   const [activeTab, setActiveTab] = useState('profil');
   
   const [profileData, setProfileData] = useState({
     nom: userName || 'Ahmed Ben Ali',
     email: 'ahmed.benali@etap.tn',
     telephone: '+216 98 765 432'
   });

   const [notifications, setNotifications] = useState({
     email: true,
     push: false,
     stockAlerts: true,
     demandesAlerts: true
   });

   const [langue, setLangue] = useState('fr');

   const tabs = [
     { id: 'profil', label: 'Profil', icon: User },
     { id: 'securite', label: 'Securite', icon: Lock },
     { id: 'apparence', label: 'Apparence', icon: Moon },
     { id: 'notifications', label: 'Notifications', icon: Bell },
     { id: 'langue', label: 'Langue', icon: Globe },
   ];

   return (
     <div className="app-layout">
       <SidebarMag 
         collapsed={sidebarCollapsed} 
         onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
         onLogout={onLogout}
        userName={userName}
       />
       
       <div className="main-container">
         <HeaderPage 
           userName={userName}
           title="Parametres"
           showSearch={false}
         />
         
         <main className="main-content">
           <div className="parametres-page">
             <div className="parametres-sidebar">
               {tabs.map(tab => {
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
                       <User size={40} />
                     </div>
                     <button className="avatar-btn">
                       <Camera size={16} />
                       Changer la photo
                     </button>
                   </div>
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
                   <button className="btn-save">
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
                     <input type="password" placeholder="********" />
                   </div>
                   <div className="form-group">
                     <label>Nouveau mot de passe</label>
                     <input type="password" placeholder="Nouveau mot de passe" />
                   </div>
                   <div className="form-group">
                     <label>Confirmer le mot de passe</label>
                     <input type="password" placeholder="Confirmer" />
                   </div>
                   <button className="btn-save">
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
                       onClick={() => isDarkMode && toggleTheme()}
                     >
                       <Sun size={24} />
                       <span>Mode clair</span>
                     </button>
                     <button 
                       className={`theme-option ${isDarkMode ? 'active' : ''}`}
                       onClick={() => !isDarkMode && toggleTheme()}
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
                 </div>
               )}

               {activeTab === 'langue' && (
                 <div className="param-section">
                   <h2>Langue</h2>
                   <div className="langue-selector">
                     <button 
                       className={`langue-option ${langue === 'fr' ? 'active' : ''}`}
                       onClick={() => setLangue('fr')}
                     >
                       Francais
                     </button>
                     <button 
                       className={`langue-option ${langue === 'ar' ? 'active' : ''}`}
                       onClick={() => setLangue('ar')}
                     >
                       العربية
                     </button>
                     <button 
                       className={`langue-option ${langue === 'en' ? 'active' : ''}`}
                       onClick={() => setLangue('en')}
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
