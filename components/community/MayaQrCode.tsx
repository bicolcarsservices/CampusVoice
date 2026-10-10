"use client";

import { useState } from "react";

export default function MayaQrCode() {
  const [available, setAvailable] = useState(true);
  if (!available) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 p-5 text-sm text-slate-500">
        Maya QR code will appear here when its image is added as <code>public/maya-qr.jpg</code>.
      </div>
    );
  }
  return (
    <img
      src="/maya-qr.jpg"
      alt="Maya QR code for payments"
      className="mx-auto max-h-80 rounded-xl border border-slate-200 object-contain"
      onError={() => setAvailable(false)}
    />
  );
}
