export const formatDurationHours = (hours: number | string | null | undefined) => {
  const numericHours = Number(hours ?? 0);
  if (!Number.isFinite(numericHours) || numericHours <= 0) return "0 min";

  const totalMinutes = Math.max(0, Math.round(numericHours * 60));
  if (totalMinutes === 0) return "0 min";
  if (totalMinutes < 60) return `${totalMinutes} ${totalMinutes === 1 ? "min" : "mins"}`;

  const fullHours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${fullHours}h ${minutes}m`;
};
