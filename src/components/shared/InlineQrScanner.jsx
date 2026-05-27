import { useEffect, useRef, useState } from 'react';
import { Camera, StopCircle } from 'lucide-react';
import { useToast } from './Toast';
import './InlineQrScanner.css';

const InlineQrScanner = ({ onDetected, onClose, mode = 'qr' }) => {
  const toast = useToast();
  const videoRef = useRef(null);
  const scanLoopRef = useRef(null);
  const detectorRef = useRef(null);
  const zxingControlsRef = useRef(null);
  const zxingReaderRef = useRef(null);
  const streamRef = useRef(null);
  const [starting, setStarting] = useState(true);
  const lockRef = useRef(false);
  const [modeLabel, setModeLabel] = useState('');

  const cleanup = () => {
    if (scanLoopRef.current) {
      cancelAnimationFrame(scanLoopRef.current);
      scanLoopRef.current = null;
    }
    detectorRef.current = null;
    if (zxingControlsRef.current?.stop) zxingControlsRef.current.stop();
    zxingControlsRef.current = null;
    if (zxingReaderRef.current?.reset) zxingReaderRef.current.reset();
    zxingReaderRef.current = null;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    lockRef.current = false;
  };

  useEffect(() => {
    let mounted = true;

    const finish = (value) => {
      if (lockRef.current) return;
      lockRef.current = true;
      onDetected?.(String(value || '').trim());
      cleanup();
      onClose?.();
    };

    const start = async () => {
      try {
        if (!navigator?.mediaDevices?.getUserMedia) {
          toast.error('Camera non disponible sur ce navigateur');
          return;
        }

        // On mobile / LAN (http://IP), the browser may block camera access because it is not a secure context.
        // This avoids a confusing "Failed to fetch / black screen" during demos.
        if (typeof window !== 'undefined' && window.isSecureContext === false) {
          toast.error('Scan camera bloque: utilisez HTTPS ou localhost (contexte securise).');
          return;
        }

        if (window.BarcodeDetector) {
          const desiredFormats = mode === 'any'
            ? [
              'qr_code',
              'ean_13',
              'ean_8',
              'upc_a',
              'upc_e',
              'code_128',
              'code_39',
              'code_93',
              'itf',
              'codabar',
              'data_matrix',
              'pdf417',
              'aztec',
            ]
            : ['qr_code'];

          let formats = desiredFormats;
          try {
            const supported = await window.BarcodeDetector.getSupportedFormats?.();
            if (Array.isArray(supported) && supported.length) {
              formats = desiredFormats.filter((f) => supported.includes(f));
            }
          } catch {
            // ignore: fallback to desiredFormats, then to QR only if needed
          }

          let detector;
          try {
            detector = new window.BarcodeDetector({ formats });
          } catch {
            detector = new window.BarcodeDetector({ formats: ['qr_code'] });
          }
          detectorRef.current = detector;

          const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
          streamRef.current = stream;
          if (!mounted || !videoRef.current) return;
          videoRef.current.srcObject = stream;
          await videoRef.current.play();

          const scan = async () => {
            if (!videoRef.current || !detectorRef.current || lockRef.current) return;
            try {
              const barcodes = await detectorRef.current.detect(videoRef.current);
              if (Array.isArray(barcodes) && barcodes[0]?.rawValue) {
                finish(barcodes[0].rawValue);
                return;
              }
            } catch {
              // keep loop alive
            }
            scanLoopRef.current = requestAnimationFrame(scan);
          };
          scanLoopRef.current = requestAnimationFrame(scan);
          if (mounted) setModeLabel(mode === 'any' ? 'Code-barres / QR' : 'QR');
          if (mounted) setStarting(false);
          return;
        }

        const { BrowserMultiFormatReader } = await import('@zxing/browser');
        let reader;
        if (mode === 'qr') {
          const { BarcodeFormat, DecodeHintType } = await import('@zxing/library');
          const hints = new Map();
          hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.QR_CODE]);
          reader = new BrowserMultiFormatReader(hints);
        } else {
          reader = new BrowserMultiFormatReader();
        }
        zxingReaderRef.current = reader;
        if (!mounted || !videoRef.current) return;
        const controls = await reader.decodeFromVideoDevice(undefined, videoRef.current, (result) => {
          if (result?.getText) finish(result.getText());
        });
        zxingControlsRef.current = controls;
        if (mounted) setModeLabel(mode === 'any' ? 'Code-barres / QR' : 'QR');
        if (mounted) setStarting(false);
      } catch {
        toast.error(mode === 'any' ? 'Impossible de demarrer le scan code-barres / QR' : 'Impossible de demarrer le scan QR');
        cleanup();
      }
    };

    start();
    return () => {
      mounted = false;
      cleanup();
    };
  }, [mode, onClose, onDetected, toast]);

  return (
      <div className="inline-qr-scanner">
        <div className="inline-qr-toolbar">
          <span className="inline-qr-title">
            <Camera size={16} />
            Scanner {modeLabel || (mode === 'any' ? 'code-barres / QR' : 'QR')}
          </span>
          <button type="button" className="inline-qr-stop" onClick={onClose}>
            <StopCircle size={16} />
            Fermer
          </button>
        </div>
      <div className="inline-qr-video-wrap">
        <video ref={videoRef} autoPlay playsInline className="inline-qr-video" />
        <div className="inline-qr-frame" />
      </div>
      {starting && <div className="inline-qr-hint">Demarrage camera...</div>}
      {!starting && (
        <div className="inline-qr-hint">
          {mode === 'any' ? 'Pointez le code-barres ou le QR dans le cadre' : 'Pointez le QR dans le cadre'}
        </div>
      )}
    </div>
  );
};

export default InlineQrScanner;
