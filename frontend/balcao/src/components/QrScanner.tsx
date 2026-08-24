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
  const [cameraErrorDetail, setCameraErrorDetail] = useState("");
  const [manualValue, setManualValue] = useState("");
  // Incrementado pelo botão "Tentar novamente" — força o efeito de baixo a
  // rodar de novo sem precisar desmontar/remontar o componente inteiro.
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let permissionStatus: PermissionStatus | null = null;

    // Achado ao vivo (ORD-122): no celular, acessando por IP da rede local
    // (não https/localhost), o Chrome nem chega a perguntar permissão —
    // getUserMedia (às vezes nem window.navigator.mediaDevices) simplesmente
    // não existe em contexto inseguro. Isso é regra do navegador, não dá pra
    // contornar no código do app — mas dá pra detectar e explicar direito em
    // vez de cair num erro genérico/errado.
    if (!window.isSecureContext) {
      setCameraErrorDetail("InsecureContext");
      setCameraError(true);
      return;
    }

    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        setCameraError(false);
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }
        scan();
      } catch (err) {
        // Achado ao vivo (ORD-121): "câmera não disponível" sem detalhe
        // nenhum tornava impossível diferenciar permissão negada de câmera
        // em uso por outro app/aba de câmera realmente ausente. Loga e
        // mostra o nome real do erro (NotAllowedError/NotReadableError/
        // NotFoundError/OverconstrainedError) — sem isso não dá pra
        // diagnosticar à distância.
        console.error("QrScanner: getUserMedia falhou", err);
        const name = err instanceof DOMException ? err.name : "erro desconhecido";
        setCameraErrorDetail(name);
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

    // Checa a Permissions API antes de tentar (Chrome/Edge; navegadores sem
    // suporte a "camera" nessa API, ex. Safari, caem direto no getUserMedia
    // — o catch acima já cobre esse caso). Duas vantagens sobre só tentar
    // direto: (1) não gasta uma chamada de getUserMedia fadada a falhar
    // quando já sabemos que está bloqueado, (2) dá pra escutar `onchange` e
    // reconectar sozinho assim que o usuário libera nas configurações do
    // navegador, sem precisar de reload nem clicar em nada.
    async function checkPermissionThenStart() {
      if (!navigator.permissions?.query) { startCamera(); return; }
      try {
        permissionStatus = await navigator.permissions.query({ name: "camera" as PermissionName });
        if (cancelled) return;
        if (permissionStatus.state === "denied") {
          setCameraErrorDetail("NotAllowedError");
          setCameraError(true);
        } else {
          startCamera();
        }
        permissionStatus.onchange = () => {
          if (permissionStatus?.state === "granted") setRetryKey((k) => k + 1);
        };
      } catch {
        startCamera();
      }
    }

    checkPermissionThenStart();

    return () => {
      cancelled = true;
      if (permissionStatus) permissionStatus.onchange = null;
      cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [active, retryKey]);

  const ERROR_HINT: Record<string, { text: string; steps?: string[]; hideRetry?: boolean }> = {
    InsecureContext: {
      text: "Este endereço não é seguro (HTTPS) — o navegador bloqueia o acesso à câmera nesse caso.",
      steps: [
        "Câmera só funciona em endereços https:// ou localhost — não em IP da rede local (http://192.168...).",
        "Peça um link de acesso seguro (ex: túnel ngrok) pra quem está configurando o sistema.",
        "Ou insira o código do ticket manualmente abaixo, sem precisar da câmera.",
      ],
      hideRetry: true,
    },
    NotAllowedError: {
      text: "Permissão de câmera bloqueada para este site.",
      steps: [
        "Clique no ícone de cadeado (ou \"ⓘ\") ao lado do endereço, no navegador.",
        "Abra \"Configurações do site\" (ou \"Permissões\").",
        "Mude \"Câmera\" de Bloquear para Perguntar ou Permitir.",
        "Volte aqui e toque em \"Tentar novamente\" — não precisa recarregar a página.",
      ],
    },
    NotReadableError: {
      text: "Câmera em uso por outro aplicativo ou aba — feche o que estiver usando e toque em \"Tentar novamente\".",
    },
    NotFoundError: {
      text: "Nenhuma câmera encontrada neste dispositivo.",
    },
    OverconstrainedError: {
      text: "Nenhuma câmera compatível com o modo traseiro foi encontrada.",
    },
  };

  if (cameraError) {
    const hint = ERROR_HINT[cameraErrorDetail];
    return (
      <div className={styles.manualFallback}>
        <i className="icon-alert-triangle" />
        <div className={styles.manualHint}>
          {hint?.text ?? "Câmera não disponível — insira o código manualmente"}
        </div>
        {hint?.steps && (
          <ol className={styles.manualSteps}>
            {hint.steps.map((s, i) => <li key={i}>{s}</li>)}
          </ol>
        )}
        {!hint?.hideRetry && (
          <Button variant="secondary" fullWidth onClick={() => setRetryKey((k) => k + 1)}>
            Tentar novamente
          </Button>
        )}
        <div className={styles.manualDivider}>ou insira o código manualmente</div>
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
