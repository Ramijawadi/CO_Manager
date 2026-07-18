import React from 'react';
import { Card, Statistic, Typography, Table, Tag, Tooltip } from 'antd';
import {
  UserOutlined,
  ClockCircleOutlined,
  DollarOutlined,
  CrownOutlined,
  ShoppingOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/fr';
import {
  getDashboardStats,
  getChartData,
  getTopProducts,
  getActiveSessionsList,
} from '../features/dashboard/api';
import { useDashboardRealtime } from '../hooks/useDashboardRealtime';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
} from 'recharts';

dayjs.extend(relativeTime);
dayjs.locale('fr');

const { Text } = Typography;

const metricCards = [
  {
    title: 'Visiteurs',
    key: 'totalVisitorsToday',
    icon: <UserOutlined />,
    color: '#4f46e5',
    bg: 'linear-gradient(135deg, #eef2ff 0%, #e0e7ff 100%)',
    suffix: null,
    precision: 0,
  },
  {
    title: 'Sessions actives',
    key: 'activeSessions',
    icon: <ClockCircleOutlined />,
    color: '#059669',
    bg: 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)',
    suffix: null,
    precision: 0,
  },
  {
    title: "Revenus du jour",
    key: 'revenueToday',
    icon: <DollarOutlined />,
    color: '#d97706',
    bg: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)',
    suffix: ' DT',
    precision: 2,
  },
  {
    title: 'Abonnements actifs',
    key: 'activeSubscriptions',
    icon: <CrownOutlined />,
    color: '#7c3aed',
    bg: 'linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%)',
    suffix: null,
    precision: 0,
  },
  {
    title: 'Produits vendus',
    key: 'productSalesToday',
    icon: <ShoppingOutlined />,
    color: '#db2777',
    bg: 'linear-gradient(135deg, #fdf2f8 0%, #fce7f3 100%)',
    suffix: null,
    precision: 0,
  },
];

const LiveIndicator: React.FC<{ status: 'connected' | 'disconnected' | 'error' }> = ({ status }) => {
  const color = status === 'connected' ? '#10b981' : status === 'error' ? '#ef4444' : '#94a3b8';
  const label = status === 'connected' ? 'En direct' : status === 'error' ? 'Erreur' : 'Hors ligne';

  return (
    <Tooltip title={label}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: color,
            boxShadow: status === 'connected' ? `0 0 6px ${color}` : 'none',
            animation: status === 'connected' ? 'pulse 2s infinite' : 'none',
          }}
        />
        <Text style={{ fontSize: 12, color: '#64748b', fontWeight: 500 }}>{label}</Text>
      </div>
    </Tooltip>
  );
};

