import React from 'react';
import { Card, Tag, Typography } from 'antd';

const { Text } = Typography;

interface AnalysisItem {
  agent_key: string;
  agent_name: string;
  content: string;
}

interface AnalysisDisplayProps {
  analysisData?: AnalysisItem[];
  content: string;
}

const AnalysisDisplay: React.FC<AnalysisDisplayProps> = ({ analysisData, content }) => {
  // Prioritize the use of structured data
  if (analysisData && analysisData.length > 0) {
    return (
      <div className="space-y-4">
        {analysisData.map((item, index) => (
          <Card 
            key={index}
            size="small"
            className="border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-shadow duration-200"
            styles={{ body: { padding: '16px' } }}
          >
            <div className="mb-3">
              <Tag 
                color="blue" 
                className="text-xs font-medium px-2 py-1 rounded-full"
              >
                {item.agent_name}
              </Tag>
            </div>
            <div className="prose prose-sm max-w-none">
              <Text className="text-gray-700 leading-relaxed whitespace-pre-wrap">
                {item.content}
              </Text>
            </div>
          </Card>
        ))}
      </div>
    );
  }

  // If there is no structured data, attempt to parse it from the 'content' string.
  // However, this situation should rarely occur because the backend now always returns structured data.
  try {
    // Attempt to parse the content in JSON format
    const parsedContent = JSON.parse(content);
    if (Array.isArray(parsedContent) && parsedContent.length > 0 && parsedContent[0].agent_name) {
      return (
        <div className="space-y-4">
          {parsedContent.map((item: AnalysisItem, index: number) => (
            <Card 
              key={index}
              size="small"
              className="border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-shadow duration-200"
              styles={{ body: { padding: '16px' } }}
            >
              <div className="mb-3">
                <Tag 
                  color="blue" 
                  className="text-xs font-medium px-2 py-1 rounded-full"
                >
                  {item.agent_name}
                </Tag>
              </div>
              <div className="prose prose-sm max-w-none">
                <Text className="text-gray-700 leading-relaxed whitespace-pre-wrap">
                  {item.content}
                </Text>
              </div>
            </Card>
          ))}
        </div>
      );
    }
  } catch (e) {
    // If the parsing fails, continue to use the simple text display.
  }

  // Final fallback: Simple text display (without any parsing)
  return (
    <div className="space-y-4">
      <Card 
        size="small"
        className="border border-gray-200 rounded-lg shadow-sm"
        styles={{ body: { padding: '16px' } }}
      >
        <div className="prose prose-sm max-w-none">
          <Text className="text-gray-700 leading-relaxed whitespace-pre-wrap">
            {content}
          </Text>
        </div>
      </Card>
    </div>
  );
};

export default AnalysisDisplay;