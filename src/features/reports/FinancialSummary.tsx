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
import { useTranslation } from 'react-i18next';
import { getNumberLocale } from '../../i18n';

export default function FinancialSummary() {
  const { t, i18n } = useTranslation();
  const numberLocale = getNumberLocale(i18n.resolvedLanguage);
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
    { title: t("Mois"), dataIndex: 'month', render: (month: string) => dayjs(`${month}-01`).format('MMMM YYYY') },
    { title: t("Sessions"), dataIndex: 'time_income', align: 'right', render: (amount: number) => formatExpenseAmount(amount, numberLocale) },
    { title: t("Produits"), dataIndex: 'product_income', align: 'right', render: (amount: number) => formatExpenseAmount(amount, numberLocale) },
    { title: t("Abonnements reçus"), dataIndex: 'subscription_income', align: 'right', render: (amount: number) => formatExpenseAmount(amount, numberLocale) },
    { title: t("Revenus"), dataIndex: 'income', align: 'right', render: (amount: number) => formatExpenseAmount(amount, numberLocale) },
    { title: t("Frais"), dataIndex: 'expenses', align: 'right', render: (amount: number) => formatExpenseAmount(amount, numberLocale) },
    { title: t("Résultat net"), dataIndex: 'net', align: 'right', render: (net: number) => (
      <Typography.Text strong style={{ color: net < 0 ? '#ef4444' : net > 0 ? '#059669' : '#64748b' }}>
        {formatExpenseAmount(net, numberLocale)}
      </Typography.Text>
    ) },
  ];
  const formatPeriodLabel = (month: string) => month === 'Total' ? t('Total') : dayjs(`${month}-01`).format('MMMM YYYY');
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
      [t('Période')]: formatPeriodLabel(row.month),
      [t('Sessions (DT)')]: row.time_income,
      [t('Produits (DT)')]: row.product_income,
      [t('Paiements abonnements (DT)')]: row.subscription_income,
      [t('Revenus (DT)')]: row.income,
      [t('Frais (DT)')]: row.expenses,
      [t('Résultat net (DT)')]: row.net,
    });
    toSheet(exportRows.map(toExport), exportFilename);
  };
  const exportPdf = () => {
    const exportRows = buildExportRows();
    if (!exportRows) return;
    const headers = ['Période', 'Sessions', 'Produits', 'Abonnements reçus', 'Revenus', 'Frais', 'Résultat net'];
    const pdfRows = exportRows.map(row => [
      formatPeriodLabel(row.month), formatExpenseAmount(row.time_income, numberLocale), formatExpenseAmount(row.product_income, numberLocale),
      formatExpenseAmount(row.subscription_income, numberLocale), formatExpenseAmount(row.income, numberLocale),
      formatExpenseAmount(row.expenses, numberLocale), formatExpenseAmount(row.net, numberLocale),
    ]);
    exportToPDF(headers, pdfRows, exportFilename, exportTitle);
  };
  const exportMenuItems: MenuProps['items'] = [
    { key: 'csv', label: t("CSV"), icon: <DownloadOutlined />, onClick: () => exportExcelOrCsv(exportToCSV) },
    { key: 'excel', label: t("Excel"), icon: <FileExcelOutlined />, onClick: () => exportExcelOrCsv(exportToExcel) },
    { key: 'pdf', label: t("PDF"), icon: <FilePdfOutlined />, onClick: exportPdf },
  ];
  return (
    <Card variant="borderless" title={t("Bilan financier")} style={{ border: '1px solid #f1f5f9', marginBottom: 16 }}>
      <Space direction="vertical" size={20} style={{ width: '100%' }}>
        <Space wrap>
          <Segmented<'month' | 'year'> value={period} onChange={setPeriod}
            options={[{ label: t("Mensuel"), value: 'month' }, { label: t("Annuel"), value: 'year' }]} />
          <DatePicker picker={period} value={date} allowClear={false}
            aria-label={period === 'year' ? t("Année du bilan") : t("Mois du bilan")}
            format={period === 'year' ? t("YYYY") : t("MM/YYYY")}
            minDate={dayjs('2000-01-01')} maxDate={dayjs('9998-12-31')}
            onChange={value => { if (value) setDate(value); }} />
          <Dropdown menu={{ items: exportMenuItems }} disabled={!totals || !!error || isLoading} trigger={['click']}>
            <Button icon={<DownloadOutlined />}>{t("Exporter le bilan")}</Button>
          </Dropdown>
        </Space>
        <Typography.Text type="secondary">
          {t("Revenus encaissés : sessions terminées à la date de sortie, produits à la date de vente et paiements d'abonnement à la date du versement. Frais à la date saisie. Calendrier : Tunisie (UTC+1). Les archives de clôture ne sont pas additionnées.")}{' '}</Typography.Text>
        {error ? <Alert type="error" showIcon title={t("Impossible de charger le bilan")} description={error.message}
          action={<Button onClick={() => { void refetch(); }}>{t("Réessayer")}</Button>} /> : (
          <>
            <Row gutter={[16, 16]}>
              <Col xs={24} md={8}><Statistic title={t("Revenus")} value={totals?.income} precision={3} suffix="DT" loading={isLoading} /></Col>
              <Col xs={24} md={8}><Statistic title={t("Frais")} value={totals?.expenses} precision={3} suffix="DT" loading={isLoading} /></Col>
              <Col xs={24} md={8}>
                <Statistic title={t("Résultat net (revenus − frais)")} value={totals?.net} precision={3} suffix="DT" loading={isLoading}
                  styles={{ content: { color: totals && totals.net < 0 ? '#ef4444' : '#059669' } }} />
                {totals && <Tag color={totals.net < 0 ? 'red' : totals.net > 0 ? 'green' : 'default'} style={{ marginTop: 8 }}>
                  {totals.net < 0 ? t("Perte") : totals.net > 0 ? t("Bénéfice") : t("Équilibre")}
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
