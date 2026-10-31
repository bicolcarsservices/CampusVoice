export type AvatarPresetOption = {
  id: string;
  label: string;
  src: string;
};

export const AVATAR_PRESET_OPTIONS: AvatarPresetOption[] = [
  { id: "avatar-01", label: "Avatar 01", src: "/avatars-pack/avatars/avatar-01.png" },
  { id: "avatar-02", label: "Avatar 02", src: "/avatars-pack/avatars/avatar-02.png" },
  { id: "avatar-03", label: "Avatar 03", src: "/avatars-pack/avatars/avatar-03.png" },
  { id: "avatar-04", label: "Avatar 04", src: "/avatars-pack/avatars/avatar-04.png" },
  { id: "avatar-05", label: "Avatar 05", src: "/avatars-pack/avatars/avatar-05.png" },
  { id: "avatar-06", label: "Avatar 06", src: "/avatars-pack/avatars/avatar-06.png" },
  { id: "avatar-07", label: "Avatar 07", src: "/avatars-pack/avatars/avatar-07.png" },
  { id: "avatar-08", label: "Avatar 08", src: "/avatars-pack/avatars/avatar-08.png" },
  { id: "avatar-09", label: "Avatar 09", src: "/avatars-pack/avatars/avatar-09.png" },
  { id: "avatar-10", label: "Avatar 10", src: "/avatars-pack/avatars/avatar-10.png" },
  { id: "avatar-11", label: "Avatar 11", src: "/avatars-pack/avatars/avatar-11.png" },
  { id: "avatar-12", label: "Avatar 12", src: "/avatars-pack/avatars/avatar-12.png" },
];

const anonymousNames = [
  "Cloud Whisper",
  "Velvet Echo",
  "Milo Drift",
  "Night Bloom",
  "Golden Pine",
  "Wisp Harbor",
  "Clover Byte",
  "Nova Lantern",
  "Sunny Hue",
  "Mint Signal",
  "Glass Orbit",
  "Echo Pine",
  "Peach Run",
  "Wild Comet",
  "Bubble Flip",
  "Quiet Azure",
  "Juniper Spark",
  "Paper Echo",
  "Dusk Lantern",
  "Moonlight Hush",
];

export function resolveAvatarUrl(path: string | null | undefined, storagePublicUrl?: string | null): string | null {
  if (!path) return storagePublicUrl ?? null;
  if (path.startsWith("/")) return path;
  if (/^https?:\/\//.test(path)) return path;
  return storagePublicUrl ?? null;
}

function hashSeed(seed: string) {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function getAnonymousName(seed: string) {
  const hash = hashSeed(seed);
  const name = anonymousNames[hash % anonymousNames.length];
  const uniqueCode = hash.toString(36).toUpperCase().padStart(7, "0");
  return `${name} ${uniqueCode}`;
}

export function getAnonymousAvatar(seed: string) {
  const preset = AVATAR_PRESET_OPTIONS[hashSeed(seed) % AVATAR_PRESET_OPTIONS.length];
  return preset.src;
}
