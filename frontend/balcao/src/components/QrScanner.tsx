import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { Button, InputBase } from "design-system";
import styles from "./QrScanner.module.scss";

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
      <div className={styles.manualFallback}>
        <div className={styles.manualHint}>
          Câmera não disponível — insira o código manualmente
        </div>
        <form onSubmit={(e) => { e.preventDefault(); if (manualValue.trim()) { onScan(manualValue.trim()); setManualValue(""); } }}>
          <div className={styles.manualField}>
            <InputBase
              aria-label="Código do ticket"
              value={manualValue}
              onChange={(e) => setManualValue(e.target.value)}
              placeholder="Código do ticket"
              autoFocus
            />
          </div>
          <Button type="submit" fullWidth>Coletar</Button>
        </form>
      </div>
    );
  }

  return (
    <div className={styles.frame}>
      <video ref={videoRef} className={styles.video} muted playsInline />
      <canvas ref={canvasRef} className={styles.hiddenCanvas} />
      <div className={styles.overlay}>
        <div className={styles.viewfinder} />
      </div>
    </div>
  );
}
