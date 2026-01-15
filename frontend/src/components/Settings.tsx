import React, { useState, useEffect, useMemo, useRef } from "react";
import { flushSync } from "react-dom";
import {
  Modal,
  Tabs,
  Card,
  Switch,
  Button,
  Form,
  Input,
  Checkbox,
  Space,
  Alert,
  Divider,
  Typography,
  message,
  Spin,
  Popconfirm,
} from "antd";
import {
  Brain,
  Cog,
  Database,
  Edit,
  Eye,
  Trash2,
  Save,
  X,
  Globe,
  Key,
  Bot,
  BarChart3,
} from "lucide-react";
import { PlusCircleOutlined } from "@ant-design/icons";
import databaseService, { PromptTemplate } from "../services/databaseService";
import apiService from "../services/api";

const { Title, Text } = Typography;
const { TextArea } = Input;

interface CustomMethod {
  key: string;
  label: string;
  description: string;
  isCustom: boolean;
}

interface SettingsProps {
  visible: boolean;
  onClose: () => void;
  onSave?: () => void;
}

const Settings: React.FC<SettingsProps> = ({ visible, onClose, onSave }) => {
  const [activeTab, setActiveTab] = useState<string>("analysis");
  const [loading, setLoading] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);

  const [autoSelectMode, setAutoSelectMode] = useState<boolean>(false);
  const [selectedMethods, setSelectedMethods] = useState<string[]>([]);
  const [customMethods, setCustomMethods] = useState<CustomMethod[]>([]);

  const [promptTemplates, setPromptTemplates] = useState<PromptTemplate[]>([]);
  const [selectedTemplateKeys, setSelectedTemplateKeys] = useState<string[]>([]);
  const [showTemplateForm, setShowTemplateForm] = useState<boolean>(false);
  const [editingTemplate, setEditingTemplate] = useState<PromptTemplate | null>(
    null,
  );
  const [templateDetail, setTemplateDetail] = useState<PromptTemplate | null>(
    null,
  );
  const [templateForm] = Form.useForm();

  const [modelConfig, setModelConfig] = useState({
    apiUrl: "",
    apiKey: "",
    modelName: "",
  });

  const [optimizationPrompt, setOptimizationPrompt] = useState<string>(
    "You are an expert prompt engineer. Please analyze and optimize the given prompt to make it clearer, more specific, and more effective. Focus on improving clarity, specificity, structure, and expected outcomes.",
  );

  const [showMethodForm, setShowMethodForm] = useState<boolean>(false);
  const [editingMethod, setEditingMethod] = useState<CustomMethod | null>(null);
  const [methodDetail, setMethodDetail] = useState<CustomMethod | null>(null);
  const [form] = Form.useForm();

  const [defaultMethods, setDefaultMethods] = useState<CustomMethod[]>([]);

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const allMethods = useMemo(() => {

    const sortedDefaultMethods = [...defaultMethods].sort((a, b) =>
      a.key.localeCompare(b.key),
    );
    const sortedCustomMethods = [...customMethods].sort((a, b) =>
      a.key.localeCompare(b.key),
    );
    return [...sortedDefaultMethods, ...sortedCustomMethods];
  }, [defaultMethods, customMethods]);

  const loadSettings = async () => {
    try {
      setLoading(true);

      const [
        agentMappingResponse,
        analysisMethods,
        selectedMethodsData,
        settings,
      ] = await Promise.all([
        apiService.getAgentMapping(),
        databaseService.getAnalysisMethods(),
        databaseService.getSelectedMethods(),
        databaseService.getSettings(),
      ]);

      let defaultMethodsData: CustomMethod[] = [];
      if (agentMappingResponse.status === "success") {
        const { agents, category_agents } = agentMappingResponse.result;

        const elementsAnalysisAgents = category_agents.elements_analysis || [];
        defaultMethodsData = elementsAnalysisAgents
          .map((agentKey: string) => agents[agentKey])
          .filter((agent: any) => agent) // 过滤掉undefined的agent
          .map((agent: any) => ({
            key: agent.key,
            label: agent.label,
            description: agent.description,
            isCustom: false,
          }));

        setDefaultMethods(defaultMethodsData);
      } else {
        console.error("Failed to load agent mapping:", agentMappingResponse);
        message.error("Failed to load agent mapping");
      }


      const customMethodsData = analysisMethods
        .filter((method: any) => method.is_custom)
        .map((method: any) => ({
          key: method.method_key,
          label: method.label,
          description: method.description,
          isCustom: true,
        }));
      setCustomMethods(customMethodsData);

      const allAvailableKeys = [
        ...defaultMethodsData.map((m: CustomMethod) => m.key),
        ...customMethodsData.map((m: CustomMethod) => m.key),
      ];

      const validSelectedMethods = selectedMethodsData.filter((key: string) =>
        allAvailableKeys.includes(key),
      );

      setSelectedMethods(validSelectedMethods);

      setAutoSelectMode(settings.autoSelectMode || false);

      setModelConfig({
        apiUrl: settings.modelApiUrl || "",
        apiKey: settings.modelApiKey || "",
        modelName: settings.modelName || "",
      });

      setOptimizationPrompt(
        settings.optimizationPrompt ||
          "You are an expert prompt engineer. Please analyze and optimize the given prompt to make it clearer, more specific, and more effective. Focus on improving clarity, specificity, structure, and expected outcomes.",
      );

      const templates = await databaseService.getPromptTemplates("prompt_crafter");
      setPromptTemplates(templates);
      setSelectedTemplateKeys(
        templates.filter((t) => Boolean(t.is_selected)).map((t) => t.template_key),
      );
    } catch (error) {
      console.error("Failed to load settings:", error);
      message.error("Failed to load settings");
      // Set default values
      setSelectedMethods([]);
      setAutoSelectMode(false);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);

      await Promise.all([
        databaseService.saveSelectedMethods(selectedMethods),
        databaseService.saveSelectedPromptTemplates(selectedTemplateKeys),
        databaseService.updateSettings({
          autoSelectMode,
          modelApiUrl: modelConfig.apiUrl,
          modelApiKey: modelConfig.apiKey,
          modelName: modelConfig.modelName,
          optimizationPrompt,
        }),
      ]);

      if (modelConfig.apiUrl || modelConfig.apiKey || modelConfig.modelName) {
        try {
          await apiService.reloadAIConfig();
        } catch (error) {
          console.warn("Failed to reload AI configuration:", error);
        }
      }

      message.success("Settings saved successfully");

      if (onSave) {
        onSave();
      }

      onClose();
    } catch (error) {
      console.error("Failed to save settings:", error);
      message.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const handleMethodToggle = (methodKey: string, checked: boolean) => {

    const scrollTop = scrollContainerRef.current?.scrollTop || 0;

    flushSync(() => {
      if (checked) {
        setSelectedMethods((prev) => [...prev, methodKey]);
      } else {
        setSelectedMethods((prev) => prev.filter((key) => key !== methodKey));
      }
    });

    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollTop;
    }
  };

  const handleSelectAll = () =>
    setSelectedMethods(allMethods.map((m) => m.key));
  const handleDeselectAll = () => setSelectedMethods([]);

  const handleAddMethod = async () => {
    try {
      const values = await form.validateFields();

      await databaseService.createCustomMethod(
        values.label,
        values.description,
      );

      const newMethod: CustomMethod = {
        key: `custom_${Date.now()}`,
        label: values.label,
        description: values.description,
        isCustom: true,
      };

      setCustomMethods((prev) => [...prev, newMethod]);
      setShowMethodForm(false);
      form.resetFields();
      message.success("Custom method added successfully");
    } catch (error) {
      console.error("Failed to add custom method:", error);
      message.error("Failed to add custom method");
    }
  };

  const handleEditMethod = (method: CustomMethod) => {
    setEditingMethod(method);
    form.setFieldsValue({
      label: method.label,
      description: method.description,
    });
    setShowMethodForm(true);
  };

  const handleSaveEdit = async () => {
    if (!editingMethod) return;

    try {
      const values = await form.validateFields();

      await databaseService.updateCustomMethod(
        editingMethod.key,
        values.label,
        values.description,
      );

      setCustomMethods((prev) =>
        prev.map((method) =>
          method.key === editingMethod.key
            ? {
                ...method,
                label: values.label,
                description: values.description,
              }
            : method,
        ),
      );

      setEditingMethod(null);
      setShowMethodForm(false);
      form.resetFields();
      message.success("Custom method updated successfully");
    } catch (error) {
      console.error("Failed to update custom method:", error);
      message.error("Failed to update custom method");
    }
  };

  const handleDeleteMethod = async (methodKey: string) => {
    try {
      await databaseService.deleteCustomMethod(methodKey);

      setCustomMethods((prev) =>
        prev.filter((method) => method.key !== methodKey),
      );
      setSelectedMethods((prev) => prev.filter((key) => key !== methodKey));

      message.success("Custom method deleted successfully");
    } catch (error) {
      console.error("Failed to delete custom method:", error);
      message.error("Failed to delete custom method");
    }
  };

  const handleCancelForm = () => {
    setShowMethodForm(false);
    setEditingMethod(null);
    form.resetFields();
  };

  const reloadPromptTemplates = async () => {
    const templates = await databaseService.getPromptTemplates("prompt_crafter");
    setPromptTemplates(templates);
    setSelectedTemplateKeys(
      templates.filter((t) => Boolean(t.is_selected)).map((t) => t.template_key),
    );
  };

  const handleTemplateToggle = (templateKey: string, checked: boolean) => {
    if (checked) {
      setSelectedTemplateKeys((prev) =>
        prev.includes(templateKey) ? prev : [...prev, templateKey],
      );
    } else {
      setSelectedTemplateKeys((prev) => prev.filter((k) => k !== templateKey));
    }
  };

  const handleSelectAllTemplates = () =>
    setSelectedTemplateKeys(promptTemplates.map((t) => t.template_key));
  const handleDeselectAllTemplates = () => setSelectedTemplateKeys([]);

  const normalizeVariablesPayload = (value?: string) => {
    if (!value) return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    const toCsvList = (input: string) =>
      input
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      return toCsvList(trimmed);
    }
    return toCsvList(trimmed);
  };

  const handleAddTemplate = async () => {
    try {
      const values = await templateForm.validateFields();
      await databaseService.createCustomPromptTemplate({
        name: values.name,
        description: values.description,
        category: "prompt_crafter",
        content: values.content,
        variables: normalizeVariablesPayload(values.variables),
      });
      await reloadPromptTemplates();
      setShowTemplateForm(false);
      setEditingTemplate(null);
      templateForm.resetFields();
      message.success("Custom template added successfully");
    } catch (error) {
      console.error("Failed to add custom template:", error);
      message.error("Failed to add custom template");
    }
  };

  const handleEditTemplate = (t: PromptTemplate) => {
    setEditingTemplate(t);
    templateForm.setFieldsValue({
      name: t.name,
      description: t.description,
      content: t.content,
      variables: t.variables ?? "",
    });
    setShowTemplateForm(true);
  };

  const handleSaveTemplateEdit = async () => {
    if (!editingTemplate) return;
    try {
      const values = await templateForm.validateFields();
      await databaseService.updateCustomPromptTemplate(editingTemplate.template_key, {
        name: values.name,
        description: values.description,
        category: "prompt_crafter",
        content: values.content,
        variables: normalizeVariablesPayload(values.variables),
      });
      await reloadPromptTemplates();
      setShowTemplateForm(false);
      setEditingTemplate(null);
      templateForm.resetFields();
      message.success("Custom template updated successfully");
    } catch (error) {
      console.error("Failed to update custom template:", error);
      message.error("Failed to update custom template");
    }
  };

  const handleDeleteTemplate = async (templateKey: string) => {
    try {
      await databaseService.deleteCustomPromptTemplate(templateKey);
      await reloadPromptTemplates();
      message.success("Custom template deleted successfully");
    } catch (error) {
      console.error("Failed to delete custom template:", error);
      message.error("Failed to delete custom template");
    }
  };

  const handleCancelTemplateForm = () => {
    setShowTemplateForm(false);
    setEditingTemplate(null);
    templateForm.resetFields();
  };

  const handleReset = () => {

    setSelectedMethods(defaultMethods.map((m) => m.key));
    setAutoSelectMode(false);
    setShowMethodForm(false);
    setEditingMethod(null);
    form.resetFields();
    setSelectedTemplateKeys(
      promptTemplates
        .filter((t) => !t.is_custom)
        .map((t) => t.template_key),
    );
    setShowTemplateForm(false);
    setEditingTemplate(null);
    templateForm.resetFields();

    setOptimizationPrompt(
      "You are an expert prompt engineer. Please analyze and optimize the given prompt to make it clearer, more specific, and more effective. Focus on improving clarity, specificity, structure, and expected outcomes.",
    );

    setModelConfig({
      apiUrl: "",
      apiKey: "",
      modelName: "",
    });
  };

  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  useEffect(() => {
    if (visible && !hasLoadedOnce) {
      loadSettings().then(() => setHasLoadedOnce(true));
    } else if (!visible) {

      setHasLoadedOnce(false);
    }
  }, [visible, hasLoadedOnce]);

  const AnalysisSettings = () => (
    <div className="space-y-10">
      {/* mode selection */}
      <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200 mt-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div>
              <Text strong className="text-lg text-gray-900">
                Analysis Method Selection Mode
              </Text>
              <div className="text-gray-600 mt-1">
                {autoSelectMode
                  ? "AI will automatically select the most suitable analysis methods based on prompt content"
                  : "Manually select specific analysis methods to use"}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Text
              className={
                !autoSelectMode ? "text-blue-600 font-medium" : "text-gray-500"
              }
            >
              Manual
            </Text>
            <Switch
              checked={autoSelectMode}
              onChange={setAutoSelectMode}
              checkedChildren="Auto"
              unCheckedChildren="Manual"
            />
            <Text
              className={
                autoSelectMode ? "text-blue-600 font-medium" : "text-gray-500"
              }
            >
              Auto
            </Text>
          </div>
        </div>
      </Card>

      {/* Automatic mode prompt */}
      {autoSelectMode && (
        <Alert
          message="AI Auto-Selection Mode"
          description="AI will analyze your prompt content and automatically select the most relevant analysis methods from default and custom methods. Manual method selection is not required in this mode."
          type="info"
          showIcon
          className="border-blue-200 bg-blue-50"
        />
      )}

      {/* Manual mode contro */}
      {!autoSelectMode && (
        <div className="flex justify-between items-center">
          <Text strong className="text-lg">
            Selected {selectedMethods.length} /{" "}
            {defaultMethods.length + customMethods.length} methods
          </Text>
          <Space>
            <Button onClick={handleSelectAll} className="px-4 py-2">
              Select All
            </Button>
            <Button onClick={handleDeselectAll} className="px-4 py-2">
              Deselect All
            </Button>
            <Button
              type="primary"
              icon={<PlusCircleOutlined />}
              onClick={() => setShowMethodForm(true)}
              className="px-4 py-2"
            >
              Add Custom Method
            </Button>
          </Space>
        </div>
      )}

      {/* Custom Method Management Button (Automatic Mode) */}
      {autoSelectMode && (
        <div className="flex justify-end">
          <Button
            type="primary"
            icon={<PlusCircleOutlined />}
            onClick={() => setShowMethodForm(true)}
            className="px-4 py-2"
          >
            Manage Custom Methods
          </Button>
        </div>
      )}

      {/* Custom method form */}
      {showMethodForm && (
        <Card className="bg-blue-50 border-blue-200">
          <div className="flex justify-between items-center mb-4">
            <Title level={4}>
              {editingMethod ? "Edit Custom Method" : "Add New Custom Method"}
            </Title>
            <Button
              icon={<X className="w-4 h-4" />}
              onClick={handleCancelForm}
              className="px-4 py-2"
            >
              Cancel
            </Button>
          </div>

          <Form form={form} layout="vertical">
            <Form.Item
              name="label"
              label="Method Title"
              rules={[
                { required: true, message: "Please enter method title" },
                { min: 2, message: "Title must be at least 2 characters" },
              ]}
            >
              <Input placeholder="Enter method title" size="large" />
            </Form.Item>

            <Form.Item
              name="description"
              label="Method Description"
              rules={[
                { required: true, message: "Please enter method description" },
                {
                  min: 10,
                  message: "Description must be at least 10 characters",
                },
              ]}
            >
              <TextArea
                rows={4}
                placeholder="Enter detailed description of the analysis method"
              />
            </Form.Item>

            <div className="flex justify-end gap-3">
              <Button
                onClick={handleCancelForm}
                size="large"
                className="px-6 py-2"
              >
                Cancel
              </Button>
              <Button
                type="primary"
                onClick={editingMethod ? handleSaveEdit : handleAddMethod}
                size="large"
                className="px-6 py-2"
              >
                {editingMethod ? "Update Method" : "Add Method"}
              </Button>
            </div>
          </Form>
        </Card>
      )}

      {/* Method Tables */}
      <div
        ref={scrollContainerRef}
        className="space-y-4 max-h-96 overflow-y-auto"
        style={{ scrollBehavior: "auto" }}
      >
        {allMethods.map((method) => (
          <Card
            key={method.key}
            className={`hover:shadow-md transition-shadow ${
              autoSelectMode ? "bg-gray-50" : "bg-white"
            }`}
          >
            <div className="flex items-start justify-between">
              {!autoSelectMode ? (
                <Checkbox
                  checked={selectedMethods.includes(method.key)}
                  onChange={(e) =>
                    handleMethodToggle(method.key, e.target.checked)
                  }
                  className="flex-1"
                >
                  <div className="ml-3">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900 text-base">
                        {method.label}
                      </span>
                      {method.isCustom && (
                        <span className="px-2 py-1 text-xs bg-blue-100 text-blue-600 rounded">
                          Custom
                        </span>
                      )}
                    </div>
                    <div className="text-gray-600 mt-1">
                      {method.description}
                    </div>
                  </div>
                </Checkbox>
              ) : (
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900 text-base">
                      {method.label}
                    </span>
                    {method.isCustom && (
                      <span className="px-2 py-1 text-xs bg-blue-100 text-blue-600 rounded">
                        Custom
                      </span>
                    )}
                  </div>
                  <div className="text-gray-600 mt-1">{method.description}</div>
                </div>
              )}

              <div className="flex gap-2 ml-3">
                <Button
                  size="small"
                  type="text"
                  icon={<Eye className="w-4 h-4" />}
                  onClick={(e) => {
                    e.stopPropagation();
                    setMethodDetail(method);
                  }}
                  className="text-gray-600 hover:text-gray-800"
                />
                {method.isCustom ? (
                  <>
                    <Button
                      size="small"
                      type="text"
                      icon={<Edit className="w-4 h-4" />}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEditMethod(method);
                      }}
                      className="text-blue-600 hover:text-blue-800"
                    />
                    <Popconfirm
                      title="Confirm Delete"
                      description="Are you sure you want to delete this custom method?"
                      onConfirm={() => handleDeleteMethod(method.key)}
                      okText="Delete"
                      cancelText="Cancel"
                    >
                      <Button
                        size="small"
                        type="text"
                        icon={<Trash2 className="w-4 h-4" />}
                        onClick={(e) => e.stopPropagation()}
                        className="text-red-600 hover:text-red-800"
                      />
                    </Popconfirm>
                  </>
                ) : null}
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* warning message */}
      {!autoSelectMode && selectedMethods.length === 0 && (
        <Alert
          message="Please select at least one analysis method"
          type="warning"
          showIcon
          className="text-center"
        />
      )}
    </div>
  );

  const ModelSettings = React.useCallback(
    () => (
      <div className="space-y-6">
        <div>
          <Title level={3}>Model Configuration</Title>
          <Text type="secondary" className="text-base">
            Configure AI model API settings for analysis and chat functionality
          </Text>
        </div>
        <Divider />

        <Form layout="vertical" className="space-y-6">
          {/* API URL config */}
          <Card className="border-blue-200 bg-blue-50/30">
            <div className="flex items-start gap-4">
              <Globe className="w-6 h-6 text-blue-600 mt-1" />
              <div className="flex-1">
                <Form.Item
                  label={<span className="text-base font-medium">API URL</span>}
                  className="mb-2"
                >
                  <Input
                    placeholder="Enter your AI model API endpoint (e.g., https://api.openai.com/v1)"
                    value={modelConfig.apiUrl}
                    onChange={(e) =>
                      setModelConfig((prev) => ({
                        ...prev,
                        apiUrl: e.target.value,
                      }))
                    }
                    className="text-base"
                    size="large"
                  />
                </Form.Item>
                <Text type="secondary" className="text-sm">
                  The base URL for your AI model API endpoint
                </Text>
              </div>
            </div>
          </Card>

          {/* API Key config */}
          <Card className="border-green-200 bg-green-50/30">
            <div className="flex items-start gap-4">
              <Key className="w-6 h-6 text-green-600 mt-1" />
              <div className="flex-1">
                <Form.Item
                  label={<span className="text-base font-medium">API Key</span>}
                  className="mb-2"
                >
                  <Input.Password
                    placeholder="Enter your API key"
                    value={modelConfig.apiKey}
                    onChange={(e) =>
                      setModelConfig((prev) => ({
                        ...prev,
                        apiKey: e.target.value,
                      }))
                    }
                    className="text-base"
                    size="large"
                  />
                </Form.Item>
                <Text type="secondary" className="text-sm">
                  Your API authentication key (will be stored securely)
                </Text>
              </div>
            </div>
          </Card>

          {/* Model Name config */}
          <Card className="border-purple-200 bg-purple-50/30">
            <div className="flex items-start gap-4">
              <Bot className="w-6 h-6 text-purple-600 mt-1" />
              <div className="flex-1">
                <Form.Item
                  label={
                    <span className="text-base font-medium">Model Name</span>
                  }
                  className="mb-2"
                >
                  <Input
                    placeholder="Enter model name (e.g., gpt-4, claude-3-sonnet)"
                    value={modelConfig.modelName}
                    onChange={(e) =>
                      setModelConfig((prev) => ({
                        ...prev,
                        modelName: e.target.value,
                      }))
                    }
                    className="text-base"
                    size="large"
                  />
                </Form.Item>
                <Text type="secondary" className="text-sm">
                  The specific model to use for AI analysis and chat
                </Text>
              </div>
            </div>
          </Card>

          {/* Configuration status prompt */}
          {modelConfig.apiUrl && modelConfig.apiKey && modelConfig.modelName ? (
            <Alert
              message="Model Configuration Complete"
              description="All required model settings have been configured. The system is ready to use AI features."
              type="success"
              showIcon
              className="border-green-200 bg-green-50"
            />
          ) : (
            <Alert
              message="Configuration Required"
              description="Please configure all model settings (API URL, API Key, and Model Name) to enable AI features."
              type="warning"
              showIcon
              className="border-orange-200 bg-orange-50"
            />
          )}
        </Form>
      </div>
    ),
    [modelConfig],
  );

  // Optimize the Settings component
  const OptimizationSettings = React.useCallback(
    () => (
      <div className="space-y-6">
        <div>
          <Title level={3}>Optimization Prompt</Title>
          <Text type="secondary" className="text-base">
            Configure the system prompt used for prompt optimization in the
            Refinement Hub stage
          </Text>
        </div>
        <Divider />

        <Form layout="vertical" className="space-y-6">
          <Card className="border-orange-200 bg-orange-50/30">
            <div className="flex items-start gap-4">
              <div className="flex-1">
                <Form.Item
                  label={
                    <span className="text-base font-medium">
                      Optimization System Prompt
                    </span>
                  }
                  className="mb-4"
                >
                  <TextArea
                    value={optimizationPrompt}
                    onChange={(e) => setOptimizationPrompt(e.target.value)}
                    placeholder="Enter the system prompt for optimization..."
                    rows={8}
                    className="text-base"
                    showCount
                    maxLength={2000}
                  />
                </Form.Item>
                <Text type="secondary" className="text-sm">
                  This prompt will be used as the system message when calling
                  the AI model to optimize prompts. Make it clear and specific
                  about what kind of optimization you want.
                </Text>
              </div>
            </div>
          </Card>

          <Alert
            message="Optimization Prompt Guidelines"
            description="The optimization prompt should clearly instruct the AI on how to improve prompts. Consider including guidelines for clarity, specificity, structure, and effectiveness. The AI will use this prompt to understand your optimization preferences."
            type="info"
            showIcon
            className="border-blue-200 bg-blue-50"
          />
        </Form>
      </div>
    ),
    [optimizationPrompt],
  );

  const DataSettings = () => {
    const templates = [...promptTemplates].sort((a, b) => {
      if (a.is_custom !== b.is_custom) return a.is_custom ? 1 : -1;
      return a.template_key.localeCompare(b.template_key);
    });

    return (
      <div className="space-y-10 mt-6">
        <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
          <div className="flex items-center justify-between">
            <div>
              <Text strong className="text-lg text-gray-900">
                Prompt Templates (Prompt Crafter)
              </Text>
              <div className="text-gray-600 mt-1">
                Select templates for auto-selection during generation, or create
                custom templates.
              </div>
            </div>
            <div className="text-gray-700">
              Selected {selectedTemplateKeys.length} / {templates.length}
            </div>
          </div>
        </Card>

        <div className="flex justify-between items-center">
          <Text strong className="text-lg">
            Templates
          </Text>
          <Space>
            <Button onClick={handleSelectAllTemplates} className="px-4 py-2">
              Select All
            </Button>
            <Button onClick={handleDeselectAllTemplates} className="px-4 py-2">
              Deselect All
            </Button>
            <Button
              type="primary"
              icon={<PlusCircleOutlined />}
              onClick={() => {
                setEditingTemplate(null);
                templateForm.resetFields();
                setShowTemplateForm(true);
              }}
              className="px-4 py-2"
            >
              Add Custom Template
            </Button>
          </Space>
        </div>

        {showTemplateForm && (
          <Card className="bg-blue-50 border-blue-200">
            <div className="flex justify-between items-center mb-4">
              <Title level={4}>
                {editingTemplate ? "Edit Custom Template" : "Add New Custom Template"}
              </Title>
              <Button
                icon={<X className="w-4 h-4" />}
                onClick={handleCancelTemplateForm}
                className="px-4 py-2"
              >
                Cancel
              </Button>
            </div>

            <Form form={templateForm} layout="vertical">
              <Form.Item
                name="name"
                label="Template Name"
                rules={[
                  { required: true, message: "Please enter template name" },
                  { min: 2, message: "Name must be at least 2 characters" },
                ]}
              >
                <Input placeholder="Enter template name" size="large" />
              </Form.Item>

              <Form.Item name="description" label="Template Description">
                <TextArea
                  rows={3}
                  placeholder="Enter short description (optional)"
                />
              </Form.Item>

              <Form.Item name="variables" label="Variables">
                <Input placeholder='e.g. ["task","constraints"] or task,constraints' size="large" />
              </Form.Item>

              <Form.Item
                name="content"
                label="Template Content"
                rules={[
                  { required: true, message: "Please enter template content" },
                  { min: 10, message: "Content must be at least 10 characters" },
                ]}
              >
                <TextArea
                  rows={8}
                  placeholder="Enter system prompt template content"
                />
              </Form.Item>

              <div className="flex justify-end gap-3">
                <Button
                  onClick={handleCancelTemplateForm}
                  size="large"
                  className="px-6 py-2"
                >
                  Cancel
                </Button>
                <Button
                  type="primary"
                  onClick={editingTemplate ? handleSaveTemplateEdit : handleAddTemplate}
                  size="large"
                  className="px-6 py-2"
                >
                  {editingTemplate ? "Update Template" : "Add Template"}
                </Button>
              </div>
            </Form>
          </Card>
        )}

        <div className="space-y-4 max-h-96 overflow-y-auto">
          {templates.map((t) => (
            <Card key={t.template_key} className="hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between">
                <Checkbox
                  checked={selectedTemplateKeys.includes(t.template_key)}
                  onChange={(e) =>
                    handleTemplateToggle(t.template_key, e.target.checked)
                  }
                  className="flex-1"
                >
                  <div className="ml-3">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900 text-base">
                        {t.name}
                      </span>
                      {t.is_custom ? (
                        <span className="px-2 py-1 text-xs bg-blue-100 text-blue-600 rounded">
                          Custom
                        </span>
                      ) : (
                        <span className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded">
                          Preset
                        </span>
                      )}
                    </div>
                    {t.description ? (
                      <div className="text-gray-600 mt-1">{t.description}</div>
                    ) : null}
                  </div>
                </Checkbox>

                <div className="flex gap-2 ml-3">
                  <Button
                    size="small"
                    type="text"
                    icon={<Eye className="w-4 h-4" />}
                    onClick={(e) => {
                      e.stopPropagation();
                      setTemplateDetail(t);
                    }}
                    className="text-gray-600 hover:text-gray-800"
                  />
                  {t.is_custom ? (
                    <>
                      <Button
                        size="small"
                        type="text"
                        icon={<Edit className="w-4 h-4" />}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEditTemplate(t);
                        }}
                        className="text-blue-600 hover:text-blue-800"
                      />
                      <Popconfirm
                        title="Confirm Delete"
                        description="Are you sure you want to delete this custom template?"
                        onConfirm={() => handleDeleteTemplate(t.template_key)}
                        okText="Delete"
                        cancelText="Cancel"
                      >
                        <Button
                          size="small"
                          type="text"
                          icon={<Trash2 className="w-4 h-4" />}
                          onClick={(e) => e.stopPropagation()}
                          className="text-red-600 hover:text-red-800"
                        />
                      </Popconfirm>
                    </>
                  ) : null}
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    );
  };

  return (
    <Modal
      title={
        <div className="flex items-center gap-3">
          <Brain className="w-6 h-6 text-blue-600" />
          <span className="text-xl font-bold">System Settings</span>
        </div>
      }
      open={visible}
      onCancel={onClose}
      width={1000}
      maskClosable={false}
      footer={
        <div className="flex justify-between">
          <Popconfirm
            title="Reset All Settings"
            description="Are you sure you want to reset all settings to default values? This action cannot be undone."
            onConfirm={handleReset}
            okText="Reset"
            cancelText="Cancel"
            okType="danger"
          >
            <Button className="px-4 py-2">Reset Settings</Button>
          </Popconfirm>
          <Space>
            <Button onClick={onClose} className="px-4 py-2">
              Cancel
            </Button>
            <Button
              type="primary"
              onClick={handleSave}
              loading={saving}
              icon={<Save className="w-4 h-4" />}
              disabled={!autoSelectMode && selectedMethods.length === 0}
              className="px-4 py-2"
            >
              Save Configuration
            </Button>
          </Space>
        </div>
      }
      destroyOnHidden
    >
      <Modal
        title="Analysis Method Details"
        open={Boolean(methodDetail)}
        onCancel={() => setMethodDetail(null)}
        footer={null}
        width={720}
      >
        <div className="space-y-4">
          <div>
            <Text strong className="text-base">
              {methodDetail?.label}
            </Text>
          </div>
          <div className="text-gray-700 whitespace-pre-wrap">
            {methodDetail?.description}
          </div>
        </div>
      </Modal>

      <Modal
        title="Template Details"
        open={Boolean(templateDetail)}
        onCancel={() => setTemplateDetail(null)}
        footer={null}
        width={860}
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <Text strong className="text-base">
                {templateDetail?.name}
              </Text>
              {templateDetail?.description ? (
                <div className="text-gray-600 mt-1">
                  {templateDetail.description}
                </div>
              ) : null}
            </div>
            <div>
              {templateDetail?.is_custom ? (
                <span className="px-2 py-1 text-xs bg-blue-100 text-blue-600 rounded">
                  Custom
                </span>
              ) : (
                <span className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded">
                  Preset
                </span>
              )}
            </div>
          </div>
          <Divider className="my-3" />
          <div>
            <Text strong>Template Content</Text>
            <pre className="text-sm whitespace-pre-wrap mt-2 p-3 bg-gray-50 border border-gray-200 rounded">
              {templateDetail?.content || ""}
            </pre>
          </div>
          {templateDetail?.variables ? (
            <div>
              <Text strong>Variables</Text>
              <pre className="text-sm whitespace-pre-wrap mt-2 p-3 bg-gray-50 border border-gray-200 rounded">
                {typeof templateDetail.variables === "string"
                  ? templateDetail.variables
                  : JSON.stringify(templateDetail.variables, null, 2)}
              </pre>
            </div>
          ) : null}
        </div>
      </Modal>

      {loading ? (
        <Spin size="large" spinning={true}>
          <div className="flex items-center justify-center py-12 min-h-[200px]">
            <div className="text-gray-500">Loading settings...</div>
          </div>
        </Spin>
      ) : (
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          size="large"
          className="settings-tabs w-full"
          items={[
            {
              key: "analysis",
              label: (
                <div className="flex items-center justify-center gap-2 flex-1 px-2 py-2">
                  <BarChart3 className="w-4 h-4" />
                  <span className="text-sm font-medium">Analysis</span>
                </div>
              ),
              children: <AnalysisSettings />,
            },
            {
              key: "optimization",
              label: (
                <div className="flex items-center justify-center gap-2 flex-1 px-2 py-2">
                  <Cog className="w-4 h-4" />
                  <span className="text-sm font-medium">Optimization</span>
                </div>
              ),
              children: <OptimizationSettings />,
            },
            {
              key: "model",
              label: (
                <div className="flex items-center justify-center gap-2 flex-1 px-2 py-2">
                  <Bot className="w-4 h-4" />
                  <span className="text-sm font-medium">Model</span>
                </div>
              ),
              children: <ModelSettings />,
            },
            {
              key: "data",
              label: (
                <div className="flex items-center justify-center gap-2 flex-1 px-2 py-2">
                  <Database className="w-4 h-4" />
                  <span className="text-sm font-medium">Prompt Templates</span>
                </div>
              ),
              children: <DataSettings />,
            },
          ]}
        />
      )}
    </Modal>
  );
};

export default Settings;
