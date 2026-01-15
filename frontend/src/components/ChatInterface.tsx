import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Input,
  Button,
  Steps,
  Spin,
  Space,
  Typography,
  Modal,
  Collapse,
  message,
  Radio,
  Checkbox,
} from "antd";
import {
  SendOutlined,
  CheckOutlined,
  CloseOutlined,
  LeftOutlined,
  RightOutlined,
  EditOutlined,
  RedoOutlined,
  EyeOutlined,
  DownOutlined,
  UpOutlined,
} from "@ant-design/icons";
import ReactMarkdown from "react-markdown";
import ThinkingProcess from "./ThinkingProcess";
import AnalysisDisplay from "./AnalysisDisplay";
import ChatTestWindow from "./ChatTestWindow";
import databaseService, { PromptTemplate } from "../services/databaseService";
import {
  getFunctionalStepName,
  getProductStepName,
  getStepIndex,
} from "../utils/helpers";

const { TextArea } = Input;
const { Step } = Steps;
const { Title, Text } = Typography;

interface EditingParagraph {
  agentName: string;
  content: string;
}

interface Message {
  id?: number | string;
  type: "user" | "system" | "assistant";
  content: any; // Modify it to the any type to support objects
  needsSupplement?: boolean;
  isTestResult?: boolean; // Add test result tags
  isAnalysis?: boolean;
  isEditable?: boolean; // Add editable tags
  originalContent?: any; // Save the original content
  timestamp?: string;
  role?: "user" | "assistant";
  thinking?: string; // Add a thought process field
  metadata?: any; // Add the metadata field
}

interface PromptVersion {
  id: number;
  version_number?: number;
  prompt: string;
  result: string;
  timestamp: string;
  isOriginal?: boolean;
  isOptimized?: boolean;
  version_name?: string;
  metadata?: any;
}

interface ComparisonData {
  versions: PromptVersion[];
  currentLeftIndex: number;
  currentRightIndex: number;
}

interface ChatHistoryMessage {
  id: number;
  message_type: "user" | "assistant";
  content: string;
  message_order: number;
  created_at: string;
  response_time_ms?: number | null;
  token_count?: number | null;
}

interface ChatInterfaceProps {
  messages: Message[];
  onSendMessage: (content: string, options?: { templateKey?: string }) => void;
  onSendFeedback: (feedback: string, content?: string | null) => void;
  onEditMessage?: (
    index: number,
    newContent: string,
    updatedAnalysisData?: any[],
  ) => void; // Update callback for message editing
  currentStep: string;
  loading: boolean;
  isNewChatMode?: boolean;
  hasError?: boolean;
  errorMessage?: string;
  onRetry?: () => void;
  sessionId?: string;
}

