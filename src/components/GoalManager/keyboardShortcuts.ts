export interface GoalSubmitKeyboardEvent {
  key: string;
  isComposing?: boolean;
  nativeEvent?: {
    isComposing?: boolean;
    keyCode?: number;
  };
}

export function shouldSubmitGoalFromKeyboard(event: GoalSubmitKeyboardEvent): boolean {
  if (event.key !== 'Enter') return false;
  if (event.isComposing || event.nativeEvent?.isComposing) return false;
  return event.nativeEvent?.keyCode !== 229;
}
