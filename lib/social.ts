export const ONLINE_WINDOW_MS = 5 * 60 * 1000;

export function isCurrentlyOnline(lastSeenAt: string | null | undefined) {
  if (!lastSeenAt) return false;
  return Date.now() - new Date(lastSeenAt).getTime() < ONLINE_WINDOW_MS;
}
