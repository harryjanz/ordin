declare module "qz-tray" {
  interface PrintData {
    type: "raw" | "html" | "image" | "pdf";
    format?: "plain" | "base64" | "file";
    data: string;
    options?: Record<string, unknown>;
  }

  interface PrintConfig {
    __brand: "PrintConfig";
  }

  interface QZ {
    websocket: {
      connect(opts?: { retries?: number; delay?: number; host?: string }): Promise<void>;
      disconnect(): Promise<void>;
      isActive(): boolean;
    };
    printers: {
      find(query?: string): Promise<string[]>;
    };
    configs: {
      create(printer: string, opts?: Record<string, unknown>): PrintConfig;
    };
    print(config: PrintConfig, data: PrintData[]): Promise<void>;
    security: {
      setCertificatePromise(fn: (resolve: (cert: string) => void) => void): void;
      setSignaturePromise(fn: (toSign: string, resolve: (sig: string) => void) => void): void;
    };
  }

  const qz: QZ;
  export default qz;
}
