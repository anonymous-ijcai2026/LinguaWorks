/**
 * Formats a date and time.
 * @param {Date|string} date - The date object or string.
 * @returns {string} - The formatted date string.
 */
export const formatDateTime = (date: Date | string): string => {
  const d = new Date(date);
  return d.toLocaleString("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
};

/**
 * Truncates text.
 * @param {string} text - The original text.
 * @param {number} maxLength - The maximum length.
 * @returns {string} - The truncated text.
 */
export const truncateText = (text: string, maxLength: number = 50): string => {
  if (!text) return "";
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + "...";
};

/**
 * Generates a unique ID.
 * @returns {string} - The unique ID.
 */
export const generateId = (): string => {
  return (
    Math.random().toString(36).substring(2, 15) +
    Math.random().toString(36).substring(2, 15)
  );
};

/**
 * Deep clones an object.
 * @param {Object} obj - The object to clone.
 * @returns {Object} - The cloned object.
 */
export const deepClone = <T>(obj: T): T => {
  return JSON.parse(JSON.stringify(obj));
};

/**
 * Finds an item by ID in an array of objects.
 * @param {Array} array - The array of objects.
 * @param {string} id - The ID to find.
 * @param {string} idField - The ID field name, defaults to 'id'.
 * @returns {Object|null} - The found object or null.
 */
export const findById = <T extends Record<string, any>>(
  array: T[] | null | undefined,
  id: string,
  idField: string = "id",
): T | null => {
  if (!array || !Array.isArray(array)) return null;
  return array.find((item) => item[idField] === id) || null;
};

/**
 * Gets the step name.
 * @param {string} step - The step code.
 * @returns {string} - The step name.
 */
export const getStepName = (step: string): string => {
  const stepMap: Record<string, string> = {
    structure: "Structure Check",
    analysis: "Analyze Elements",
    generation: "Generate Prompt",
    optimization: "Optimize Prompt",
    testing: "Test Prompt",
  };
  return stepMap[step] || "Structure Check";
};

export const getFunctionalStepName = (step: string): string => {
  return getStepName(step);
};

export const getProductStepName = (step: string): string => {
  const stepMap: Record<string, string> = {
    structure: "🎨 Idea Incubator",
    analysis: "🔍 Insight Decoder",
    generation: "⚒️ Prompt Crafter",
    optimization: "✨ Refinement Hub",
    testing: "🧪 Validation Chamber",
  };
  return stepMap[step] || "🎨 Idea Incubator";
};

/**
 * Gets the step index.
 * @param {string} step - The step code.
 * @returns {number} - The step index.
 */
export const getStepIndex = (step: string): number => {
  const stepMap: Record<string, number> = {
    structure: 0,
    analysis: 1,
    generation: 2,
    optimization: 3,
    testing: 4,
  };
  return stepMap[step] !== undefined ? stepMap[step] : 0;
};

// Define common types
export type Step =
  | "structure"
  | "analysis"
  | "generation"
  | "optimization"
  | "testing";

export interface Session {
  id: string;
  current_step: Step;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  role: "user" | "system";
  content: string;
  timestamp: string;
}
