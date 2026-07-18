import React, { useEffect, useState, useRef } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { supabase } from '../lib/supabase';
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
  const { session, setSession, setRole } = useAuthStore();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initializeAuth = async () => {
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      setSession(currentSession);

      if (currentSession?.user) {
        const { data, error } = await supabase
          .from('users')
          .select('role')
          .eq('id', currentSession.user.id)
          .single();

        if (error || !data) {
          setRole('staff');
        } else {
          setRole(data.role as 'admin' | 'staff' | 'demo');
        }
      }

      setLoading(false);
    };

    initializeAuth();

    const { data: authListener } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      setSession(newSession);
      if (newSession?.user) {
        const { data } = await supabase
          .from('users')
          .select('role')
          .eq('id', newSession.user.id)
          .single();
        setRole((data?.role as 'admin' | 'staff' | 'demo') || 'staff');
      } else {
        setRole(null);
      }
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, [setSession, setRole]);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <LottieLoader />
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
};

export default ProtectedRoute;
