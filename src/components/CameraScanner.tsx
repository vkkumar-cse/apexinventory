import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { Button } from "@/components/ui/button";
import { Camera, CameraOff, Loader2 } from "lucide-react";
import { toast } from "sonner";

const elementId = "qr-reader-region";

type BrowserBarcodeDetector = {
  detect: (source: CanvasImageSource) => Promise<Array<{ rawValue?: string }>>;
};

declare global {
  interface Window {
    BarcodeDetector?: {
      new(options?: { formats?: string[] }): BrowserBarcodeDetector;
      getSupportedFormats?: () => Promise<string[]>;
    };
  }
}

export function CameraScanner({ onResult }: { onResult: (text: string) => void }) {
  const [active, setActive] = useState(false);
  const [starting, setStarting] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [nativePreview, setNativePreview] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanLoopRef = useRef<number | null>(null);

  const isSecureCameraContext =
    window.isSecureContext ||
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1";

  const cameraErrorMessage = (error: unknown) => {
    const err = error as DOMException | Error | undefined;
    const name = err?.name ?? "";
    const message = err?.message ?? "";

    if (!navigator.mediaDevices?.getUserMedia || message === "Browser Does Not Support Camera") {
      return "Browser Does Not Support Camera";
    }
    if (!isSecureCameraContext || message === "HTTPS Required") return "HTTPS Required";
    if (name === "NotAllowedError" || name === "PermissionDeniedError") return "Camera Permission Denied";
    if (name === "NotFoundError" || name === "DevicesNotFoundError") return "No Camera Found";
    if (name === "NotReadableError" || name === "TrackStartError" || message.toLowerCase().includes("in use")) {
      return "Camera Already In Use";
    }
    return "Failed To Start Camera";
  };

  const logVideoState = () => {
    const video = document.querySelector("video") as HTMLVideoElement | null;
    console.log("Video Element:", video);
    console.log("Video SrcObject:", video?.srcObject ?? null);
    console.log("Video Width:", video?.videoWidth ?? 0);
    console.log("Video Height:", video?.videoHeight ?? 0);
    console.log("Ready State:", video?.readyState ?? 0);
    return video;
  };

  const waitForRenderableVideo = async () => {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const video = logVideoState();

      if (video?.srcObject && video.readyState >= HTMLMediaElement.HAVE_METADATA) {
        await video.play().catch((error) => {
          console.error("CAMERA ERROR", error);
        });
        return;
      }

      await new Promise((resolve) => window.setTimeout(resolve, 150));
    }

    throw new Error("Failed To Start Camera");
  };

  const stopNativePreview = () => {
    if (scanLoopRef.current !== null) {
      window.cancelAnimationFrame(scanLoopRef.current);
      scanLoopRef.current = null;
    }

    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setNativePreview(false);
  };

  const startNativeQrLoop = async () => {
    if (!window.BarcodeDetector || !videoRef.current) {
      console.error("CAMERA ERROR", new Error("Native QR detector unavailable"));
      return;
    }

    const supportedFormats = window.BarcodeDetector.getSupportedFormats
      ? await window.BarcodeDetector.getSupportedFormats()
      : ["qr_code"];

    if (!supportedFormats.includes("qr_code")) {
      console.error("CAMERA ERROR", new Error("Native QR detector does not support qr_code"));
      return;
    }

    const detector = new window.BarcodeDetector({ formats: ["qr_code"] });

    const scanFrame = async () => {
      const video = videoRef.current;
      if (!video || video.paused || video.ended) return;

      try {
        const codes = await detector.detect(video);
        const value = codes[0]?.rawValue;
        if (value) {
          onResult(value);
          await stop();
          return;
        }
      } catch (error) {
        console.error("CAMERA ERROR", error);
      }

      scanLoopRef.current = window.requestAnimationFrame(scanFrame);
    };

    scanLoopRef.current = window.requestAnimationFrame(scanFrame);
  };

  const startDirectCameraPreview = async () => {
    const video = videoRef.current;
    if (!video) throw new Error("Failed To Start Camera");

    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } },
      audio: false,
    });

    streamRef.current = stream;
    video.srcObject = stream;
    await video.play();
    setNativePreview(true);
    setActive(true);

    console.log("Video Element:", video);
    console.log("Video SrcObject:", video.srcObject);
    console.log("Video Width:", video.videoWidth);
    console.log("Video Height:", video.videoHeight);
    console.log("Ready State:", video.readyState);

    await startNativeQrLoop();
  };

  async function stop() {
    stopNativePreview();

    const scanner = scannerRef.current;
    scannerRef.current = null;

    if (scanner) {
      try {
        if (scanner.isScanning) await scanner.stop();
        await scanner.clear();
      } catch (error) {
        console.error("CAMERA ERROR", error);
      }
    }

    setActive(false);
  }

  async function start() {
    setStarting(true);
    setActive(false);
    setNativePreview(false);
    setCameraError(null);

    try {
      const scannerContainer = document.getElementById(elementId);
      const cameras = "Skipped: using facingMode environment";
      const selectedCameraId = { facingMode: "environment" };

      console.log("Camera start requested");
      console.log("Secure Context:", window.isSecureContext);
      console.log("Media Devices:", navigator.mediaDevices);
      console.log("Scanner Container:", scannerContainer);
      console.log("Available Cameras:", cameras);
      console.log("Selected Camera:", selectedCameraId);

      if (!navigator.mediaDevices?.getUserMedia) throw new Error("Browser Does Not Support Camera");
      if (!isSecureCameraContext) throw new Error("HTTPS Required");
      if (!scannerContainer) throw new Error("Failed To Start Camera");

      await stop();
      scannerContainer.innerHTML = "";

      const scanner = new Html5Qrcode(elementId, false);
      scannerRef.current = scanner;

      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: 250 },
        (decoded) => {
          onResult(decoded);
          stop();
        },
        (errorMessage) => {
          if (errorMessage) console.debug("QR decode miss:", errorMessage);
        }
      );

      await waitForRenderableVideo();
      setActive(true);
    } catch (error) {
      console.error("CAMERA ERROR", error);
      await stop();

      const message = cameraErrorMessage(error);

      if (message === "Failed To Start Camera") {
        try {
          await startDirectCameraPreview();
          return;
        } catch (directError) {
          console.error("CAMERA ERROR", directError);
        }
      }

      toast.error(message);
      setCameraError(message);
    } finally {
      setStarting(false);
    }
  }

  useEffect(() => () => { stop(); }, []);

  return (
    <div className="space-y-3">
      <div className="relative mx-auto aspect-square w-full max-w-sm overflow-hidden rounded-lg border border-border bg-slate-950">
        <div
          id={elementId}
          className="absolute inset-0 block h-full w-full overflow-visible [&_video]:!block [&_video]:!h-full [&_video]:!w-full [&_video]:!object-cover"
        />
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={`absolute inset-0 h-full w-full object-cover ${nativePreview ? "block" : "hidden"}`}
        />

        {!active && (
          <div className="absolute inset-0 z-10 grid place-items-center bg-secondary/95 text-muted-foreground">
            {starting ? (
              <div className="text-center">
                <Loader2 className="mx-auto mb-2 h-6 w-6 animate-spin text-primary" />
                <p className="text-sm font-medium text-foreground">Starting camera...</p>
              </div>
            ) : (
              <div className="px-4 text-center">
                <CameraOff className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
                <p className="text-sm font-medium text-foreground">
                  {cameraError ? "Unable To Start Camera" : "Camera preview will appear here"}
                </p>
                {cameraError && <p className="mt-1 text-xs text-muted-foreground">{cameraError}</p>}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex justify-center">
        {!active ? (
          <Button onClick={start} disabled={starting}>
            <Camera className="h-4 w-4 mr-2" />{starting ? "Starting..." : cameraError ? "Retry Camera" : "Open Camera"}
          </Button>
        ) : (
          <Button variant="secondary" onClick={stop}>
            <CameraOff className="h-4 w-4 mr-2" />Stop Camera
          </Button>
        )}
      </div>

      <p className="text-xs text-center text-muted-foreground">
        Point your camera at any product QR. Requires HTTPS and camera permission.
      </p>
    </div>
  );
}
