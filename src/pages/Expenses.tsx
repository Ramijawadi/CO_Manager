import { Card, Typography } from 'antd';
import ExpenseList from '../features/expenses/ExpenseList';

export default function Expenses() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', padding: 16 }}>
      <div style={{ marginBottom: 16, flexShrink: 0 }}>
        <Typography.Text style={{ fontSize: 15, color: '#64748b' }}>
          Gérez vos frais : internet, électricité, eau et autres dépenses
        </Typography.Text>
      </div>
      <Card
        variant="borderless"
        style={{ borderRadius: 14, border: '1px solid #f1f5f9', flex: 1, minHeight: 0, overflow: 'auto' }}
        styles={{ body: { padding: 0 } }}
      >
        <ExpenseList />
      </Card>
    </div>
  );
}
