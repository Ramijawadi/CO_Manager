import React from 'react';
import { Card, Typography } from 'antd';
import SessionList from '../features/sessions/SessionList';

const { Text } = Typography;

const Sessions: React.FC = () => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ marginBottom: 16, flexShrink: 0 }}>
        <Text style={{ fontSize: 15, color: '#64748b' }}>
          Suivez et gérez les sessions en cours
        </Text>
      </div>
      <Card
        bordered={false}
        style={{ borderRadius: 14, border: '1px solid #f1f5f9', flex: 1, minHeight: 0, overflow: 'auto', display: 'flex', flexDirection: 'column' }}
        styles={{ body: { flex: 1, minHeight: 0, overflow: 'auto', display: 'flex', flexDirection: 'column', padding: 0 } }}
      >
        <SessionList />
      </Card>
    </div>
  );
};

export default Sessions;
