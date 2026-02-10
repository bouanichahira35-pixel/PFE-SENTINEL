import React from 'react';
import HoverCard from './HoverCard';
import './HoverCard.css';

/**
 * HoverCardExamples - Demo component showcasing different HoverCard variations
 */
const HoverCardExamples = () => {
  // Sample data for cards
  const cards = [
    {
      id: 1,
      title: 'Stock Management',
      description: 'Track and manage your inventory in real-time',
      fullContent: (
        <>
          <p><strong>Features:</strong></p>
          <ul style={{ textAlign: 'left', margin: '0.5rem 0', paddingLeft: '1.2rem' }}>
            <li>Real-time stock updates</li>
            <li>Low inventory alerts</li>
            <li>Barcode scanning</li>
            <li>Batch tracking</li>
          </ul>
          <button style={{ 
            marginTop: '1rem', 
            padding: '0.5rem 1rem',
            background: 'var(--hover-card-accent)',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer'
          }}>
            View Details
          </button>
        </>
      ),
      icon: '📦',
      variant: 'default'
    },
    {
      id: 2,
      title: 'Quick Actions',
      description: 'Perform common tasks with a single click',
      fullContent: (
        <>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'center' }}>
            <button style={{ padding: '0.4rem 0.8rem', background: 'rgba(255,255,255,0.2)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: '6px', color: 'white', cursor: 'pointer' }}>➕ Add</button>
            <button style={{ padding: '0.4rem 0.8rem', background: 'rgba(255,255,255,0.2)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: '6px', color: 'white', cursor: 'pointer' }}>✏️ Edit</button>
            <button style={{ padding: '0.4rem 0.8rem', background: 'rgba(255,255,255,0.2)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: '6px', color: 'white', cursor: 'pointer' }}>🗑️ Delete</button>
          </div>
          <p style={{ marginTop: '1rem', fontSize: '0.85rem' }}>Access all quick actions instantly</p>
        </>
      ),
      variant: 'gradient'
    },
    {
      id: 3,
      title: 'Analytics',
      description: 'View detailed reports and insights',
      fullContent: (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-around', marginBottom: '0.5rem' }}>
            <div>
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>1.2K</div>
              <div style={{ fontSize: '0.75rem', opacity: 0.8 }}>Orders</div>
            </div>
            <div>
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>$8.5K</div>
              <div style={{ fontSize: '0.75rem', opacity: 0.8 }}>Revenue</div>
            </div>
          </div>
          <p style={{ fontSize: '0.85rem', opacity: 0.9 }}>+15% from last month</p>
        </>
      ),
      variant: 'glass'
    },
    {
      id: 4,
      title: 'Notifications',
      description: 'Stay updated with important alerts',
      fullContent: (
        <>
          <div style={{ textAlign: 'left' }}>
            <div style={{ padding: '0.5rem', background: 'rgba(255,255,255,0.1)', borderRadius: '8px', marginBottom: '0.5rem' }}>
              <span style={{ color: 'var(--hover-card-success)' }}>●</span> New order received
            </div>
            <div style={{ padding: '0.5rem', background: 'rgba(255,255,255,0.1)', borderRadius: '8px', marginBottom: '0.5rem' }}>
              <span style={{ color: 'var(--hover-card-warning)' }}>●</span> Low stock warning
            </div>
            <div style={{ padding: '0.5rem', background: 'rgba(255,255,255,0.1)', borderRadius: '8px' }}>
              <span style={{ color: 'var(--hover-card-primary)' }}>●</span> System update available
            </div>
          </div>
        </>
      ),
      icon: '🔔',
      variant: 'border-gradient'
    }
  ];

  return (
    <div style={{ padding: '2rem', minHeight: '100vh', background: '#f5f5f5' }}>
      <h1 style={{ textAlign: 'center', marginBottom: '2rem', color: '#333' }}>
        Hover Card Examples
      </h1>
      
      {/* Default Cards */}
      <h2 style={{ marginBottom: '1rem', color: '#666', fontSize: '1.2rem' }}>
        Default Variant
      </h2>
      <div className="hover-card-grid hover-card-grid--4">
        {cards.filter(c => c.variant === 'default').map(card => (
          <HoverCard
            key={card.id}
            title={card.title}
            description={card.description}
            fullContent={card.fullContent}
            icon={card.icon}
            variant={card.variant}
            size="medium"
          />
        ))}
      </div>

      {/* Gradient Cards */}
      <h2 style={{ marginTop: '2rem', marginBottom: '1rem', color: '#666', fontSize: '1.2rem' }}>
        Gradient Variant
      </h2>
      <div className="hover-card-grid hover-card-grid--4">
        {cards.filter(c => c.variant === 'gradient').map(card => (
          <HoverCard
            key={card.id}
            title={card.title}
            description={card.description}
            fullContent={card.fullContent}
            variant={card.variant}
            size="medium"
          />
        ))}
      </div>

      {/* Glass Cards */}
      <h2 style={{ marginTop: '2rem', marginBottom: '1rem', color: '#666', fontSize: '1.2rem' }}>
        Glass Variant
      </h2>
      <div className="hover-card-grid hover-card-grid--4">
        {cards.filter(c => c.variant === 'glass').map(card => (
          <HoverCard
            key={card.id}
            title={card.title}
            description={card.description}
            fullContent={card.fullContent}
            variant={card.variant}
            size="medium"
          />
        ))}
      </div>

      {/* Border Gradient Cards */}
      <h2 style={{ marginTop: '2rem', marginBottom: '1rem', color: '#666', fontSize: '1.2rem' }}>
        Border Gradient Variant
      </h2>
      <div className="hover-card-grid hover-card-grid--4">
        {cards.filter(c => c.variant === 'border-gradient').map(card => (
          <HoverCard
            key={card.id}
            title={card.title}
            description={card.description}
            fullContent={card.fullContent}
            icon={card.icon}
            variant={card.variant}
            size="medium"
          />
        ))}
      </div>

      {/* Size Variants */}
      <h2 style={{ marginTop: '2rem', marginBottom: '1rem', color: '#666', fontSize: '1.2rem' }}>
        Size Variants
      </h2>
      <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <HoverCard
          title="Small Card"
          description="Compact size for tight spaces"
          fullContent={<p>Compact content here</p>}
          icon="🔹"
          size="small"
          variant="default"
        />
        <HoverCard
          title="Medium Card"
          description="Standard size for most use cases"
          fullContent={<p>Standard content here</p>}
          icon="🔸"
          size="medium"
          variant="default"
        />
        <HoverCard
          title="Large Card"
          description="Expanded size for detailed content"
          fullContent={<p>Extended content here with more details</p>}
          icon="🔶"
          size="large"
          variant="default"
        />
      </div>
    </div>
  );
};

export default HoverCardExamples;
