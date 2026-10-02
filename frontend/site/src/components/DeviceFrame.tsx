export default function DeviceFrame({ src, alt, float = false }: { src: string; alt: string; float?: boolean }) {
  return (
    <div className={`device-frame ${float ? "device-frame--float" : ""}`}>
      <div className="device-frame__screen">
        <img src={src} alt={alt} loading="lazy" />
      </div>
    </div>
  );
}