const Dashboard: React.FC = () => {
  const { status: realtimeStatus } = useDashboardRealtime();

  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useQuery({
    queryKey: ['dashboardStats'],
    queryFn: getDashboardStats,
    refetchInterval: 30000,
  });

  const { data: charts, isLoading: chartsLoading } = useQuery({
    queryKey: ['dashboardCharts'],
    queryFn: getChartData,
    refetchInterval: 30000,
  });

  const { data: topProducts, isLoading: topProductsLoading } = useQuery({
    queryKey: ['topProducts'],
    queryFn: getTopProducts,
    refetchInterval: 30000,
  });

  const { data: activeSessions, isLoading: sessionsLoading } = useQuery({
    queryKey: ['activeSessionsList'],
    queryFn: getActiveSessionsList,
    refetchInterval: 10000,
  });

  const sessionColumns = [
    {
      title: 'Client',
      dataIndex: 'customer_name',
      key: 'customer_name',
      render: (name: string) => (
        <Text strong style={{ fontSize: 13 }}>{name}</Text>
      ),
    },
    {
      title: 'Arrivée',
      dataIndex: 'entry_time',
      key: 'entry_time',
      render: (time: string) => (
        <Text style={{ fontSize: 13 }}>{dayjs(time).format('HH:mm')}</Text>
      ),
    },
    {
      title: 'Durée',
      dataIndex: 'duration_minutes',
      key: 'duration_minutes',
      render: (min: number) => {
        const h = Math.floor(min / 60);
        const m = min % 60;
        return (
          <Tag color="green" style={{ borderRadius: 6, fontSize: 12 }}>
            {h > 0 ? `${h}h ${m}m` : `${m}m`}
          </Tag>
        );
      },
    },
  ];

  const productColumns = [
    {
      title: 'Produit',
      dataIndex: 'name',
      key: 'name',
      render: (name: string) => (
        <Text strong style={{ fontSize: 13 }}>{name}</Text>
      ),
    },
    {
      title: 'Qté',
      dataIndex: 'quantity_sold',
      key: 'quantity_sold',
      width: 60,
      render: (qty: number) => (
        <Tag color="blue" style={{ borderRadius: 6, fontSize: 12 }}>{qty}</Tag>
      ),
    },
    {
      title: 'Revenu',
      dataIndex: 'revenue',
      key: 'revenue',
      width: 90,
      render: (rev: number) => (
        <Text strong style={{ fontSize: 13, color: '#059669' }}>{rev.toFixed(2)} DT</Text>
      ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'auto', padding: 16 }}>
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>

      {/* Header with live indicator */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexShrink: 0 }}>
        <LiveIndicator status={realtimeStatus} />
        <Tooltip title="Rafraîchir">
          <ReloadOutlined
            style={{ fontSize: 16, color: '#94a3b8', cursor: 'pointer' }}
            onClick={() => refetchStats()}
          />
        </Tooltip>
      </div>

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
          </Card>
        ))}
      </div>

      {/* Charts Row */}
      <div style={{ flex: 1, minHeight: 280, display: 'flex', gap: 14, marginBottom: 18 }}>
        <div style={{ flex: 1, minWidth: 0 }} className="animate-fade-in-up">
          <Card
            loading={chartsLoading}
            bordered={false}
            style={{ borderRadius: 14, border: '1px solid #f1f5f9', height: '100%' }}
            styles={{ body: { padding: '18px 20px 8px', height: '100%', display: 'flex', flexDirection: 'column' } }}
          >
            <Text style={{ fontSize: 14, fontWeight: 600, color: '#0f172a', marginBottom: 14, flexShrink: 0 }}>
              Flux de Revenus (7 jours)
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
              Flux de Visiteurs (aujourd'hui)
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

      {/* Bottom Row: Active Sessions + Top Products */}
      <div style={{ display: 'flex', gap: 14, flex: '0 0 auto' }}>
        <div style={{ flex: 1.2, minWidth: 0 }} className="animate-fade-in-up">
          <Card
            loading={sessionsLoading}
            bordered={false}
            style={{ borderRadius: 14, border: '1px solid #f1f5f9' }}
            styles={{ body: { padding: '18px 20px 10px' } }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <Text style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>
                Sessions actives
              </Text>
              <Tag color="green" style={{ borderRadius: 6, fontSize: 11 }}>
                {activeSessions?.length ?? 0}
              </Tag>
            </div>
            <Table
              dataSource={activeSessions}
              columns={sessionColumns}
              rowKey="id"
              pagination={{ defaultPageSize: 5 }}
              size="small"
              locale={{ emptyText: 'Aucune session active' }}
              style={{ borderRadius: 10 }}
            />
          </Card>
        </div>

        <div style={{ flex: 0.8, minWidth: 0 }} className="animate-fade-in-up">
          <Card
            loading={topProductsLoading}
            bordered={false}
            style={{ borderRadius: 14, border: '1px solid #f1f5f9' }}
            styles={{ body: { padding: '18px 20px 10px' } }}
          >
            <Text style={{ fontSize: 14, fontWeight: 600, color: '#0f172a', marginBottom: 12, display: 'block' }}>
              Top Produits (aujourd'hui)
            </Text>
            <Table
              dataSource={topProducts}
              columns={productColumns}
              rowKey="product_id"
              pagination={{ defaultPageSize: 5 }}
              size="small"
              locale={{ emptyText: 'Aucune vente aujourd\'hui' }}
              style={{ borderRadius: 10 }}
            />
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
