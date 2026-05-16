export const ASSISTANT_MESSAGES_BOTTOM_THRESHOLD_PX = 48;

type AssistantScrollMetrics = Pick<HTMLElement, 'clientHeight' | 'scrollHeight' | 'scrollTop'>;
type AssistantScrollable = Pick<HTMLElement, 'scrollHeight' | 'scrollTo'> & {
  scrollTop: number;
};

export function isAssistantMessagesNearBottom(
  element: AssistantScrollMetrics,
  thresholdPx = ASSISTANT_MESSAGES_BOTTOM_THRESHOLD_PX,
): boolean {
  const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
  return distanceFromBottom <= thresholdPx;
}

export function scrollAssistantMessagesToBottom(
  element: AssistantScrollable,
  behavior: ScrollBehavior = 'auto',
): void {
  const top = element.scrollHeight;

  if (typeof element.scrollTo === 'function') {
    element.scrollTo({ top, behavior });
    return;
  }

  element.scrollTop = top;
}
