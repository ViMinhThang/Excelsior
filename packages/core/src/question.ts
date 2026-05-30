export interface AskQuestionOption {
  id: string;
  label: string;
  description?: string;
}

export interface AskQuestionRequest {
  callId: string;
  question: string;
  options: AskQuestionOption[];
  allowManual: boolean;
}

export interface AskQuestionResponse {
  callId: string;
  answer: string;
  selectedOptionId?: string;
  selectedOptionLabel?: string;
  isManual: boolean;
  cancelled?: boolean;
}
