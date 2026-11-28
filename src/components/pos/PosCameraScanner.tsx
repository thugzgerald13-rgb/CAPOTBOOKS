/**
 * PosCameraScanner — Android/device camera barcode capture for the pharmacy POS.
 *
 * USB/Bluetooth wedge scanners require NO component: they type into the focused
 * search box and submit with Enter, exactly like a keyboard. This component
 * covers devices with a camera (Android tablets/phones, webcams) using the
 * native BarcodeDetector API where available.
 */
import { useEffect, useRef, useState } from 'react';
import { CameraOff, ScanBarcode } from 'lucide-react';

const getBarcodeDetector = (): any => (window as any).BarcodeDetector ?? null;

export function PosCameraScanner({ onCode, onClose }: { onCode: (code: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastCode, setLastCode] = useState('');
  const onCodeRef = useRef(onCode);
  onCodeRef.current = onCode;
  const lastCodeRef = useRef('');

  useEffect(() => {
    let cancelled = false;
    const start = async () => {
      const Detector = getBarcodeDetector();
      if (!Detector) {
        setError('Camera scanning is not supported on this browser. Use a USB/Bluetooth scanner or type the code manually.');
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
        let detector: any;
        try {
          detector = new Detector({ formats: ['ean_13', 'ean_8', 'code_128', 'code_39', 'code_93', 'qr_code', 'upc_a', 'upc_e', 'codabar', 'itf'] });
        } catch {
          detector = new Detector();
        }
        const loop = async () => {
          if (cancelled || !videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            if (codes && codes.length > 0) {
              const value = String(codes[0].rawValue || '').trim();
              if (value && value !== lastCodeRef.current) {
                lastCodeRef.current = value;
                setLastCode(value);
                onCodeRef.current(value);
              }
            }
          } catch { /* frame not decoded yet — keep looping */ }
          rafRef.current = requestAnimationFrame(loop);
        };
        loop();
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Camera unavailable. Check permission, or use a USB/Bluetooth scanner.');
      }
    };
    start();
    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  return (
    <div className="relative rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-black">
      <video ref={videoRef} muted playsInline className="w-full h-44 object-cover" />
      <button
        type="button"
        onClick={onClose}
        className="absolute top-2 right-2 p-1.5 bg-black/60 text-white rounded-lg hover:bg-black/80 transition"
        title="Stop camera"
      >
        <CameraOff className="w-4 h-4" />
      </button>
      {error ? (
        <p className="p-3 text-xs text-rose-200 bg-rose-900/60">{error}</p>
      ) : (
        <p className="absolute bottom-2 left-2 right-2 text-[11px] font-mono text-white bg-black/60 px-2 py-1 rounded flex items-center gap-1.5">
          <ScanBarcode className="w-3.5 h-3.5" />
          {lastCode ? `Last scan: ${lastCode}` : 'Point the camera at a barcode…'}
        </p>
      )}
    </div>
  );
}
