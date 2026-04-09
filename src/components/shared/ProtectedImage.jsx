import useProtectedFileUrl from '../../hooks/useProtectedFileUrl';

const DEFAULT_STYLE = { background: 'linear-gradient(135deg, rgba(15,118,110,.08), rgba(14,165,233,.10))' };

export default function ProtectedImage({
  filePath,
  alt = '',
  className = '',
  fallbackText = '',
  fallbackNode = null,
  style = {},
}) {
  const src = useProtectedFileUrl(filePath);
  if (!src) {
    return (
      <div className={className} style={{ ...DEFAULT_STYLE, ...style, display: 'grid', placeItems: 'center' }}>
        {fallbackNode}
        {!fallbackNode && fallbackText ? (
          <span style={{ fontWeight: 900, color: '#334155', fontSize: 12 }}>{fallbackText}</span>
        ) : null}
      </div>
    );
  }
  return <img src={src} alt={alt} className={className} style={style} />;
}
