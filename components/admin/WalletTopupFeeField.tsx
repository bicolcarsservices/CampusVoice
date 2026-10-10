"use client";

import { useState } from "react";
import { formatCentavos } from "@/lib/wallet";

export default function WalletTopupFeeField({ requestedCentavos }: { requestedCentavos: number }) {
  const [received, setReceived] = useState((requestedCentavos / 100).toFixed(2));
  const [fee, setFee] = useState("0");
  const parsedReceived = /^\d{1,6}(?:\.\d{1,2})?$/.test(received) ? Math.round(Number(received) * 100) : null;
  const parsedFee = /^\d{1,6}(?:\.\d{1,2})?$/.test(fee) ? Math.round(Number(fee) * 100) : null;
  const validReceived = parsedReceived !== null && parsedReceived >= 100 && parsedReceived <= 10000000;
  const validFee = validReceived && parsedFee !== null && parsedFee >= 0 && parsedFee < (parsedReceived ?? 0);

  return (
    <div className="space-y-2">
      <label className="block text-sm">Verified Maya amount received (PHP)
        <input
          name="received_php"
          type="number"
          min="1"
          max="100000"
          step="0.01"
          required
          value={received}
          onChange={(event) => setReceived(event.target.value)}
          className="input mt-1"
        />
      </label>
      <label className="block text-sm">Maya fee/deduction (PHP)
        <input
          name="fee_php"
          type="number"
          min="0"
          max={Math.max(0, ((parsedReceived ?? 100) - 100) / 100).toFixed(2)}
          step="0.01"
          required
          value={fee}
          onChange={(event) => setFee(event.target.value)}
          className="input mt-1"
        />
      </label>
      <p className="text-sm" aria-live="polite">
        Wallet credit after deduction: <strong>{validFee ? formatCentavos((parsedReceived ?? 0) - (parsedFee ?? 0)) : "Enter a valid amount and deduction"}</strong>
      </p>
    </div>
  );
}
