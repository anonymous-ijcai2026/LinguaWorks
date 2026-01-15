// Database API service
const API_BASE_URL = "http://localhost:5001/api";

export interface Session {
  id: string;
  user_id?: number;
  name: string;
  current_step:
    | "structure"
    | "analysis"
    | "generation"
    | "optimization"
    | "testing";
  created_at?: string;
  updated_at?: string;
  message_count?: number;
  last_message_time?: string;
  has_error?: number; // 0 or 1 from database BOOLEAN field
  error_message?: string;
  error_step?: string;
  retry_data?: string; // JSON string
}

export interface Message {
  id?: number;
  session_id: string;
  type: "user" | "assistant";
  content: string;
  step?: "structure" | "analysis" | "generation" | "optimization" | "testing";
  timestamp?: string;
  metadata?: any;
  thinking?: string;
  isEditable?: boolean;
  originalContent?: string;
}

export interface AnalysisMethod {
  user_id: number;
  method_type: "default" | "custom";
  method_key: string;
  label: string;
  description: string;
  is_custom: boolean;
  is_selected: boolean;
}

export interface CustomMethod {
  method_key: string;
  label: string;
  description: string;
  is_custom: boolean;
}

export interface PromptTemplate {
  template_key: string;
  name: string;
  description?: string;
  category?: string;
  content: string;
  variables?: string | null;
  is_custom: boolean;
  is_selected: boolean;
}

export const hasSessionError = (session: Session): boolean => {
  return session.has_error === 1;
};

class DatabaseService {
  private getAuthHeaders(): Record<string, string> {
    const userData = localStorage.getItem("user");
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (userData) {
      try {
        const user = JSON.parse(userData);
        if (user && user.id) {
          headers["Authorization"] = `Bearer ${user.id}`;
        }
      } catch (error) {
        console.error("Failed to parse user data from localStorage:", error);
      }
    }

    return headers;
  }

  private async request(endpoint: string, options: RequestInit = {}) {
    const url = `${API_BASE_URL}${endpoint}`;
    const config: RequestInit = {
      headers: {
        ...this.getAuthHeaders(),
        ...options.headers,
      },
      ...options,
    };

    try {
      const response = await fetch(url, config);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error(`API request failed: ${endpoint}`, error);
      throw error;
    }
  }

  private getCurrentUserId(): number {
    const user = localStorage.getItem("user");
    if (user) {
      try {
        const userData = JSON.parse(user);
        if (userData && userData.id && userData.id > 0) {
          return userData.id;
        }
      } catch (error) {
        console.error("Failed to parse user data from localStorage:", error);
      }
    }
    throw new Error("User not authenticated. Please login first.");
  }

  async getSessions(userId?: number): Promise<Session[]> {
    const actualUserId = userId || this.getCurrentUserId();
    return this.request(`/sessions?user_id=${actualUserId}`);
  }

  async createSession(
    name: string,
    step: string = "structure",
    userId?: number,
  ): Promise<Session> {
    const actualUserId = userId || this.getCurrentUserId();
    return this.request("/sessions", {
      method: "POST",
      body: JSON.stringify({ user_id: actualUserId, name, current_step: step }),
    });
  }

  async updateSession(
    sessionId: string,
    updates: Partial<Session>,
  ): Promise<void> {
    return this.request(`/sessions/${sessionId}`, {
      method: "PUT",
      body: JSON.stringify(updates),
    });
  }

  async deleteSession(sessionId: string): Promise<void> {
    return this.request(`/sessions/${sessionId}`, {
      method: "DELETE",
    });
  }

  async getMessages(sessionId: string): Promise<Message[]> {
    return this.request(`/sessions/${sessionId}/messages`);
  }

  async addMessage(
    sessionId: string,
    message: Omit<Message, "id" | "session_id" | "timestamp">,
  ): Promise<Message> {
    const messageData = {
      ...message,
      session_id: sessionId,
      thinking: message.thinking || message.metadata?.thinking,
    };
    return this.request(`/sessions/${sessionId}/messages`, {
      method: "POST",
      body: JSON.stringify(messageData),
    });
  }

  async updateMessage(
    messageId: string,
    updates: Partial<Message>,
  ): Promise<void> {
    return this.request(`/messages/${messageId}`, {
      method: "PUT",
      body: JSON.stringify(updates),
    });
  }

  async getAnalysisMethods(userId?: number): Promise<AnalysisMethod[]> {
    const actualUserId = userId || this.getCurrentUserId();
    return this.request(`/analysis-methods?user_id=${actualUserId}`);
  }

  async createCustomMethod(
    label: string,
    description: string,
    userId?: number,
  ): Promise<CustomMethod> {
    const actualUserId = userId || this.getCurrentUserId();
    return this.request("/analysis-methods", {
      method: "POST",
      body: JSON.stringify({ user_id: actualUserId, label, description }),
    });
  }

  async updateCustomMethod(
    methodKey: string,
    label: string,
    description: string,
    userId?: number,
  ): Promise<void> {
    const actualUserId = userId || this.getCurrentUserId();
    return this.request(`/analysis-methods/${methodKey}`, {
      method: "PUT",
      body: JSON.stringify({ user_id: actualUserId, label, description }),
    });
  }

  async deleteCustomMethod(methodKey: string, userId?: number): Promise<void> {
    const actualUserId = userId || this.getCurrentUserId();
    return this.request(
      `/analysis-methods/${methodKey}?user_id=${actualUserId}`,
      {
        method: "DELETE",
      },
    );
  }

