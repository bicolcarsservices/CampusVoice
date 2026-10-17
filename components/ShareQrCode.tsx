import QRCode from "qrcode";
import { campusVoicePublicUrl } from "@/lib/branding";

export default async function ShareQrCode() {
  const dataUrl = await QRCode.toDataURL(campusVoicePublicUrl, {
    errorCorrectionLevel: "H",
    margin: 2,
    width: 440,
    color: {
      dark: "#102a43",
      light: "#ffffff",
    },
  });

  return (
    <div className="share-qr-code-group">
      <div className="share-qr-code">
        <img
          src={dataUrl}
          alt="Scan this QR code to open CampusVoice"
          width={220}
          height={220}
        />
      </div>
      <a
        className="btn-ghost share-qr-download"
        href={dataUrl}
        download="campusvoice-qr.png"
      >
        Download QR code
      </a>
    </div>
  );
}
