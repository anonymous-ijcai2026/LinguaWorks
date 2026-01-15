import React, { useState } from 'react';
import { Form, Input, Button, Card, Typography, message } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import { User } from 'lucide-react';

const { Title, Text } = Typography;

interface LoginProps {
  onLogin: (username: string, password: string) => Promise<void>;
  onRegister?: (username: string, password: string, email: string) => Promise<void>;
  loading?: boolean;
}

const Login: React.FC<LoginProps> = ({ onLogin, onRegister, loading = false }) => {
  const [form] = Form.useForm();
  const [isLoading, setIsLoading] = useState(false);
  const [isRegisterMode, setIsRegisterMode] = useState(false);

  const handleSubmit = async (values: { username: string; password: string; email?: string }) => {
    try {
      setIsLoading(true);
      if (isRegisterMode && onRegister) {
        await onRegister(values.username, values.password, values.email || '');
      } else {
        await onLogin(values.username, values.password);
      }
    } catch (error) {
      console.error(isRegisterMode ? 'Registration failed:' : 'Login failed:', error);
      message.error(isRegisterMode ? 'Registration failed. Please try again.' : 'Login failed. Please check your credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-purple-50">
      <Card className="w-full max-w-md shadow-2xl border-0 bg-white/95 backdrop-blur-xl">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-r from-indigo-100 to-purple-100 rounded-full mb-4">
            <User className="w-8 h-8 text-transparent bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text" style={{WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent'}} />
          </div>
          <Title level={2} className="text-transparent bg-gradient-to-r from-indigo-600 via-purple-600 to-blue-600 bg-clip-text mb-2 font-['Inter'] font-bold">
            🧙‍♂️ LinguaWorks
          </Title>
          <Text type="secondary" className="text-base font-['Inter']">
            {isRegisterMode ? 'Create your account to get started' : 'Sign in to your account to continue'}
          </Text>
        </div>

        <Form
          form={form}
          name="login"
          onFinish={handleSubmit}
          layout="vertical"
          size="large"
          className="space-y-4"
        >
          <Form.Item
            name="username"
            label="Username"
            rules={[
              { required: true, message: 'Please enter your username!' },
              { min: 3, message: 'Username must be at least 3 characters long!' }
            ]}
          >
            <Input
              prefix={<UserOutlined className="text-indigo-400" />}
              placeholder="Enter your username"
              className="rounded-lg border-indigo-200 focus:border-indigo-500"
            />
          </Form.Item>

          <Form.Item
            name="password"
            label="Password"
            rules={[
              { required: true, message: 'Please enter your password!' },
              { min: 4, message: 'Password must be at least 4 characters long!' }
            ]}
          >
            <Input.Password
              prefix={<LockOutlined className="text-indigo-400" />}
              placeholder="Enter your password"
              className="rounded-lg border-indigo-200 focus:border-indigo-500"
            />
          </Form.Item>

          {isRegisterMode && (
            <Form.Item
              name="email"
              label="Email"
              rules={[
                { required: true, message: 'Please enter your email!' },
                { type: 'email', message: 'Please enter a valid email!' }
              ]}
            >
              <Input
                prefix={<UserOutlined className="text-indigo-400" />}
                placeholder="Enter your email"
                className="rounded-lg border-indigo-200 focus:border-indigo-500"
              />
            </Form.Item>
          )}

          <Form.Item className="mb-0">
            <Button
              type="primary"
              htmlType="submit"
              loading={isLoading || loading}
              className="w-full h-12 rounded-lg bg-gradient-to-r from-indigo-600 via-purple-600 to-blue-600 hover:from-indigo-700 hover:via-purple-700 hover:to-blue-700 border-0 text-base font-medium shadow-lg hover:shadow-xl transition-all duration-300"
            >
              {isLoading || loading ? (isRegisterMode ? 'Creating Account...' : 'Signing in...') : (isRegisterMode ? 'Create Account' : 'Sign In')}
            </Button>
          </Form.Item>
        </Form>

        <div className="mt-6 text-center">
          <Text type="secondary" className="text-sm font-['Inter']">
            {isRegisterMode ? 'Already have an account?' : "Don't have an account?"}
            {' '}
            <Button 
              type="link" 
              className="p-0 h-auto text-sm text-indigo-600 hover:text-purple-600 font-medium"
              onClick={() => setIsRegisterMode(!isRegisterMode)}
            >
              {isRegisterMode ? 'Sign In' : 'Create Account'}
            </Button>
          </Text>
        </div>
      </Card>
    </div>
  );
};

export default Login;