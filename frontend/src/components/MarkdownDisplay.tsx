import React from "react";
import ReactMarkdown from "react-markdown";
import { Card, Typography } from "antd";

const { Title } = Typography;

interface MarkdownDisplayProps {
  content: string;
  title?: string;
}

const MarkdownDisplay: React.FC<MarkdownDisplayProps> = ({
  content,
  title,
}) => {
  return (
    <Card
      title={
        title && (
          <Title
            level={5}
            className="font-['Inter'] font-bold text-transparent bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text"
            style={{ margin: 0, fontSize: "18px" }}
          >
            {title}
          </Title>
        )
      }
      bordered={false}
      className="markdown-card shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-[1.01]"
      style={{
        marginBottom: 20,
        background: "linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)",
        borderRadius: "16px",
        border: "1px solid rgba(99, 102, 241, 0.15)",
        backdropFilter: "blur(10px)",
      }}
      styles={{
        body: {
          padding: "24px",
          borderRadius: "16px",
        },
      }}
    >
      <div className="markdown-content font-['Inter']">
        <ReactMarkdown
          components={{
            h1: ({ children }) => (
              <h1 className="text-2xl font-bold mb-4 text-transparent bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text font-['Inter']">
                {children}
              </h1>
            ),
            h2: ({ children }) => (
              <h2 className="text-xl font-semibold mb-3 text-indigo-700 font-['Inter']">
                {children}
              </h2>
            ),
            h3: ({ children }) => (
              <h3 className="text-lg font-medium mb-2 text-indigo-600 font-['Inter']">
                {children}
              </h3>
            ),
            p: ({ children }) => (
              <p className="mb-4 text-gray-700 leading-relaxed font-['Inter']">
                {children}
              </p>
            ),
            ul: ({ children }) => (
              <ul className="mb-4 pl-6 space-y-2 font-['Inter']">{children}</ul>
            ),
            ol: ({ children }) => (
              <ol className="mb-4 pl-6 space-y-2 font-['Inter']">{children}</ol>
            ),
            li: ({ children }) => (
              <li className="text-gray-700 font-['Inter']">{children}</li>
            ),
            code: ({ children }) => (
              <code className="bg-gradient-to-r from-blue-50 to-indigo-50 px-2 py-1 rounded-md text-indigo-600 font-['JetBrains_Mono'] text-sm border border-indigo-200">
                {children}
              </code>
            ),
            pre: ({ children }) => (
              <pre className="bg-gradient-to-br from-gray-900 to-gray-800 p-4 rounded-xl overflow-x-auto mb-4 shadow-lg border border-gray-700">
                {children}
              </pre>
            ),
          }}
        >
          {content}
        </ReactMarkdown>
      </div>
    </Card>
  );
};

export default MarkdownDisplay;
