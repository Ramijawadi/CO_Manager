import React from 'react';
import { Card, Typography } from 'antd';
import ProductList from '../features/products/ProductList';

const { Text } = Typography;

const Products: React.FC = () => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', padding: 16 }}>
      <div style={{ marginBottom: 16, flexShrink: 0 }}>
        <Text style={{ fontSize: 15, color: '#64748b' }}>
          Gérez votre catalogue de produits
        </Text>
      </div>
      <Card
        bordered={false}
        style={{ borderRadius: 14, border: '1px solid #f1f5f9', flex: 1, minHeight: 0, overflow: 'auto', display: 'flex', flexDirection: 'column' }}
        styles={{ body: { flex: 1, minHeight: 0, overflow: 'auto', display: 'flex', flexDirection: 'column', padding: 0 } }}
      >
        <ProductList />
      </Card>
    </div>
  );
};

export default Products;
