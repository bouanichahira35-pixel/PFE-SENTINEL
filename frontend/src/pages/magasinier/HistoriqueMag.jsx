 import { useState } from 'react';
 import { History, ArrowDownToLine, ArrowUpFromLine, Package, Calendar, User, Filter, Search } from 'lucide-react';
 import SidebarMag from '../../components/magasinier/SidebarMag';
 import HeaderPage from '../../components/shared/HeaderPage';
 import './HistoriqueMag.css';

 const mockHistorique = [
   { id: 1, type: 'Entree', produit: 'Cable HDMI 2m', code: 'PRD-001', quantite: 100, date: '2026-02-04 09:30', magasinier: 'Ahmed Ben Ali', source: 'Fournisseur ABC' },
   { id: 2, type: 'Sortie', produit: 'Souris sans fil', code: 'PRD-002', quantite: 10, date: '2026-02-04 08:15', magasinier: 'Ahmed Ben Ali', source: 'Demande DEM-002' },
   { id: 3, type: 'Entree', produit: 'Papier A4', code: 'PRD-005', quantite: 200, date: '2026-02-03 16:45', magasinier: 'Mohamed Sassi', source: 'Fournisseur XYZ' },
   { id: 4, type: 'Sortie', produit: 'Clavier mecanique', code: 'PRD-003', quantite: 5, date: '2026-02-03 14:20', magasinier: 'Ahmed Ben Ali', source: 'Service IT' },
   { id: 5, type: 'Ajout', produit: 'Ecran 27 pouces', code: 'PRD-010', quantite: 20, date: '2026-02-03 10:00', magasinier: 'Mohamed Sassi', source: 'Nouveau produit' },
   { id: 6, type: 'Sortie', produit: 'Stylo bleu', code: 'PRD-006', quantite: 50, date: '2026-02-02 15:30', magasinier: 'Ahmed Ben Ali', source: 'Demande DEM-005' },
   { id: 7, type: 'Entree', produit: 'Cartouche encre', code: 'PRD-007', quantite: 30, date: '2026-02-02 11:00', magasinier: 'Mohamed Sassi', source: 'Fournisseur ABC' },
 ];

 const HistoriqueMag = ({ userName, onLogout }) => {
   const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
   const [searchQuery, setSearchQuery] = useState('');
   const [filterType, setFilterType] = useState('tous');

   const filteredHistorique = mockHistorique.filter(item => {
     const matchSearch = item.produit.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         item.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         item.magasinier.toLowerCase().includes(searchQuery.toLowerCase());
     const matchType = filterType === 'tous' || item.type.toLowerCase() === filterType;
     return matchSearch && matchType;
   });

   const getTypeIcon = (type) => {
     switch (type) {
       case 'Entree':
         return <ArrowDownToLine size={16} />;
       case 'Sortie':
         return <ArrowUpFromLine size={16} />;
       default:
         return <Package size={16} />;
     }
   };

   const getTypeClass = (type) => {
     switch (type) {
       case 'Entree':
         return 'type-entree';
       case 'Sortie':
         return 'type-sortie';
       default:
         return 'type-ajout';
     }
   };

   return (
     <div className="app-layout">
       <SidebarMag 
         collapsed={sidebarCollapsed} 
         onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
         onLogout={onLogout}
       />
       
       <div className="main-container">
         <HeaderPage 
           userName={userName}
           title="Historique"
           searchValue={searchQuery}
           onSearchChange={setSearchQuery}
         />
         
         <main className="main-content">
           <div className="historique-page">
             <div className="historique-toolbar">
               <div className="filter-group">
                 <Filter size={16} />
                 <select 
                   value={filterType} 
                   onChange={(e) => setFilterType(e.target.value)}
                   className="filter-select"
                 >
                   <option value="tous">Toutes les operations</option>
                   <option value="entree">Entrees</option>
                   <option value="sortie">Sorties</option>
                   <option value="ajout">Ajouts</option>
                 </select>
               </div>
             </div>

             <div className="historique-table-container">
               <table className="historique-table">
                 <thead>
                   <tr>
                     <th>Type</th>
                     <th>Produit</th>
                     <th>Quantite</th>
                     <th>Date</th>
                     <th>Magasinier</th>
                     <th>Source / Destination</th>
                   </tr>
                 </thead>
                 <tbody>
                   {filteredHistorique.map((item, index) => (
                     <tr key={item.id} style={{ animationDelay: `${index * 50}ms` }}>
                       <td>
                         <span className={`type-badge ${getTypeClass(item.type)}`}>
                           {getTypeIcon(item.type)}
                           {item.type}
                         </span>
                       </td>
                       <td className="product-cell">
                         <Package size={16} />
                         <div>
                           <span className="product-name">{item.produit}</span>
                           <span className="product-code">{item.code}</span>
                         </div>
                       </td>
                       <td className="quantity-cell">
                         <span className={item.type === 'Entree' ? 'qty-plus' : item.type === 'Sortie' ? 'qty-minus' : ''}>
                           {item.type === 'Entree' ? '+' : item.type === 'Sortie' ? '-' : ''}{item.quantite}
                         </span>
                       </td>
                       <td className="date-cell">
                         <Calendar size={14} />
                         {item.date}
                       </td>
                       <td className="user-cell">
                         <User size={14} />
                         {item.magasinier}
                       </td>
                       <td className="source-cell">{item.source}</td>
                     </tr>
                   ))}
                 </tbody>
               </table>
             </div>

             <div className="historique-footer">
               <p>{filteredHistorique.length} operation{filteredHistorique.length > 1 ? 's' : ''}</p>
             </div>
           </div>
         </main>
       </div>
     </div>
   );
 };

 export default HistoriqueMag;