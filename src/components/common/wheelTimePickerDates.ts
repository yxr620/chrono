import dayjs, { type Dayjs } from 'dayjs';

export interface WheelDateItem {
  value: string;
  label: string;
}

export const generateDateItems = (today: Dayjs = dayjs()): WheelDateItem[] => {
  const todayStr = today.format('YYYY-MM-DD');

  return Array.from({ length: 31 }, (_, i) => {
    const d = today.add(i - 15, 'day');
    const labelDate = d.locale('en');
    const dateStr = d.format('YYYY-MM-DD');
    const label = dateStr === todayStr
      ? `Today ${labelDate.format('MM/DD')}`
      : `${labelDate.format('ddd')} ${labelDate.format('MM/DD')}`;
    return { value: dateStr, label };
  });
};
