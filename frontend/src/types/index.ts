// Session step type
export type Step =
  | "structure"
  | "analysis"
  | "generation"
  | "optimization"
  | "testing";

// Conversation information
export interface Session {
  id: string;
  current_step: Step;
  created_at: string;
  updated_at: string;
}

// Message type
export interface Message {
  id: string;
  role: "user" | "system";
  content: string;
  timestamp: string;
  thinking?: string;
  metadata?: any;
}

// API response type
export interface ApiResponse<T = any> {
  status: string;
  message?: string;
  result: T;
}

// Chat interface component properties
export interface ChatInterfaceProps {
  messages: Message[];
  onSendMessage: (content: string) => void;
  onSendFeedback: (feedback: string, content?: string) => void;
  loading: boolean;
  currentStep: Step;
}

// Session list component properties
export interface SessionListProps {
  sessions: Session[];
  activeSessionId: string;
  onSessionSelect: (sessionId: string) => void;
  onNewSession: () => void;
}

// Markdown displays component properties
export interface MarkdownDisplayProps {
  content: string;
  title?: string;
}
