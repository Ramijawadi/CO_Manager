import React from 'react';
import { Card, Statistic, Typography } from 'antd';
import {
  UserOutlined,
  ClockCircleOutlined,
  DollarOutlined,
  CrownOutlined,
  ShoppingOutlined,
  ArrowUpOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { getDashboardStats, getChartData } from '../features/dashboard/api';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  AreaChart, Area
} from 'recharts';

const { Text } = Typography;

const metricCards = [
  {
    title: "Visiteurs",
    key: 'totalVisitorsToday',
    icon: <UserOutlined />,
    color: '#4f46e5',
    bg: 'linear-gradient(135deg, #eef2ff 0%, #e0e7ff 100%)',
    suffix: null,
    precision: 0,
    trend: '+12%',
  },
  {
    title: 'Sessions',
    key: 'activeSessions',
    icon: <ClockCircleOutlined />,
    color: '#059669',
    bg: 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)',
    suffix: null,
    precision: 0,
    trend: '+5%',
  },
  {
    title: 'Revenus',
    key: 'revenueToday',
    icon: <DollarOutlined />,
    color: '#d97706',
    bg: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)',
    suffix: ' DT',
    precision: 2,
    trend: '+18%',
  },
  {
    title: 'Abonnements',
    key: 'activeSubscriptions',
    icon: <CrownOutlined />,
    color: '#7c3aed',
    bg: 'linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%)',
    suffix: null,
    precision: 0,
    trend: '+3%',
  },
  {
    title: 'Produits',
    key: 'productSalesToday',
    icon: <ShoppingOutlined />,
    color: '#db2777',
    bg: 'linear-gradient(135deg, #fdf2f8 0%, #fce7f3 100%)',
    suffix: null,
    precision: 0,
    trend: '+8%',
  },
];

const Dashboard: React.FC = () => {
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['dashboardStats'],
    queryFn: getDashboardStats,
  });

  const { data: charts, isLoading: chartsLoading } = useQuery({
    queryKey: ['dashboardCharts'],
    queryFn: getChartData,
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Metrics Row */}
      <div style={{ display: 'flex', gap: 14, marginBottom: 18, flex: '0 0 auto' }}>
        {metricCards.map((card, index) => (
          <Card
            key={card.key}
            loading={statsLoading}
            bordered={false}
            className="animate-fade-in-up"
            style={{
              flex: 1,
              borderRadius: 14,
              border: '1px solid #f1f5f9',
              overflow: 'hidden',
              animationDelay: `${index * 0.08}s`,
            }}
            styles={{ body: { padding: '22px 24px 20px', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' } }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <div style={{ minWidth: 0 }}>
                <Text style={{ fontSize: 13, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  {card.title}
                </Text>
                <div style={{ marginTop: 10 }}>
                  <Statistic
                    value={stats?.[card.key as keyof typeof stats] as number}
                    precision={card.precision}
                    suffix={card.suffix}
                    valueStyle={{ fontSize: 28, fontWeight: 700, color: '#0f172a', lineHeight: 1 }}
                  />
                </div>
              </div>
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 13,
                  background: card.bg,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <span style={{ fontSize: 20, color: card.color }}>{card.icon}</span>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 14 }}>
              <ArrowUpOutlined style={{ fontSize: 11, color: '#10b981' }} />
              <Text style={{ fontSize: 13, color: '#10b981', fontWeight: 600 }}>
                {card.trend}
              </Text>
              <Text style={{ fontSize: 13, color: '#94a3b8' }}>vs hier</Text>
            </div>
          </Card>
        ))}
      </div>

      {/* Charts Row - takes remaining space */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 14 }}>
        <div style={{ flex: 1, minWidth: 0 }} className="animate-fade-in-up" /* animation delay handled by index.css */>
          <Card
            loading={chartsLoading}
            bordered={false}
            style={{ borderRadius: 14, border: '1px solid #f1f5f9', height: '100%' }}
            styles={{ body: { padding: '18px 20px 8px', height: '100%', display: 'flex', flexDirection: 'column' } }}
          >
            <Text style={{ fontSize: 14, fontWeight: 600, color: '#0f172a', marginBottom: 14, flexShrink: 0 }}>
              Flux de Revenus
            </Text>
            <div style={{ flex: 1, minHeight: 0 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={charts?.revenueData}>
                  <defs>
                    <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11 }} width={45} />
                  <RechartsTooltip
                    formatter={(value) => [`${value} DT`, 'Revenus']}
                    contentStyle={{ borderRadius: 10, border: '1px solid #f1f5f9', boxShadow: '0 4px 12px rgba(0,0,0,0.06)', fontSize: 13 }}
                  />
                  <Area type="monotone" dataKey="revenue" stroke="#6366f1" strokeWidth={2.5} fillOpacity={1} fill="url(#colorRevenue)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>

        <div style={{ flex: 1, minWidth: 0 }} className="animate-fade-in-up">
          <Card
            loading={chartsLoading}
            bordered={false}
            style={{ borderRadius: 14, border: '1px solid #f1f5f9', height: '100%' }}
            styles={{ body: { padding: '18px 20px 8px', height: '100%', display: 'flex', flexDirection: 'column' } }}
          >
            <Text style={{ fontSize: 14, fontWeight: 600, color: '#0f172a', marginBottom: 14, flexShrink: 0 }}>
              Flux de Visiteurs
            </Text>
            <div style={{ flex: 1, minHeight: 0 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={charts?.visitorData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11 }} width={40} />
                  <RechartsTooltip
                    formatter={(value) => [value, 'Visiteurs']}
                    contentStyle={{ borderRadius: 10, border: '1px solid #f1f5f9', boxShadow: '0 4px 12px rgba(0,0,0,0.06)', fontSize: 13 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="visitors"
                    stroke="#10b981"
                    strokeWidth={2.5}
                    dot={{ r: 3, fill: '#10b981', strokeWidth: 2, stroke: '#fff' }}
                    activeDot={{ r: 6, fill: '#10b981', strokeWidth: 2, stroke: '#fff' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
