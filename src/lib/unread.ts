/** Postgres "-infinity" (never read) comes back as a string Date can't parse. */
export function isUnread(lastMessageAt: string, lastReadAt: string): boolean {
  const read = new Date(lastReadAt).getTime();
  if (Number.isNaN(read)) return true;
  return new Date(lastMessageAt).getTime() > read;
}
