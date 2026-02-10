import React from 'react';
import './HoverCard.css';

/**
 * HoverCard - A beautiful card component with dynamic content reveal on hover
 * 
 * @param {string} title - Card title
 * @param {string} description - Brief description shown initially
 * @param {string|React.ReactNode} fullContent - Content revealed on hover
 * @param {string} image - Optional image URL
 * @param {string} icon - Optional icon class or component
 * @param {string} variant - Card style variant: 'default', 'gradient', 'glass'
 * @param {string} size - Card size: 'small', 'medium', 'large'
 * @param {Function} onClick - Optional click handler
 * @param {string} className - Additional CSS classes
 */
const HoverCard = ({
  title,
  description,
  fullContent,
  image,
  icon,
  variant = 'default',
  size = 'medium',
  onClick,
  className = ''
}) => {
  const cardClasses = `
    hover-card
    hover-card--${variant}
    hover-card--${size}
    ${className}
  `;

  return (
    <div className={cardClasses} onClick={onClick}>
      {/* Card Image/Overlay */}
      {image && (
        <div className="hover-card__image-wrapper">
          <img src={image} alt={title} className="hover-card__image" />
          <div className="hover-card__image-overlay" />
        </div>
      )}

      {/* Card Icon */}
      {icon && !image && (
        <div className="hover-card__icon-wrapper">
          <span className="hover-card__icon">{icon}</span>
        </div>
      )}

      {/* Card Content */}
      <div className="hover-card__content">
        <div className="hover-card__header">
          <h3 className="hover-card__title">{title}</h3>
          <div className="hover-card__separator">
            <span className="hover-card__separator-line" />
            <span className="hover-card__separator-dot" />
            <span className="hover-card__separator-line" />
          </div>
        </div>
        
        <p className="hover-card__description">{description}</p>
        
        {/* Hidden Content Revealed on Hover */}
        <div className="hover-card__reveal">
          <div className="hover-card__reveal-content">
            {fullContent}
          </div>
          <div className="hover-card__reveal-bg" />
        </div>
      </div>

      {/* Hover Indicator */}
      <div className="hover-card__indicator">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M5 12h14M12 5l7 7-7 7" />
        </svg>
      </div>
    </div>
  );
};

export default HoverCard;

