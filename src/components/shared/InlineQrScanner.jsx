import { useEffect, useRef, useState } from 'react';
import { Camera, StopCircle } from 'lucide-react';
import { useToast } from './Toast';
import './InlineQrScanner.css';

const InlineQrScanner = ({ onDetected, onClose }) => {
  const toast = useToast();
  const videoRef = useRef(null);
  const scanLoopRef = useRef(null);
  const detectorRef = useRef(null);
  const zxingControlsRef = useRef(null);
  const zxingReaderRef = useRef(null);
  const streamRef = useRef(null);
  const [starting, setStarting] = useState(true);
  const lockRef = useRef(false);

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

        if (window.BarcodeDetector) {
          const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
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
          if (mounted) setStarting(false);
          return;
        }

        const { BrowserMultiFormatReader } = await import('@zxing/browser');
        const reader = new BrowserMultiFormatReader();
        zxingReaderRef.current = reader;
        if (!mounted || !videoRef.current) return;
        const controls = await reader.decodeFromVideoDevice(undefined, videoRef.current, (result) => {
          if (result?.getText) finish(result.getText());
        });
        zxingControlsRef.current = controls;
        if (mounted) setStarting(false);
      } catch {
        toast.error('Impossible de demarrer le scan QR');
        cleanup();
      }
    };

    start();
    return () => {
      mounted = false;
      cleanup();
    };
  }, [onClose, onDetected, toast]);

  return (
    <div className="inline-qr-scanner">
      <div className="inline-qr-toolbar">
        <span className="inline-qr-title">
          <Camera size={16} />
          Scanner QR
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
      {!starting && <div className="inline-qr-hint">Pointez le QR dans le cadre</div>}
    </div>
  );
};

export default InlineQrScanner;
