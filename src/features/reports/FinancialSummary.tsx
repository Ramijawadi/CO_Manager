import { useState } from 'react';
import { Alert, Button, Card, Col, DatePicker, Dropdown, Row, Segmented, Space, Statistic, Table, Tag, Typography } from 'antd';
import type { TableColumnsType, MenuProps } from 'antd';
import { DownloadOutlined, FileExcelOutlined, FilePdfOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { formatExpenseAmount } from '../expenses/types';
import { getFinancialReport } from './financialApi';
import type { FinancialMonth } from './financialApi';
import { exportToCSV, exportToExcel, exportToPDF } from './exportUtils';

export default function FinancialSummary() {
  const [period, setPeriod] = useState<'month' | 'year'>('month');
  const [date, setDate] = useState(dayjs());
  const year = date.year();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['financialReport', year], queryFn: () => getFinancialReport(year),
  });
  const selectedMonth = data?.months.find(row => row.month === date.format('YYYY-MM'));
  const totals = period === 'year' ? data?.totals : selectedMonth;
  const rows = period === 'year' ? data?.months : selectedMonth ? [selectedMonth] : [];
  const columns: TableColumnsType<FinancialMonth> = [
    { title: 'Mois', dataIndex: 'month', render: (month: string) => dayjs(`${month}-01`).format('MMMM YYYY') },
    { title: 'Sessions', dataIndex: 'time_income', align: 'right', render: formatExpenseAmount },
    { title: 'Produits', dataIndex: 'product_income', align: 'right', render: formatExpenseAmount },
    { title: 'Abonnements reçus', dataIndex: 'subscription_income', align: 'right', render: formatExpenseAmount },
    { title: 'Revenus', dataIndex: 'income', align: 'right', render: formatExpenseAmount },
    { title: 'Frais', dataIndex: 'expenses', align: 'right', render: formatExpenseAmount },
    { title: 'Résultat net', dataIndex: 'net', align: 'right', render: (net: number) => (
      <Typography.Text strong style={{ color: net < 0 ? '#ef4444' : net > 0 ? '#059669' : '#64748b' }}>
        {formatExpenseAmount(net)}
      </Typography.Text>
    ) },
  ];
  const formatPeriodLabel = (month: string) => month === 'Total' ? 'Total' : dayjs(`${month}-01`).format('MMMM YYYY');
  const exportFilename = `Bilan_${period === 'year' ? year : date.format('YYYY-MM')}`;
  const exportTitle = `Bilan financier (${period === 'year' ? year : date.format('MM/YYYY')})`;
  const buildExportRows = () => {
    if (!rows || !totals) return null;
    return [...rows, { ...totals, month: 'Total' }];
  };
  const exportExcelOrCsv = (toSheet: (data: any[], filename: string) => void) => {
    const exportRows = buildExportRows();
    if (!exportRows) return;
    const toExport = (row: FinancialMonth) => ({
      'Période': formatPeriodLabel(row.month), 'Sessions (DT)': row.time_income, 'Produits (DT)': row.product_income,
      'Paiements abonnements (DT)': row.subscription_income, 'Revenus (DT)': row.income,
      'Frais (DT)': row.expenses, 'Résultat net (DT)': row.net,
    });
    toSheet(exportRows.map(toExport), exportFilename);
  };
  const exportPdf = () => {
    const exportRows = buildExportRows();
    if (!exportRows) return;
    const headers = ['Période', 'Sessions', 'Produits', 'Abonnements reçus', 'Revenus', 'Frais', 'Résultat net'];
    const pdfRows = exportRows.map(row => [
      formatPeriodLabel(row.month), formatExpenseAmount(row.time_income), formatExpenseAmount(row.product_income),
      formatExpenseAmount(row.subscription_income), formatExpenseAmount(row.income),
      formatExpenseAmount(row.expenses), formatExpenseAmount(row.net),
    ]);
    exportToPDF(headers, pdfRows, exportFilename, exportTitle);
  };
  const exportMenuItems: MenuProps['items'] = [
    { key: 'csv', label: 'CSV', icon: <DownloadOutlined />, onClick: () => exportExcelOrCsv(exportToCSV) },
    { key: 'excel', label: 'Excel', icon: <FileExcelOutlined />, onClick: () => exportExcelOrCsv(exportToExcel) },
    { key: 'pdf', label: 'PDF', icon: <FilePdfOutlined />, onClick: exportPdf },
  ];
  return (
    <Card variant="borderless" title="Bilan financier" style={{ border: '1px solid #f1f5f9', marginBottom: 16 }}>
      <Space direction="vertical" size={20} style={{ width: '100%' }}>
        <Space wrap>
          <Segmented<'month' | 'year'> value={period} onChange={setPeriod}
            options={[{ label: 'Mensuel', value: 'month' }, { label: 'Annuel', value: 'year' }]} />
          <DatePicker picker={period} value={date} allowClear={false}
            aria-label={period === 'year' ? 'Année du bilan' : 'Mois du bilan'}
            format={period === 'year' ? 'YYYY' : 'MM/YYYY'}
            minDate={dayjs('2000-01-01')} maxDate={dayjs('9998-12-31')}
            onChange={value => { if (value) setDate(value); }} />
          <Dropdown menu={{ items: exportMenuItems }} disabled={!totals || !!error || isLoading} trigger={['click']}>
            <Button icon={<DownloadOutlined />}>Exporter le bilan</Button>
          </Dropdown>
        </Space>
        <Typography.Text type="secondary">
          Revenus encaissés : sessions terminées à la date de sortie, produits à la date de vente et paiements d'abonnement à la date du versement.
          Frais à la date saisie. Calendrier : Tunisie (UTC+1). Les archives de clôture ne sont pas additionnées.
        </Typography.Text>
        {error ? <Alert type="error" showIcon title="Impossible de charger le bilan" description={error.message}
          action={<Button onClick={() => { void refetch(); }}>Réessayer</Button>} /> : (
          <>
            <Row gutter={[16, 16]}>
              <Col xs={24} md={8}><Statistic title="Revenus" value={totals?.income} precision={3} suffix="DT" loading={isLoading} /></Col>
              <Col xs={24} md={8}><Statistic title="Frais" value={totals?.expenses} precision={3} suffix="DT" loading={isLoading} /></Col>
              <Col xs={24} md={8}>
                <Statistic title="Résultat net (revenus − frais)" value={totals?.net} precision={3} suffix="DT" loading={isLoading}
                  styles={{ content: { color: totals && totals.net < 0 ? '#ef4444' : '#059669' } }} />
                {totals && <Tag color={totals.net < 0 ? 'red' : totals.net > 0 ? 'green' : 'default'} style={{ marginTop: 8 }}>
                  {totals.net < 0 ? 'Perte' : totals.net > 0 ? 'Bénéfice' : 'Équilibre'}
                </Tag>}
              </Col>
            </Row>
            <Table columns={columns} rowKey="month" dataSource={rows} loading={isLoading}
              scroll={{ x: 1000 }} pagination={false} />
          </>
        )}
      </Space>
    </Card>
  );
}
