import React, { useState, useEffect, useRef } from 'react';
import { Input, Button, Typography, message } from 'antd';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';
import { MailOutlined, LockOutlined } from '@ant-design/icons';
import lottie from 'lottie-web';
import animationData from '../assets/loading-circles.json';

const { Title, Text } = Typography;

const LottieLoader: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      const anim = lottie.loadAnimation({
        container: containerRef.current,
        renderer: 'svg',
        loop: true,
        autoplay: true,
        animationData,
      });
      return () => anim.destroy();
    }
  }, []);

  return <div ref={containerRef} style={{ width: 150, height: 150 }} />;
};

const Login: React.FC = () => {
  const [email, setEmail] = useState('ramijawadi104@gmail.com');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showSuccessLoader, setShowSuccessLoader] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      message.error(error.message);
      setLoading(false);
    } else {
      message.success('Connexion réussie');
      setShowSuccessLoader(true);
      setTimeout(() => {
        navigate('/');
      }, 2000);
    }
  };

  if (showSuccessLoader) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#f8fafc' }}>
        <LottieLoader />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* Left Panel - Branding */}
      <div
        style={{
          flex: 1,
          background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #312e81 100%)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          padding: 60,
          position: 'relative',
        }}
      >
        {/* Decorative circles */}
        <div style={{
          position: 'absolute',
          width: 400,
          height: 400,
          borderRadius: '50%',
          background: 'rgba(99,102,241,0.12)',
          top: -100,
          right: -100,
        }} />
        <div style={{
          position: 'absolute',
          width: 250,
          height: 250,
          borderRadius: '50%',
          background: 'rgba(168,85,247,0.1)',
          bottom: -50,
          left: -50,
        }} />

        <div style={{ position: 'relative', zIndex: 1, textAlign: 'center' }}>
          <svg width="72" height="72" viewBox="0 0 48 48" fill="none" style={{ margin: '0 auto 28px', display: 'block', filter: 'drop-shadow(0 8px 24px rgba(99,102,241,0.5))' }}>
            <defs>
              <linearGradient id="loginLogoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" style={{stopColor:'#6366f1'}}/>
                <stop offset="50%" style={{stopColor:'#8b5cf6'}}/>
                <stop offset="100%" style={{stopColor:'#a855f7'}}/>
              </linearGradient>
              <linearGradient id="loginLogoInner" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" style={{stopColor:'#818cf8'}}/>
                <stop offset="100%" style={{stopColor:'#c084fc'}}/>
              </linearGradient>
              <filter id="loginGlow">
                <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
                <feMerge>
                  <feMergeNode in="coloredBlur"/>
                  <feMergeNode in="SourceGraphic"/>
                </feMerge>
              </filter>
            </defs>
            <path d="M24 2L42 13V35L24 46L6 35V13L24 2Z" fill="url(#loginLogoGrad)" rx="4"/>
            <path d="M24 8L36 15V33L24 40L12 33V15L24 8Z" fill="none" stroke="url(#loginLogoInner)" strokeWidth="1.5" opacity="0.4"/>
            <path d="M30 16C26.5 13 20.5 13 17 16.5C13.5 20 13.5 26 17 29.5C20.5 33 26.5 33 30 29.5" 
                  stroke="white" strokeWidth="3.5" strokeLinecap="round" fill="none" filter="url(#loginGlow)"/>
            <circle cx="31" cy="22.5" r="2" fill="white" opacity="0.9"/>
          </svg>
          <h1 style={{ color: 'white', fontSize: 36, fontWeight: 800, margin: '0 0 12px', letterSpacing: '-0.03em' }}>
            Co-Manager
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 16, margin: 0, maxWidth: 300, lineHeight: 1.6 }}>
            Gérez votre espace de coworking avec facilité et elegance
          </p>
        </div>
      </div>

      {/* Right Panel - Login Form */}
      <div
        style={{
          width: 480,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          padding: 60,
          background: '#ffffff',
        }}
      >
        <div style={{ width: '100%', maxWidth: 360 }}>
          <div style={{ marginBottom: 40 }}>
            <Title level={3} style={{ margin: '0 0 8px', fontWeight: 700, color: '#0f172a', letterSpacing: '-0.02em' }}>
              Bienvenue
            </Title>
            <Text style={{ fontSize: 15, color: '#64748b' }}>
              Connectez-vous pour accéder à votre tableau de bord
            </Text>
          </div>

          <form onSubmit={handleLogin}>
            <div style={{ marginBottom: 18 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 6 }}>
                Email
              </label>
              <Input
                type="email"
                placeholder="admin@coworking.com"
                prefix={<MailOutlined style={{ color: '#94a3b8' }} />}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                size="large"
                style={{ borderRadius: 10, padding: '10px 14px' }}
              />
            </div>
            <div style={{ marginBottom: 28 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 6 }}>
                Mot de passe
              </label>
              <Input.Password
                placeholder="Entrez votre mot de passe"
                prefix={<LockOutlined style={{ color: '#94a3b8' }} />}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                size="large"
                style={{ borderRadius: 10, padding: '10px 14px' }}
              />
            </div>
            <Button
              type="primary"
              htmlType="submit"
              block
              loading={loading}
              size="large"
              style={{
                height: 48,
                borderRadius: 10,
                fontWeight: 600,
                fontSize: 15,
                background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)',
                border: 'none',
                boxShadow: '0 4px 12px rgba(79,70,229,0.3)',
              }}
            >
              Se connecter
            </Button>
          </form>

          <div style={{ textAlign: 'center', marginTop: 32 }}>
            <Text style={{ fontSize: 12, color: '#94a3b8' }}>
              Système de gestion Co-Manager v1.0
            </Text>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
