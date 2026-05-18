import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ClipboardCheck, Rocket, RefreshCw, Info } from 'lucide-react';
import SidebarResp from '../../components/responsable/SidebarResp';
import HeaderPage from '../../components/shared/HeaderPage';
import ProtectedPage from '../../components/shared/ProtectedPage';
import LoadingSpinner from '../../components/shared/LoadingSpinner';
import { useToast } from '../../components/shared/Toast';
import { get, post } from '../../services/api';
import './LancerInventaireResp.css';

function toDateInputValue(date) {
  if (!date) return '';
  try {
    const d = new Date(date);
    if (Number.isNaN(d.getTime())) return '';
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  } catch {
    return '';
  }
}

const LancerInventaireResp = ({ userName, onLogout }) => {
  const toast = useToast();
  const navigate = useNavigate();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= 768 : false));
  const [isLoading, setIsLoading] = useState(false);

  const [options, setOptions] = useState({
    magasins: [],
    zones: [],
    categories: [],
    familles: [],
    magasiniers: [],
  });

  const [typeInventaire, setTypeInventaire] = useState('GLOBAL');
  const [magasinId, setMagasinId] = useState('');
  const [zoneId, setZoneId] = useState('');
  const [familleId, setFamilleId] = useState('');
  const [categorieId, setCategorieId] = useState('');
  const [magasinierId, setMagasinierId] = useState('');
  const [datePrevue, setDatePrevue] = useState(() => toDateInputValue(new Date(Date.now() + 24 * 60 * 60 * 1000)));
  const [commentaire, setCommentaire] = useState('');
  const [bloquerMouvements, setBloquerMouvements] = useState(true);
  const [notificationsActives, setNotificationsActives] = useState(true);
  const [formErrors, setFormErrors] = useState([]);

  const loadOptions = useCallback(async () => {
    setIsLoading(true);
    try {
      const payload = await get('/inventory/launch/options');
      setOptions({
        magasins: Array.isArray(payload?.magasins) ? payload.magasins : [],
        zones: Array.isArray(payload?.zones) ? payload.zones : [],
        categories: Array.isArray(payload?.categories) ? payload.categories : [],
        familles: Array.isArray(payload?.familles) ? payload.familles : [],
        magasiniers: Array.isArray(payload?.magasiniers) ? payload.magasiniers : [],
      });
    } catch (err) {
      toast.error(err.message || "Erreur chargement options d'inventaire");
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadOptions();
  }, [loadOptions]);

  useEffect(() => {
    if (typeInventaire === 'GLOBAL') {
      setZoneId('');
      setFamilleId('');
      setCategorieId('');
      setBloquerMouvements(true);
    }
  }, [typeInventaire]);

  const zoneDisabled = typeInventaire === 'GLOBAL';
  const familleDisabled = typeInventaire === 'GLOBAL';
  const categorieDisabled = typeInventaire === 'GLOBAL';

  const magasinLabel = useMemo(() => {
    const item = (options.magasins || []).find((m) => String(m._id) === String(magasinId));
    return item ? `${item.name || 'Magasin'} (${item.code || '-'})` : '';
  }, [magasinId, options.magasins]);

  const canSubmitHint = useMemo(() => {
    if (!typeInventaire) return 'Choisissez un type.';
    if (!magasinId) return 'Choisissez un magasin.';
    if (!magasinierId) return 'Assignez un magasinier.';
    if (!datePrevue) return 'Saisissez une date prévue.';
    if (typeInventaire === 'TOURNANT' && !zoneId && !familleId && !categorieId) {
      return 'Pour TOURNANT, sélectionnez au moins une zone, une famille ou une catégorie.';
    }
    return '';
  }, [categorieId, datePrevue, familleId, magasinId, magasinierId, typeInventaire, zoneId]);

  const validateForm = () => {
    const errs = [];
    if (!typeInventaire) errs.push('type_inventaire obligatoire');
    if (!magasinId) errs.push('magasin obligatoire');
    if (!magasinierId) errs.push('magasinier obligatoire');
    if (!datePrevue) errs.push('date_prevue obligatoire');

    if (typeInventaire === 'TOURNANT' && !zoneId && !familleId && !categorieId) {
      errs.push('Pour TOURNANT, choisir au moins zone ou famille ou catégorie');
    }

    if (typeInventaire === 'GLOBAL' && (zoneId || familleId || categorieId)) {
      errs.push('Pour GLOBAL, le périmètre est tout le magasin (ne pas sélectionner zone/famille/catégorie).');
    }

    setFormErrors(errs);
    return errs.length === 0;
  };

  const launchInventory = async () => {
    if (!validateForm()) {
      toast.error('Données invalides');
      return;
    }

    setIsLoading(true);
    try {
      const payload = await post('/inventory/inventories', {
        type_inventaire: typeInventaire,
        magasin_id: magasinId,
        zone_id: zoneDisabled ? null : (zoneId || null),
        famille_id: familleDisabled ? null : (familleId || null),
        categorie_id: categorieDisabled ? null : (categorieId || null),
        magasinier_id: magasinierId,
        date_prevue: datePrevue,
        commentaire,
        bloquer_mouvements: Boolean(bloquerMouvements),
        notifications_activees: Boolean(notificationsActives),
      });

      const ref = payload?.inventory?.reference || 'Inventaire';
      const linesCount = Number(payload?.lines_count || 0);
      toast.success(`${ref} lancé (${linesCount} ligne(s))`);
      navigate('/responsable/inventaires', { replace: true });
    } catch (err) {
      toast.error(err.message || "Erreur lancement inventaire");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <ProtectedPage userName={userName}>
      <div className="app-layout">
        <div className={`sidebar-backdrop ${sidebarCollapsed ? 'hidden' : ''}`} onClick={() => setSidebarCollapsed(true)} />
        <SidebarResp collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} onLogout={onLogout} userName={userName} />

        <div className="main-container">
          <HeaderPage userName={userName} title="Inventaires" showSearch={false} onMenuClick={() => setSidebarCollapsed((p) => !p)} />
          <main className="main-content">
            {isLoading && <LoadingSpinner overlay text="Traitement..." />}

            <div className="inv-launch-header">
              <div className="inv-launch-title">
                <h2><ClipboardCheck size={20} /> Lancer une session d'inventaire</h2>
                <div className="inv-launch-sub">Définissez le périmètre et assignez la mission au magasinier.</div>
              </div>
              <div className="inv-launch-actions">
                <button className="inv-launch-btn" type="button" onClick={() => navigate('/responsable/inventaires')}>
                  <ArrowLeft size={16} /> Retour aux inventaires
                </button>
                <button className="inv-launch-btn" type="button" onClick={loadOptions} disabled={isLoading}>
                  <RefreshCw size={16} /> Actualiser
                </button>
              </div>
            </div>

            <div className="inv-launch-grid">
              <section className="inv-launch-card">
                <div className="inv-launch-card-head">
                  <strong>Paramètres</strong>
                  {canSubmitHint ? <span className="inv-launch-hint">{canSubmitHint}</span> : null}
                </div>

                <div className="inv-launch-type">
                  <button
                    type="button"
                    className={`inv-type-card ${typeInventaire === 'GLOBAL' ? 'active' : ''}`}
                    onClick={() => setTypeInventaire('GLOBAL')}
                  >
                    <div className="inv-type-kicker">GLOBAL</div>
                    <div className="inv-type-title">Inventaire global</div>
                    <div className="inv-type-desc">Tous les articles du magasin seront concernés.</div>
                  </button>
                  <button
                    type="button"
                    className={`inv-type-card ${typeInventaire === 'TOURNANT' ? 'active' : ''}`}
                    onClick={() => setTypeInventaire('TOURNANT')}
                  >
                    <div className="inv-type-kicker">TOURNANT</div>
                    <div className="inv-type-title">Inventaire tournant</div>
                    <div className="inv-type-desc">Contrôle ciblé par zone, famille ou catégorie.</div>
                  </button>
                </div>

                {typeInventaire === 'GLOBAL' ? (
                  <div className="inv-launch-info global">
                    <Info size={16} />
                    <div>
                      <strong>Inventaire global</strong>
                      <div>Tous les articles du magasin seront inclus. Il est recommandé de bloquer les mouvements.</div>
                    </div>
                  </div>
                ) : (
                  <div className="inv-launch-info tournant">
                    <Info size={16} />
                    <div>
                      <strong>Inventaire tournant</strong>
                      <div>Sélectionnez une zone, une famille ou une catégorie à contrôler.</div>
                    </div>
                  </div>
                )}

                <div className="inv-launch-form">
                  <div className="inv-launch-row">
                    <label>Magasin</label>
                    <select value={magasinId} onChange={(e) => setMagasinId(e.target.value)}>
                      <option value="">Choisir un magasin</option>
                      {options.magasins.map((m) => (
                        <option key={m._id} value={m._id}>
                          {m.name} ({m.code})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="inv-launch-row two">
                    <div>
                      <label>Zone (optionnel)</label>
                      <select value={zoneId} onChange={(e) => setZoneId(e.target.value)} disabled={zoneDisabled}>
                        <option value="">{zoneDisabled ? 'Désactivé (GLOBAL)' : 'Choisir une zone'}</option>
                        {options.zones.map((z) => (
                          <option key={z._id} value={z._id}>
                            {z.name} ({z.code})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label>Famille (optionnel)</label>
                      <select value={familleId} onChange={(e) => setFamilleId(e.target.value)} disabled={familleDisabled}>
                        <option value="">{familleDisabled ? 'Désactivé (GLOBAL)' : 'Choisir une famille'}</option>
                        {options.familles.map((f) => (
                          <option key={f.value} value={f.value}>
                            {f.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="inv-launch-row two">
                    <div>
                      <label>Catégorie (optionnel)</label>
                      <select value={categorieId} onChange={(e) => setCategorieId(e.target.value)} disabled={categorieDisabled}>
                        <option value="">{categorieDisabled ? 'Désactivé (GLOBAL)' : 'Choisir une catégorie'}</option>
                        {options.categories.map((c) => (
                          <option key={c._id} value={c._id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label>Magasinier assigné</label>
                      <select value={magasinierId} onChange={(e) => setMagasinierId(e.target.value)}>
                        <option value="">Choisir un magasinier</option>
                        {options.magasiniers.map((u) => (
                          <option key={u._id} value={u._id}>
                            {u.username}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="inv-launch-row two">
                    <div>
                      <label>Date prévue</label>
                      <input type="date" value={datePrevue} onChange={(e) => setDatePrevue(e.target.value)} />
                    </div>
                    <div className="inv-launch-checks">
                      <label className="inv-launch-check">
                        <input
                          type="checkbox"
                          checked={bloquerMouvements}
                          onChange={(e) => setBloquerMouvements(e.target.checked)}
                        />
                        Bloquer les mouvements pendant l'inventaire
                      </label>
                      <label className="inv-launch-check">
                        <input
                          type="checkbox"
                          checked={notificationsActives}
                          onChange={(e) => setNotificationsActives(e.target.checked)}
                        />
                        Notifier le magasinier
                      </label>
                    </div>
                  </div>

                  <div className="inv-launch-row">
                    <label>Commentaire</label>
                    <textarea
                      rows={3}
                      value={commentaire}
                      onChange={(e) => setCommentaire(e.target.value)}
                      placeholder="Objectif, consignes, contraintes..."
                    />
                  </div>

                  {formErrors.length ? (
                    <div className="inv-launch-errors">
                      <strong>Données invalides</strong>
                      <ul>
                        {formErrors.map((e, idx) => <li key={`${e}_${idx}`}>{e}</li>)}
                      </ul>
                    </div>
                  ) : null}

                  <div className="inv-launch-footer">
                    <button className="inv-launch-btn ghost" type="button" onClick={() => navigate('/responsable/inventaires')} disabled={isLoading}>
                      Annuler
                    </button>
                    <button className="inv-launch-btn primary" type="button" onClick={launchInventory} disabled={isLoading}>
                      <Rocket size={16} /> Lancer inventaire
                    </button>
                  </div>
                </div>
              </section>

              <aside className="inv-launch-card side">
                <div className="inv-launch-side-head">
                  <strong>Résumé</strong>
                </div>
                <div className="inv-launch-kv">
                  <div className="k"><span>Type</span></div>
                  <div className="v"><span className={`inv-status-badge type ${typeInventaire === 'GLOBAL' ? 'global' : 'tournant'}`}>{typeInventaire}</span></div>
                </div>
                <div className="inv-launch-kv">
                  <div className="k"><span>Magasin</span></div>
                  <div className="v">{magasinLabel || '-'}</div>
                </div>
                <div className="inv-launch-kv">
                  <div className="k"><span>Mouvements</span></div>
                  <div className="v">{bloquerMouvements ? 'Bloqués (si GLOBAL)' : 'Non bloqués'}</div>
                </div>
                <div className="inv-launch-kv">
                  <div className="k"><span>Notification</span></div>
                  <div className="v">{notificationsActives ? 'Active' : 'Désactivée'}</div>
                </div>
                <div className="inv-launch-side-note">
                  Statut initial après lancement: <span className="inv-status-badge a_faire">A_FAIRE</span>
                </div>
              </aside>
            </div>
          </main>
        </div>
      </div>
    </ProtectedPage>
  );
};

export default LancerInventaireResp;

