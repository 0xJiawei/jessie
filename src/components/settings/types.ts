export interface SectionFeedbackHandlers {
  onSaved: () => void;
  onMessage: (message: string, isError?: boolean) => void;
}
