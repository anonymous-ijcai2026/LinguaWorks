import React, { useState, useRef, useEffect } from 'react';
import { Input, Button, Spin, message, Collapse } from 'antd';
import { SendOutlined } from '@ant-design/icons';
import ReactMarkdown from 'react-markdown';

const { TextArea } = Input;

interface ChatMessage {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  timestamp: string;
  message_order?: number;
  response_time_ms?: number;
  token_count?: number;
  suggestions?: Array<{
    title?: string;
    edit?: string;
    why?: string;
    expected_effect?: string;
  }>;
}

interface ChatTestWindowProps {
  sessionId: string;
  versionNumber: number;
  height?: string;
  className?: string;
}

const ChatTestWindow: React.FC<ChatTestWindowProps> = ({
  sessionId,
  versionNumber,
  height = '300px',
  className = ''
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);





  // Load the chat history
  useEffect(() => {
    const loadChatHistory = async () => {
      try {
        setLoadingHistory(true);
        // Obtain the authentication header information
        const authHeaders: { [key: string]: string } = {
          'Content-Type': 'application/json',
        };
        
        const userData = localStorage.getItem('user');
        if (userData) {
          const user = JSON.parse(userData);
          authHeaders['Authorization'] = `Bearer ${user.id}`;
        }
        
        const response = await fetch('http://localhost:8000/chat-test-history', {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({
          session_id: sessionId,
          version_id: versionNumber,
          limit: 50
        }),
        });

        if (response.ok) {
          const data = await response.json();
          if (data.status === 'success' && data.result.messages) {
            const historyMessages: ChatMessage[] = data.result.messages.map((msg: any) => {
              let meta: any = msg?.metadata ?? null;
              if (typeof meta === 'string' && meta) {
                try {
                  meta = JSON.parse(meta);
                } catch {
                  meta = null;
                }
              }

              const suggestions = Array.isArray(meta?.suggestions) ? meta.suggestions : [];

              return {
                id: msg.id.toString(),
                type: msg.message_type as 'user' | 'assistant',
                content: msg.content,
                timestamp: msg.created_at,
                message_order: msg.message_order,
                response_time_ms: msg.response_time_ms,
                token_count: msg.token_count,
                suggestions: suggestions,
              };
            });
            setMessages(historyMessages);
          }
        }
      } catch (error) {
        console.error('Failed to load chat history:', error);
      } finally {
        setLoadingHistory(false);
      }
    };

    loadChatHistory();
  }, [sessionId, versionNumber]);

  const saveMessageToDatabase = async (
    messageType: 'user' | 'assistant',
    content: string,
    responseTimeMs?: number,
    metadata?: any,
  ): Promise<number | null> => {
    try {
      const authHeaders: { [key: string]: string } = {
        'Content-Type': 'application/json',
      };
      
      const userData = localStorage.getItem('user');
      if (userData) {
        const user = JSON.parse(userData);
        authHeaders['Authorization'] = `Bearer ${user.id}`;
      }
      
      const res = await fetch('http://localhost:8000/chat-test-save-message', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          session_id: sessionId,
          version_id: versionNumber,
          message_type: messageType,
          content: content,
          response_time_ms: responseTimeMs,
          token_count: null,
          metadata: metadata ?? null
        }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      const messageId = data?.result?.message_id;
      return typeof messageId === 'number' ? messageId : null;
    } catch (error) {
      console.error('Failed to save message to database:', error);
      return null;
    }
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim() || loading) return;

    const tempUserId = Date.now().toString();
    const userMessage: ChatMessage = {
      id: tempUserId,
      type: 'user',
      content: inputValue.trim(),
      timestamp: new Date().toISOString()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setLoading(true);

    const savedUserId = await saveMessageToDatabase('user', userMessage.content);
    if (savedUserId != null) {
      setMessages(prev => prev.map(m => (m.id === tempUserId ? { ...m, id: savedUserId.toString() } : m)));
    }

    try {
      const startTime = Date.now();
      const authHeaders: { [key: string]: string } = {
        'Content-Type': 'application/json',
      };
      
      const userData = localStorage.getItem('user');
      if (userData) {
        const user = JSON.parse(userData);
        authHeaders['Authorization'] = `Bearer ${user.id}`;
      }
      
      const response = await fetch('http://localhost:8000/chat-test-version', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          session_id: sessionId,
          version_number: versionNumber,
          user_message: userMessage.content
        }),
      });

      const result = await response.json();
      const responseTime = Date.now() - startTime;

      if (result.status === 'success') {
        const tempAssistantId = (Date.now() + 1).toString();
        const assistantMessage: ChatMessage = {
          id: tempAssistantId,
          type: 'assistant',
          content: result.result.response,
          timestamp: new Date().toISOString(),
          response_time_ms: responseTime,
          suggestions: Array.isArray(result.result.suggestions) ? result.result.suggestions : []
        };
        setMessages(prev => [...prev, assistantMessage]);

        const savedAssistantId = await saveMessageToDatabase(
          'assistant',
          assistantMessage.content,
          responseTime,
          { suggestions: assistantMessage.suggestions }
        );
        if (savedAssistantId != null) {
          setMessages(prev => prev.map(m => (m.id === tempAssistantId ? { ...m, id: savedAssistantId.toString() } : m)));
        }
      } else {
        message.error('Test failed, please try again');
      }
    } catch (error) {
      console.error('Chat test error:', error);
      message.error('Network error, please try again');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputValue(e.target.value);
  };

  return (
    <div className={`flex flex-col bg-white border border-gray-200 rounded-xl ${className}`} style={{ height }}>
      {/* 消息列表 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3" style={{ minHeight: '200px' }}>
        {loadingHistory ? (
          <div className="text-center text-gray-400 py-8">
            <Spin size="small" />
            <div className="text-sm mt-2">Loading chat history...</div>
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center text-gray-400 py-8">
            <div className="text-2xl mb-2">💭</div>
            <div className="text-sm">Start a conversation to test this prompt</div>
            <div className="text-xs mt-1">Type a message below and see how the AI responds</div>
          </div>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.type === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] rounded-lg px-3 py-2 ${
                msg.type === 'user'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-100 text-gray-800 border border-gray-200'
              }`}>
                {msg.type === 'user' ? (
                  <div className="text-sm whitespace-pre-wrap">{msg.content}</div>
                ) : (
                  <div className="text-sm">
                    <ReactMarkdown className="prose prose-sm max-w-none">
                      {msg.content}
                    </ReactMarkdown>
                    {msg.suggestions && msg.suggestions.length > 0 ? (
                      <div className="mt-3 p-3 rounded-lg border border-amber-200 bg-amber-50">
                        <Collapse
                          size="small"
                          ghost
                          defaultActiveKey={[]}
                          items={[
                            {
                              key: "ideas",
                              label: (
                                <span className="text-xs font-semibold text-amber-800">
                                  Prompt improvement ideas
                                </span>
                              ),
                              children: (
                                <Collapse
                                  size="small"
                                  ghost
                                  accordion
                                  defaultActiveKey={[]}
                                  items={msg.suggestions.slice(0, 5).map((s, idx) => ({
                                    key: String(idx),
                                    label: (
                                      <span className="text-xs font-medium text-amber-900">
                                        {s.title || `Suggestion ${idx + 1}`}
                                      </span>
                                    ),
                                    children: (
                                      <div className="space-y-2 text-xs text-amber-900">
                                        {s.edit ? (
                                          <div className="rounded-md border border-amber-200 bg-white px-2 py-1 whitespace-pre-wrap text-amber-900/90">
                                            {s.edit}
                                          </div>
                                        ) : null}
                                        {(s.why || s.expected_effect) ? (
                                          <div className="text-amber-900/80">
                                            {s.why ? <span>{s.why}</span> : null}
                                            {s.why && s.expected_effect ? (
                                              <span> · </span>
                                            ) : null}
                                            {s.expected_effect ? (
                                              <span>{s.expected_effect}</span>
                                            ) : null}
                                          </div>
                                        ) : null}
                                      </div>
                                    ),
                                  }))}
                                />
                              ),
                            },
                          ]}
                        />
                      </div>
                    ) : null}
                  </div>
                )}
                <div className={`text-xs mt-1 opacity-70 ${
                  msg.type === 'user' ? 'text-blue-100' : 'text-gray-500'
                }`}>
                  {new Date(msg.timestamp).toLocaleTimeString()}
                </div>
              </div>
            </div>
          ))
        )}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 border border-gray-200 rounded-lg px-3 py-2">
              <Spin size="small" />
              <span className="ml-2 text-sm text-gray-600">AI is thinking...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* 输入区域 */}
      <div className="flex-shrink-0 p-4 border-t border-gray-200 bg-gray-50">
        <div className="flex gap-2">
          <TextArea
            value={inputValue}
            onChange={handleInputChange}
            onKeyPress={handleKeyPress}
            placeholder="Type your test message here..."
            autoSize={{ minRows: 1, maxRows: 3 }}
            className="flex-1"
            disabled={loading}
          />
          <Button
            type="primary"
            icon={<SendOutlined />}
            onClick={handleSendMessage}
            loading={loading}
            disabled={!inputValue.trim()}
            className="self-end"
          >
            Send
          </Button>
        </div>
        <div className="text-xs text-gray-500 mt-2">
          Press Enter to send, Shift+Enter for new line
        </div>
      </div>
    </div>
  );
};

export default ChatTestWindow;
