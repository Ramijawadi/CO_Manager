import React from 'react';
import { Card, Tabs, Typography } from 'antd';
import SubscriptionList from '../features/subscriptions/SubscriptionList';
import PaymentList from '../features/subscriptions/PaymentList';

const { Text } = Typography;

const Subscriptions: React.FC = () => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', padding: 16 }}>
      <div style={{ marginBottom: 16, flexShrink: 0 }}>
        <Text style={{ fontSize: 15, color: '#64748b' }}>
          Gérez les abonnements de vos clients
        </Text>
      </div>
      <Card
        bordered={false}
        style={{ borderRadius: 14, border: '1px solid #f1f5f9', flex: 1, minHeight: 0, overflow: 'auto', display: 'flex', flexDirection: 'column' }}
        styles={{ body: { flex: 1, minHeight: 0, overflow: 'auto', display: 'flex', flexDirection: 'column', padding: 0 } }}
      >
        <Tabs style={{ height: '100%' }} tabBarStyle={{ padding: '0 24px', marginBottom: 0 }}
          items={[
            { key: 'subscriptions', label: 'Abonnements', children: <SubscriptionList /> },
            { key: 'payments', label: 'Paiements', children: <PaymentList /> },
          ]} />
      </Card>
    </div>
  );
};

export default Subscriptions;
