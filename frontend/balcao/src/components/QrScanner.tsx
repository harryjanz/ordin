import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";

interface Props {
  onScan: (data: string) => void;
  active: boolean;
}

export default function QrScanner({ onScan, active }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const [cameraError, setCameraError] = useState(false);
  const [manualValue, setManualValue] = useState("");

  useEffect(() => {
    if (!active) return;

    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }
        scan();
      } catch {
        setCameraError(true);
      }
    }

    function scan() {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
        rafRef.current = requestAnimationFrame(scan);
        return;
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height);
      if (code?.data) {
        onScan(code.data);
        return;
      }
      rafRef.current = requestAnimationFrame(scan);
    }

    startCamera();

    return () => {
      cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [active]);

  if (cameraError) {
    return (
      <div style={{ textAlign: "center" }}>
        <div style={{ color: "rgba(223,232,237,0.5)", fontSize: 13, marginBottom: 12 }}>
          Câmera não disponível — insira o código manualmente
        </div>
        <form onSubmit={(e) => { e.preventDefault(); if (manualValue.trim()) { onScan(manualValue.trim()); setManualValue(""); } }}>
          <input
            value={manualValue}
            onChange={(e) => setManualValue(e.target.value)}
            placeholder="Código do ticket"
            autoFocus
            style={{
              padding: "8px 12px",
              background: "rgba(153,0,255,0.08)",
              border: "1px solid rgba(153,0,255,0.3)",
              borderRadius: 8,
              color: "#DFE8ED",
              fontSize: 15,
              width: "100%",
              outline: "none",
              marginBottom: 8,
            }}
          />
          <button
            type="submit"
            style={{
              width: "100%",
              padding: "8px",
              background: "#9900ff",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              cursor: "pointer",
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            Coletar
          </button>
        </form>
      </div>
    );
  }

  return (
    <div style={{ position: "relative", borderRadius: 12, overflow: "hidden", background: "#000" }}>
      <video ref={videoRef} style={{ width: "100%", display: "block" }} muted playsInline />
      <canvas ref={canvasRef} style={{ display: "none" }} />
      {/* Viewfinder overlay */}
      <div style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        pointerEvents: "none",
      }}>
        <div style={{
          width: 200,
          height: 200,
          border: "3px solid #9900ff",
          borderRadius: 16,
          boxShadow: "0 0 0 2000px rgba(0,0,0,0.45)",
        }} />
      </div>
    </div>
  );
}
