import React, { useEffect, useState, useRef } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { getSession } from '../lib/auth';
import { Alert, Button } from 'antd';
import { useQueryClient } from '@tanstack/react-query';
import lottie from 'lottie-web';
import animationData from '../assets/loading-circles.json';

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

const ProtectedRoute: React.FC = () => {
  const { session, setSession, signOut } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const queryClient = useQueryClient();

  useEffect(() => {
    let mounted = true;
    const initializeAuth = async () => {
      try {
        const currentSession = await getSession();
        if (mounted) setSession(currentSession);
      } catch (cause) {
        if (mounted) setError(cause instanceof Error ? cause.message : 'Unable to verify your session.');
      } finally {
        if (mounted) setLoading(false);
      }
    };
    void initializeAuth();
    const expireSession = () => {
      signOut();
      queryClient.clear();
    };
    window.addEventListener('auth-expired', expireSession);
    return () => {
      mounted = false;
      window.removeEventListener('auth-expired', expireSession);
    };
  }, [setSession, signOut, queryClient, attempt]);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <LottieLoader />
      </div>
    );
  }

  if (error) {
    return <Alert type="error" showIcon title="Connexion indisponible" description={error}
      action={<Button onClick={() => {
        setLoading(true);
        setError(null);
        setAttempt(value => value + 1);
      }}>Réessayer</Button>} />;
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
};

export default ProtectedRoute;
