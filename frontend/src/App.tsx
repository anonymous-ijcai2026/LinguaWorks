import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { Spin } from "antd";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import HomePage from "./pages/HomePage";
import ChatInterface from "./components/ChatInterface";
import Settings from "./components/Settings";
import ChatTestWindow from "./components/ChatTestWindow";
import Login from "./components/Login";
import "./App.css";

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { user, isLoading, login, register } = useAuth();

  if (isLoading) {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "100vh",
        }}
      >
        <Spin size="large" />
      </div>
    );
  }

  if (!user) {
    const handleLogin = async (
      username: string,
      password: string,
    ): Promise<void> => {
      const success = await login(username, password);
      if (!success) {
        throw new Error("Login failed");
      }
    };

    const handleRegister = async (
      username: string,
      password: string,
      email: string,
    ): Promise<void> => {
      const success = await register(username, password, email);
      if (!success) {
        throw new Error("Registration failed");
      }
    };

    return <Login onLogin={handleLogin} onRegister={handleRegister} />;
  }

  return <>{children}</>;
};

const AppRouter: React.FC = () => {
  return (
    <Router>
      <Routes>
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <HomePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/chat/:sessionId"
          element={
            <ProtectedRoute>
              <ChatInterface
                messages={[]}
                onSendMessage={() => {}}
                onSendFeedback={() => {}}
                currentStep="structure"
                loading={false}
              />
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings"
          element={
            <ProtectedRoute>
              <Settings visible={true} onClose={() => {}} />
            </ProtectedRoute>
          }
        />
        <Route
          path="/test/:sessionId"
          element={
            <ProtectedRoute>
              <ChatTestWindow sessionId="test-session" versionNumber={1} />
            </ProtectedRoute>
          }
        />
      </Routes>
    </Router>
  );
};

const App: React.FC = () => {
  return (
    <AuthProvider>
      <AppRouter />
    </AuthProvider>
  );
};

export default App;
