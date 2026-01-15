import React, { useState } from "react";
import { Card, Button } from "antd";
import { EyeOutlined, EyeInvisibleOutlined } from "@ant-design/icons";
import ReactMarkdown from "react-markdown";

// const { Panel } = Collapse;
// const { Text, Paragraph } = Typography;

interface ThinkingProcessProps {
  thinking: string;
}

const ThinkingProcess: React.FC<ThinkingProcessProps> = ({ thinking }) => {
  const [isVisible, setIsVisible] = useState(false);

  if (!thinking || thinking.trim() === "") {
    return null;
  }

  const toggleVisibility = () => {
    setIsVisible(!isVisible);
  };

  return (
    <div className="thinking-process-container" style={{ marginTop: "16px" }}>
      <Button
        type="text"
        icon={isVisible ? <EyeInvisibleOutlined /> : <EyeOutlined />}
        onClick={toggleVisibility}
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
        <span style={{ color: "#475569", fontWeight: "500" }}>
          {isVisible ? "Hide Thinking Process" : "Show Thinking Process"}
        </span>
      </Button>

      {isVisible && (
        <Card
          size="small"
          className="thinking-card animate-fadeIn"
          style={{
            marginTop: "12px",
            background: "linear-gradient(135deg, #fefefe 0%, #f8fafc 100%)",
            border: "1px solid #e2e8f0",
            borderRadius: "12px",
            boxShadow:
              "0 4px 12px rgba(0, 0, 0, 0.05), 0 1px 3px rgba(0, 0, 0, 0.1)",
            borderLeft: "4px solid #3b82f6",
          }}
          styles={{ body: { padding: "20px" } }}
        >
          <div
            className="thinking-content"
            style={{
              fontSize: "14px",
              lineHeight: "1.7",
              color: "#334155",
              fontFamily: "Inter, sans-serif",
            }}
          >
            <ReactMarkdown
              components={{
                p: ({ children }) => (
                  <p
                    style={{
                      margin: "0 0 12px 0",
                      fontSize: "14px",
                      fontFamily: "Inter, sans-serif",
                      lineHeight: "1.8",
                      color: "#334155",
                    }}
                  >
                    {children}
                  </p>
                ),
                h1: ({ children }) => (
                  <h4
                    style={{
                      margin: "24px 0 16px 0",
                      fontSize: "18px",
                      fontWeight: "700",
                      fontFamily: "Inter, sans-serif",
                      color: "#0f172a",
                      borderLeft: "3px solid #3b82f6",
                      paddingLeft: "12px",
                      background:
                        "linear-gradient(90deg, rgba(59, 130, 246, 0.05) 0%, transparent 100%)",
                      paddingTop: "8px",
                      paddingBottom: "8px",
                      borderRadius: "0 6px 6px 0",
                    }}
                  >
                    {children}
                  </h4>
                ),
                h2: ({ children }) => (
                  <h5
                    style={{
                      margin: "20px 0 12px 0",
                      fontSize: "16px",
                      fontWeight: "650",
                      fontFamily: "Inter, sans-serif",
                      color: "#1e293b",
                      borderLeft: "2px solid #10b981",
                      paddingLeft: "10px",
                      background:
                        "linear-gradient(90deg, rgba(16, 185, 129, 0.04) 0%, transparent 100%)",
                      paddingTop: "6px",
                      paddingBottom: "6px",
                    }}
                  >
                    {children}
                  </h5>
                ),
                h3: ({ children }) => (
                  <h6
                    style={{
                      margin: "16px 0 10px 0",
                      fontSize: "15px",
                      fontWeight: "600",
                      fontFamily: "Inter, sans-serif",
                      color: "#334155",
                      borderLeft: "2px solid #f59e0b",
                      paddingLeft: "8px",
                      background:
                        "linear-gradient(90deg, rgba(245, 158, 11, 0.03) 0%, transparent 100%)",
                      paddingTop: "4px",
                      paddingBottom: "4px",
                    }}
                  >
                    {children}
                  </h6>
                ),
                ul: ({ children }) => (
                  <ul
                    style={{
                      margin: "12px 0 16px 0",
                      paddingLeft: "20px",
                      listStyleType: "none",
                      fontSize: "14px",
                      fontFamily: "Inter, sans-serif",
                      lineHeight: "1.7",
                      color: "#334155",
                    }}
                  >
                    {children}
                  </ul>
                ),
                ol: ({ children }) => (
                  <ol
                    style={{
                      margin: "12px 0 16px 0",
                      paddingLeft: "20px",
                      listStyleType: "decimal",
                      fontSize: "14px",
                      fontFamily: "Inter, sans-serif",
                      lineHeight: "1.7",
                      color: "#334155",
                    }}
                  >
                    {children}
                  </ol>
                ),
                li: ({ children }) => (
                  <li
                    style={{
                      margin: "6px 0",
                      fontSize: "14px",
                      fontFamily: "Inter, sans-serif",
                      lineHeight: "1.7",
                      color: "#334155",
                      position: "relative",
                      paddingLeft: "16px",
                    }}
                  >
                    <span
                      style={{
                        position: "absolute",
                        left: "0",
                        top: "0",
                        width: "6px",
                        height: "6px",
                        borderRadius: "50%",
                        background: "#3b82f6",
                        marginTop: "8px",
                      }}
                    ></span>
                    {children}
                  </li>
                ),
                strong: ({ children }) => (
                  <strong
                    style={{
                      fontWeight: "650",
                      color: "#0f172a",
                      background:
                        "linear-gradient(135deg, rgba(59, 130, 246, 0.12) 0%, rgba(99, 102, 241, 0.08) 100%)",
                      padding: "2px 6px",
                      borderRadius: "4px",
                      border: "1px solid rgba(59, 130, 246, 0.15)",
                      boxShadow: "0 1px 2px rgba(59, 130, 246, 0.1)",
                    }}
                  >
                    {children}
                  </strong>
                ),
                em: ({ children }) => (
                  <em
                    style={{
                      fontStyle: "italic",
                      color: "#475569",
                      fontWeight: "500",
                      background: "rgba(148, 163, 184, 0.08)",
                      padding: "1px 3px",
                      borderRadius: "3px",
                    }}
                  >
                    {children}
                  </em>
                ),
                code: ({ children }) => (
                  <code
                    style={{
                      fontFamily: "JetBrains Mono, Consolas, Monaco, monospace",
                      fontSize: "13px",
                      background:
                        "linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)",
                      padding: "3px 8px",
                      borderRadius: "5px",
                      color: "#1e293b",
                      border: "1px solid #cbd5e1",
                      boxShadow: "0 1px 2px rgba(0, 0, 0, 0.05)",
                    }}
                  >
                    {children}
                  </code>
                ),
                pre: ({ children }) => (
                  <pre
                    style={{
                      background:
                        "linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)",
                      padding: "16px",
                      borderRadius: "8px",
                      fontSize: "13px",
                      fontFamily: "JetBrains Mono, Consolas, Monaco, monospace",
                      border: "1px solid #cbd5e1",
                      color: "#1e293b",
                      overflow: "auto",
                      margin: "16px 0",
                      boxShadow: "0 2px 4px rgba(0, 0, 0, 0.05)",
                      borderLeft: "3px solid #3b82f6",
                    }}
                  >
                    {children}
                  </pre>
                ),
                blockquote: ({ children }) => (
                  <blockquote
                    style={{
                      margin: "16px 0",
                      padding: "16px 20px",
                      borderLeft: "4px solid #10b981",
                      background:
                        "linear-gradient(135deg, rgba(16, 185, 129, 0.06) 0%, rgba(5, 150, 105, 0.04) 100%)",
                      borderRadius: "0 8px 8px 0",
                      fontStyle: "italic",
                      color: "#334155",
                      boxShadow: "0 2px 4px rgba(16, 185, 129, 0.1)",
                      border: "1px solid rgba(16, 185, 129, 0.15)",
                      borderLeftWidth: "4px",
                    }}
                  >
                    {children}
                  </blockquote>
                ),
              }}
            >
              {thinking}
            </ReactMarkdown>
          </div>
        </Card>
      )}
    </div>
  );
};

export default ThinkingProcess;
