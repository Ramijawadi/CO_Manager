import React, { useState } from 'react';
import { Card, Typography, DatePicker, Button, Space, Table, message, Popconfirm, Row, Col, Statistic } from 'antd';
import { DownloadOutlined, FilePdfOutlined, FileExcelOutlined, SaveOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getReportData, closeDay, getDailyClosures } from '../features/reports/api';
import { exportToCSV, exportToExcel, exportToPDF } from '../features/reports/exportUtils';
import { getDashboardStats } from '../features/dashboard/api';
import { useRoleGuard } from '../hooks/useRoleGuard';

const { Text } = Typography;
const { RangePicker } = DatePicker;

const Reports: React.FC = () => {
  useRoleGuard(['admin']);

  const queryClient = useQueryClient();
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([dayjs(), dayjs()]);

  const { data: reportData = [], isLoading } = useQuery({
    queryKey: ['reportData', dateRange[0].format('YYYY-MM-DD'), dateRange[1].format('YYYY-MM-DD')],
    queryFn: () => getReportData(dateRange[0].format('YYYY-MM-DD'), dateRange[1].format('YYYY-MM-DD')),
  });

  const { data: todayStats } = useQuery({
    queryKey: ['dashboardStats'],
    queryFn: getDashboardStats,
  });

  const { data: closures = [] } = useQuery({
    queryKey: ['dailyClosures'],
    queryFn: getDailyClosures,
  });

  const closeDayMutation = useMutation({
    mutationFn: () => closeDay(dayjs().format('YYYY-MM-DD'), {
      total_visitors: todayStats?.totalVisitorsToday || 0,
      total_revenue: todayStats?.revenueToday || 0,
      product_sales: todayStats?.productSalesToday || 0,
      time_revenue: (todayStats?.revenueToday || 0) - (todayStats?.productSalesToday || 0),
    }),
    onSuccess: () => {
      message.success('Journée clôturée et données archivées avec succès');
      queryClient.invalidateQueries({ queryKey: ['dailyClosures'] });
    },
    onError: (error: Error) => message.error(error.message),
  });

  const handleExportCSV = () => {
    const formattedData = reportData.map(session => ({
      'ID Session': session.id,
      'Nom du Client': session.customers?.full_name,
      "Heure d'entrée": new Date(session.entry_time).toLocaleString('fr-FR'),
      'Heure de sortie': session.exit_time ? new Date(session.exit_time).toLocaleString('fr-FR') : 'Actif',
      'Coût Temps (DT)': session.time_cost || 0,
      'Total Produits (DT)': session.session_products?.reduce((acc: any, curr: any) => acc + curr.total_price, 0) || 0,
      'Revenu Total Session (DT)': (session.time_cost || 0) + (session.session_products?.reduce((acc: any, curr: any) => acc + curr.total_price, 0) || 0),
    }));
    exportToCSV(formattedData, `Rapport_${dateRange[0].format('YYYY-MM-DD')}_au_${dateRange[1].format('YYYY-MM-DD')}`);
  };

  const handleExportExcel = () => {
    const formattedData = reportData.map(session => ({
      'ID Session': session.id,
      'Nom du Client': session.customers?.full_name,
      "Heure d'entrée": new Date(session.entry_time).toLocaleString('fr-FR'),
      'Heure de sortie': session.exit_time ? new Date(session.exit_time).toLocaleString('fr-FR') : 'Actif',
      'Coût Temps (DT)': session.time_cost || 0,
      'Total Produits (DT)': session.session_products?.reduce((acc: any, curr: any) => acc + curr.total_price, 0) || 0,
      'Revenu Total Session (DT)': (session.time_cost || 0) + (session.session_products?.reduce((acc: any, curr: any) => acc + curr.total_price, 0) || 0),
    }));
    exportToExcel(formattedData, `Rapport_${dateRange[0].format('YYYY-MM-DD')}_au_${dateRange[1].format('YYYY-MM-DD')}`);
  };

  const handleExportPDF = () => {
    const headers = ['Client', 'Entrée', 'Sortie', 'Coût Temps', 'Coût Produits', 'Total'];
    const rows = reportData.map(session => {
      const prodTotal = session.session_products?.reduce((acc: any, curr: any) => acc + curr.total_price, 0) || 0;
      return [
        session.customers?.full_name,
        new Date(session.entry_time).toLocaleString('fr-FR'),
        session.exit_time ? new Date(session.exit_time).toLocaleString('fr-FR') : 'Actif',
        `${session.time_cost || 0} DT`,
        `${prodTotal} DT`,
        `${(session.time_cost || 0) + prodTotal} DT`,
      ];
    });

    exportToPDF(
      headers,
      rows,
      `Rapport_${dateRange[0].format('YYYY-MM-DD')}`,
      `Rapport des Sessions (${dateRange[0].format('DD/MM/YYYY')} au ${dateRange[1].format('DD/MM/YYYY')})`
    );
  };

  const totalFilteredRevenue = reportData.reduce((acc, session) => {
    const prodTotal = session.session_products?.reduce((sum: number, p: any) => sum + p.total_price, 0) || 0;
    return acc + (session.time_cost || 0) + prodTotal;
  }, 0);

  const columns = [
    { title: 'Date', dataIndex: 'closure_date', key: 'closure_date' },
    { title: 'Visiteurs', dataIndex: 'total_visitors', key: 'visitors' },
    { title: 'Revenu Total (DT)', dataIndex: 'total_revenue', key: 'revenue', render: (val: number) => val.toFixed(2) },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexShrink: 0 }}>
        <Text style={{ fontSize: 15, color: '#64748b' }}>
          Analysez vos données et archivage des journées
        </Text>
        <Popconfirm
          title="Clôturer la journée"
          description="Êtes-vous sûr de vouloir finaliser et archiver les données d'aujourd'hui ?"
          onConfirm={() => closeDayMutation.mutate()}
          okText="Oui, Clôturer"
          cancelText="Annuler"
        >
          <Button type="primary" danger icon={<SaveOutlined />} loading={closeDayMutation.isPending}>
            Clôturer la journée
          </Button>
        </Popconfirm>
      </div>

      <Card
        bordered={false}
        style={{ borderRadius: 14, border: '1px solid #f1f5f9', marginBottom: 14, flexShrink: 0 }}
      >
        <Space direction="vertical" style={{ width: '100%' }} size={12}>
          <Space wrap>
            <RangePicker
              value={dateRange}
              onChange={(dates) => dates && setDateRange([dates[0]!, dates[1]!])}
              ranges={{
                "Aujourd'hui": [dayjs(), dayjs()],
                'Cette semaine': [dayjs().startOf('week'), dayjs().endOf('week')],
                'Ce mois': [dayjs().startOf('month'), dayjs().endOf('month')],
              }}
            />
            <Button icon={<DownloadOutlined />} onClick={handleExportCSV} disabled={reportData.length === 0}>CSV</Button>
            <Button icon={<FileExcelOutlined />} onClick={handleExportExcel} disabled={reportData.length === 0}>Excel</Button>
            <Button icon={<FilePdfOutlined />} onClick={handleExportPDF} disabled={reportData.length === 0}>PDF</Button>
          </Space>

          <Row gutter={16}>
            <Col span={8}>
              <Statistic title="Sessions Trouvées" value={reportData.length} loading={isLoading} />
            </Col>
            <Col span={8}>
              <Statistic title="Revenu Filtré" value={totalFilteredRevenue} precision={2} suffix="DT" loading={isLoading} />
            </Col>
          </Row>
        </Space>
      </Card>

      <Card
        bordered={false}
        style={{ borderRadius: 14, border: '1px solid #f1f5f9', flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
        styles={{ body: { flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' } }}
      >
        <Text style={{ fontSize: 14, fontWeight: 600, color: '#0f172a', marginBottom: 12, flexShrink: 0 }}>
          Archive des Journées Clôturées
        </Text>
        <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
          <Table
            columns={columns}
            dataSource={closures}
            rowKey="id"
            pagination={{ pageSize: 5, showTotal: (total: number) => `Total: ${total} journ\u00e9e${total > 1 ? 's' : ''}` }}
            style={{ height: '100%' }}

          />
        </div>
      </Card>
    </div>
  );
};

export default Reports;
