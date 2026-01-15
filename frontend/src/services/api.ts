import axios, { AxiosInstance, AxiosResponse, AxiosError } from "axios";

interface ApiResponse<T = any> {
  status: string;
  message?: string;
  result: T;
}

const api: AxiosInstance = axios.create({
  baseURL: "http://localhost:8000",
  timeout: 30000,
  headers: {
    "Content-Type": "application/json",
  },
});

api.interceptors.request.use(
  (config) => {
    const userData = localStorage.getItem("user");
    if (userData) {
      try {
        const user = JSON.parse(userData);
        if (user && user.id) {
          config.headers["Authorization"] = `Bearer ${user.id}`;
        }
      } catch (error) {
        console.error("Failed to parse user data from localStorage:", error);
      }
    }
    return config;
  },
  (error: AxiosError) => {
    return Promise.reject(error);
  },
);

api.interceptors.response.use(
  (response: AxiosResponse) => {
    return response.data;
  },
  (error: AxiosError) => {
    if (error.response) {
      console.error("API error response:", error.response.data);
      return Promise.reject(
        new Error((error.response.data as any).detail || "Request failed"),
      );
    } else if (error.request) {
      console.error("API request without response:", error.request);
      return Promise.reject(
        new Error("Server not responding, please check network connection"),
      );
    } else {
      console.error("API request configuration error:", error.message);
      return Promise.reject(new Error("Request configuration error"));
    }
  },
);

const apiService = {
  checkStructure: (
    sessionId: string,
    content: string,
  ): Promise<ApiResponse> => {
    return api.post("/check-structure", { session_id: sessionId, content });
  },

  sendStructureFeedback: (
    sessionId: string,
    feedback: string,
    content: string | null = null,
  ): Promise<ApiResponse> => {
    return api.post("/structure-feedback", {
      session_id: sessionId,
      feedback,
      content,
    });
  },
  analyzeElements: (
    sessionId: string,
    content: string,
  ): Promise<ApiResponse> => {
    return api.post("/analyze-elements", { session_id: sessionId, content });
  },

  sendAnalysisFeedback: (
    sessionId: string,
    feedback: string,
    content: string | null = null,
  ): Promise<ApiResponse> => {
    return api.post("/analysis-feedback", {
      session_id: sessionId,
      feedback,
      content,
    });
  },


  generatePrompt: (
    sessionId: string,
    content: string,
  ): Promise<ApiResponse> => {
    return api.post("/generate-prompt", { session_id: sessionId, content });
  },


  sendGenerationFeedback: (
    sessionId: string,
    feedback: string,
    content: string | null = null,
  ): Promise<ApiResponse> => {
    return api.post("/generation-feedback", {
      session_id: sessionId,
      feedback,
      content,
    });
  },


  optimizePrompt: (
    sessionId: string,
    content: string,
  ): Promise<ApiResponse> => {
    return api.post("/optimize-prompt", { session_id: sessionId, content });
  },

  sendOptimizationFeedback: (
    sessionId: string,
    feedback: string,
    content: string | null = null,
  ): Promise<ApiResponse> => {
    return api.post("/optimization-feedback", {
      session_id: sessionId,
      feedback,
      content,
    });
  },

  getAgentMapping: (): Promise<ApiResponse> => {
    return api.get("/agent-mapping");
  },

  getAgentInfo: (agentKey: string): Promise<ApiResponse> => {
    return api.get(`/agent-info/${agentKey}`);
  },

  reloadAIConfig: (): Promise<ApiResponse> => {
    return api.post("/reload-ai-config");
  },

  validateModelConfig: (): Promise<ApiResponse> => {
    return api.get("/validate-model-config");
  },

  validateAnalysisConfig: (): Promise<ApiResponse> => {
    return api.get("/validate-analysis-config");
  },
};

export default apiService;

export const validateModelConfig = apiService.validateModelConfig;
export const validateAnalysisConfig = apiService.validateAnalysisConfig;
