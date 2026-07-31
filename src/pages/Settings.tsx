import React, { useEffect, useState } from 'react';
import { Card, Form, InputNumber, Typography, message, Spin, Button, Divider, Modal, Input, Popconfirm } from 'antd';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getSettings, updateSettings } from '../features/settings/api';
import { getPlans, updatePlan, createPlan, deletePlan } from '../features/plans/api';
import { usePermissions } from '../hooks/usePermissions';
import { LogoutOutlined, PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';
import { AuthButton } from '../components/AuthButton';

const { Text, Title } = Typography;

const Settings: React.FC = () => {

  const [form] = Form.useForm();
  const [addPlanForm] = Form.useForm();
  const [isAddPlanModalVisible, setIsAddPlanModalVisible] = useState(false);
  const queryClient = useQueryClient();
  const { requireAdmin } = usePermissions();
  const navigate = useNavigate();
  const { setRole } = useAuthStore();

  const { data: settings, isLoading: settingsLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: getSettings,
  });

  const { data: plans, isLoading: plansLoading } = useQuery({
    queryKey: ['plans'],
    queryFn: getPlans,
  });

  useEffect(() => {
    if (settings && plans) {
      const initialValues: any = {
        hourly_rate: settings.hourly_rate,
      };
      plans.forEach(plan => {
        initialValues[`plan_${plan.id}_price`] = Number(plan.price || 0);
        initialValues[`plan_${plan.id}_duration`] = Number(plan.duration_days || 0);
      });
      form.setFieldsValue(initialValues);
    }
  }, [settings, plans, form]);

  const updateMutation = useMutation({
    mutationFn: async (values: any) => {
      // Update settings
      await updateSettings(settings!.id, { hourly_rate: values.hourly_rate });

      // Update plans
      if (plans) {
        const planUpdates = plans.map(plan => {
          return updatePlan(plan.id, {
            price: values[`plan_${plan.id}_price`],
            duration_days: values[`plan_${plan.id}_duration`],
          });
        });
        await Promise.all(planUpdates);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      queryClient.invalidateQueries({ queryKey: ['plans'] });
      message.success('Paramètres et abonnements mis à jour avec succès');
    },
    onError: (error: Error) => message.error(error.message),
  });

  const addPlanMutation = useMutation({
    mutationFn: async (values: any) => {
      await createPlan({
        name: values.name,
        duration_days: values.duration_days,
        price: values.price,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plans'] });
      message.success('Nouvel abonnement ajouté avec succès');
      setIsAddPlanModalVisible(false);
      addPlanForm.resetFields();
    },
    onError: (error: Error) => message.error(error.message),
  });

  const deletePlanMutation = useMutation({
    mutationFn: async (id: string) => {
      await deletePlan(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plans'] });
      message.success('Abonnement supprimé avec succès');
    },
    onError: (error: Error) => message.error(error.message),
  });

  const handleFinish = (values: any) => {
    if (!requireAdmin()) return;
    updateMutation.mutate(values);
  };

  const handleAddPlan = (values: any) => {
    if (!requireAdmin()) return;
    addPlanMutation.mutate(values);
  };

  const handleDeletePlan = (id: string) => {
    if (!requireAdmin()) return;
    deletePlanMutation.mutate(id);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setRole(null);
    navigate('/login');
  };

  if (settingsLoading || plansLoading) {
    return <Spin size="large" style={{ display: 'block', margin: '40px auto' }} />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'auto', padding: 24 }}>
      <div style={{ marginBottom: 24, flexShrink: 0 }}>
        <Text style={{ fontSize: 16, color: '#64748b' }}>
          Configurez les paramètres de votre espace, y compris la tarification de la base de données.
        </Text>
      </div>

      <Card
        bordered={false}
        style={{ borderRadius: 14, border: '1px solid #f1f5f9', maxWidth: 800, flexShrink: 0, marginBottom: 24 }}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleFinish}
        >
          <Title level={5} style={{ marginTop: 0, marginBottom: 20 }}>Tarification par heure</Title>
          <Form.Item
            name="hourly_rate"
            label="Taux Horaire (DT)"
            rules={[{ required: true, message: 'Veuillez entrer le taux horaire' }]}
            tooltip="Prix de la session par heure."
          >
            <InputNumber min={0} step={0.1} style={{ width: '100%', maxWidth: 300 }} />
          </Form.Item>

          <Divider />

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <Title level={5} style={{ margin: 0 }}>Tarification des Abonnements</Title>
            <AuthButton 
              type="primary" 
              icon={<PlusOutlined />} 
              onClick={() => setIsAddPlanModalVisible(true)}
              style={{ borderRadius: 10 }}
            >
              Créer un abonnement
            </AuthButton>
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 24 }}>
            {plans?.map(plan => (
              <Card 
                type="inner" 
                title={plan.name} 
                key={plan.id} 
                style={{ borderRadius: 10, background: '#f8fafc' }}
                extra={
                  <Popconfirm
                    title="Supprimer cet abonnement"
                    description="Êtes-vous sûr de vouloir supprimer cet abonnement ?"
                    onConfirm={() => handleDeletePlan(plan.id)}
                    okText="Oui"
                    cancelText="Non"
                  >
                    <AuthButton type="text" danger icon={<DeleteOutlined />} loading={deletePlanMutation.isPending && deletePlanMutation.variables === plan.id} />
                  </Popconfirm>
                }
              >
                <Form.Item
                  name={`plan_${plan.id}_price`}
                  label="Prix (DT)"
                  rules={[{ required: true, message: 'Veuillez entrer le prix' }]}
                >
                  <InputNumber min={0} step={1} style={{ width: '100%' }} />
                </Form.Item>
                <Form.Item
                  name={`plan_${plan.id}_duration`}
                  label="Durée (Jours)"
                  rules={[{ required: true, message: 'Veuillez entrer la durée' }]}
                >
                  <InputNumber min={1} step={1} style={{ width: '100%' }} />
                </Form.Item>
              </Card>
            ))}
          </div>

          <Divider />

          <Form.Item style={{ marginBottom: 0 }}>
            <AuthButton type="primary" htmlType="submit" loading={updateMutation.isPending} size="large" style={{ borderRadius: 10 }}>
              Enregistrer les modifications
            </AuthButton>
          </Form.Item>
        </Form>
      </Card>

      <Card
        bordered={false}
        style={{ borderRadius: 14, border: '1px solid #fee2e2', background: '#fef2f2', maxWidth: 800, flexShrink: 0 }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <Title level={5} style={{ color: '#ef4444', margin: 0 }}>Déconnexion</Title>
            <Text type="secondary" style={{ color: '#f87171' }}>Se déconnecter de votre session actuelle de manière sécurisée.</Text>
          </div>
          <Button 
            danger 
            type="primary" 
            icon={<LogoutOutlined />} 
            onClick={handleLogout}
            size="large"
            style={{ borderRadius: 10 }}
          >
            Déconnexion
          </Button>
        </div>
      </Card>

      <Modal
        title="Créer un nouvel abonnement"
        open={isAddPlanModalVisible}
        onCancel={() => {
          setIsAddPlanModalVisible(false);
          addPlanForm.resetFields();
        }}
        footer={null}
      >
        <Form
          form={addPlanForm}
          layout="vertical"
          onFinish={handleAddPlan}
        >
          <Form.Item
            name="name"
            label="Nom de l'abonnement"
            rules={[{ required: true, message: 'Veuillez entrer le nom' }]}
          >
            <Input placeholder="Ex: Journalier" />
          </Form.Item>
          <Form.Item
            name="duration_days"
            label="Durée (Jours)"
            rules={[{ required: true, message: 'Veuillez entrer la durée' }]}
          >
            <InputNumber min={1} step={1} style={{ width: '100%' }} placeholder="Ex: 1" />
          </Form.Item>
          <Form.Item
            name="price"
            label="Prix (DT)"
            rules={[{ required: true, message: 'Veuillez entrer le prix' }]}
          >
            <InputNumber min={0} step={1} style={{ width: '100%' }} placeholder="Ex: 5" />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0, marginTop: 24, textAlign: 'right' }}>
            <Button onClick={() => setIsAddPlanModalVisible(false)} style={{ marginRight: 8 }}>
              Annuler
            </Button>
            <AuthButton type="primary" htmlType="submit" loading={addPlanMutation.isPending}>
              Créer l'abonnement
            </AuthButton>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default Settings;
