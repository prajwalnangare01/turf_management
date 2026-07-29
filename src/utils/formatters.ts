export const formatTime12h = (time24: string): string => {
  if (!time24) return '';
  const parts = time24.split(':');
  let h = parseInt(parts[0], 10);
  const m = parts[1] || '00';
  if (isNaN(h)) return time24;

  const period = h >= 12 ? 'PM' : 'AM';

  let emoji = '☀️';
  if (h >= 5 && h < 9) {
    emoji = '🌅'; // Sunrise / Early Morning
  } else if (h >= 9 && h < 16) {
    emoji = '☀️'; // Day / Sun
  } else if (h >= 16 && h < 19) {
    emoji = '🌆'; // Sunset / Evening
  } else {
    emoji = '🌙'; // Night / Moon
  }

  const h12 = h % 12 === 0 ? 12 : h % 12;
  const formattedH = h12 < 10 ? `0${h12}` : `${h12}`;

  return `${emoji} ${formattedH}:${m} ${period}`;
};

export const formatTimeRange12h = (startTime24: string, endTime24: string): string => {
  if (!startTime24 || !endTime24) return '';
  return `${formatTime12h(startTime24)} – ${formatTime12h(endTime24)}`;
};
