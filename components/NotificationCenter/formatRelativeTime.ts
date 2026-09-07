// Small, dependency-free relative-time formatter (pt-BR) for notification timestamps.
// No date library is added to package.json for this (AGENTS.md: new dependencies go through the
// Coordenador) — the ranges below cover the same "Há 5m" / "Ontem" style the hardcoded
// Sidebar.tsx notifications used, just computed from a real `createdAt` instead of a fixed string.
export function formatRelativeTime(isoDate: string, now: Date = new Date()): string {
  const then = new Date(isoDate);
  const diffMs = now.getTime() - then.getTime();
  const diffSec = Math.max(0, Math.floor(diffMs / 1000));

  if (diffSec < 60) return 'Agora';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `Há ${diffMin}m`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `Há ${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return 'Ontem';
  if (diffDays < 7) return `Há ${diffDays}d`;

  return then.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
