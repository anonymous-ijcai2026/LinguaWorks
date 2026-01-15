import React, { useState, useMemo } from "react";
import { List, Tooltip, Button, Popconfirm, Input, Spin } from "antd";
import {
  MessageOutlined,
  DeleteOutlined,
  EditOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  PlusCircleOutlined,
} from "@ant-design/icons";
import { Session } from "../services/databaseService";
import { truncateText } from "../utils/helpers";

interface SessionListProps {
  sessions: Session[];
  activeSessionId: string;
  onSelectSession: (id: string) => void;
  onDeleteSession: (id: string) => void;
  onUpdateSessionName: (id: string, newName: string) => void;
  onCreateNewSession: () => void;
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
  loading?: boolean;
}

const SessionList: React.FC<SessionListProps> = ({
  sessions,
  activeSessionId,
  onSelectSession,
  onDeleteSession,
  onUpdateSessionName,
  onCreateNewSession,
  collapsed,
  setCollapsed,
  loading = false,
}) => {
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  const getSmartSessionName = (session: Session): string => {
    if (
      session.name &&
      !session.name.includes("Conversation") &&
      !session.name.includes("会话")
    ) {
      return session.name;
    }
    return session.name || "New Conversation";
  };


  const formatTimeDisplay = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();

    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const sessionDate = new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
    );

    const diffTime = today.getTime() - sessionDate.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return "Today";
    } else if (diffDays === 1) {
      return "Yesterday";
    } else if (diffDays === 2) {
      return "2 days ago";
    } else if (diffDays <= 7) {
      return `${diffDays} days ago`;
    } else if (diffDays <= 30) {
      return "Last week";
    } else if (diffDays <= 90) {
      return "Last month";
    } else if (diffDays <= 180) {
      return "3 months ago";
    } else if (diffDays <= 365) {
      return "6 months ago";
    } else if (diffDays <= 730) {
      return "Last year";
    } else {

      const sessionYear = date.getFullYear();
      return `${sessionYear}`;
    }
  };

  const groupedSessions = useMemo(() => {
    const groups: { [key: string]: Session[] } = {};

    sessions.forEach((session) => {
      const timeKey = formatTimeDisplay(
        session.updated_at || session.created_at || new Date().toISOString(),
      );
      if (!groups[timeKey]) {
        groups[timeKey] = [];
      }
      groups[timeKey].push(session);
    });

    const sortedGroups = Object.entries(groups).sort(([a], [b]) => {
      const timeOrder = [
        "Today",
        "Yesterday",
        "2 days ago",
        "3 days ago",
        "4 days ago",
        "5 days ago",
        "6 days ago",
        "7 days ago",
        "Last week",
        "Last month",
        "3 months ago",
        "6 months ago",
        "Last year",
      ];

      const aIndex = timeOrder.indexOf(a);
      const bIndex = timeOrder.indexOf(b);

      if (aIndex !== -1 && bIndex !== -1) {
        return aIndex - bIndex;
      }
      else if (aIndex !== -1) {
        return -1;
      }
      else if (bIndex !== -1) {
        return 1;
      }
      else {
        const yearA = parseInt(a);
        const yearB = parseInt(b);
        return yearB - yearA; // 倒序，新年份在前
      }
    });

    return sortedGroups;
  }, [sessions]);

  const handleToggleCollapse = () => {
    setCollapsed(!collapsed);
  };

  const startEditing = (session: Session, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingSessionId(session.id);
    setEditingName(session.name);
  };

  const saveSessionName = (sessionId: string) => {
    if (editingName.trim()) {
      onUpdateSessionName(sessionId, editingName);
    }
    setEditingSessionId(null);
  };

  return (
    <div
      className={`h-full flex flex-col transition-all duration-300 ${
        collapsed ? "w-20" : "w-full"
      } bg-gradient-to-b from-white via-blue-50 to-indigo-50 backdrop-blur-sm border-r border-blue-200/50 shadow-xl`}
    >
      <div className="flex items-center justify-between py-4 px-4 border-b border-gradient-to-r from-blue-200 to-indigo-200 bg-gradient-to-r from-white to-blue-50">
        <div
          className={`overflow-hidden transition-all duration-300 ${
            collapsed ? "w-0 opacity-0" : "w-auto opacity-100"
          }`}
        >
          <Button
            onClick={onCreateNewSession}
            className="bg-gradient-to-r from-blue-500 to-indigo-600 text-white border-none shadow-lg hover:shadow-xl hover:from-blue-600 hover:to-indigo-700 flex items-center justify-center w-36 h-12 rounded-xl text-base font-semibold tracking-wide transform hover:scale-105 transition-all duration-300"
            icon={<PlusCircleOutlined className="text-lg" />}
          >
            <span className="font-['Inter'] font-semibold">New Chat</span>
          </Button>
        </div>
        <Button
          type="text"
          icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
          onClick={handleToggleCollapse}
          className="text-gray-600 hover:text-blue-600 hover:bg-blue-100/70 transition-all duration-300 rounded-lg p-2 backdrop-blur-sm"
        />
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden p-2">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            {!collapsed ? (
              <Spin size="small" spinning={true} className="text-blue-600">
                <div className="min-h-[40px] flex items-center justify-center">
                  <div className="text-gray-500 text-sm">
                    Loading sessions...
                  </div>
                </div>
              </Spin>
            ) : (
              <Spin size="small" className="text-blue-600" />
            )}
          </div>
        ) : sessions.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-500 font-['Inter']">
            {!collapsed && (
              <div className="text-center">
                <div className="text-4xl mb-2">💬</div>
                <div className="font-medium">No conversations yet</div>
                <div className="text-sm text-gray-400 mt-1">
                  Start a new chat to begin
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {groupedSessions.map(([timeGroup, groupSessions]) => (
              <div key={timeGroup}>
                {!collapsed && (
                  <div
                    className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider"
                    style={{ fontFamily: "Inter" }}
                  >
                    {timeGroup}
                  </div>
                )}
                <List
                  dataSource={groupSessions}
                  renderItem={(session) => {
                    const smartName = getSmartSessionName(session);
                    const displayName = truncateText(smartName, 25);

                    return (
                      <List.Item
                        className={`group cursor-pointer border-0 ${
                          collapsed ? "mx-1" : "mx-2"
                        } my-1 ${
                          collapsed ? "px-1" : "px-4"
                        } py-3 rounded-xl transition-all duration-300 transform hover:scale-[1.02] hover:shadow-md ${
                          session.id === activeSessionId
                            ? "bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow-lg border-l-4 border-l-blue-300"
                            : "bg-white/70 hover:bg-white/90 backdrop-blur-sm border border-blue-100/50 hover:border-blue-200"
                        }`}
                        onClick={() => onSelectSession(session.id)}
                      >
                        <div
                          className={`flex items-center ${
                            collapsed
                              ? "w-full justify-center"
                              : "w-[98%] justify-between"
                          }`}
                        >
                          {collapsed ? (
                            <Tooltip title={smartName} placement="right">
                              <div
                                className={`flex items-center justify-center w-10 h-10 rounded-full transition-all duration-300 ${
                                  session.id === activeSessionId
                                    ? "bg-white/20 backdrop-blur-sm"
                                    : "bg-gradient-to-br from-blue-100 to-indigo-100"
                                }`}
                              >
                                <MessageOutlined
                                  className={`text-lg ${
                                    session.id === activeSessionId
                                      ? "text-white"
                                      : "text-blue-600"
                                  }`}
                                />
                              </div>
                            </Tooltip>
                          ) : (
                            <>
                              <div className="flex items-center flex-1 min-w-0">
                                <div
                                  className={`flex items-center justify-center w-10 h-10 rounded-full mr-3 transition-all duration-300 flex-shrink-0 ${
                                    session.id === activeSessionId
                                      ? "bg-white/20 backdrop-blur-sm"
                                      : "bg-gradient-to-br from-blue-100 to-indigo-100"
                                  }`}
                                >
                                  <MessageOutlined
                                    className={`text-lg ${
                                      session.id === activeSessionId
                                        ? "text-white"
                                        : "text-blue-600"
                                    }`}
                                  />
                                </div>
                                <div className="flex-1 min-w-0">
                                  {editingSessionId === session.id ? (
                                    <Input
                                      value={editingName}
                                      onChange={(e) =>
                                        setEditingName(e.target.value)
                                      }
                                      onPressEnter={() =>
                                        saveSessionName(session.id)
                                      }
                                      onBlur={() => saveSessionName(session.id)}
                                      autoFocus
                                      size="small"
                                      className="w-full rounded-lg border-blue-200 focus:border-blue-400 font-['Inter']"
                                    />
                                  ) : (
                                    <Tooltip
                                      title={
                                        smartName.length > 25
                                          ? smartName
                                          : undefined
                                      }
                                      placement="top"
                                    >
                                      <div
                                        className={`truncate font-['Inter'] font-medium text-sm ${
                                          session.id === activeSessionId
                                            ? "text-white"
                                            : "text-gray-800"
                                        }`}
                                      >
                                        {displayName}
                                      </div>
                                    </Tooltip>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center ml-2 opacity-0 group-hover:opacity-100 transition-all duration-300 flex-shrink-0">
                                {editingSessionId !== session.id && (
                                  <Button
                                    type="text"
                                    icon={<EditOutlined />}
                                    size="small"
                                    onClick={(e) => startEditing(session, e)}
                                    className={`mr-1 rounded-lg transition-all duration-300 ${
                                      session.id === activeSessionId
                                        ? "text-white/80 hover:text-white hover:bg-white/20"
                                        : "text-gray-500 hover:text-blue-600 hover:bg-blue-100"
                                    }`}
                                  />
                                )}
                                <Popconfirm
                                  title="Are you sure you want to delete this conversation？"
                                  onConfirm={(e) => {
                                    e?.stopPropagation();
                                    onDeleteSession(session.id);
                                  }}
                                  okText="Yes"
                                  cancelText="No"
                                >
                                  <Button
                                    type="text"
                                    danger
                                    icon={<DeleteOutlined />}
                                    size="small"
                                    onClick={(e) => e.stopPropagation()}
                                    className={`rounded-lg transition-all duration-300 ${
                                      session.id === activeSessionId
                                        ? "text-white/80 hover:text-white hover:bg-red-500/30"
                                        : "text-gray-500 hover:text-red-500 hover:bg-red-100"
                                    }`}
                                  />
                                </Popconfirm>
                              </div>
                            </>
                          )}
                        </div>
                      </List.Item>
                    );
                  }}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default SessionList;
