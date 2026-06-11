/**
 * Check if a cafe-hours room is currently open.
 * All times are converted to the room creator's timezone before comparison.
 * Supports overnight ranges (e.g. 22:00–06:00).
 */
export function isCafeOpen(room) {
  if (!room.cafeHoursEnabled || !room.cafeHoursStart || !room.cafeHoursEnd) {
    return true; // no cafe hours configured — always open
  }

  const tz = room.cafeHoursTimezone || 'UTC';

  // Get current time in the room's timezone
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    weekday: 'short',
  });

  const parts = formatter.formatToParts(now);
  let hours = parts.find(p => p.type === 'hour')?.value || '00';
  // en-US with hour12:false returns "24" at midnight instead of "00"
  if (hours === '24') hours = '00';
  const minutes = parts.find(p => p.type === 'minute')?.value || '00';
  const currentTime = `${hours}:${minutes}`;

  // Day check
  const dayMap = { Sun: '0', Mon: '1', Tue: '2', Wed: '3', Thu: '4', Fri: '5', Sat: '6' };
  const weekday = parts.find(p => p.type === 'weekday')?.value;
  const currentDay = dayMap[weekday] || '0';
  const allowedDays = (room.cafeHoursDays || '0,1,2,3,4,5,6').split(',');

  if (!allowedDays.includes(currentDay)) {
    return false;
  }

  const start = room.cafeHoursStart;
  const end = room.cafeHoursEnd;

  // Overnight range (e.g. 22:00–06:00)
  if (start > end) {
    return currentTime >= start || currentTime < end;
  }

  // Normal range (e.g. 09:00–17:00)
  return currentTime >= start && currentTime < end;
}
