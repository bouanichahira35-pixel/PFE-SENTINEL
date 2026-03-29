import { useEffect, useRef, useState } from "react";
import { BrowserQRCodeReader } from "@zxing/browser";
import { toast } from "react-toastify";

const DEFAULT_SUCCESS_MESSAGE = "QR Code scanné avec succès !";
const DEFAULT_ERROR_MESSAGE = "Erreur lors du scan du QR Code.";

const QrReader = ({ onScan, onError, title = "Scanner un QR Code" }) => {
  const videoRef = useRef(null);
  const controlsRef = useRef(null);
  const hasScannedRef = useRef(false);

  const onScanRef = useRef(onScan);
  const onErrorRef = useRef(onError);
  onScanRef.current = onScan;
  onErrorRef.current = onError;

  const [isStarting, setIsStarting] = useState(true);
  const [isActive, setIsActive] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const reader = new BrowserQRCodeReader();

    async function start() {
      setIsStarting(true);
      hasScannedRef.current = false;
      try {
        const controls = await reader.decodeFromVideoDevice(
          undefined,
          videoRef.current,
          (result, error) => {
            if (cancelled) return;

            if (result && !hasScannedRef.current) {
              hasScannedRef.current = true;
              const text = typeof result.getText === "function" ? result.getText() : String(result);
              toast.success(DEFAULT_SUCCESS_MESSAGE);
              try {
                onScanRef.current?.(text);
              } finally {
                controlsRef.current?.stop();
                setIsActive(false);
              }
              return;
            }

            // ZXing remonte très souvent des erreurs "pas trouvé" tant qu'aucun QR n'est visible.
            if (error && error.name && String(error.name).toLowerCase().includes("notfound")) {
              return;
            }
          }
        );

        if (cancelled) {
          controls.stop();
          return;
        }

        controlsRef.current = controls;
        setIsActive(true);
      } catch (err) {
        if (cancelled) return;
        toast.error(DEFAULT_ERROR_MESSAGE);
        onErrorRef.current?.(err);
      } finally {
        if (!cancelled) setIsStarting(false);
      }
    }

    start();

    return () => {
      cancelled = true;
      try {
        controlsRef.current?.stop();
      } catch {
        // best-effort cleanup
      }
      controlsRef.current = null;
      setIsActive(false);
      setIsStarting(false);
    };
  }, []);

  return (
    <div>
      <h3>{title}</h3>
      <video
        ref={videoRef}
        style={{ width: "100%", maxWidth: 420, borderRadius: 12, background: "#111" }}
        muted
        playsInline
      />
      <div style={{ marginTop: 10, fontSize: 13, opacity: 0.85 }}>
        {isStarting
          ? "Initialisation de la caméra…"
          : isActive
            ? "Caméra active. Présentez un QR Code."
            : "Scan terminé."}
      </div>
    </div>
  );
};

export default QrReader;

