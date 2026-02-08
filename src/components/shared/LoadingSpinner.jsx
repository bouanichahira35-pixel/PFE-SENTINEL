import './LoadingSpinner.css';

const LoadingSpinner = ({ size = 'medium', text = '', overlay = false }) => {
  const sizeClasses = {
    small: 'spinner-small',
    medium: 'spinner-medium',
    large: 'spinner-large'
  };

  const spinner = (
    <div className={`loading-spinner-wrapper ${overlay ? 'spinner-overlay' : ''}`}>
      <div className={`loading-spinner ${sizeClasses[size]}`}>
        <div className="spinner-circle"></div>
      </div>
      {text && <p className="spinner-text">{text}</p>}
    </div>
  );

  return spinner;
};

export default LoadingSpinner;
