export const ASSISTANT_TEXTAREA_MAX_HEIGHT = 120;

export interface AssistantTextareaLayout {
  height: string;
  overflowY: 'auto' | 'hidden';
}

export function getAssistantTextareaLayout(
  scrollHeight: number,
  maxHeight = ASSISTANT_TEXTAREA_MAX_HEIGHT,
): AssistantTextareaLayout {
  const clampedHeight = Math.min(scrollHeight, maxHeight);

  return {
    height: `${clampedHeight}px`,
    overflowY: scrollHeight > maxHeight ? 'auto' : 'hidden',
  };
}