  async getSettings(userId?: number): Promise<Record<string, any>> {
    const actualUserId = userId || this.getCurrentUserId();
    return this.request(`/settings?user_id=${actualUserId}`);
  }

  async updateSettings(
    settings: Record<string, any>,
    userId?: number,
  ): Promise<void> {
    const actualUserId = userId || this.getCurrentUserId();
    return this.request("/settings", {
      method: "PUT",
      body: JSON.stringify({ user_id: actualUserId, settings }),
    });
  }

  async getSelectedMethods(userId?: number): Promise<string[]> {
    const actualUserId = userId || this.getCurrentUserId();
    return this.request(`/selected-methods?user_id=${actualUserId}`);
  }

  async saveSelectedMethods(methods: string[], userId?: number): Promise<void> {
    const actualUserId = userId || this.getCurrentUserId();
    return this.request("/selected-methods", {
      method: "POST",
      body: JSON.stringify({ user_id: actualUserId, methods }),
    });
  }

  async getPromptTemplates(
    category: string = "prompt_crafter",
    userId?: number,
  ): Promise<PromptTemplate[]> {
    const actualUserId = userId || this.getCurrentUserId();
    const query = new URLSearchParams({
      user_id: String(actualUserId),
      category,
    }).toString();
    return this.request(`/prompt-templates?${query}`);
  }

  async createCustomPromptTemplate(
    payload: {
      name: string;
      description?: string;
      category?: string;
      content: string;
      variables?: string[] | string | null;
    },
    userId?: number,
  ): Promise<PromptTemplate> {
    const actualUserId = userId || this.getCurrentUserId();
    return this.request("/prompt-templates", {
      method: "POST",
      body: JSON.stringify({ user_id: actualUserId, ...payload }),
    });
  }

  async updateCustomPromptTemplate(
    templateKey: string,
    payload: {
      name: string;
      description?: string;
      category?: string;
      content: string;
      variables?: string[] | string | null;
    },
    userId?: number,
  ): Promise<void> {
    const actualUserId = userId || this.getCurrentUserId();
    return this.request(`/prompt-templates/${templateKey}`, {
      method: "PUT",
      body: JSON.stringify({ user_id: actualUserId, ...payload }),
    });
  }

  async deleteCustomPromptTemplate(
    templateKey: string,
    userId?: number,
  ): Promise<void> {
    const actualUserId = userId || this.getCurrentUserId();
    return this.request(
      `/prompt-templates/${templateKey}?user_id=${actualUserId}`,
      {
        method: "DELETE",
      },
    );
  }

  async getSelectedPromptTemplates(
    category: string = "prompt_crafter",
    userId?: number,
  ): Promise<string[]> {
    const actualUserId = userId || this.getCurrentUserId();
    const query = new URLSearchParams({
      user_id: String(actualUserId),
      category,
    }).toString();
    return this.request(`/selected-prompt-templates?${query}`);
  }

  async saveSelectedPromptTemplates(
    templates: string[],
    userId?: number,
  ): Promise<void> {
    const actualUserId = userId || this.getCurrentUserId();
    return this.request("/selected-prompt-templates", {
      method: "POST",
      body: JSON.stringify({ user_id: actualUserId, templates }),
    });
  }

  async healthCheck(): Promise<{ status: string; database: string }> {
    return this.request("/health");
  }

  async migrateFromLocalStorage(): Promise<void> {
    try {
      const storedSessions = localStorage.getItem("promptSessions");
      if (storedSessions) {
        const sessions = JSON.parse(storedSessions);
        for (const session of sessions) {
          try {
            await this.createSession(session.name, session.step || "structure");
            if (session.messages && session.messages.length > 0) {
              for (const message of session.messages) {
                const savedMessage = await this.addMessage(session.id, {
                  type: message.type,
                  content: message.content,
                  step: message.step,
                  metadata: message.metadata || {},
                });
                message.id = savedMessage.id;
              }
            }
          } catch (error) {
            console.error(`Failed session migration: ${session.id}`, error);
          }
        }
      }

      const customMethods = localStorage.getItem("customAnalysisMethods");
      if (customMethods) {
        const methods = JSON.parse(customMethods);
        for (const method of methods) {
          try {
            await this.createCustomMethod(method.label, method.description);
          } catch (error) {
            console.error(
              `Migration of custom method failed: ${method.label} (${method.key})`,
              error,
            );
          }
        }
      }

      const selectedMethods = localStorage.getItem("selectedAnalysisMethods");
      if (selectedMethods) {
        const methods = JSON.parse(selectedMethods);
        await this.saveSelectedMethods(methods);
      }

      const autoSelectMode = localStorage.getItem("autoSelectMode");
      if (autoSelectMode) {
        await this.updateSettings({
          autoSelectMode: JSON.parse(autoSelectMode),
        });
      }
    } catch (error) {
      console.error("Data migration failed:", error);
      throw error;
    }
  }

  clearLocalStorage(): void {
    const keysToRemove = [
      "promptSessions",
      "customAnalysisMethods",
      "selectedAnalysisMethods",
      "autoSelectMode",
    ];

    keysToRemove.forEach((key) => {
      localStorage.removeItem(key);
    });
  }
}

export const databaseService = new DatabaseService();
export default databaseService;
