import React, { useState } from 'react';
import { Layout as AntLayout, Menu, theme, Button, Space, Dropdown } from 'antd';
import type { MenuProps } from 'antd';
import {
  DashboardOutlined,
  UserOutlined,
  ClockCircleOutlined,
  BarChartOutlined,
  SettingOutlined,
  LogoutOutlined,
  CreditCardOutlined,
  ShoppingOutlined,
  DownOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
} from '@ant-design/icons';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';

const { Header, Sider, Content } = AntLayout;

const AppLayout: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false);
  const { role, setRole } = useAuthStore();
  const {
    token: { colorBgContainer },
  } = theme.useToken();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setRole(null);
    navigate('/login');
  };

  const menuItems: MenuProps['items'] = [
    {
      key: '/',
      icon: <DashboardOutlined />,
      label: 'Dashboard',
    },
    {
      key: '/customers',
      icon: <UserOutlined />,
      label: 'Visiteurs',
    },
    {
      key: '/sessions',
      icon: <ClockCircleOutlined />,
      label: 'Sessions',
    },
    {
      key: '/subscriptions',
      icon: <CreditCardOutlined />,
      label: 'Abonnements',
    },
    {
      key: '/products',
      icon: <ShoppingOutlined />,
      label: 'Produits',
    },
  ];

  if (role === 'admin') {
    menuItems?.push(
      {
        key: '/reports',
        icon: <BarChartOutlined />,
        label: 'Rapports',
      },
      {
        key: '/settings',
        icon: <SettingOutlined />,
        label: 'Paramètres',
      }
    );
  }

  const userMenuItems: MenuProps['items'] = [
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: 'Déconnexion',
      danger: true,
      onClick: handleLogout,
    },
  ];

  const pageTitle: Record<string, string> = {
    '/': 'Dashboard',
    '/customers': 'Visiteurs',
    '/sessions': 'Sessions',
    '/subscriptions': 'Abonnements',
    '/products': 'Produits',
    '/reports': 'Rapports',
    '/settings': 'Paramètres',
  };

  return (
    <AntLayout style={{ height: '100vh', overflow: 'hidden' }}>
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={(value) => setCollapsed(value)}
        width={260}
        collapsedWidth={72}
        trigger={null}
        style={{
          background: '#0f172a',
          boxShadow: '2px 0 12px 0 rgba(0,0,0,0.08)',
          zIndex: 100,
          overflow: 'auto',
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        <div
          style={{
            height: 72,
            margin: collapsed ? '16px 0 24px' : '16px 16px 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: collapsed ? 'center' : 'space-between',
            gap: 10,
            transition: 'all 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
            overflow: 'hidden',
            position: 'relative',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, overflow: 'hidden' }}>
            <svg width="36" height="36" viewBox="0 0 48 48" fill="none" style={{ flexShrink: 0 }}>
              <defs>
                <linearGradient id="sideLogoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" style={{stopColor:'#6366f1'}}/>
                  <stop offset="50%" style={{stopColor:'#8b5cf6'}}/>
                  <stop offset="100%" style={{stopColor:'#a855f7'}}/>
                </linearGradient>
              </defs>
              <path d="M24 2L42 13V35L24 46L6 35V13L24 2Z" fill="url(#sideLogoGrad)" rx="4"/>
              <path d="M30 16C26.5 13 20.5 13 17 16.5C13.5 20 13.5 26 17 29.5C20.5 33 26.5 33 30 29.5" 
                    stroke="white" strokeWidth="3.5" strokeLinecap="round" fill="none"/>
              <circle cx="31" cy="22.5" r="2" fill="white" opacity="0.9"/>
            </svg>
            {!collapsed && (
              <span style={{ color: 'white', fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em', whiteSpace: 'nowrap' }}>
                Co-Manager
              </span>
            )}
          </div>
          {!collapsed && (
            <Button
              type="text"
              icon={<MenuFoldOutlined />}
              onClick={() => setCollapsed(true)}
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                color: 'rgba(255,255,255,0.5)',
                flexShrink: 0,
                transition: 'all 0.25s ease',
              }}
            />
          )}
        </div>
        <div style={{ padding: collapsed ? '0 0' : '0 8px', transition: 'padding 0.3s cubic-bezier(0.4, 0, 0.2, 1)' }}>
          <Menu
            theme="dark"
            mode="inline"
            selectedKeys={[location.pathname]}
            items={menuItems}
            onClick={({ key }) => navigate(key)}
            style={{
              background: 'transparent',
              border: 'none',
            }}
          />
        </div>
        {!collapsed && (
          <div
            style={{
              position: 'absolute',
              bottom: 24,
              left: 16,
              right: 16,
              padding: '14px 16px',
              background: 'rgba(255,255,255,0.06)',
              borderRadius: 12,
              border: '1px solid rgba(255,255,255,0.08)',
              animation: 'fadeIn 0.3s ease forwards',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <UserOutlined style={{ color: 'white', fontSize: 14 }} />
              </div>
              <div style={{ overflow: 'hidden', flex: 1 }}>
                <div style={{ color: 'rgba(255,255,255,0.9)', fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap' }}>
                  {role === 'admin' ? 'Administrateur' : role === 'demo' ? 'Demo' : 'Staff'}
                </div>
                <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, whiteSpace: 'nowrap' }}>
                  {role === 'admin' ? 'Accès complet' : role === 'demo' ? 'Lecture seule' : 'Accès limité'}
                </div>
              </div>
            </div>
          </div>
        )}
        {collapsed && (
          <div
            style={{
              position: 'absolute',
              bottom: 24,
              left: 0,
              right: 0,
              display: 'flex',
              justifyContent: 'center',
            }}
          >
            <Button
              type="text"
              icon={<MenuUnfoldOutlined />}
              onClick={() => setCollapsed(false)}
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                color: 'rgba(255,255,255,0.6)',
                transition: 'all 0.25s ease',
              }}
            />
          </div>
        )}
      </Sider>
      <AntLayout style={{ display: 'flex', flexDirection: 'column', background: '#f8fafc' }}>
        <Header
          style={{
            padding: '0 20px',
            background: '#ffffff',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            boxShadow: '0 1px 0 0 #f1f5f9',
            zIndex: 99,
            height: 72,
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#0f172a', letterSpacing: '-0.02em' }}>
              {pageTitle[location.pathname] || 'Page'}
            </h2>
          </div>
          <Space size={16}>
            <Dropdown menu={{ items: userMenuItems }} placement="bottomRight" trigger={['click']}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  cursor: 'pointer',
                  padding: '6px 12px 6px 6px',
                  borderRadius: 12,
                  transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                  background: 'transparent',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#f8fafc')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <UserOutlined style={{ color: 'white', fontSize: 15 }} />
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', lineHeight: 1.2 }}>
                    {role === 'admin' ? 'Admin' : role === 'demo' ? 'Demo' : 'Staff'}
                  </div>
                  <div style={{ fontSize: 11, color: '#94a3b8', lineHeight: 1.2 }}>
                    {role === 'admin' ? 'Administrateur' : role === 'demo' ? 'Lecture seule' : 'Employé'}
                  </div>
                </div>
                <DownOutlined style={{ fontSize: 10, color: '#94a3b8' }} />
              </div>
            </Dropdown>
          </Space>
        </Header>
        
        {role === 'demo' && (
          <div style={{
            background: '#eef2ff',
            borderBottom: '1px solid #c7d2fe',
            padding: '10px 32px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            color: '#4338ca',
            fontSize: 14,
            fontWeight: 500,
            zIndex: 98
          }}>
            <span style={{ 
              background: '#4f46e5', 
              color: 'white', 
              padding: '2px 8px', 
              borderRadius: 6, 
              fontSize: 11, 
              fontWeight: 700,
              letterSpacing: '0.05em',
              textTransform: 'uppercase'
            }}>
              Portfolio Demo Mode
            </span>
            You are exploring a read-only version of the application. Administrative actions are disabled.
          </div>
        )}

        <Content style={{ margin: 0, overflow: 'hidden', flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div
            className="animate-fade-in"
            style={{
              height: '100%',
              background: colorBgContainer,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            <Outlet />
          </div>
        </Content>
      </AntLayout>
    </AntLayout>
  );
};

export default AppLayout;
