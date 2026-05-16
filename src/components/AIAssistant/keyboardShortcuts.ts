export interface AssistantKeyboardShortcutEvent {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  isComposing?: boolean;
  nativeEvent?: {
    isComposing?: boolean;
  };
}

export function shouldSendAssistantMessageFromKeyboard(event: AssistantKeyboardShortcutEvent): boolean {
  if (event.key !== 'Enter') return false;
  if (event.isComposing || event.nativeEvent?.isComposing) return false;
  return Boolean(event.metaKey || event.ctrlKey);
}
