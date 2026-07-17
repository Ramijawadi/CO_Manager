export const calculateDuration = (entryTime: string, exitTime: string): number => {
  const start = new Date(entryTime).getTime();
  const end = new Date(exitTime).getTime();
  const diffInMs = end - start;
  // Convert ms to hours
  return diffInMs / (1000 * 60 * 60);
};

export const calculateTimeCost = (durationHours: number, hourlyRate: number = 1): number => {
  // Round up to the nearest hour or use exact fraction?
  // Usually coworking spaces might round to half-hour or calculate exact. Let's use exact for now
  return Number((durationHours * hourlyRate).toFixed(2));
};
