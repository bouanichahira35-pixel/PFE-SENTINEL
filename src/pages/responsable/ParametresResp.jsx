 import { useState } from 'react';
 import { User, Lock, Moon, Sun, Globe, Bell, Camera, Save, Layers, Settings, Users, Bot, ShieldCheck } from 'lucide-react';
 import SidebarResp from '../../components/responsable/SidebarResp';
 import HeaderPage from '../../components/shared/HeaderPage';
 import useTheme from '../../hooks/useTheme';
 import './ParametresResp.css';

 const categories = ['Informatique', 'Fournitures', 'Mobilier', 'Electronique', 'Outillage'];

 const ParametresResp = ({ userName, onLogout }) => {
   const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
   const { isDarkMode, toggleTheme } = useTheme();
   const [activeTab, setActiveTab] = useState('profil');
   
   const [profileData, setProfileData] = useState({
     nom: userName || 'Mohamed Responsable',
     email: 'mohamed.resp@etap.tn',
     telephone: '+216 98 123 456'
   });

   const [stockRules, setStockRules] = useState({
     seuilAlerte: 10,
     joursInactivite: 30,
     validationObligatoire: true
   });

   const [aiSettings, setAiSettings] = useState({
     predictionsEnabled: true,
     alertesAuto: true,
     analyseConsommation: true
   });

   const tabs = [
     { id: 'profil', label: 'Profil', icon: User },
     { id: 'securite', label: 'Securite', icon: Lock },
     { id: 'apparence', label: 'Apparence', icon: Moon },
     { id: 'categories', label: 'Categories', icon: Layers },
     { id: 'regles', label: 'Regles Stock', icon: Settings },
     { id: 'utilisateurs', label: 'Utilisateurs', icon: Users },
     { id: 'ia', label: 'Intelligence Artificielle', icon: Bot },
   ];

   return (
     <div className="app-layout">
       <SidebarResp 
         collapsed={sidebarCollapsed} 
         onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
         onLogout={onLogout}
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
                     <div className="avatar-large resp">
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
                   <button className="btn-save resp">
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
                   <button className="btn-save resp">
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

               {activeTab === 'categories' && (
                 <div className="param-section">
                   <h2>Gestion des categories</h2>
                   <div className="categories-list">
                     {categories.map((cat, index) => (
                       <div key={index} className="category-item">
                         <Layers size={16} />
                         <span>{cat}</span>
                       </div>
                     ))}
                   </div>
                   <div className="add-category">
                     <input type="text" placeholder="Nouvelle categorie..." />
                     <button className="btn-add">Ajouter</button>
                   </div>
                 </div>
               )}

               {activeTab === 'regles' && (
                 <div className="param-section">
                   <h2>Regles de gestion du stock</h2>
                   <div className="form-group">
                     <label>Seuil d'alerte par defaut</label>
                     <input
                       type="number"
                       value={stockRules.seuilAlerte}
                       onChange={(e) => setStockRules({ ...stockRules, seuilAlerte: e.target.value })}
                     />
                     <span className="input-hint">Quantite minimum avant alerte</span>
                   </div>
                   <div className="form-group">
                     <label>Jours d'inactivite</label>
                     <input
                       type="number"
                       value={stockRules.joursInactivite}
                       onChange={(e) => setStockRules({ ...stockRules, joursInactivite: e.target.value })}
                     />
                     <span className="input-hint">Produit considere inactif apres ce nombre de jours</span>
                   </div>
                   <div className="toggle-item">
                     <div>
                       <span className="toggle-label">Validation obligatoire des nouveaux produits</span>
                       <span className="toggle-desc">Les produits ajoutes par le magasinier doivent etre valides</span>
                     </div>
                     <label className="toggle-switch">
                       <input
                         type="checkbox"
                         checked={stockRules.validationObligatoire}
                         onChange={(e) => setStockRules({ ...stockRules, validationObligatoire: e.target.checked })}
                       />
                       <span className="toggle-slider"></span>
                     </label>
                   </div>
                   <button className="btn-save resp">
                     <Save size={16} />
                     Enregistrer les regles
                   </button>
                 </div>
               )}

               {activeTab === 'utilisateurs' && (
                 <div className="param-section">
                   <h2>Gestion des utilisateurs</h2>
                   <div className="users-list">
                     <div className="user-item">
                       <div className="user-avatar mag">
                         <User size={18} />
                       </div>
                       <div className="user-info">
                         <span className="user-name">Ahmed Ben Ali</span>
                         <span className="user-role">Magasinier</span>
                       </div>
                       <span className="user-status online">Actif</span>
                     </div>
                     <div className="user-item">
                       <div className="user-avatar mag">
                         <User size={18} />
                       </div>
                       <div className="user-info">
                         <span className="user-name">Mohamed Sassi</span>
                         <span className="user-role">Magasinier</span>
                       </div>
                       <span className="user-status online">Actif</span>
                     </div>
                   </div>
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
                         <input
                           type="checkbox"
                           checked={aiSettings.predictionsEnabled}
                           onChange={(e) => setAiSettings({ ...aiSettings, predictionsEnabled: e.target.checked })}
                         />
                         <span className="toggle-slider"></span>
                       </label>
                     </div>
                     <div className="toggle-item">
                       <div>
                         <span className="toggle-label">Alertes automatiques</span>
                         <span className="toggle-desc">Generer des alertes IA automatiquement</span>
                       </div>
                       <label className="toggle-switch">
                         <input
                           type="checkbox"
                           checked={aiSettings.alertesAuto}
                           onChange={(e) => setAiSettings({ ...aiSettings, alertesAuto: e.target.checked })}
                         />
                         <span className="toggle-slider"></span>
                       </label>
                     </div>
                     <div className="toggle-item">
                       <div>
                         <span className="toggle-label">Analyse de consommation</span>
                         <span className="toggle-desc">Detecter les anomalies de consommation</span>
                       </div>
                       <label className="toggle-switch">
                         <input
                           type="checkbox"
                           checked={aiSettings.analyseConsommation}
                           onChange={(e) => setAiSettings({ ...aiSettings, analyseConsommation: e.target.checked })}
                         />
                         <span className="toggle-slider"></span>
                       </label>
                     </div>
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

 export default ParametresResp;