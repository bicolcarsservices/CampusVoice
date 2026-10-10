export function parsePhpAmount(value: FormDataEntryValue | null): number | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!/^(?:0|[1-9]\d{0,5})(?:\.\d{1,2})?$/.test(normalized)) return null;
  const [pesos, centavos = ""] = normalized.split(".");
  const amount = Number(pesos) * 100 + Number(centavos.padEnd(2, "0"));
  return Number.isSafeInteger(amount) && amount >= 100 && amount <= 10000000 ? amount : null;
}

export function formatCentavos(amount: number | string | null | undefined): string {
  return `₱${((Number(amount ?? 0) || 0) / 100).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
