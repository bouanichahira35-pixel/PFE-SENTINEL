import { useNavigate } from 'react-router-dom';

const NotFound = () => {
  const navigate = useNavigate();

  return (
    <div style={{ padding: '2rem' }}>
      <h1>Page introuvable</h1>
      <p>La page demandee n'existe pas.</p>
      <button onClick={() => navigate('/')}>Retour a l'accueil</button>
    </div>
  );
};

export default NotFound;
