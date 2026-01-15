import React, { useState, useEffect } from "react";
import { Layout, Typography, Button, message, Spin, Modal } from "antd";
// import { v4 as uuidv4 } from 'uuid';

import ChatInterface from "../components/ChatInterface";
import SessionList from "../components/SessionList";
import Settings from "../components/Settings";
import { Settings as SettingsIcon, LogOut } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import databaseService, {
  Session,
  hasSessionError,
} from "../services/databaseService";
import { validateModelConfig, validateAnalysisConfig } from "../services/api";
import "../App.css";

const { Header, Sider, Content } = Layout;
const { Title } = Typography;

interface LocalMessage {
  id?: string;
  type: "user" | "system";
  content: string;
  needsSupplement?: boolean;
  isTestResult?: boolean;
  isAnalysis?: boolean;
  thinking?: string;
  metadata?: any;
  isError?: boolean;
  canRetry?: boolean;
  retryData?: any;
}

interface ApiResponse {
  status: string;
  message?: string;
  result?: any;
}

const HomePage: React.FC = () => {
  const { logout } = useAuth();
  const [sessionId, setSessionId] = useState<string>("");
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentStep, setCurrentStep] = useState<string>("structure");
  const [loading, setLoading] = useState<boolean>(false);
  const [initialLoading, setInitialLoading] = useState<boolean>(true);
  const [sessionSwitchLoading, setSessionSwitchLoading] =
    useState<boolean>(false);
  const [messageHistory, setMessageHistory] = useState<LocalMessage[]>([]);
  const [collapsed, setCollapsed] = useState<boolean>(false);
  const [isNewChatMode, setIsNewChatMode] = useState<boolean>(false);
  const [selectedAnalysisMethods, setSelectedAnalysisMethods] = useState<
    string[]
  >([]);
  const [autoSelectMode, setAutoSelectMode] = useState<boolean>(false);
  const [customMethods, setCustomMethods] = useState<any[]>([]);
  const [settingsVisible, setSettingsVisible] = useState<boolean>(false);
  const [hasError, setHasError] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [lastFailedRequest, setLastFailedRequest] = useState<any>(null);

  // Open the Settings Modal
  const handleOpenSettings = () => {
    setSettingsVisible(true);
  };

  // Close the settings Modal
  const handleCloseSettings = () => {
    setSettingsVisible(false);
  };

  // Handle logout
  const handleLogout = () => {
    Modal.confirm({
      title: "Confirm Logout",
      content: "Are you sure you want to logout?",
      okText: "Logout",
      cancelText: "Cancel",
      onOk: () => {
        logout();
      },
    });
  };

  // Verify model configuration
  const checkModelConfig = async () => {
    try {
      const result = await validateModelConfig();
      return result;
    } catch (error) {
      console.error("Failed to validate model config:", error);
      return {
        status: "error",
        message: "Configuration verification failed",
        result: {},
      };
    }
  };

  // Verification analysis configuration
  const checkAnalysisConfig = async () => {
    try {
      const result = await validateAnalysisConfig();
      return result;
    } catch (error) {
      console.error("Failed to validate analysis config:", error);
      return {
        status: "error",
        message: "The analysis configuration verification failed",
        result: {},
      };
    }
  };

  // Display a configuration error pop-up window
  const showConfigError = (message: string, missingFields?: string[]) => {
    const fieldNames: { [key: string]: string } = {
      base_url: "API address",
      api_key: "API key",
      model_name: "Model name",
    };

    const missingFieldsText = missingFields
      ? missingFields.map((field) => fieldNames[field] || field).join("、")
      : "";

    const fullMessage = missingFieldsText
      ? `${message}\n\nMissing configuration items: ${missingFieldsText}`
      : message;

    Modal.error({
      title: "Model Configuration Error",
      content: (
        <div>
          <p>{fullMessage}</p>
          <p>
            Please configure complete model information in settings before
            trying again.
          </p>
        </div>
      ),
      onOk: () => {
        setSettingsVisible(true);
      },
      okText: "Open Settings",
    });
  };

  // Display a pop-up window indicating incorrect analysis configuration
  const showAnalysisConfigError = (message: string) => {
    Modal.error({
      title: "Analysis Configuration Error",
      content: (
        <div>
          <p>{message}</p>
          <p>
            Please select at least one analysis method in settings before using
            the Insight Decoder feature.
          </p>
        </div>
      ),
      onOk: () => {
        setSettingsVisible(true);
      },
      okText: "Open Settings",
    });
  };

  // Retry function
  const handleRetry = async () => {
    if (lastFailedRequest) {
      setHasError(false);
      setErrorMessage("");

      try {
        await databaseService.updateSession(sessionId, {
          has_error: 0,
          error_message: undefined,
          error_step: undefined,
          retry_data: undefined,
        });
      } catch (dbError) {
        console.error("Failed to clear error state in database:", dbError);
      }

      const retryData = JSON.parse(JSON.stringify(lastFailedRequest));
      if (retryData.isFeedback) {
        if (
          retryData.step === "analysis" &&
          retryData.autoSelectMode !== undefined
        ) {
          const originalAutoSelectMode = autoSelectMode;
          const originalSelectedMethods = selectedAnalysisMethods;
          const originalCustomMethods = customMethods;

          setAutoSelectMode(retryData.autoSelectMode);
          setSelectedAnalysisMethods(retryData.selectedAnalysisMethods || []);
          setCustomMethods(retryData.customMethods || []);

          try {
            await handleFeedback("no", retryData.content, true);
          } finally {
            setAutoSelectMode(originalAutoSelectMode);
            setSelectedAnalysisMethods(originalSelectedMethods);
            setCustomMethods(originalCustomMethods);
          }
        } else {
          await handleFeedback("no", retryData.content, true);
        }
      } else {
        if (
          retryData.step === "analysis" &&
          retryData.autoSelectMode !== undefined
        ) {
          const originalAutoSelectMode = autoSelectMode;
          const originalSelectedMethods = selectedAnalysisMethods;
          const originalCustomMethods = customMethods;

          setAutoSelectMode(retryData.autoSelectMode);
          setSelectedAnalysisMethods(retryData.selectedAnalysisMethods || []);
          setCustomMethods(retryData.customMethods || []);

          try {
            await handleSendMessage(
              lastFailedRequest.content,
              lastFailedRequest.step,
              true,
              retryData.templateKey ? { templateKey: retryData.templateKey } : undefined,
            );
          } finally {
            setAutoSelectMode(originalAutoSelectMode);
            setSelectedAnalysisMethods(originalSelectedMethods);
            setCustomMethods(originalCustomMethods);
          }
        } else {
          await handleSendMessage(
            lastFailedRequest.content,
            lastFailedRequest.step,
            true,
            retryData.templateKey ? { templateKey: retryData.templateKey } : undefined,
          );
        }
      }
    }
  };

  const reloadAnalysisSettings = async () => {
    try {
      const selectedMethods = await databaseService.getSelectedMethods();
      setSelectedAnalysisMethods(selectedMethods);

      const settings = await databaseService.getSettings();
      setAutoSelectMode(settings.autoSelectMode || false);

      const analysisMethods = await databaseService.getAnalysisMethods();
      const customMethodsData = analysisMethods.filter(
        (method) => method.is_custom,
      );
      setCustomMethods(customMethodsData);
    } catch (error) {
      console.error("Failed to reload analysis settings:", error);
    }
  };

  const updateSessionName = async (id: string, newName: string) => {
    try {
      await databaseService.updateSession(id, { name: newName });
      const updatedSessions = sessions.map((session) => {
        if (session.id === id) {
          return {
            ...session,
            name: newName,
          };
        }
        return session;
      });
      setSessions(updatedSessions);
      message.success("Conversation name updated");
    } catch (error) {
      console.error("Failed to update session name:", error);
      message.error("Failed to update conversation name");
    }
  };

  useEffect(() => {
    const initializeData = async () => {
      try {
        setInitialLoading(true);

        const sessionsData = await databaseService.getSessions();
        setSessions(sessionsData);

        const selectedMethods = await databaseService.getSelectedMethods();
        setSelectedAnalysisMethods(selectedMethods);

        const settings = await databaseService.getSettings();
        setAutoSelectMode(settings.autoSelectMode || false);

        const analysisMethods = await databaseService.getAnalysisMethods();
        const customMethodsData = analysisMethods.filter(
          (method) => method.is_custom,
        );
        setCustomMethods(customMethodsData);

        if (sessionsData.length > 0) {
          setSessionId(sessionsData[0].id);

          const messages = await databaseService.getMessages(
            sessionsData[0].id,
          );
          const localMessages: LocalMessage[] = messages.map((msg) => ({
            id: msg.id?.toString(),
            type:
              msg.type === "assistant"
                ? "system"
                : (msg.type as "user" | "system"),
            content: msg.content,
            needsSupplement: msg.metadata?.needsSupplement,
            isTestResult: msg.metadata?.isTestResult,
            isAnalysis: msg.metadata?.isAnalysis,
            thinking: msg.thinking || msg.metadata?.thinking,
            metadata: msg.metadata,
          }));
          setMessageHistory(localMessages);
          setCurrentStep(sessionsData[0].current_step);

          const firstSession = sessionsData[0];
          if (hasSessionError(firstSession)) {
            setHasError(true);
            setErrorMessage(firstSession.error_message || "Unknown error");
            if (firstSession.retry_data) {
              try {
                const retryData = JSON.parse(firstSession.retry_data);
                setLastFailedRequest(retryData);
              } catch (parseError) {
                console.error(
                  "Failed to parse retry data for first session:",
                  parseError,
                );
              }
            }
          } else {
            setHasError(false);
            setErrorMessage("");
            setLastFailedRequest(null);
          }
        } else {
          createNewSession();
        }
      } catch (error) {
        console.error("Failed to initialize data:", error);
        message.error("Failed to load data from database");

        createNewSession();
      } finally {
        setInitialLoading(false);
      }
    };

    initializeData();
  }, []);

  const createNewSession = () => {
    setIsNewChatMode(true);
    setSessionId("");
    setCurrentStep("structure");
    setMessageHistory([]);
    message.success("Ready to start a new conversation");
  };

  const createActualSession = async (initialMessages: LocalMessage[] = []) => {
    try {
      const newSession = await databaseService.createSession(
        `Conversation ${new Date().toLocaleString()}`,
        "structure",
      );

      for (const msg of initialMessages) {
        const savedMessage = await databaseService.addMessage(newSession.id, {
          type: msg.type === "system" ? "assistant" : msg.type,
          content: msg.content,
          step: "structure",
          metadata: {
            needsSupplement: msg.needsSupplement,
            isTestResult: msg.isTestResult,
            isAnalysis: msg.isAnalysis,
            thinking: msg.thinking,
          },
        });

        msg.id = savedMessage.id?.toString();
      }

      const updatedSessions = [newSession, ...sessions];
      setSessions(updatedSessions);
      setSessionId(newSession.id);
      setIsNewChatMode(false);

      return newSession.id;
    } catch (error) {
      console.error("Failed to create session:", error);
      message.error("Failed to create new conversation");
      return "";
    }
  };

  const switchSession = async (id: string) => {
    try {
      setSessionSwitchLoading(true);
      const session = sessions.find((s) => s.id === id);
      if (session) {
        setSessionId(id);
        setCurrentStep(session.current_step || "structure");
        setIsNewChatMode(false);

        const messages = await databaseService.getMessages(id);
        const localMessages: LocalMessage[] = messages.map((msg) => ({
          id: msg.id?.toString(),
          type:
            msg.type === "assistant"
              ? "system"
              : (msg.type as "user" | "system"),
          content: msg.content,
          needsSupplement: msg.metadata?.needsSupplement,
          isTestResult: msg.metadata?.isTestResult,
          isAnalysis: msg.metadata?.isAnalysis,
          thinking: msg.thinking || msg.metadata?.thinking,
          metadata: msg.metadata,
        }));
        setMessageHistory(localMessages);

        if (hasSessionError(session)) {
          setHasError(true);
          setErrorMessage(session.error_message || "Unknown error");
          if (session.retry_data) {
            try {
              const retryData = JSON.parse(session.retry_data);
              setLastFailedRequest(retryData);
            } catch (parseError) {
              console.error("Failed to parse retry data:", parseError);
            }
          }
        } else {
          setHasError(false);
          setErrorMessage("");
          setLastFailedRequest(null);
        }
      }
    } catch (error) {
      console.error("Failed to switch session:", error);
      message.error("Failed to load conversation");
    } finally {
      setSessionSwitchLoading(false);
    }
  };

  const deleteSession = async (id: string) => {
    try {
      await databaseService.deleteSession(id);
      const updatedSessions = sessions.filter((session) => session.id !== id);
      setSessions(updatedSessions);

      if (id === sessionId) {
        if (updatedSessions.length > 0) {
          await switchSession(updatedSessions[0].id);
        } else {
          createNewSession();
        }
      }

      message.success("Conversation deleted");
    } catch (error) {
      console.error("Failed to delete session:", error);
      message.error("Failed to delete conversation");
    }
  };

  const updateSessionState = async (
    step: string,
    targetSessionId?: string,
    currentSessions?: Session[],
  ) => {
    const currentSessionId = targetSessionId || sessionId;

    if (!currentSessionId) {
      return;
    }

    try {
      await databaseService.updateSession(currentSessionId, {
        current_step: step as any,
      });

      const sessionsToUpdate = currentSessions || sessions;
      const updatedSessions = sessionsToUpdate.map((session) => {
        if (session.id === currentSessionId) {
          return {
            ...session,
            current_step: step as any,
          };
        }
        return session;
      });

      setSessions(updatedSessions);
    } catch (error) {
      console.error("Failed to update session state:", error);
    }
  };

  const handleSendMessage = async (
    content: string,
    step: string = currentStep,
    isRetry: boolean = false,
    options?: { templateKey?: string },
  ) => {
    const isTemplateRegeneration =
      step === "generation" && Boolean(options?.templateKey) && !content.trim();
    if (!content.trim() && !isTemplateRegeneration) return;

    setHasError(false);
    setErrorMessage("");
    setLoading(true);

    const configValidation = await checkModelConfig();
    if (configValidation.status === "error") {
      setLoading(false);
      const errorDetail = configValidation.result || {};
      showConfigError(
        errorDetail.message ||
          configValidation.message ||
          "The model configuration is incomplete",
        errorDetail.missing_fields,
      );
      return;
    }

    let updatedMessages: LocalMessage[];
    if (isRetry) {

      updatedMessages = [...messageHistory];
    } else if (isTemplateRegeneration) {
      updatedMessages = [...messageHistory];
    } else {

      updatedMessages = [
        ...messageHistory,
        {
          type: "user",
          content: content,
        } as LocalMessage,
      ];
      setMessageHistory(updatedMessages);
    }

    let currentSessionId = sessionId;
    let currentSessions = sessions;
    if (isNewChatMode) {
      currentSessionId = await createActualSession(updatedMessages);
      if (!currentSessionId) {
        setLoading(false);
        return;
      }

      const updatedSessionsList = await databaseService.getSessions();
      setSessions(updatedSessionsList);
      currentSessions = updatedSessionsList;
    } else if (!isRetry && !isTemplateRegeneration) {
      try {
        const savedUserMessage = await databaseService.addMessage(
          currentSessionId,
          {
            type: "user",
            content: content,
            step: currentStep as
              | "structure"
              | "analysis"
              | "generation"
              | "optimization"
              | "testing",
            metadata: {},
          },
        );
        updatedMessages[updatedMessages.length - 1].id =
          savedUserMessage.id?.toString();
      } catch (error) {
        console.error("Failed to save user message:", error);
      }
    }

    setLoading(true);

    let contextContent = content;
    if (step !== "structure" && !isTemplateRegeneration) {
      const lastSystemMessage = messageHistory
        .slice()
        .reverse()
        .find((msg) => msg.type === "system" && !msg.needsSupplement);

      if (lastSystemMessage) {
        contextContent = `Previous step result: ${lastSystemMessage.content}\n\nUser feedback: ${content}`;
      }
    }

    try {
      if (step === "analysis") {
        const analysisConfigValidation = await checkAnalysisConfig();
        if (analysisConfigValidation.status === "error") {
          setLoading(false);
          const errorDetail = analysisConfigValidation.result || {};
          showAnalysisConfigError(
            errorDetail.message ||
              analysisConfigValidation.message ||
              "The analysis configuration is incomplete",
          );
          return;
        }
      }

      let endpoint = "";
      let responseMessage: LocalMessage = {} as LocalMessage;

      switch (step) {
        case "structure":
          endpoint = "http://localhost:8000/check-structure";
          break;
        case "analysis":
          endpoint = "http://localhost:8000/analyze-elements";
          break;
        case "generation":
          endpoint = "http://localhost:8000/generate-prompt";
          break;
        case "optimization":
          endpoint = "http://localhost:8000/optimize-prompt";
          break;
        case "testing":
          endpoint = "http://localhost:8000/test-results";
          break;
        default:
          endpoint = "http://localhost:8000/check-structure";
      }

      const requestBody: any = {
        session_id: currentSessionId,
        content: contextContent,
      };

      if (step === "analysis") {
        requestBody.auto_select = autoSelectMode;

        if (autoSelectMode) {
          requestBody.selected_methods = ["auto_select"];
        } else {
          requestBody.selected_methods = selectedAnalysisMethods;
        }


        if (customMethods.length > 0) {
          const customMethodsDict: {
            [key: string]: { label: string; description: string };
          } = {};
          customMethods.forEach((method: any) => {
            customMethodsDict[method.method_key] = {
              label: method.label,
              description: method.description,
            };
          });
          requestBody.custom_methods = customMethodsDict;
        }
      }
      if (step === "generation" && options?.templateKey) {
        requestBody.template_key = options.templateKey;
      }

      const authHeaders: { [key: string]: string } = {
        "Content-Type": "application/json",
      };

      const userData = localStorage.getItem("user");
      if (userData) {
        const user = JSON.parse(userData);
        authHeaders["Authorization"] = `Bearer ${user.id}`;
      }

      const response = await fetch(endpoint, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }

      const data: ApiResponse = await response.json();

      if (data.status === "success") {
        if (step === "structure") {
          responseMessage = {
            type: "system",
            content: data.result.answer,
            needsSupplement: data.result.needs_supplement,
            thinking: data.result.thinking,
          } as LocalMessage;
        } else if (step === "analysis") {
          let formattedContent;
          let analysisData = null;

          if (typeof data.result === "string") {
            formattedContent = data.result;
          } else if (Array.isArray(data.result)) {
            if (
              data.result.length > 0 &&
              typeof data.result[0] === "object" &&
              data.result[0].agent_name
            ) {
              analysisData = data.result;
              formattedContent = data.result
                .map((item) => `**${item.agent_name}**\n\n${item.content}`)
                .join("\n\n");
            } else {
              formattedContent = data.result
                .filter((item) => item && item.trim() !== "")
                .join("\n\n");
            }
          } else {
            formattedContent = JSON.stringify(data.result, null, 2);
          }

          responseMessage = {
            type: "system",
            content: formattedContent,
            isAnalysis: true,
            metadata: analysisData ? { analysisData } : undefined,
          } as LocalMessage;
        } else if (step === "testing") {
          responseMessage = {
            type: "system",
            content: data.result,
            isTestResult: true,
          } as LocalMessage;
        } else if (step === "generation") {
          if (
            typeof data.result === "object" &&
            data.result &&
            typeof data.result.prompt === "string"
          ) {
            responseMessage = {
              type: "system",
              content: data.result.prompt,
              thinking: data.result.thinking,
              metadata: {
                ...(data.result.selected_template
                  ? { selected_template: data.result.selected_template }
                  : {}),
                ...(data.result.template_candidates
                  ? { template_candidates: data.result.template_candidates }
                  : {}),
              },
            } as LocalMessage;
          } else {
            responseMessage = {
              type: "system",
              content:
                typeof data.result === "string"
                  ? data.result
                  : JSON.stringify(data.result, null, 2),
            } as LocalMessage;
          }
        } else if (step === "optimization") {
          if (typeof data.result === "object" && data.result.optimized_prompt) {
            responseMessage = {
              type: "system",
              content: data.result.optimized_prompt,
              thinking: data.result.thinking,
              metadata: {
                original_prompt: data.result.original_prompt,
                optimized_prompt: data.result.optimized_prompt,
              },
            } as LocalMessage;
          } else {
            responseMessage = {
              type: "system",
              content:
                typeof data.result === "string"
                  ? data.result
                  : JSON.stringify(data.result, null, 2),
            } as LocalMessage;
          }
        } else {
          responseMessage = {
            type: "system",
            content:
              typeof data.result === "string"
                ? data.result
                : JSON.stringify(data.result, null, 2),
          } as LocalMessage;
        }

        try {
          const savedResponseMessage = await databaseService.addMessage(
            currentSessionId,
            {
              type: "assistant",
              content: responseMessage.content,
              step: step as any,
              metadata: {
                needsSupplement: responseMessage.needsSupplement,
                isTestResult: responseMessage.isTestResult,
                isAnalysis: responseMessage.isAnalysis,
                thinking: responseMessage.thinking,
                ...(responseMessage.metadata || {}),
              },
            },
          );
          responseMessage.id = savedResponseMessage.id?.toString();
        } catch (error) {
          console.error("Failed to save system message:", error);
        }

        const finalMessages: LocalMessage[] = [
          ...updatedMessages,
          responseMessage,
        ];
        setMessageHistory(finalMessages);

        if (hasError) {
          setHasError(false);
          setErrorMessage("");
          setLastFailedRequest(null);

          try {
            await databaseService.updateSession(currentSessionId, {
              has_error: 0,
              error_message: undefined,
              error_step: undefined,
              retry_data: undefined,
            });
          } catch (dbError) {
            console.error("Failed to clear error state in database:", dbError);
          }
        }

        await updateSessionState(step, currentSessionId, currentSessions);
      } else {
        throw new Error(data.message || "Request failed");
      }
    } catch (error) {
      console.error("API request failed:", error);

      setLastFailedRequest({ content, step });
      setHasError(true);

      let errorMsg = "Unknown error";

      if (error instanceof Error) {
        try {
          const errorResponse = JSON.parse(
            error.message.replace("API request failed: 400", ""),
          );
          if (
            errorResponse.detail &&
            errorResponse.detail.type === "config_error"
          ) {
            showConfigError(
              errorResponse.detail.message,
              errorResponse.detail.missing_fields,
            );
            setLoading(false);
            return;
          }
        } catch (parseError) {
          //
        }
        errorMsg = error.message;
      }

      setErrorMessage(errorMsg);

      try {
        const retryData: any = { content, step };
        if (step === "generation" && options?.templateKey) {
          retryData.templateKey = options.templateKey;
        }

        if (step === "analysis") {
          retryData.autoSelectMode = autoSelectMode;
          retryData.selectedAnalysisMethods = selectedAnalysisMethods;
          retryData.customMethods = customMethods;
        }

        await databaseService.updateSession(currentSessionId, {
          has_error: 1,
          error_message: errorMsg,
          error_step: step,
          retry_data: JSON.stringify(retryData),
        });
      } catch (dbError) {
        console.error("Failed to save error state to database:", dbError);
      }

      Modal.error({
        title: "Request Failed",
        content: (
          <div>
            <p>Error occurred: {errorMsg}</p>
            <p>
              You can retry this operation or check your network connection.
            </p>
          </div>
        ),
        okText: "OK",
      });

      await updateSessionState(step, currentSessionId, currentSessions);
    } finally {
      setLoading(false);
    }
  };

  const handleEditMessage = async (
    messageIndex: number,
    newContent: string,
    updatedAnalysisData?: any[],
  ) => {
    const updatedMessages = [...messageHistory];
    const messageToEdit = updatedMessages[messageIndex];

    if (messageToEdit) {
      messageToEdit.content = newContent;

      if (updatedAnalysisData && messageToEdit.isAnalysis) {
        messageToEdit.metadata = {
          ...messageToEdit.metadata,
          analysisData: updatedAnalysisData,
        };
      }

      setMessageHistory(updatedMessages);

      try {
        if (messageToEdit.id) {
          const updateData: any = {
            content: newContent,
          };

          if (updatedAnalysisData && messageToEdit.isAnalysis) {
            updateData.metadata = {
              ...messageToEdit.metadata,
              analysisData: updatedAnalysisData,
            };
          }

          await databaseService.updateMessage(
            messageToEdit.id.toString(),
            updateData,
          );
        } else {
          console.warn("Message has no ID, cannot update in database");
        }
      } catch (error) {
        console.error("Failed to update message:", error);
      }
    }
  };

  const handleFeedback = async (
    feedback: string,
    content?: string | null,
    isRetry: boolean = false,
  ) => {
    setLoading(true);
    let updatedMessages: LocalMessage[] = [];
    if (feedback != "yes") {
      if (isRetry) {
        updatedMessages = [...messageHistory];
      } else {
        const userMessage: LocalMessage = {
          type: "user",
          content: content || "",
        };

        try {
          const savedFeedbackMessage = await databaseService.addMessage(
            sessionId,
            {
              type: "user",
              content: content || "",
              step: currentStep as any,
              metadata: { isFeedback: true },
            },
          );
          userMessage.id = savedFeedbackMessage.id?.toString();
        } catch (error) {
          console.error("Failed to save feedback message:", error);
        }

        updatedMessages = [...messageHistory, userMessage];
        setMessageHistory(updatedMessages);
      }
    } else {
      updatedMessages = [...messageHistory];
    }

    try {
      let endpoint = "";

      switch (currentStep) {
        case "structure":
          endpoint = "http://localhost:8000/structure-feedback";
          break;
        case "analysis":
          endpoint = "http://localhost:8000/analysis-feedback";
          break;
        case "generation":
          endpoint = "http://localhost:8000/generation-feedback";
          break;
        case "optimization":
          endpoint = "http://localhost:8000/optimization-feedback";
          break;
        default:
          endpoint = "http://localhost:8000/structure-feedback";
      }

      const authHeaders: { [key: string]: string } = {
        "Content-Type": "application/json",
      };

      const userData = localStorage.getItem("user");
      if (userData) {
        const user = JSON.parse(userData);
        authHeaders["Authorization"] = `Bearer ${user.id}`;
      }

      const response = await fetch(endpoint, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          session_id: sessionId,
          feedback: feedback,
          content: content,
        }),
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }

      const data: ApiResponse = await response.json();

      if (data.status === "success") {
        let responseMessage = "";
        let nextStep = currentStep;

        if (feedback === "yes") {
          const lastSystemMessage = messageHistory
            .slice()
            .reverse()
            .find((msg) => msg.type === "system" && msg.thinking);

          if (
            lastSystemMessage &&
            lastSystemMessage.thinking &&
            lastSystemMessage.id
          ) {
            try {
              await databaseService.updateMessage(lastSystemMessage.id, {
                metadata: {
                  ...lastSystemMessage.metadata,
                  thinking: lastSystemMessage.thinking,
                },
              });
            } catch (error) {
              console.error("Failed to save thinking to database:", error);
            }
          }

          switch (currentStep) {
            case "structure":
              nextStep = "analysis";
              break;
            case "analysis":
              nextStep = "generation";
              break;
            case "generation":
              nextStep = "optimization";
              break;
            case "optimization":
              nextStep = "testing";
              break;
            default:
              nextStep = "analysis";
          }

          setCurrentStep(nextStep);
          await updateSessionState(nextStep, sessionId);

          const nextMessage = content || "Accept";
          if (nextMessage) {
            handleSendMessage(nextMessage, nextStep);
          }
        } else if (feedback === "supplement") {
          if (currentStep === "structure") {
            responseMessage =
              data.result.answer || "Please provide more information";
          }

          const systemMessage: LocalMessage = {
            type: "system",
            content: responseMessage,
            needsSupplement: data.result.needs_supplement,
            thinking: data.result.thinking,
          };

          try {
            const savedSupplementMessage = await databaseService.addMessage(
              sessionId,
              {
                type: "assistant",
                content: responseMessage,
                step: currentStep as any,
                metadata: {
                  needsSupplement: data.result.needs_supplement,
                  isSupplement: true,
                  thinking: data.result.thinking,
                },
              },
            );

            systemMessage.id = savedSupplementMessage.id?.toString();
          } catch (error) {
            console.error("Failed to save supplement message:", error);
          }

          const supplementMessages: LocalMessage[] = [
            ...updatedMessages,
            systemMessage,
          ];
          setMessageHistory(supplementMessages);
        } else {
          let systemMessage: LocalMessage;

          if (currentStep === "structure") {
            responseMessage = data.result.answer;
            systemMessage = {
              type: "system",
              content: responseMessage,
              thinking: data.result.thinking,
            };
          } else if (currentStep === "analysis") {
            let formattedContent;
            let analysisData = null;

            if (typeof data.result === "string") {
              formattedContent = data.result;
            } else if (Array.isArray(data.result)) {
              if (
                data.result.length > 0 &&
                typeof data.result[0] === "object" &&
                data.result[0].agent_name
              ) {
                analysisData = data.result;
                formattedContent = data.result
                  .map((item) => `**${item.agent_name}**\n\n${item.content}`)
                  .join("\n\n");
              } else {
                formattedContent = data.result
                  .filter((item) => item && item.trim() !== "")
                  .join("\n\n");
              }
            } else {
              formattedContent = JSON.stringify(data.result, null, 2);
            }

            systemMessage = {
              type: "system",
              content: formattedContent,
              isAnalysis: true,
              metadata: analysisData ? { analysisData } : undefined,
              thinking: data.result.thinking,
            } as LocalMessage;
          } else if (currentStep === "generation") {
            if (
              typeof data.result === "object" &&
              data.result &&
              typeof data.result.prompt === "string"
            ) {
              systemMessage = {
                type: "system",
                content: data.result.prompt,
                thinking: data.result.thinking,
                metadata: {
                  ...(data.result.selected_template
                    ? { selected_template: data.result.selected_template }
                    : {}),
                },
              } as LocalMessage;
            } else {
              responseMessage =
                typeof data.result === "string"
                  ? data.result
                  : JSON.stringify(data.result, null, 2);
              systemMessage = {
                type: "system",
                content: responseMessage,
              } as LocalMessage;
            }
          } else {
            responseMessage =
              typeof data.result === "string"
                ? data.result
                : JSON.stringify(data.result, null, 2);

            systemMessage = {
              type: "system",
              content: responseMessage,
              thinking: data.result.thinking,
            };
          }

          try {
            const messageToSave: any = {
              type: "assistant",
              content: systemMessage.content,
              step: currentStep as any,
              metadata: {
                isFeedbackResponse: true,
                thinking: systemMessage.thinking,
              },
            };

            if (currentStep === "analysis" && systemMessage.metadata) {
              messageToSave.metadata = {
                ...messageToSave.metadata,
                ...systemMessage.metadata,
                isAnalysis: true,
              };
            }

            const savedFeedbackResponse = await databaseService.addMessage(
              sessionId,
              messageToSave,
            );
            systemMessage.id = savedFeedbackResponse.id?.toString();
          } catch (error) {
            console.error("Failed to save feedback response:", error);
          }

          const feedbackMessages: LocalMessage[] = [
            ...updatedMessages,
            systemMessage,
          ];
          setMessageHistory(feedbackMessages);
        }
      } else {
        throw new Error(data.message || "Feedback request failed");
      }
    } catch (error) {
      console.error("Report API request errors:", error);

      setLastFailedRequest({ content: content || "", step: currentStep });
      setHasError(true);

      let errorMsg = "Unknown error";
      if (error instanceof Error) {
        errorMsg = error.message;
      }

      setErrorMessage(errorMsg);

      try {
        const retryData: any = {
          content: content || "",
          step: currentStep,
          isFeedback: true,
        };

        if (currentStep === "analysis") {
          retryData.autoSelectMode = autoSelectMode;
          retryData.selectedAnalysisMethods = selectedAnalysisMethods;
          retryData.customMethods = customMethods;
        }

        await databaseService.updateSession(sessionId, {
          has_error: 1,
          error_message: errorMsg,
          error_step: currentStep,
          retry_data: JSON.stringify(retryData),
        });
      } catch (dbError) {
        console.error("Failed to save error state to database:", dbError);
      }

      Modal.error({
        title: "Feedback Request Failed",
        content: (
          <div>
            <p>Error occurred: {errorMsg}</p>
            <p>
              You can retry this operation or check your network connection.
            </p>
          </div>
        ),
        okText: "OK",
      });

      await updateSessionState(currentStep, sessionId);
    } finally {
      setLoading(false);
    }
  };

  const handleSendMessageFromChat = (
    content: string,
    options?: { templateKey?: string },
  ) => {
    void handleSendMessage(content, currentStep, false, options);
  };

  if (initialLoading) {
    return (
      <Layout className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50">
        <Header className="flex justify-between items-center px-6 bg-gradient-to-r from-indigo-600 via-purple-600 to-blue-600 shadow-2xl border-b border-white/20 backdrop-blur-sm">
          <div className="flex items-center">
            <Title
              level={3}
              className="text-white m-0 font-['Inter'] font-bold tracking-wide drop-shadow-lg text-2xl"
            >
              🧙‍♂️ LinguaWorks
            </Title>
          </div>
        </Header>
        <div className="flex items-center justify-center h-[calc(100vh-64px)]">
          <div className="text-center">
            <div className="p-8 bg-gradient-to-br from-blue-100 to-indigo-100 rounded-3xl w-32 h-32 mx-auto mb-6 flex items-center justify-center">
              <Spin size="large" className="text-blue-600" />
            </div>
            <Title
              level={2}
              className="font-['Inter'] font-bold text-transparent bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text mb-4"
            >
              🚀 Loading LinguaWorks
            </Title>
            <p className="text-gray-600 font-['Inter'] text-lg">
              Initializing your AI-powered prompt optimization experience...
            </p>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50">
      <Header className="flex justify-between items-center px-6 bg-gradient-to-r from-indigo-600 via-purple-600 to-blue-600 shadow-2xl border-b border-white/20 backdrop-blur-sm">
        <div className="flex items-center">
          <Title
            level={3}
            className="text-white m-0 font-['Inter'] font-bold tracking-wide drop-shadow-lg text-2xl"
          >
            🧙‍♂️ LinguaWorks
          </Title>
        </div>
        <div className="flex items-center gap-3">
          <Button
            onClick={handleOpenSettings}
            className="bg-white/20 text-white border-white/30 shadow-lg hover:bg-white/30 hover:shadow-xl backdrop-blur-sm transition-all duration-300 flex items-center justify-center group"
            size="large"
            icon={
              <SettingsIcon className="w-5 h-5 group-hover:rotate-90 transition-transform duration-300" />
            }
          ></Button>
          <Button
            onClick={handleLogout}
            className="bg-white/20 text-white border-white/30 shadow-lg hover:bg-red-500/30 hover:shadow-xl backdrop-blur-sm transition-all duration-300 flex items-center justify-center group"
            size="large"
            icon={
              <LogOut className="w-5 h-5 group-hover:translate-x-1 transition-transform duration-300" />
            }
            title="Logout"
          ></Button>
        </div>
      </Header>
      <Layout className="relative">
        <Sider
          width={280}
          collapsedWidth={80}
          theme="light"
          className="overflow-y-auto overflow-x-hidden h-[calc(100vh-64px)] fixed left-0 border-r border-indigo-200/50 shadow-2xl bg-white/95 backdrop-blur-xl transition-all duration-300 z-40"
          collapsed={collapsed}
          trigger={null}
        >
          <SessionList
            sessions={sessions}
            activeSessionId={sessionId}
            onSelectSession={switchSession}
            onDeleteSession={deleteSession}
            onUpdateSessionName={updateSessionName}
            onCreateNewSession={createNewSession}
            collapsed={collapsed}
            setCollapsed={setCollapsed}
            loading={sessionSwitchLoading}
          />
        </Sider>
        <Content
          className={`transition-all duration-300 ${
            collapsed ? "ml-[80px]" : "ml-[280px]"
          } p-2 overflow-auto h-[calc(100vh-64px)] flex justify-center relative z-10`}
        >
          {sessionSwitchLoading ? (
            <div className="flex items-center justify-center w-full h-full">
              <div className="text-center">
                <div className="p-6 bg-gradient-to-br from-purple-100 to-blue-100 rounded-3xl w-24 h-24 mx-auto mb-4 flex items-center justify-center">
                  <Spin size="large" className="text-purple-600" />
                </div>
                <Title
                  level={3}
                  className="font-['Inter'] font-bold text-transparent bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text mb-2"
                >
                  💬 Loading Conversation
                </Title>
                <p className="text-gray-600 font-['Inter']">
                  Preparing your chat history...
                </p>
              </div>
            </div>
          ) : (
            <div
              className={`${isNewChatMode ? "max-w-4xl" : "max-w-7xl"} w-full`}
            >
              <ChatInterface
                messages={messageHistory}
                onSendMessage={handleSendMessageFromChat}
                onSendFeedback={handleFeedback}
                onEditMessage={handleEditMessage}
                currentStep={currentStep}
                loading={loading}
                isNewChatMode={isNewChatMode}
                hasError={hasError}
                errorMessage={errorMessage}
                onRetry={handleRetry}
                sessionId={sessionId}
              />
            </div>
          )}
        </Content>
      </Layout>
      <Settings
        visible={settingsVisible}
        onClose={handleCloseSettings}
        onSave={reloadAnalysisSettings}
      />
    </Layout>
  );
};

export default HomePage;
