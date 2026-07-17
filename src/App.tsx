import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConfigProvider } from 'antd';
import frFR from 'antd/locale/fr_FR';
import dayjs from 'dayjs';
import 'dayjs/locale/fr';
import AppLayout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import Dashboard from './pages/Dashboard';
import Customers from './pages/Customers';
import Sessions from './pages/Sessions';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import Login from './pages/Login';
import Subscriptions from './pages/Subscriptions';
import Products from './pages/Products';

dayjs.locale('fr');

const queryClient = new QueryClient();

const App: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <ConfigProvider
        locale={frFR}
        theme={{
          token: {
            fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
            colorPrimary: '#4f46e5',
            colorSuccess: '#10b981',
            colorWarning: '#f59e0b',
            colorError: '#ef4444',
            colorInfo: '#3b82f6',
            borderRadius: 10,
            colorBgLayout: '#f8fafc',
            colorBgContainer: '#ffffff',
            boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.04), 0 1px 2px -1px rgb(0 0 0 / 0.04)',
            boxShadowSecondary: '0 4px 6px -1px rgb(0 0 0 / 0.05), 0 2px 4px -2px rgb(0 0 0 / 0.05)',
            fontSize: 14,
            colorText: '#1e293b',
            colorTextSecondary: '#64748b',
            colorBorder: '#e2e8f0',
            colorBorderSecondary: '#f1f5f9',
          },
          components: {
            Button: {
              controlHeight: 40,
              fontWeight: 500,
              paddingInline: 20,
            },
            Card: {
              borderRadiusLG: 14,
              paddingLG: 24,
            },
            Table: {
              borderRadiusLG: 12,
              headerBg: '#f8fafc',
              headerColor: '#475569',
              headerSortActiveBg: '#f1f5f9',
              rowHoverBg: '#f8fafc',
              colorBgContainer: '#ffffff',
            },
            Input: {
              controlHeight: 40,
              borderRadius: 10,
            },
            Select: {
              controlHeight: 40,
              borderRadius: 10,
            },
            DatePicker: {
              controlHeight: 40,
              borderRadius: 10,
            },
            Menu: {
              itemBorderRadius: 10,
              itemMarginInline: 8,
              itemPaddingInline: 16,
              itemHeight: 44,
              iconSize: 18,
            },
            Modal: {
              borderRadiusLG: 16,
              paddingLG: 28,
            },
            Statistic: {
              titleFontSize: 13,
            },
          },
        }}
      >
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />

            {/* Protected Routes */}
            <Route element={<ProtectedRoute />}>
              <Route path="/" element={<AppLayout />}>
                <Route index element={<Dashboard />} />
                <Route path="customers" element={<Customers />} />
                <Route path="sessions" element={<Sessions />} />
                <Route path="subscriptions" element={<Subscriptions />} />
                <Route path="products" element={<Products />} />
                <Route path="reports" element={<Reports />} />
                <Route path="settings" element={<Settings />} />
              </Route>
            </Route>
          </Routes>
        </BrowserRouter>
      </ConfigProvider>
    </QueryClientProvider>
  );
};

export default App;
