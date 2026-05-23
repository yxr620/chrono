import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/zh-cn';

dayjs.extend(relativeTime);

export const formatTimestamp = (value: Date | number | null): string => {
  if (!value) return '未同步';
  const timestamp = value instanceof Date ? value.getTime() : value;
  return new Date(timestamp).toLocaleString('zh-CN', {
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
};

export const formatRelativeTime = (value: Date | number | null): string => {
  if (!value) return '从未同步';
  const ts = value instanceof Date ? value.getTime() : value;
  const diffMs = Date.now() - ts;
  if (diffMs < 60_000) return '刚刚';
  if (diffMs > 30 * 24 * 60 * 60 * 1000) return formatTimestamp(ts);
  return dayjs(ts).locale('zh-cn').fromNow();
};
