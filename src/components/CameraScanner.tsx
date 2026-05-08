import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { Button } from "@/components/ui/button";
import { Camera, CameraOff, Loader2 } from "lucide-react";
import { toast } from "sonner";

export function CameraScanner({ onResult }: { onResult: (text: string) => void }) {
  const [active, setActive] = useState(false);
  const [starting, setStarting] = useState(false);
  const elementId = "qr-reader-region";
  const scannerRef = useRef<Html5Qrcode | null>(null);

  async function start() {
    setStarting(true);
    try {
      const scanner = new Html5Qrcode(elementId, /* verbose= */ false);
      scannerRef.current = scanner;
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        (decoded) => {
          onResult(decoded);
          stop();
        },
        () => { /* ignore per-frame decode errors */ }
      );
      setActive(true);
    } catch (e: any) {
      toast.error(e?.message ?? "Camera access denied. Allow camera permission and try again.");
      scannerRef.current = null;
    } finally {
      setStarting(false);
    }
  }

  async function stop() {
    const s = scannerRef.current;
    if (!s) { setActive(false); return; }
    try { await s.stop(); await s.clear(); } catch { /* noop */ }
    scannerRef.current = null;
    setActive(false);
  }

  useEffect(() => () => { stop(); /* eslint-disable-next-line */ }, []);

  return (
    <div className="space-y-3">
      <div
        id={elementId}
        className="w-full aspect-square max-w-sm mx-auto bg-black rounded-lg overflow-hidden grid place-items-center text-muted-foreground"
      >
        {!active && !starting && <span className="text-xs">Camera preview will appear here</span>}
        {starting && <Loader2 className="h-6 w-6 animate-spin text-primary" />}
      </div>
      <div className="flex justify-center">
        {!active ? (
          <Button onClick={start} disabled={starting}>
            <Camera className="h-4 w-4 mr-2" />{starting ? "Starting…" : "Open camera"}
          </Button>
        ) : (
          <Button variant="secondary" onClick={stop}>
            <CameraOff className="h-4 w-4 mr-2" />Stop camera
          </Button>
        )}
      </div>
      <p className="text-xs text-center text-muted-foreground">
        Point your camera at any product QR. Requires HTTPS and camera permission.
      </p>
    </div>
  );
}