const ChatInterface: React.FC<ChatInterfaceProps> = ({
  messages,
  onSendMessage,
  onSendFeedback,
  onEditMessage,
  currentStep,
  loading,
  isNewChatMode = false,
  hasError = false,
  errorMessage = "",
  onRetry,
  sessionId = "test-session",
}) => {
  const [inputValue, setInputValue] = useState<string>("");
  const [feedbackValue, setFeedbackValue] = useState<string>("");
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [templateLoading, setTemplateLoading] = useState(false);
  const [availableTemplates, setAvailableTemplates] = useState<PromptTemplate[]>(
    [],
  );
  const [selectedTemplateKey, setSelectedTemplateKey] = useState<string>("");
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingContent, setEditingContent] = useState<string>("");

  const [editingParagraphs, setEditingParagraphs] = useState<
    EditingParagraph[]
  >([]);
  const [isSegmentedEdit, setIsSegmentedEdit] = useState<boolean>(false);

  const [comparisonData, setComparisonData] = useState<ComparisonData | null>(
    null,
  );
  const [isEditingPrompt, setIsEditingPrompt] = useState(false);
  const [editingPromptContent, setEditingPromptContent] = useState("");
  const [isTestingPrompt, setIsTestingPrompt] = useState(false);
  const [editingVersionName, setEditingVersionName] = useState<{
    side: "left" | "right";
    value: string;
  } | null>(null);
  const [collapsedPanels, setCollapsedPanels] = useState<{
    [key: string]: boolean;
  }>({});
  const [diffModalOpen, setDiffModalOpen] = useState(false);
  const [diffLoading, setDiffLoading] = useState(false);
  const [diffExplanation, setDiffExplanation] = useState("");
  const [leftHistoryMessages, setLeftHistoryMessages] = useState<
    ChatHistoryMessage[]
  >([]);
  const [rightHistoryMessages, setRightHistoryMessages] = useState<
    ChatHistoryMessage[]
  >([]);
  const [leftSelectedMessageIds, setLeftSelectedMessageIds] = useState<
    number[]
  >([]);
  const [rightSelectedMessageIds, setRightSelectedMessageIds] = useState<
    number[]
  >([]);

  const getAdaptiveHeight = (panelKey: string, siblingKey: string) => {
    const isCollapsed = collapsedPanels[panelKey];
    const isSiblingCollapsed = collapsedPanels[siblingKey];

    if (isCollapsed && isSiblingCollapsed) {
      return "16vh";
    } else if (isCollapsed) {
      return "8vh";
    } else if (isSiblingCollapsed) {
      return "56vh";
    } else {
      return "32vh";
    }
  };

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const getAuthHeaders = useCallback(() => {
    const authHeaders: { [key: string]: string } = {
      "Content-Type": "application/json",
    };

    const userData = localStorage.getItem("user");
    if (userData) {
      const user = JSON.parse(userData);
      authHeaders["Authorization"] = `Bearer ${user.id}`;
    }

    return authHeaders;
  }, []);

  const getVersionDisplayName = (v: PromptVersion | undefined, index: number) =>
    v?.version_name || `Version ${v?.version_number ?? index + 1}`;

  const getDiffStorageKey = useCallback((versionAId: number, versionBId: number) => {
    const [minId, maxId] =
      versionAId < versionBId ? [versionAId, versionBId] : [versionBId, versionAId];
    return `diff_analysis:${sessionId}:${minId}:${maxId}`;
  }, [sessionId]);

  const fetchSavedDiffFromBackend = useCallback(async (versionAId: number, versionBId: number) => {
    try {
      const response = await fetch("http://localhost:8000/chat-test-diff-analysis-get", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          session_id: sessionId,
          left_version_id: versionAId,
          right_version_id: versionBId,
        }),
      });
      if (!response.ok) return null;
      const data = await response.json();
      const analysis = data?.result?.analysis;
      return analysis && typeof analysis === "object" ? analysis : null;
    } catch {
      return null;
    }
  }, [getAuthHeaders, sessionId]);

  const loadSavedDiff = useCallback((versionAId: number, versionBId: number) => {
    try {
      const raw = localStorage.getItem(getDiffStorageKey(versionAId, versionBId));
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch {
      return null;
    }
  }, [getDiffStorageKey]);

  const saveDiffToBackend = async (payload: {
    versionAId: number;
    versionBId: number;
    selectedAIds: number[];
    selectedBIds: number[];
    explanation: string;
  }) => {
    try {
      await fetch("http://localhost:8000/chat-test-diff-analysis-save", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          session_id: sessionId,
          left_version_id: payload.versionAId,
          right_version_id: payload.versionBId,
          left_message_ids: payload.selectedAIds,
          right_message_ids: payload.selectedBIds,
          explanation: payload.explanation,
        }),
      });
    } catch {
      return;
    }
  };

  const saveDiff = (payload: {
    versionAId: number;
    versionBId: number;
    versionAName: string;
    versionBName: string;
    selectedAIds: number[];
    selectedBIds: number[];
    explanation: string;
  }) => {
    try {
      const nowIso = new Date().toISOString();
      const stored = { ...payload, updatedAt: nowIso };
      localStorage.setItem(
        getDiffStorageKey(payload.versionAId, payload.versionBId),
        JSON.stringify(stored),
      );
    } catch {
      return;
    }
  };

  const fetchChatHistoryMessages = async (versionId: number) => {
    const response = await fetch("http://localhost:8000/chat-test-history", {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({
        session_id: sessionId,
        version_id: versionId,
        limit: 200,
      }),
    });

    if (!response.ok) return [];

    const data = await response.json();
    const rawMessages: ChatHistoryMessage[] = Array.isArray(data?.result?.messages)
      ? data.result.messages
      : [];
    return rawMessages;
  };

  const openDiffModal = async () => {
    if (!comparisonData) return;

    const leftVersion = comparisonData.versions[comparisonData.currentLeftIndex];
    const rightVersion = comparisonData.versions[comparisonData.currentRightIndex];
    const leftId = leftVersion?.id;
    const rightId = rightVersion?.id;
    if (!leftId || !rightId) return;

    setDiffModalOpen(true);
    setDiffLoading(true);

    try {
      const [leftMsgs, rightMsgs] = await Promise.all([
        fetchChatHistoryMessages(leftId),
        fetchChatHistoryMessages(rightId),
      ]);

      setLeftHistoryMessages(leftMsgs);
      setRightHistoryMessages(rightMsgs);

      const backendSaved = await fetchSavedDiffFromBackend(leftId, rightId);
      const localSaved = loadSavedDiff(leftId, rightId);
      const saved = backendSaved || localSaved;

      if (saved?.explanation) {
        setDiffExplanation(saved.explanation);
      } else {
        setDiffExplanation("");
      }

      const leftIds = Array.isArray(saved?.left_message_ids)
        ? saved.left_message_ids
        : Array.isArray(saved?.selectedAIds)
        ? saved.selectedAIds
        : null;
      const rightIds = Array.isArray(saved?.right_message_ids)
        ? saved.right_message_ids
        : Array.isArray(saved?.selectedBIds)
        ? saved.selectedBIds
        : null;

      if (leftIds && rightIds) {
        setLeftSelectedMessageIds(leftIds);
        setRightSelectedMessageIds(rightIds);
      } else {
        setLeftSelectedMessageIds(leftMsgs.map((m) => m.id));
        setRightSelectedMessageIds(rightMsgs.map((m) => m.id));
      }
    } catch (e) {
      message.error("Failed to load chat history");
    } finally {
      setDiffLoading(false);
    }
  };

  const runDiffExplain = async () => {
    if (!comparisonData) return;

    const leftVersion = comparisonData.versions[comparisonData.currentLeftIndex];
    const rightVersion = comparisonData.versions[comparisonData.currentRightIndex];
    const leftId = leftVersion?.id;
    const rightId = rightVersion?.id;
    if (!leftId || !rightId) return;

    if (leftSelectedMessageIds.length === 0 || rightSelectedMessageIds.length === 0) {
      message.warning("Please select messages first");
      return;
    }

    setDiffLoading(true);
    setDiffExplanation("");
    try {
      const response = await fetch(
        "http://localhost:8000/chat-test-diff-explain",
        {
          method: "POST",
          headers: getAuthHeaders(),
          body: JSON.stringify({
            session_id: sessionId,
            left_version_id: leftId,
            right_version_id: rightId,
            left_message_ids: leftSelectedMessageIds,
            right_message_ids: rightSelectedMessageIds,
            left_start_order: 1,
            left_end_order: 1,
            right_start_order: 1,
            right_end_order: 1,
          }),
        },
      );

      const data = await response.json();
      if (data?.status !== "success") {
        message.error("Difference analysis failed");
        return;
      }

      const explanation = data?.result?.explanation || "";
      setDiffExplanation(explanation);
      const payloadToPersist = {
        versionAId: leftId,
        versionBId: rightId,
        versionAName: getVersionDisplayName(leftVersion, comparisonData.currentLeftIndex),
        versionBName: getVersionDisplayName(rightVersion, comparisonData.currentRightIndex),
        selectedAIds: leftSelectedMessageIds,
        selectedBIds: rightSelectedMessageIds,
        explanation,
      };
      saveDiff(payloadToPersist);
      saveDiffToBackend(payloadToPersist);
    } catch (e) {
      message.error("Network error, please try again");
    } finally {
      setDiffLoading(false);
    }
  };

  useEffect(() => {
    if (!comparisonData) return;
    const leftVersion = comparisonData.versions[comparisonData.currentLeftIndex];
    const rightVersion = comparisonData.versions[comparisonData.currentRightIndex];
    if (!leftVersion?.id || !rightVersion?.id) return;

    const leftId = leftVersion.id;
    const rightId = rightVersion.id;

    (async () => {
      const backendSaved = await fetchSavedDiffFromBackend(leftId, rightId);
      const localSaved = loadSavedDiff(leftId, rightId);
      const saved = backendSaved || localSaved;

      if (saved?.explanation) {
        setDiffExplanation(saved.explanation);
      } else {
        setDiffExplanation("");
      }
    })();
  }, [
    comparisonData,
    comparisonData?.currentLeftIndex,
    comparisonData?.currentRightIndex,
    comparisonData?.versions,
    fetchSavedDiffFromBackend,
    loadSavedDiff,
  ]);

  const lastTemplateMetadata = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const meta = messages[i]?.metadata;
      if (meta && meta.selected_template) return meta;
    }
    return null;
  })();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Save the version to the back end
  const saveVersionsToBackend = async (versions: PromptVersion[]) => {
    const updatedVersions: PromptVersion[] = [];

    for (const version of versions) {
      try {
        const versionType = version.isOriginal
          ? "original"
          : version.isOptimized
          ? "optimized"
          : "user_modified";

        // 获取认证头信息
        const authHeaders: { [key: string]: string } = {
          "Content-Type": "application/json",
        };

        const userData = localStorage.getItem("user");
        if (userData) {
          const user = JSON.parse(userData);
          authHeaders["Authorization"] = `Bearer ${user.id}`;
        }

        const response = await fetch(
          `http://localhost:8000/api/sessions/${sessionId}/versions`,
          {
            method: "POST",
            headers: authHeaders,
            body: JSON.stringify({
              prompt_content: version.prompt,
              test_result: version.result,
              version_type: versionType,
              metadata: {
                timestamp: version.timestamp,
                isOriginal: version.isOriginal,
                isOptimized: version.isOptimized,
              },
            }),
          },
        );

        if (response.ok) {
          const apiResponse = await response.json();
          const realId = apiResponse.result?.version_id || version.id;
          const realNumber = apiResponse.result?.version_number;
          updatedVersions.push({
            ...version,
            id: realId,
            version_number:
              typeof realNumber === "number" ? realNumber : version.version_number,
          });
        } else {
          updatedVersions.push(version);
        }
      } catch (error) {
        console.error("Failed to save version to backend:", error);
        updatedVersions.push(version);
      }
    }

    return updatedVersions;
  };

  const saveVersionToBackend = async (version: PromptVersion) => {
    try {
      const versionType = version.isOriginal
        ? "original"
        : version.isOptimized
        ? "optimized"
        : "user_modified";

      const authHeaders: { [key: string]: string } = {
        "Content-Type": "application/json",
      };

      const userData = localStorage.getItem("user");
      if (userData) {
        const user = JSON.parse(userData);
        authHeaders["Authorization"] = `Bearer ${user.id}`;
      }

      const response = await fetch(
        `http://localhost:8000/api/sessions/${sessionId}/versions`,
        {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({
            prompt_content: version.prompt,
            test_result: version.result,
            version_type: versionType,
            metadata: {
              timestamp: version.timestamp,
              isOriginal: version.isOriginal,
              isOptimized: version.isOptimized,
            },
          }),
        },
      );

      if (response.ok) {
        const apiResponse = await response.json();
        return {
          version_id: apiResponse.result?.version_id || version.id,
          version_number:
            typeof apiResponse.result?.version_number === "number"
              ? apiResponse.result.version_number
              : version.version_number,
        };
      }
    } catch (error) {
      console.error("Failed to save version to backend:", error);
    }
    return { version_id: version.id, version_number: version.version_number };
  };

  const handleSend = () => {
    if (inputValue.trim() && !loading) {
      onSendMessage(inputValue);
      setInputValue("");
    }
  };

  const openTemplateModal = async () => {
    try {
      setTemplateModalOpen(true);
      setTemplateLoading(true);
      const templates = await databaseService.getPromptTemplates("prompt_crafter");
      const selected = templates.filter((t) => Boolean(t.is_selected));
      const list = selected.length > 0 ? selected : templates;
      setAvailableTemplates(list);
      setSelectedTemplateKey(list[0]?.template_key || "");
    } catch (e) {
      message.error("Failed to load templates");
      setAvailableTemplates([]);
      setSelectedTemplateKey("");
    } finally {
      setTemplateLoading(false);
    }
  };

  const regenerateWithTemplate = () => {
    if (!selectedTemplateKey) return;
    setTemplateModalOpen(false);
    onSendMessage("", { templateKey: selectedTemplateKey });
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSendFeedback = (feedbackType: "yes" | "no" | "supplement") => {
    if (feedbackType === "yes") {
      onSendFeedback("yes", "Accept");
      setFeedbackValue("");
    } else if (feedbackType === "no" && feedbackValue.trim()) {
      onSendFeedback("no", feedbackValue);
      setFeedbackValue("");
    } else if (feedbackType === "supplement" && feedbackValue.trim()) {
      onSendFeedback("supplement", feedbackValue);
      setFeedbackValue("");
    }
  };

  const handleTestResultClick = async (content: any) => {
    if (typeof content === "object" && "original_result" in content) {
      try {
        const authHeaders: { [key: string]: string } = {};
        const userData = localStorage.getItem("user");
        if (userData) {
          const user = JSON.parse(userData);
          authHeaders["Authorization"] = `Bearer ${user.id}`;
        }

        const response = await fetch(
          `http://localhost:8000/api/sessions/${sessionId}/versions`,
          {
            headers: authHeaders,
          },
        );

        if (response.ok) {
          const apiResponse = await response.json();
          if (
            apiResponse.status === "success" &&
            apiResponse.result.length > 0
          ) {
            // 使用后端数据
            const versions: PromptVersion[] = apiResponse.result.map(
              (v: any) => ({
                id: v.id,
                version_number: v.version_number,
                prompt: v.prompt_content,
                result: v.test_result || "",
                timestamp: v.created_at,
                isOriginal: v.version_type === "original",
                isOptimized: v.version_type === "optimized",
                version_name: v.version_name,
                metadata: v.metadata,
              }),
            );

            setComparisonData({
              versions,
              currentLeftIndex: 0,
              currentRightIndex: Math.min(1, versions.length - 1),
            });
            setIsModalVisible(true);
            return;
          }
        }
      } catch (error) {
        console.warn(
          "Failed to load versions from backend, using local data:",
          error,
        );
      }
      const versions: PromptVersion[] = [
        {
          id: 1,
          version_number: 1,
          prompt: content.original_prompt,
          result: content.original_result,
          timestamp: new Date().toISOString(),
          isOriginal: true,
        },
        {
          id: 2,
          version_number: 2,
          prompt: content.optimized_prompt,
          result: content.optimized_result,
          timestamp: new Date().toISOString(),
          isOptimized: true,
        },
      ];
      const updatedVersions = await saveVersionsToBackend(versions);

      setComparisonData({
        versions: updatedVersions,
        currentLeftIndex: 0,
        currentRightIndex: 1,
      });
      setIsModalVisible(true);
    }
  };

  const navigateVersion = (
    direction: "left" | "right",
    side: "left" | "right",
  ) => {
    if (!comparisonData) return;

    const { versions, currentLeftIndex, currentRightIndex } = comparisonData;
    let newLeftIndex = currentLeftIndex;
    let newRightIndex = currentRightIndex;

    if (side === "left") {
      if (direction === "left" && currentLeftIndex > 0) {
        newLeftIndex = currentLeftIndex - 1;
      } else if (
        direction === "right" &&
        currentLeftIndex < versions.length - 1
      ) {
        newLeftIndex = currentLeftIndex + 1;
      }
    } else {
      if (direction === "left" && currentRightIndex > 0) {
        newRightIndex = currentRightIndex - 1;
      } else if (
        direction === "right" &&
        currentRightIndex < versions.length - 1
      ) {
        newRightIndex = currentRightIndex + 1;
      }
    }

    setComparisonData({
      ...comparisonData,
      currentLeftIndex: newLeftIndex,
      currentRightIndex: newRightIndex,
    });
  };

  const startEditingPrompt = () => {
    if (!comparisonData) return;
    const rightVersion =
      comparisonData.versions[comparisonData.currentRightIndex];
    setEditingPromptContent(rightVersion.prompt);
    setIsEditingPrompt(true);
  };

  const cancelEditingPrompt = () => {
    setIsEditingPrompt(false);
    setEditingPromptContent("");
  };

  const startEditingVersionName = (side: "left" | "right") => {
    if (!comparisonData) return;
    const currentIndex =
      side === "left"
        ? comparisonData.currentLeftIndex
        : comparisonData.currentRightIndex;
    const currentVersion = comparisonData.versions[currentIndex];
    const currentName =
      currentVersion?.version_name || `Version ${currentIndex + 1}`;
    setEditingVersionName({ side, value: currentName });
  };

  const saveVersionName = async () => {
    if (!editingVersionName || !comparisonData) return;

    const currentIndex =
      editingVersionName.side === "left"
        ? comparisonData.currentLeftIndex
        : comparisonData.currentRightIndex;
    const currentVersion = comparisonData.versions[currentIndex];

    if (!currentVersion || editingVersionName.value.trim() === "") {
      message.error("Version name cannot be empty");
      return;
    }

    try {
      const versionId = currentVersion.id;
      const authHeaders: { [key: string]: string } = {
        "Content-Type": "application/json",
      };

      const userData = localStorage.getItem("user");
      if (userData) {
        const user = JSON.parse(userData);
        authHeaders["Authorization"] = `Bearer ${user.id}`;
      }

      const response = await fetch(
        `http://localhost:8000/api/sessions/${sessionId}/versions/${versionId}/name`,
        {
          method: "PUT",
          headers: authHeaders,
          body: JSON.stringify({
            version_name: editingVersionName.value.trim(),
          }),
        },
      );

      const result = await response.json();

      if (result.status !== "success") {
        throw new Error(result.message || "Failed to update version name");
      }

      const updatedVersions = comparisonData.versions.map((v) =>
        v.id === currentVersion.id
          ? { ...v, version_name: editingVersionName.value.trim() }
          : v,
      );

      setComparisonData({
        ...comparisonData,
        versions: updatedVersions,
      });

      setEditingVersionName(null);
      message.success("Version name updated successfully");
    } catch (error) {
      console.error("Failed to update the version name:", error);
      message.error("Failed to update version name, please try again");
    }
  };

  const cancelEditingVersionName = () => {
    setEditingVersionName(null);
  };

  const deleteVersion = async (versionId: number) => {
    if (!comparisonData) return;

    if (versionId === 1 || versionId === 2) {
      message.error("Version 1 and Version 2 cannot be deleted");
      return;
    }

    Modal.confirm({
      title: "Confirm Delete",
      content:
        "Are you sure you want to delete this version? This action cannot be undone.",
      okText: "Delete",
      cancelText: "Cancel",
      onOk: async () => {
        try {
          const authHeaders: { [key: string]: string } = {
            "Content-Type": "application/json",
          };

          const userData = localStorage.getItem("user");
          if (userData) {
            const user = JSON.parse(userData);
            authHeaders["Authorization"] = `Bearer ${user.id}`;
          }

          const response = await fetch(
            `http://localhost:8000/api/sessions/${sessionId}/versions/${versionId}`,
            {
              method: "DELETE",
              headers: authHeaders,
            },
          );

          const result = await response.json();

          if (result.status === "success") {
            const updatedVersions = comparisonData.versions.filter(
              (v) => v.id !== versionId,
            );

            let newLeftIndex = comparisonData.currentLeftIndex;
            let newRightIndex = comparisonData.currentRightIndex;

            if (
              comparisonData.versions[comparisonData.currentLeftIndex]?.id ===
              versionId
            ) {
              newLeftIndex = Math.min(newLeftIndex, updatedVersions.length - 1);
            } else if (
              comparisonData.currentLeftIndex >
              updatedVersions.findIndex(
                (v) =>
                  v.id ===
                  comparisonData.versions[comparisonData.currentLeftIndex]?.id,
              )
            ) {
              newLeftIndex = Math.max(0, newLeftIndex - 1);
            }

            if (
              comparisonData.versions[comparisonData.currentRightIndex]?.id ===
              versionId
            ) {
              newRightIndex = Math.min(
                newRightIndex,
                updatedVersions.length - 1,
              );
            } else if (
              comparisonData.currentRightIndex >
              updatedVersions.findIndex(
                (v) =>
                  v.id ===
                  comparisonData.versions[comparisonData.currentRightIndex]?.id,
              )
            ) {
              newRightIndex = Math.max(0, newRightIndex - 1);
            }

            setComparisonData({
              versions: updatedVersions,
              currentLeftIndex: newLeftIndex,
              currentRightIndex: newRightIndex,
            });

            message.success("Version deleted successfully");
          } else {
            message.error(result.message || "Failed to delete version");
          }
        } catch (error) {
          console.error("删除版本失败:", error);
          message.error("Failed to delete version");
        }
      },
    });
  };

  const saveEditedPrompt = async () => {
    if (!comparisonData || !editingPromptContent.trim()) return;

    const rightVersion =
      comparisonData.versions[comparisonData.currentRightIndex];
    if (editingPromptContent === rightVersion.prompt) {
      message.warning("Prompt内容未发生变化，无需保存");
      return;
    }

    setIsTestingPrompt(true);

    try {
      const newVersion: PromptVersion = {
        id: comparisonData.versions.length + 1,
        prompt: editingPromptContent,
        result: "", // 新版本暂时没有测试结果
        timestamp: new Date().toISOString(),
        version_name: `Version ${comparisonData.versions.length + 1}`,
      };

      const saved = await saveVersionToBackend(newVersion);
      newVersion.id = saved.version_id;
      if (typeof saved.version_number === "number") {
        newVersion.version_number = saved.version_number;
      }

      const updatedVersions = [...comparisonData.versions, newVersion];

      setComparisonData({
        ...comparisonData,
        versions: updatedVersions,
        currentRightIndex: updatedVersions.length - 1,
      });

      setIsEditingPrompt(false);
      setEditingPromptContent("");
      message.success(
        "New version saved successfully. You can test it in the chat test window.",
      );
    } catch (error) {
      console.error("Saving the Prompt failed:", error);
      message.error("Save failed, please try again");
    } finally {
      setIsTestingPrompt(false);
    }
  };

  const handleEditStart = (
    index: number,
    content: string,
    isAnalysis: boolean = false,
  ) => {
    setEditingIndex(index);
    let contentStr =
      typeof content === "string" ? content : JSON.stringify(content, null, 2);

    if (isAnalysis) {
      const message = messages[index];
      if (message.metadata?.analysisData) {
        const analysisData = message.metadata.analysisData;
        const paragraphs: EditingParagraph[] = analysisData.map(
          (item: any) => ({
            agentName: item.agent_name,
            content: item.content,
          }),
        );
        setEditingParagraphs(paragraphs);
        setIsSegmentedEdit(true);
        setEditingContent("");
      } else {
        contentStr = contentStr.replace(/\*\*[^*]+\*\*\n\n/g, "");
        const paragraphs = contentStr
          .split("\n\n")
          .filter((p) => p.trim() !== "");
        setEditingParagraphs(
          paragraphs.map((p) => ({ agentName: "User", content: p })),
        );
        setIsSegmentedEdit(true);
        setEditingContent("");
      }
    } else {
      setEditingParagraphs([]);
      setIsSegmentedEdit(false);
      setEditingContent(contentStr);
    }
  };

  const handleEditSave = (index: number) => {
    if (onEditMessage) {
      let finalContent = "";
      if (isSegmentedEdit) {
        const message = messages[index];
        if (message.isAnalysis && message.metadata?.analysisData) {
          const updatedAnalysisData = editingParagraphs
            .filter((paragraph: EditingParagraph) => {
              return paragraph.content && paragraph.content.trim();
            })
            .map((paragraph: EditingParagraph, pIndex: number) => ({
              agent_key:
                message.metadata.analysisData[pIndex]?.agent_key ||
                `user_${pIndex}`,
              agent_name:
                paragraph.agentName ||
                message.metadata.analysisData[pIndex]?.agent_name ||
                "User",
              content: paragraph.content,
            }));

          finalContent = updatedAnalysisData
            .map((item: any) => `**${item.agent_name}**\n\n${item.content}`)
            .join("\n\n");

          if (onEditMessage) {
            onEditMessage(index, finalContent, updatedAnalysisData);
          }
          setEditingIndex(null);
          setEditingContent("");
          setEditingParagraphs([]);
          setIsSegmentedEdit(false);
          return;
        } else {
          const validParagraphs = editingParagraphs.filter(
            (p: EditingParagraph) => {
              return p.content && p.content.trim();
            },
          );
          finalContent = validParagraphs
            .map((p: EditingParagraph) => p.content)
            .join("\n\n");
        }
      } else {
        finalContent = editingContent;
      }

      if (finalContent.trim()) {
        onEditMessage(index, finalContent);
      }
      setEditingIndex(null);
      setEditingContent("");
      setEditingParagraphs([]);
      setIsSegmentedEdit(false);
    }
  };

  const handleEditCancel = () => {
    setEditingIndex(null);
    setEditingContent("");
    setEditingParagraphs([]);
    setIsSegmentedEdit(false);
  };

  const isMessageEditable = (msg: Message, index: number) => {
    return (
      (msg.type === "system" || msg.type === "assistant") &&
      !msg.isTestResult &&
      !msg.needsSupplement &&
      (currentStep === "analysis" ||
        currentStep === "generation" ||
        currentStep === "optimization") &&
      index === messages.length - 1
    );
  };

  const getFeedbackButtonDisabled = (
    type: "yes" | "no" | "supplement",
  ): boolean => {
    if (currentStep === "testing") return true;
    if (type === "yes") return false;
    return !feedbackValue.trim();
  };

  const getCurrentStepIndex = (): number => {
    return getStepIndex(currentStep);
  };

  const getStepName = (): string => {
    return getFunctionalStepName(currentStep);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Create a new interface for the dialogue mode */}
      {isNewChatMode ? (
        <div className="flex flex-col h-full min-h-[calc(100vh-120px)] w-full">
          <div className="flex-1 flex items-center justify-center py-8 w-full">
            <div className="text-center max-w-4xl mx-auto px-6 w-full flex flex-col items-center justify-center">
              <div className="mb-8">
                <Title
                  level={1}
                  className="text-transparent bg-gradient-to-r from-indigo-600 via-purple-600 to-blue-600 bg-clip-text mb-4 font-bold"
                  style={{ fontFamily: "Inter" }}
                >
                  🧙‍♂️ Welcome to LinguaWorks
                </Title>
                <Text
                  className="text-gray-600 text-lg block mb-8"
                  style={{ fontFamily: "Inter" }}
                >
                  Transform your ideas into powerful AI prompts with our
                  intelligent optimization system
                </Text>
              </div>

              {/* input area */}
              <div className="bg-gradient-to-br from-white to-indigo-50 rounded-2xl shadow-xl border border-indigo-200/50 p-8 mb-8 backdrop-blur-sm w-full max-w-6xl mx-auto">
                <TextArea
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder="Please provide additional information..."
                  autoSize={{ minRows: 8, maxRows: 16 }}
                  onKeyPress={handleKeyPress}
                  disabled={loading}
                  className="border-0 text-base resize-none focus:ring-0 focus:border-0 shadow-none rounded-xl w-full"
                  style={{
                    boxShadow: "none",
                    fontFamily: "Inter",
                    width: "100%",
                  }}
                />
                <div className="flex justify-end mt-3">
                  <Button
                    type="primary"
                    icon={loading ? <Spin size="small" /> : <SendOutlined />}
                    onClick={handleSend}
                    disabled={!inputValue.trim() || loading}
                    size="large"
                    className="bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 border-none shadow-lg hover:shadow-xl px-8 py-2 h-auto text-base font-medium rounded-xl transform hover:scale-105 transition-all duration-300"
                    style={{ fontFamily: "Inter" }}
                  >
                    {loading ? "" : "Start"}
                  </Button>
                </div>
              </div>

              {/* Task example */}
              <div className="mt-12 p-8 bg-gradient-to-br from-white to-indigo-50 rounded-2xl shadow-xl border border-indigo-200/50 backdrop-blur-sm w-full max-w-6xl mx-auto">
                <h3
                  className="text-xl font-semibold text-gray-800 mb-6 text-center"
                  style={{ fontFamily: "Inter" }}
                >
                  💡 Task Examples
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-4 lg:gap-6">
                  <div
                    className="p-4 bg-white rounded-xl shadow-md border border-gray-200/50 hover:shadow-lg transition-all duration-300 transform hover:scale-105 cursor-pointer"
                    onClick={() =>
                      setInputValue(
                        "I need an AI assistant that can help customer service representatives quickly respond to customer inquiries. It should understand customer intent, provide accurate and friendly response suggestions, and handle common pre-sales and after-sales questions.",
                      )
                    }
                  >
                    <h4
                      className="text-base font-semibold text-gray-800 mb-3"
                      style={{ fontFamily: "Inter" }}
                    >
                      Customer Service Chatbot
                    </h4>
                    <p
                      className="text-gray-600 text-sm"
                      style={{ fontFamily: "Inter" }}
                    >
                      Intelligent customer service assistant for quick response
                      to inquiries
                    </p>
                  </div>

                  <div
                    className="p-4 bg-white rounded-xl shadow-md border border-gray-200/50 hover:shadow-lg transition-all duration-300 transform hover:scale-105 cursor-pointer"
                    onClick={() =>
                      setInputValue(
                        "Help me create a code review assistant that can analyze Python code quality, performance issues, security vulnerabilities, and provide specific improvement suggestions. It should support various coding standard checks like PEP8, type annotations, etc.",
                      )
                    }
                  >
                    <h4
                      className="text-base font-semibold text-gray-800 mb-3"
                      style={{ fontFamily: "Inter" }}
                    >
                      Code Review Assistant
                    </h4>
                    <p
                      className="text-gray-600 text-sm"
                      style={{ fontFamily: "Inter" }}
                    >
                      Automated code quality checking and optimization
                      suggestions
                    </p>
                  </div>

                  <div
                    className="p-4 bg-white rounded-xl shadow-md border border-gray-200/50 hover:shadow-lg transition-all duration-300 transform hover:scale-105 cursor-pointer"
                    onClick={() =>
                      setInputValue(
                        "I want a learning plan assistant that can create personalized study plans based on user learning goals, time schedules, and learning abilities. It should include daily learning tasks, progress tracking, and difficulty adjustments.",
                      )
                    }
                  >
                    <h4
                      className="text-base font-semibold text-gray-800 mb-3"
                      style={{ fontFamily: "Inter" }}
                    >
                      Learning Plan Assistant
                    </h4>
                    <p
                      className="text-gray-600 text-sm"
                      style={{ fontFamily: "Inter" }}
                    >
                      Personalized learning path planning and progress
                      management
                    </p>
                  </div>

                  <div
                    className="p-4 bg-white rounded-xl shadow-md border border-gray-200/50 hover:shadow-lg transition-all duration-300 transform hover:scale-105 cursor-pointer"
                    onClick={() =>
                      setInputValue(
                        "Create a document summarization tool that can quickly extract key information from long documents and generate structured summaries. It should support multiple document formats and identify important paragraphs, key data, and core viewpoints.",
                      )
                    }
                  >
                    <h4
                      className="text-base font-semibold text-gray-800 mb-3"
                      style={{ fontFamily: "Inter" }}
                    >
                      Document Summarization Tool
                    </h4>
                    <p
                      className="text-gray-600 text-sm"
                      style={{ fontFamily: "Inter" }}
                    >
                      Intelligent document analysis and key information
                      extraction
                    </p>
                  </div>

                  <div
                    className="p-4 bg-white rounded-xl shadow-md border border-gray-200/50 hover:shadow-lg transition-all duration-300 transform hover:scale-105 cursor-pointer"
                    onClick={() =>
                      setInputValue(
                        "Design a data analysis assistant that can help users analyze Excel spreadsheet data, automatically generate charts, discover data trends, and provide business insights. It should support various data visualization methods and statistical analysis techniques.",
                      )
                    }
                  >
                    <h4
                      className="text-base font-semibold text-gray-800 mb-3"
                      style={{ fontFamily: "Inter" }}
                    >
                      Data Analysis Assistant
                    </h4>
                    <p
                      className="text-gray-600 text-sm"
                      style={{ fontFamily: "Inter" }}
                    >
                      Automated data processing and visualization analysis
                    </p>
                  </div>

                  <div
                    className="p-4 bg-white rounded-xl shadow-md border border-gray-200/50 hover:shadow-lg transition-all duration-300 transform hover:scale-105 cursor-pointer"
                    onClick={() =>
                      setInputValue(
                        "I need a creative writing assistant that can generate high-quality copy content based on given topics, styles, target audiences, and other requirements. It should include various types like advertising copy, social media content, product descriptions, etc.",
                      )
                    }
                  >
                    <h4
                      className="text-base font-semibold text-gray-800 mb-3"
                      style={{ fontFamily: "Inter" }}
                    >
                      Creative Writing Assistant
                    </h4>
                    <p
                      className="text-gray-600 text-sm"
                      style={{ fontFamily: "Inter" }}
                    >
                      Diverse copywriting and content generation
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Step indicator */}
          <div className="mb-3 p-4 bg-gradient-to-br from-white to-indigo-50/50 rounded-2xl shadow-lg border border-indigo-200/30 backdrop-blur-sm">
            <Steps
              current={getCurrentStepIndex()}
              size="small"
              className="px-2 step-indicator-custom"
            >
              <Step
                title={getProductStepName("structure")}
                className="text-sm font-medium"
              />
              <Step
                title={getProductStepName("analysis")}
                className="text-sm font-medium"
              />
              <Step
                title={getProductStepName("generation")}
                className="text-sm font-medium"
              />
              <Step
                title={getProductStepName("optimization")}
                className="text-sm font-medium"
              />
              <Step
                title={getProductStepName("testing")}
                className="text-sm font-medium"
              />
            </Steps>
          </div>

          {/* Dashboard position */}
          <div className="flex-1 mb-2 overflow-y-auto bg-gradient-to-br from-gray-50/50 to-indigo-50/30 rounded-2xl shadow-lg border border-indigo-200/50 backdrop-blur-sm">
            <div className="p-6 h-[calc(100vh-300px)] ">
              {messages.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center p-10 bg-gradient-to-br from-indigo-50/80 to-purple-50/80 rounded-2xl w-3/4 max-w-lg shadow-xl border border-indigo-200/50 backdrop-blur-sm">
                    <div className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg">
                      <span className="text-2xl">💬</span>
                    </div>
                    <Text
                      className="text-gray-700 block mb-3 font-semibold text-lg"
                      style={{ fontFamily: "Inter" }}
                    >
                      Start a new conversation
                    </Text>
                    <Text
                      className="text-gray-600 text-sm"
                      style={{ fontFamily: "Inter" }}
                    >
                      Enter your prompt to start your optimization journey
                    </Text>
                  </div>
                </div>
              ) : (
                <div className="space-y-8 w-full">
                  {messages.map((msg, index) => (
                    <div
                      key={index}
                      className={`flex ${
                        msg.type === "user" ? "justify-end" : "justify-start"
                      }`}
                    >
                      <div
                        className={`max-w-[85%] p-6 rounded-2xl shadow-xl border backdrop-blur-sm transition-all duration-300 hover:shadow-2xl ${
                          msg.type === "user"
                            ? "bg-gradient-to-br from-cyan-400 to-blue-500 text-white border-cyan-300/30 rounded-br-md"
                            : "bg-gradient-to-br from-white/90 to-indigo-50/30 text-gray-800 border-indigo-200/50 rounded-bl-md"
                        } break-words ${
                          (msg.type === "system" || msg.type === "assistant") &&
                          index === messages.length - 1
                            ? "mb-6"
                            : ""
                        } ${editingIndex === index ? "min-w-[85%]" : ""}`}
                        style={{ fontFamily: "Inter" }}
                      >
                        {/* Edit button or Exit button */}
                        {isMessageEditable(msg, index) && (
                          <div className="flex justify-end mb-2">
                            {editingIndex === index ? (
                              <Button
                                size="small"
                                type="text"
                                onClick={handleEditCancel}
                                className="text-blue-500 hover:text-blue-700"
                              >
                                Exit
                              </Button>
                            ) : (
                              <Button
                                size="small"
                                type="text"
                                onClick={() =>
                                  handleEditStart(
                                    index,
                                    msg.content,
                                    msg.isAnalysis,
                                  )
                                }
                                className="text-blue-500 hover:text-blue-700"
                              >
                                Edit
                              </Button>
                            )}
                          </div>
                        )}

                        <div className="prose max-w-none w-full">
                          {editingIndex !== index &&
                          msg.metadata &&
                          msg.metadata.selected_template ? (
                            <div className="mb-4 p-4 rounded-xl border border-slate-200 bg-white/80">
                              <div className="text-sm font-medium text-slate-700">
                                Prompt Template
                              </div>
                              <div className="text-sm text-slate-600 mt-1">
                                Selected:{" "}
                                <span className="font-medium text-slate-800">
                                  {msg.metadata.selected_template?.name ||
                                    msg.metadata.selected_template?.template_key ||
                                    "Unknown"}
                                </span>
                              </div>
                              {Array.isArray(msg.metadata.template_candidates) &&
                              msg.metadata.template_candidates.length > 0 ? (
                                <div className="text-xs text-slate-500 mt-2 leading-relaxed">
                                  Candidates:{" "}
                                  {msg.metadata.template_candidates
                                    .map((t: any) => t?.name || t?.template_key)
                                    .filter(Boolean)
                                    .join(" · ")}
                                </div>
                              ) : null}
                            </div>
                          ) : null}
                          {editingIndex === index ? (
                            <div className="space-y-3 w-full">
                              <div className="border border-gray-300 rounded-lg overflow-hidden w-full">
                                <div className="p-4 w-full">
                                  {isSegmentedEdit ? (
                                    <div className="space-y-4">
                                      <div className="text-sm text-gray-600 mb-4">
                                        Segmented editing mode: Each paragraph
                                        can be edited independently
                                      </div>
                                      {editingParagraphs.map(
                                        (
                                          paragraph: EditingParagraph,
                                          pIndex,
                                        ) => (
                                          <div
                                            key={pIndex}
                                            className="border border-gray-200 rounded-lg"
                                          >
                                            {/* Agent来源标识 */}
                                            <div className="px-3 py-2 bg-blue-50 border-b border-gray-200 rounded-t-lg">
                                              <span className="inline-block bg-blue-100 text-blue-800 text-xs font-medium px-2 py-1 rounded-full">
                                                {paragraph.agentName || "User"}
                                              </span>
                                            </div>
                                            <div className="p-3">
                                              <TextArea
                                                value={paragraph.content || ""}
                                                onChange={(e) => {
                                                  const newParagraphs = [
                                                    ...editingParagraphs,
                                                  ];
                                                  newParagraphs[pIndex] = {
                                                    ...newParagraphs[pIndex],
                                                    content: e.target.value,
                                                  };
                                                  setEditingParagraphs(
                                                    newParagraphs,
                                                  );
                                                }}
                                                autoSize={{
                                                  minRows: 3,
                                                  maxRows: 10,
                                                }}
                                                className="w-full border-0 resize-none focus:outline-none focus:ring-0"
                                                placeholder="Edit this paragraph..."
                                                style={{
                                                  boxShadow: "none",
                                                  fontSize: "14px",
                                                  lineHeight: "1.6",
                                                }}
                                              />
                                            </div>
                                          </div>
                                        ),
                                      )}
                                      <div className="flex justify-center">
                                        <Button
                                          type="dashed"
                                          onClick={() =>
                                            setEditingParagraphs([
                                              ...editingParagraphs,
                                              {
                                                agentName: "User",
                                                content: "",
                                              },
                                            ])
                                          }
                                          className="text-blue-600 border-blue-300 hover:border-blue-500"
                                        >
                                          + Add a new paragraph
                                        </Button>
                                      </div>
                                    </div>
                                  ) : (
                                    <TextArea
                                      value={editingContent}
                                      onChange={(e) =>
                                        setEditingContent(e.target.value)
                                      }
                                      autoSize={{ minRows: 8, maxRows: 20 }}
                                      className="w-full border-0 resize-none focus:outline-none focus:ring-0"
                                      placeholder="Supports Markdown format..."
                                      style={{
                                        boxShadow: "none",
                                        fontSize: "14px",
                                        lineHeight: "1.6",
                                        fontFamily:
                                          'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace',
                                      }}
                                    />
                                  )}
                                </div>
                              </div>
                              <div className="flex justify-end space-x-2">
                                <Button size="small" onClick={handleEditCancel}>
                                  Cancel
                                </Button>
                                <Button
                                  size="small"
                                  type="primary"
                                  onClick={() => handleEditSave(index)}
                                >
                                  Save
                                </Button>
                              </div>
                            </div>
                          ) : msg.isTestResult ? (
                            <div className="space-y-4">
                              {/* Display the content of the test cases */}
                              {typeof msg.content === "object" &&
                                msg.content.test_case && (
                                  <div className="bg-gradient-to-br from-white to-green-50/30 rounded-xl p-4 border border-green-200/50 shadow-sm">
                                    <div className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
                                      <span className="inline-block w-2 h-2 bg-green-500 rounded-full"></span>
                                      Test Case
                                    </div>
                                    <div className="text-sm text-gray-800 leading-relaxed">
                                      <ReactMarkdown>
                                        {msg.content.test_case}
                                      </ReactMarkdown>
                                    </div>
                                  </div>
                                )}

                              {/* Display the Test result content of version 2 */}
                              <div className="bg-gradient-to-br from-white to-indigo-50/30 rounded-xl p-4 border border-indigo-200/50 shadow-sm">
                                <div className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
                                  <span className="inline-block w-2 h-2 bg-indigo-500 rounded-full"></span>
                                  Response result of the LLM
                                </div>
                                <div className="text-sm text-gray-800 leading-relaxed">
                                  <ReactMarkdown>
                                    {typeof msg.content === "object" &&
                                    msg.content.optimized_result
                                      ? msg.content.optimized_result
                                      : typeof msg.content === "string"
                                      ? msg.content
                                      : "No test result available"}
                                  </ReactMarkdown>
                                </div>
                              </div>

                              {/* The "View" button has the same style as "ThinkingProcess". */}
                              <Button
                                type="text"
                                icon={<EyeOutlined />}
                                onClick={() =>
                                  handleTestResultClick(msg.content)
                                }
                                className="transition-all duration-200 hover:bg-slate-50 border border-slate-200 hover:border-slate-300 rounded-lg"
                                style={{
                                  padding: "10px 16px",
                                  height: "auto",
                                  fontSize: "14px",
                                  color: "#475569",
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "8px",
                                  fontFamily: "Inter, sans-serif",
                                  fontWeight: "500",
                                  background: "#ffffff",
                                  boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
                                }}
                              >
                                <span
                                  style={{
                                    color: "#475569",
                                    fontWeight: "500",
                                  }}
                                >
                                  Click to view the effect comparison
                                </span>
                              </Button>
                            </div>
                          ) : msg.isAnalysis ? (
                            <AnalysisDisplay
                              analysisData={msg.metadata?.analysisData}
                              content={
                                typeof msg.content === "string"
                                  ? msg.content
                                  : JSON.stringify(msg.content, null, 2)
                              }
                            />
                          ) : (
                            <pre className="text-sm whitespace-pre-wrap">
                              {typeof msg.content === "string"
                                ? msg.content
                                : JSON.stringify(msg.content, null, 2)}
                            </pre>
                          )}
                        </div>

                        {/* Thought process display */}
                        {(msg.type === "system" || msg.type === "assistant") &&
                          msg.thinking && (
                            <div className="mt-3">
                              <ThinkingProcess thinking={msg.thinking} />
                            </div>
                          )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {loading && (
                <div className="flex justify-center py-6">
                  <Spin size="large" spinning={true} />
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* input area */}
          {currentStep !== "testing" && (
            <div className="mt-1 bg-gradient-to-br from-white/90 to-indigo-50/50 p-4 rounded-2xl shadow-xl border border-indigo-200/50 backdrop-blur-sm">
              {messages.length > 0 &&
              (messages[messages.length - 1].type === "system" ||
                messages[messages.length - 1].type === "assistant") &&
              !loading ? (
                <div className="space-y-3">
                  {!messages[messages.length - 1].needsSupplement ? (
                    <>
                      <div className="space-y-3">
                        <TextArea
                          value={feedbackValue}
                          onChange={(e) => setFeedbackValue(e.target.value)}
                          placeholder={
                            loading
                              ? ""
                              : currentStep === "testing"
                              ? "No input is required during the testing stage"
                              : "Please enter your feedback..."
                          }
                          autoSize={{ minRows: 3, maxRows: 5 }}
                          className="rounded-xl border-indigo-300/50 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 transition-all duration-300 shadow-md hover:shadow-lg bg-gradient-to-br from-white to-indigo-50/50"
                          disabled={currentStep === "testing"}
                        />
                        <Space
                          wrap
                          className="flex flex-wrap gap-2 mt-3 justify-end"
                        >
                          {currentStep === "generation" &&
                          lastTemplateMetadata &&
                          lastTemplateMetadata.selected_template ? (
                            <div className="flex-1 text-xs text-gray-600 flex items-center">
                              <span className="mr-2">
                                Candidates:{" "}
                                {Array.isArray(
                                  lastTemplateMetadata.template_candidates,
                                )
                                  ? lastTemplateMetadata.template_candidates
                                      .length
                                  : 0}
                              </span>
                              <span className="truncate">
                                Selected:{" "}
                                {lastTemplateMetadata.selected_template?.name ||
                                  lastTemplateMetadata.selected_template
                                    ?.template_key ||
                                  "Unknown"}
                              </span>
                            </div>
                          ) : null}
                          {currentStep === "generation" && (
                            <Button
                              type="default"
                              icon={<RedoOutlined />}
                              onClick={openTemplateModal}
                              disabled={loading}
                              className="border-gray-500 text-gray-600 shadow-xl hover:shadow-2xl flex items-center transition-all duration-300 transform hover:scale-105 bg-gradient-to-r from-gray-50 to-gray-100 rounded-xl"
                              size="large"
                            >
                              Reselect Template
                            </Button>
                          )}
                          <Button
                            danger
                            icon={<CloseOutlined />}
                            onClick={() => handleSendFeedback("no")}
                            disabled={getFeedbackButtonDisabled("no")}
                            className={`border-red-500 text-red-500 shadow-xl hover:shadow-2xl flex items-center transition-all duration-300 transform hover:scale-105 bg-gradient-to-r from-red-50 to-pink-50 rounded-xl ${
                              !getFeedbackButtonDisabled("no")
                                ? "hover:from-red-100 hover:to-pink-100 hover:border-red-600 hover:text-red-600"
                                : ""
                            }`}
                            size="large"
                          >
                            Feedback
                          </Button>
                          <Button
                            type="primary"
                            icon={<CheckOutlined />}
                            onClick={() => handleSendFeedback("yes")}
                            disabled={getFeedbackButtonDisabled("yes")}
                            className={`!bg-gradient-to-r !from-indigo-500 !to-purple-600 border-none shadow-xl hover:shadow-2xl flex items-center transition-all duration-300 transform hover:scale-105 rounded-xl ${
                              !getFeedbackButtonDisabled("yes")
                                ? "hover:!from-indigo-600 hover:!to-purple-700"
                                : ""
                            }`}
                            size="large"
                          >
                            Accept
                          </Button>
                        </Space>
                      </div>
                    </>
                  ) : (
                    <>
                      <TextArea
                        value={feedbackValue}
                        onChange={(e) => setFeedbackValue(e.target.value)}
                        placeholder={
                          loading
                            ? ""
                            : currentStep === "testing"
                            ? "No input is required during the testing stage"
                            : "Please provide additional information..."
                        }
                        autoSize={{ minRows: 3, maxRows: 5 }}
                        className="rounded-lg border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all duration-200"
                        disabled={currentStep === "testing"}
                      />
                      <Button
                        type="primary"
                        onClick={() => handleSendFeedback("supplement")}
                        disabled={
                          !feedbackValue.trim() || currentStep === "testing"
                        }
                        className={`mt-3 float-right bg-gradient-to-r from-indigo-500 to-purple-600 border-none shadow-xl hover:shadow-2xl transition-all duration-300 transform hover:scale-105 rounded-xl ${
                          !(!feedbackValue.trim() || currentStep === "testing")
                            ? "hover:from-indigo-600 hover:to-purple-700"
                            : ""
                        }`}
                        size="large"
                      >
                        Send
                      </Button>
                    </>
                  )}
                </div>
              ) : (
                <>
                  {currentStep !== "testing" && (
                    <>
                      {hasError ? (
                        <div className="rounded-xl border-red-300/50 focus:border-red-500 focus:ring-2 focus:ring-red-200 transition-all duration-300 shadow-md hover:shadow-lg bg-gradient-to-br from-red-50 to-red-100/50 p-4 min-h-[80px] flex items-center">
                          <span className="text-red-600 text-sm">
                            ❌{" "}
                            {errorMessage || "Request failed, please try again"}
                          </span>
                        </div>
                      ) : (
                        <TextArea
                          value={inputValue}
                          onChange={(e) => setInputValue(e.target.value)}
                          placeholder={
                            loading
                              ? ""
                              : `Please enter "${getStepName()}" content...`
                          }
                          autoSize={{ minRows: 3, maxRows: 5 }}
                          onKeyPress={handleKeyPress}
                          disabled={loading}
                          className="rounded-xl border-indigo-300/50 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 transition-all duration-300 shadow-md hover:shadow-lg bg-gradient-to-br from-white to-indigo-50/50"
                        />
                      )}

                      <Button
                        type="primary"
                        icon={
                          loading ? (
                            <Spin size="small" />
                          ) : hasError ? (
                            <RedoOutlined />
                          ) : (
                            <SendOutlined />
                          )
                        }
                        onClick={hasError ? onRetry : handleSend}
                        className={`mt-3 float-right ${
                          hasError
                            ? "bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700"
                            : "bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700"
                        } border-none shadow-xl hover:shadow-2xl transition-all duration-300 transform hover:scale-105 rounded-xl`}
                        disabled={
                          hasError ? false : !inputValue.trim() || loading
                        }
                        size="large"
                      >
                        {loading ? "Sending..." : hasError ? "Retry" : "Send"}
                      </Button>
                    </>
                  )}
                </>
              )}
            </div>
          )}

          <Modal
            title="Select a prompt template"
            open={templateModalOpen}
            onCancel={() => setTemplateModalOpen(false)}
            onOk={regenerateWithTemplate}
            confirmLoading={templateLoading}
            okButtonProps={{ disabled: !selectedTemplateKey }}
            destroyOnClose
          >
            {templateLoading ? (
              <div className="flex justify-center py-8">
                <Spin />
              </div>
            ) : (
              <Radio.Group
                value={selectedTemplateKey}
                onChange={(e) => setSelectedTemplateKey(e.target.value)}
                className="w-full"
              >
                <Space direction="vertical" className="w-full">
                  {availableTemplates.map((t) => (
                    <Radio key={t.template_key} value={t.template_key}>
                      <div className="ml-2">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900">
                            {t.name}
                          </span>
                          {t.is_custom ? (
                            <span className="px-2 py-0.5 text-xs bg-blue-100 text-blue-600 rounded">
                              Custom
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded">
                              Preset
                            </span>
                          )}
                        </div>
                        {t.description ? (
                          <div className="text-xs text-gray-500 mt-1">
                            {t.description}
                          </div>
                        ) : null}
                      </div>
                    </Radio>
                  ))}
                </Space>
              </Radio.Group>
            )}
          </Modal>

          {/* Compare the modal box */}
          <Modal
            title={
              <div className="text-center">
                <button
                  type="button"
                  onClick={openDiffModal}
                  className="group mx-auto inline-flex flex-col items-center gap-1 rounded-xl px-3 py-1.5 hover:bg-indigo-50/60 focus:outline-none focus:ring-2 focus:ring-indigo-400/40"
                >
                  <div className="text-2xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
                    🪄 Effect Comparison
                  </div>
                  <div className="text-xs text-gray-500 group-hover:text-indigo-600">
                    Click to analyze result differences
                  </div>
                </button>
              </div>
            }
            open={isModalVisible}
            onCancel={() => setIsModalVisible(false)}
            footer={null}
            width="92vw"
            style={{ top: 10 }}
            className="comparison-modal"
            maskClosable={false}
            styles={{
              body: {
                padding: "20px",
                maxHeight: "88vh",
                overflowY: "auto",
                background: "linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)",
              },
              header: {
                background: "linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)",
                borderBottom: "1px solid #e2e8f0",
                padding: "20px 24px",
              },
            }}
          >
            {comparisonData && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 h-full">
                {/* The version on the left */}
                <div className="bg-white/90 backdrop-blur-sm border border-indigo-200/60 rounded-3xl shadow-xl hover:shadow-2xl transition-all duration-500 relative overflow-hidden">
                  {/* Decorative gradient bar */}
                  <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-600"></div>
                  {/* Version Navigation */}
                  <div className="flex items-center justify-between p-5 border-b border-indigo-100/60 bg-gradient-to-r from-blue-50/60 to-indigo-50/60">
                    <Button
                      type="text"
                      icon={<LeftOutlined />}
                      disabled={comparisonData.currentLeftIndex === 0}
                      onClick={() => navigateVersion("left", "left")}
                      size="large"
                      className="hover:bg-indigo-100/60 rounded-xl transition-all duration-300 hover:scale-105 disabled:opacity-40"
                    />
                    <div className="text-center">
                      <div className="text-sm font-medium text-gray-600">
                        {editingVersionName?.side === "left" ? (
                          <div className="flex items-center gap-1">
                            <Input
                              size="small"
                              value={editingVersionName.value}
                              onChange={(e) =>
                                setEditingVersionName({
                                  ...editingVersionName,
                                  value: e.target.value,
                                })
                              }
                              onPressEnter={saveVersionName}
                              style={{ width: "120px", fontSize: "12px" }}
                              placeholder="Enter version name"
                              autoFocus
                            />
                            <Button
                              size="middle"
                              type="text"
                              icon={<CheckOutlined />}
                              onClick={saveVersionName}
                            />
                            <Button
                              size="middle"
                              type="text"
                              icon={<CloseOutlined />}
                              onClick={cancelEditingVersionName}
                            />
                          </div>
                        ) : (
                          <div className="flex items-center gap-1">
                            <div
                              className="cursor-pointer hover:text-blue-600 flex items-center gap-1"
                              onClick={() => startEditingVersionName("left")}
                            >
                              {comparisonData.versions[
                                comparisonData.currentLeftIndex
                              ]?.version_name ||
                                `Version ${
                                  comparisonData.currentLeftIndex + 1
                                }`}
                              <EditOutlined
                                style={{ fontSize: "10px", opacity: 0.6 }}
                              />
                            </div>
                            {comparisonData.versions.length > 1 &&
                              comparisonData.versions[
                                comparisonData.currentLeftIndex
                              ]?.id > 2 && (
                                <Button
                                  size="middle"
                                  type="text"
                                  danger
                                  onClick={() =>
                                    deleteVersion(
                                      comparisonData.versions[
                                        comparisonData.currentLeftIndex
                                      ]?.id,
                                    )
                                  }
                                  style={{
                                    fontSize: "12px",
                                    padding: "2px 6px",
                                    height: "20px",
                                    minWidth: "20px",
                                  }}
                                >
                                  ×
                                </Button>
                              )}
                          </div>
                        )}
                      </div>
                      <div className="text-xs text-gray-400">
                        {comparisonData.versions[
                          comparisonData.currentLeftIndex
                        ]?.isOriginal
                          ? "Original"
                          : comparisonData.versions[
                              comparisonData.currentLeftIndex
                            ]?.isOptimized
                          ? "Optimized"
                          : "Modified"}
                      </div>
                    </div>
                    <Button
                      type="text"
                      icon={<RightOutlined />}
                      disabled={
                        comparisonData.currentLeftIndex ===
                        comparisonData.versions.length - 1
                      }
                      onClick={() => navigateVersion("right", "left")}
                      size="large"
                      className="hover:bg-indigo-100/60 rounded-xl transition-all duration-300 hover:scale-105 disabled:opacity-40"
                    />
                  </div>

                  <Collapse
                    size="small"
                    className="border-0 bg-transparent"
                    expandIcon={() => null}
                    onChange={(keys) =>
                      setCollapsedPanels((prev) => ({
                        ...prev,
                        "1": !keys.includes("1"),
                      }))
                    }
                    items={[
                      {
                        key: "1",
                        label: (
                          <div className="flex items-center gap-4">
                            <div
                              className="w-10 h-10 bg-gradient-to-br from-blue-500 via-indigo-500 to-purple-600 rounded-xl flex items-center justify-center cursor-pointer relative shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105"
                              onClick={(e) => {
                                e.stopPropagation();
                                const collapse =
                                  e.currentTarget.closest(".ant-collapse");
                                const panel =
                                  collapse?.querySelector(".ant-collapse-item");
                                if (panel) {
                                  const header = panel.querySelector(
                                    ".ant-collapse-header",
                                  );
                                  if (header) {
                                    (header as HTMLElement).click();
                                  }
                                }
                              }}
                            >
                              <span className="text-white text-base font-bold">
                                P
                              </span>
                              <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-white rounded-full flex items-center justify-center shadow-md border border-gray-100">
                                {collapsedPanels["1"] ? (
                                  <DownOutlined className="text-xs text-gray-600" />
                                ) : (
                                  <UpOutlined className="text-xs text-gray-600" />
                                )}
                              </div>
                            </div>
                            <h5 className="text-xl font-bold text-gray-800 m-0 tracking-wide">
                              Prompt
                            </h5>
                          </div>
                        ),
                        children: (
                          <div className="px-5 pb-5">
                            <div
                              className="bg-gradient-to-br from-white via-blue-50/20 to-indigo-50/40 border border-blue-200/60 rounded-2xl p-5 text-sm leading-relaxed overflow-y-auto shadow-inner whitespace-pre-wrap hover:shadow-lg transition-shadow duration-300"
                              style={{
                                height: getAdaptiveHeight("1", "2"),
                                minHeight: "120px",
                              }}
                            >
                              {comparisonData.versions[
                                comparisonData.currentLeftIndex
                              ]?.prompt || ""}
                            </div>
                          </div>
                        ),
                      },
                    ]}
                    defaultActiveKey={["1"]}
                  />

                  <Collapse
                    size="small"
                    className="border-0 bg-transparent"
                    expandIcon={() => null}
                    onChange={(keys) =>
                      setCollapsedPanels((prev) => ({
                        ...prev,
                        "2": !keys.includes("2"),
                      }))
                    }
                    items={[
                      {
                        key: "2",
                        label: (
                          <div className="flex items-center gap-4">
                            <div
                              className="w-10 h-10 bg-gradient-to-br from-emerald-500 via-green-500 to-teal-600 rounded-xl flex items-center justify-center cursor-pointer relative shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105"
                              onClick={(e) => {
                                e.stopPropagation();
                                const collapse =
                                  e.currentTarget.closest(".ant-collapse");
                                const panel =
                                  collapse?.querySelector(".ant-collapse-item");
                                if (panel) {
                                  const header = panel.querySelector(
                                    ".ant-collapse-header",
                                  );
                                  if (header) {
                                    (header as HTMLElement).click();
                                  }
                                }
                              }}
                            >
                              <span className="text-white text-base font-bold">
                                💬
                              </span>
                              <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-white rounded-full flex items-center justify-center shadow-md border border-gray-100">
                                {collapsedPanels["2"] ? (
                                  <DownOutlined className="text-xs text-gray-600" />
                                ) : (
                                  <UpOutlined className="text-xs text-gray-600" />
                                )}
                              </div>
                            </div>
                            <h5 className="text-xl font-bold text-gray-800 m-0 tracking-wide">
                              Test
                            </h5>
                          </div>
                        ),
                        children: (
                          <div className="px-5 pb-5">
                            <div className="rounded-2xl overflow-hidden shadow-lg border border-emerald-100/50">
                              <ChatTestWindow
                                sessionId={sessionId}
                                versionNumber={
                                  comparisonData.versions[
                                    comparisonData.currentLeftIndex
                                  ]?.id || 1
                                }
                                height={getAdaptiveHeight("2", "1")}
                                className="shadow-inner"
                              />
                            </div>
                          </div>
                        ),
                      },
                    ]}
                    defaultActiveKey={["2"]}
                  />
                </div>

                {/* The version on the right */}
                <div className="bg-white/90 backdrop-blur-sm border border-purple-200/60 rounded-3xl shadow-xl hover:shadow-2xl transition-all duration-500 relative overflow-hidden">
                  {/* Decorative gradient bar */}
                  <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-purple-500 via-pink-500 to-rose-600"></div>
                  {/* Version Navigation */}
                  <div className="flex items-center justify-between p-5 border-b border-purple-100/60 bg-gradient-to-r from-purple-50/60 to-pink-50/60">
                    <Button
                      type="text"
                      icon={<LeftOutlined />}
                      disabled={comparisonData.currentRightIndex === 0}
                      onClick={() => navigateVersion("left", "right")}
                      size="large"
                      className="hover:bg-purple-100/60 rounded-xl transition-all duration-300 hover:scale-105 disabled:opacity-40"
                    />
                    <div className="text-center">
                      <div className="text-sm font-medium text-gray-600">
                        {editingVersionName?.side === "right" ? (
                          <div className="flex items-center gap-1">
                            <Input
                              size="small"
                              value={editingVersionName.value}
                              onChange={(e) =>
                                setEditingVersionName({
                                  ...editingVersionName,
                                  value: e.target.value,
                                })
                              }
                              onPressEnter={saveVersionName}
                              style={{ width: "120px", fontSize: "12px" }}
                              placeholder="Enter version name"
                              autoFocus
                            />
                            <Button
                              size="middle"
                              type="text"
                              icon={<CheckOutlined />}
                              onClick={saveVersionName}
                            />
                            <Button
                              size="middle"
                              type="text"
                              icon={<CloseOutlined />}
                              onClick={cancelEditingVersionName}
                            />
                          </div>
                        ) : (
                          <div className="flex items-center gap-1">
                            <div
                              className="cursor-pointer hover:text-blue-600 flex items-center gap-1"
                              onClick={() => startEditingVersionName("right")}
                            >
                              {comparisonData.versions[
                                comparisonData.currentRightIndex
                              ]?.version_name ||
                                `Version ${
                                  comparisonData.currentRightIndex + 1
                                }`}
                              <EditOutlined
                                style={{ fontSize: "10px", opacity: 0.6 }}
                              />
                            </div>
                            {comparisonData.versions.length > 1 &&
                              comparisonData.versions[
                                comparisonData.currentRightIndex
                              ]?.id > 2 && (
                                <Button
                                  size="middle"
                                  type="text"
                                  danger
                                  onClick={() =>
                                    deleteVersion(
                                      comparisonData.versions[
                                        comparisonData.currentRightIndex
                                      ]?.id,
                                    )
                                  }
                                  style={{
                                    fontSize: "12px",
                                    padding: "2px 6px",
                                    height: "20px",
                                    minWidth: "20px",
                                  }}
                                >
                                  ×
                                </Button>
                              )}
                          </div>
                        )}
                      </div>
                      <div className="text-xs text-gray-400">
                        {comparisonData.versions[
                          comparisonData.currentRightIndex
                        ]?.isOriginal
                          ? "Original"
                          : comparisonData.versions[
                              comparisonData.currentRightIndex
                            ]?.isOptimized
                          ? "Optimized"
                          : "Modified"}
                      </div>
                    </div>
                    <Button
                      type="text"
                      icon={<RightOutlined />}
                      disabled={
                        comparisonData.currentRightIndex ===
                        comparisonData.versions.length - 1
                      }
                      onClick={() => navigateVersion("right", "right")}
                      size="large"
                      className="hover:bg-purple-100/60 rounded-xl transition-all duration-300 hover:scale-105 disabled:opacity-40"
                    />
                  </div>

                  <Collapse
                    size="small"
                    className="border-0 bg-transparent"
                    expandIcon={() => null}
                    onChange={(keys) =>
                      setCollapsedPanels((prev) => ({
                        ...prev,
                        "3": !keys.includes("3"),
                      }))
                    }
                    items={[
                      {
                        key: "3",
                        label: (
                          <div className="flex items-center gap-4">
                            <div
                              className="w-10 h-10 bg-gradient-to-br from-purple-500 via-pink-500 to-rose-600 rounded-xl flex items-center justify-center cursor-pointer relative shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105"
                              onClick={(e) => {
                                e.stopPropagation();
                                const collapse =
                                  e.currentTarget.closest(".ant-collapse");
                                const panel =
                                  collapse?.querySelector(".ant-collapse-item");
                                if (panel) {
                                  const header = panel.querySelector(
                                    ".ant-collapse-header",
                                  );
                                  if (header) {
                                    (header as HTMLElement).click();
                                  }
                                }
                              }}
                            >
                              <span className="text-white text-base font-bold">
                                P
                              </span>
                              <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-white rounded-full flex items-center justify-center shadow-md border border-gray-100">
                                {collapsedPanels["3"] ? (
                                  <DownOutlined className="text-xs text-gray-600" />
                                ) : (
                                  <UpOutlined className="text-xs text-gray-600" />
                                )}
                              </div>
                            </div>
                            <h5 className="text-xl font-bold text-gray-800 m-0 tracking-wide">
                              Prompt
                            </h5>
                          </div>
                        ),
                        extra: !isEditingPrompt ? (
                          <Button
                            type="text"
                            icon={<EditOutlined />}
                            onClick={(e) => {
                              e.stopPropagation();
                              startEditingPrompt();
                            }}
                            size="middle"
                            title="Edit Prompt"
                            className="hover:bg-purple-100/60 rounded-xl transition-all duration-300 hover:scale-105"
                          />
                        ) : null,
                        children: (
                          <div className="px-5 pb-5">
                            {isEditingPrompt ? (
                              <div className="space-y-4">
                                <Input.TextArea
                                  value={editingPromptContent}
                                  onChange={(e) =>
                                    setEditingPromptContent(e.target.value)
                                  }
                                  rows={8}
                                  className="text-sm border-purple-200/60 focus:border-purple-400 rounded-2xl shadow-sm hover:shadow-md transition-shadow duration-300"
                                  style={{
                                    height: getAdaptiveHeight("3", "4"),
                                    minHeight: "120px",
                                  }}
                                />
                                <div className="flex justify-end gap-3">
                                  <Button
                                    size="small"
                                    onClick={cancelEditingPrompt}
                                    className="rounded-xl hover:scale-105 transition-all duration-300"
                                  >
                                    Cancel
                                  </Button>
                                  <Button
                                    type="primary"
                                    size="small"
                                    icon={<CheckOutlined />}
                                    loading={isTestingPrompt}
                                    onClick={saveEditedPrompt}
                                    className="bg-gradient-to-r from-purple-500 via-pink-500 to-rose-600 border-0 rounded-xl hover:from-purple-600 hover:to-pink-700 hover:scale-105 transition-all duration-300 shadow-lg"
                                  >
                                    Save Version
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <div>
                                <div
                                  className="bg-gradient-to-br from-white via-purple-50/20 to-pink-50/40 border border-purple-200/60 rounded-2xl p-5 text-sm leading-relaxed overflow-y-auto shadow-inner whitespace-pre-wrap hover:shadow-lg transition-shadow duration-300"
                                  style={{
                                    height: getAdaptiveHeight("3", "4"),
                                    minHeight: "120px",
                                  }}
                                >
                                  {comparisonData.versions[
                                    comparisonData.currentRightIndex
                                  ]?.prompt || ""}
                                </div>
                              </div>
                            )}
                          </div>
                        ),
                      },
                    ]}
                    defaultActiveKey={["3"]}
                  />

                  <Collapse
                    size="small"
                    className="border-0 bg-transparent"
                    expandIcon={() => null}
                    onChange={(keys) =>
                      setCollapsedPanels((prev) => ({
                        ...prev,
                        "4": !keys.includes("4"),
                      }))
                    }
                    items={[
                      {
                        key: "4",
                        label: (
                          <div className="flex items-center gap-4">
                            <div
                              className="w-10 h-10 bg-gradient-to-br from-orange-500 via-red-500 to-pink-600 rounded-xl flex items-center justify-center cursor-pointer relative shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105"
                              onClick={(e) => {
                                e.stopPropagation();
                                const collapse =
                                  e.currentTarget.closest(".ant-collapse");
                                const panel =
                                  collapse?.querySelector(".ant-collapse-item");
                                if (panel) {
                                  const header = panel.querySelector(
                                    ".ant-collapse-header",
                                  );
                                  if (header) {
                                    (header as HTMLElement).click();
                                  }
                                }
                              }}
                            >
                              <span className="text-white text-base font-bold">
                                💬
                              </span>
                              <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-white rounded-full flex items-center justify-center shadow-md border border-gray-100">
                                {collapsedPanels["4"] ? (
                                  <DownOutlined className="text-xs text-gray-600" />
                                ) : (
                                  <UpOutlined className="text-xs text-gray-600" />
                                )}
                              </div>
                            </div>
                            <h5 className="text-xl font-bold text-gray-800 m-0 tracking-wide">
                              Test
                            </h5>
                          </div>
                        ),
                        children: (
                          <div className="px-5 pb-5">
                            <div className="rounded-2xl overflow-hidden shadow-lg border border-orange-100/50">
                              <ChatTestWindow
                                sessionId={sessionId}
                                versionNumber={
                                  comparisonData.versions[
                                    comparisonData.currentRightIndex
                                  ]?.id || 1
                                }
                                height={getAdaptiveHeight("4", "3")}
                                className="shadow-inner"
                              />
                            </div>
                          </div>
                        ),
                      },
                    ]}
                    defaultActiveKey={["4"]}
                  />
                </div>
              </div>
              </div>
            )}
          </Modal>

          <Modal
            title={
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-lg font-semibold text-gray-900">
                    Analyze result differences
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    Pick message ranges on both sides, then generate an
                    explanation.
                  </div>
                </div>
              </div>
            }
            open={diffModalOpen}
            onCancel={() => setDiffModalOpen(false)}
            footer={null}
            width="92vw"
            style={{ top: 24, maxWidth: 1100 }}
            maskClosable={!diffLoading}
            className="diff-analysis-modal"
            styles={{
              body: {
                padding: "16px",
                background: "linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)",
              },
              header: {
                background: "linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)",
                borderBottom: "1px solid #e2e8f0",
                padding: "16px 20px",
              },
            }}
          >
            {!comparisonData ? null : (
              <div className="space-y-4">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="rounded-3xl border border-indigo-100 bg-white shadow-sm overflow-hidden">
                    <div className="px-4 py-3 bg-gradient-to-r from-indigo-50 to-blue-50 border-b border-indigo-100">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-gray-900 truncate">
                            {getVersionDisplayName(
                              comparisonData.versions[
                                comparisonData.currentLeftIndex
                              ],
                              comparisonData.currentLeftIndex,
                            )}
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            Selected {leftSelectedMessageIds.length} /{" "}
                            {leftHistoryMessages.length}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="small"
                            onClick={() =>
                              setLeftSelectedMessageIds(
                                leftHistoryMessages.map((m) => m.id),
                              )
                            }
                            disabled={
                              diffLoading || leftHistoryMessages.length === 0
                            }
                            className="rounded-lg"
                          >
                            Select all
                          </Button>
                          <Button
                            size="small"
                            onClick={() => setLeftSelectedMessageIds([])}
                            disabled={
                              diffLoading || leftHistoryMessages.length === 0
                            }
                            className="rounded-lg"
                          >
                            Clear
                          </Button>
                        </div>
                      </div>
                      <div className="text-xs text-gray-500 mt-2">
                        Click a message to include/exclude it.
                      </div>
                    </div>

                    <div className="p-3 max-h-[360px] overflow-y-auto space-y-2">
                      {leftHistoryMessages.length === 0 ? (
                        <div className="text-xs text-gray-500">
                          No test messages found.
                        </div>
                      ) : (
                        leftHistoryMessages.map((m) => {
                          const checked = leftSelectedMessageIds.includes(m.id);
                          const label =
                            m.message_type === "user" ? "User" : "Assistant";
                          const shortContent =
                            (m.content || "").length > 140
                              ? `${(m.content || "").slice(0, 140)}…`
                              : m.content || "";
                          return (
                            <div
                              key={m.id}
                              className={[
                                "flex gap-2 items-start rounded-2xl border px-3 py-2 cursor-pointer transition-colors",
                                checked
                                  ? "border-indigo-200 bg-indigo-50"
                                  : "border-gray-100 bg-white hover:bg-gray-50",
                                diffLoading ? "opacity-70" : "",
                              ].join(" ")}
                              onClick={() => {
                                setLeftSelectedMessageIds((prev) =>
                                  prev.includes(m.id)
                                    ? prev.filter((x) => x !== m.id)
                                    : [...prev, m.id],
                                );
                              }}
                            >
                              <Checkbox
                                checked={checked}
                                disabled={diffLoading}
                                onClick={(e) => e.stopPropagation()}
                                onChange={() => {
                                  setLeftSelectedMessageIds((prev) =>
                                    prev.includes(m.id)
                                      ? prev.filter((x) => x !== m.id)
                                      : [...prev, m.id],
                                  );
                                }}
                              />
                              <div className="min-w-0">
                                <div className="text-xs text-gray-600">
                                  {label} · #{m.message_order}
                                </div>
                                <div className="text-xs text-gray-900 whitespace-pre-wrap break-words">
                                  {shortContent}
                                </div>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>

                  <div className="rounded-3xl border border-purple-100 bg-white shadow-sm overflow-hidden">
                    <div className="px-4 py-3 bg-gradient-to-r from-purple-50 to-pink-50 border-b border-purple-100">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-gray-900 truncate">
                            {getVersionDisplayName(
                              comparisonData.versions[
                                comparisonData.currentRightIndex
                              ],
                              comparisonData.currentRightIndex,
                            )}
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            Selected {rightSelectedMessageIds.length} /{" "}
                            {rightHistoryMessages.length}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="small"
                            onClick={() =>
                              setRightSelectedMessageIds(
                                rightHistoryMessages.map((m) => m.id),
                              )
                            }
                            disabled={
                              diffLoading || rightHistoryMessages.length === 0
                            }
                            className="rounded-lg"
                          >
                            Select all
                          </Button>
                          <Button
                            size="small"
                            onClick={() => setRightSelectedMessageIds([])}
                            disabled={
                              diffLoading || rightHistoryMessages.length === 0
                            }
                            className="rounded-lg"
                          >
                            Clear
                          </Button>
                        </div>
                      </div>
                      <div className="text-xs text-gray-500 mt-2">
                        Click a message to include/exclude it.
                      </div>
                    </div>

                    <div className="p-3 max-h-[360px] overflow-y-auto space-y-2">
                      {rightHistoryMessages.length === 0 ? (
                        <div className="text-xs text-gray-500">
                          No test messages found.
                        </div>
                      ) : (
                        rightHistoryMessages.map((m) => {
                          const checked = rightSelectedMessageIds.includes(m.id);
                          const label =
                            m.message_type === "user" ? "User" : "Assistant";
                          const shortContent =
                            (m.content || "").length > 140
                              ? `${(m.content || "").slice(0, 140)}…`
                              : m.content || "";
                          return (
                            <div
                              key={m.id}
                              className={[
                                "flex gap-2 items-start rounded-2xl border px-3 py-2 cursor-pointer transition-colors",
                                checked
                                  ? "border-purple-200 bg-purple-50"
                                  : "border-gray-100 bg-white hover:bg-gray-50",
                                diffLoading ? "opacity-70" : "",
                              ].join(" ")}
                              onClick={() => {
                                setRightSelectedMessageIds((prev) =>
                                  prev.includes(m.id)
                                    ? prev.filter((x) => x !== m.id)
                                    : [...prev, m.id],
                                );
                              }}
                            >
                              <Checkbox
                                checked={checked}
                                disabled={diffLoading}
                                onClick={(e) => e.stopPropagation()}
                                onChange={() => {
                                  setRightSelectedMessageIds((prev) =>
                                    prev.includes(m.id)
                                      ? prev.filter((x) => x !== m.id)
                                      : [...prev, m.id],
                                  );
                                }}
                              />
                              <div className="min-w-0">
                                <div className="text-xs text-gray-600">
                                  {label} · #{m.message_order}
                                </div>
                                <div className="text-xs text-gray-900 whitespace-pre-wrap break-words">
                                  {shortContent}
                                </div>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>

                <div className="rounded-3xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-semibold text-gray-900">
                        Explanation
                      </div>
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          onClick={() => setDiffModalOpen(false)}
                          disabled={diffLoading}
                          className="rounded-xl"
                        >
                          Close
                        </Button>
                        <Button
                          type="primary"
                          onClick={runDiffExplain}
                          loading={diffLoading}
                          className="rounded-xl"
                          disabled={
                            leftHistoryMessages.length === 0 ||
                            rightHistoryMessages.length === 0 ||
                            leftSelectedMessageIds.length === 0 ||
                            rightSelectedMessageIds.length === 0
                          }
                        >
                          Analyze
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div className="p-4">
                    {diffLoading ? (
                      <div className="flex items-center gap-2 text-gray-600">
                        <Spin size="small" />
                        <span className="text-sm">
                          Analyzing differences...
                        </span>
                      </div>
                    ) : diffExplanation ? (
                      <div className="prose prose-sm max-w-none">
                        <ReactMarkdown>{diffExplanation}</ReactMarkdown>
                      </div>
                    ) : (
                      <div className="text-sm text-gray-500">
                        Select messages on both sides, then click Analyze.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </Modal>
        </>
      )}
    </div>
  );
};

export default ChatInterface;
