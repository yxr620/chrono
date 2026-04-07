import { IOSWheelDateTimePicker } from '../plugins/iosWheelDateTimePicker';
import { useAppToast } from './useAppToast';
import dayjs from 'dayjs';

export const useIOSTimePicker = () => {
  const [present] = useAppToast();

  const openIOSTimePicker = async (
    initialValue: Date,
    onConfirm: (date: Date) => void
  ) => {
    try {
      const result = await IOSWheelDateTimePicker.present({
        value: initialValue.toISOString(),
        daysBefore: 15,
        daysAfter: 15
      });
      if (result.cancelled || !result.value) return;
      const parsed = dayjs(result.value);
      if (parsed.isValid()) onConfirm(parsed.toDate());
    } catch (error) {
      console.error('Failed to open iOS native wheel picker:', error);
      present({ message: '打开原生时间选择器失败', duration: 1500, position: 'top', color: 'warning' });
    }
  };

  return { openIOSTimePicker };
};
