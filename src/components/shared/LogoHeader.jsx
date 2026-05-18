import logoETAP from '../../assets/logoETAP.png';
import './LogoHeader.css';

const LogoHeader = ({ title }) => {
  return (
    <div className="logo-header">
      <img src={logoETAP} alt="ETAP Logo" className="logo-header-img" />
      {title && <span className="logo-header-title">{title}</span>}
    </div>
  );
};

export default LogoHeader;
