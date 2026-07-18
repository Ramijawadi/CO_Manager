import React, { useEffect } from 'react';
import { Card, Form, InputNumber, Typography, message, Spin } from 'antd';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getSettings, updateSettings } from '../features/settings/api';
import type { SettingsInput } from '../features/settings/types';
import { useRoleGuard } from '../hooks/useRoleGuard';
import { AuthButton } from '../components/AuthButton';
import { usePermissions } from '../hooks/usePermissions';

const { Text } = Typography;

const Settings: React.FC = () => {
  useRoleGuard(['admin', 'demo']);

  const [form] = Form.useForm();
  const queryClient = useQueryClient();
  const { requireAdmin } = usePermissions();

  const { data: settings, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: getSettings,
  });

  useEffect(() => {
    if (settings) {
      form.setFieldsValue(settings);
    }
  }, [settings, form]);

  const updateMutation = useMutation({
    mutationFn: (values: SettingsInput) => updateSettings(settings!.id, values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      message.success('Paramètres mis à jour avec succès');
    },
    onError: (error: Error) => message.error(error.message),
  });

  const handleFinish = (values: SettingsInput) => {
    if (!requireAdmin()) return;
    updateMutation.mutate(values);
  };

  if (isLoading) {
    return <Spin size="large" style={{ display: 'block', margin: '40px auto' }} />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ marginBottom: 20, flexShrink: 0 }}>
        <Text style={{ fontSize: 15, color: '#64748b' }}>
          Configurez les paramètres de votre espace
        </Text>
      </div>

      <Card
        bordered={false}
        style={{ borderRadius: 14, border: '1px solid #f1f5f9', maxWidth: 600, flexShrink: 0 }}
      >
        <Text style={{ fontSize: 15, fontWeight: 600, color: '#0f172a', display: 'block', marginBottom: 20 }}>
          Tarification
        </Text>
        <Form
          form={form}
          layout="vertical"
          onFinish={handleFinish}
        >
          <Form.Item
            name="hourly_rate"
            label="Taux Horaire (DT)"
            rules={[{ required: true, message: 'Veuillez entrer le taux horaire' }]}
            tooltip="Prix de la session par heure."
          >
            <InputNumber min={0} step={0.1} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item>
            <AuthButton type="primary" htmlType="submit" loading={updateMutation.isPending}>
              Enregistrer
            </AuthButton>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
};

export default Settings;
