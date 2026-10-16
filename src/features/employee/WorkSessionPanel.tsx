import React, { useEffect, useState } from 'react';
import {
  Alert, Button, Card, Empty, Popconfirm, Tag, Typography, message,
} from 'antd';
import {
  CalendarOutlined, CheckCircleOutlined, ClockCircleOutlined,
  PlayCircleOutlined, StopOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { endWorkSession, getMyWorkSessions, startWorkSession } from './api';
import { getDateLocale } from '../../i18n';
import { useTranslation } from 'react-i18next';
import './WorkSessionPanel.css';

const { Text, Title } = Typography;

function elapsedSince(startTime: string, now: number): string {
  const elapsedSeconds = Math.max(0, Math.floor((now - Date.parse(startTime)) / 1000));
  const hours = Math.floor(elapsedSeconds / 3600);
  const minutes = Math.floor((elapsedSeconds % 3600) / 60);
  const seconds = elapsedSeconds % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function formatDateTime(date: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(date));
}

const WorkSessionPanel: React.FC = () => {
  const { t, i18n } = useTranslation();
  const locale = getDateLocale(i18n.resolvedLanguage);
  const queryClient = useQueryClient();
  const [now, setNow] = useState(0);
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['myWorkSessions'],
    queryFn: getMyWorkSessions,
  });
  const active = data?.active ?? null;
  const completedShifts = (data?.history ?? [])
    .filter(shift => shift.status === 'completed')
    .slice(0, 4);

  useEffect(() => {
    if (!active) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [active]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['myWorkSessions'] });
  const startMutation = useMutation({
    mutationFn: startWorkSession,
    onSuccess: refresh,
    onError: error => message.error(error.message),
  });
  const endMutation = useMutation({
    mutationFn: endWorkSession,
    onSuccess: refresh,
    onError: error => message.error(error.message),
  });

  return (
    <Card
      className="work-session-card"
      loading={isLoading}
      styles={{ body: { padding: 0 } }}
    >
      <div className="work-session-content">
        <div className="work-session-main">
          <div className="work-session-heading">
            <div>
              <Text className="work-session-eyebrow">{t('Mon espace')}</Text>
              <Title level={4} className="work-session-title">{t('Mon service')}</Title>
            </div>
            <Tag
              className={`work-session-status${active ? ' is-active' : ''}`}
              icon={active ? <span className="work-session-live-dot" /> : <CheckCircleOutlined />}
            >
              {active ? t('Service en cours') : t('Aucun service actif')}
            </Tag>
          </div>

          {isError && (
            <Alert
              type="error"
              showIcon
              message={error instanceof Error ? error.message : t('Impossible de charger mes services')}
              style={{ marginBottom: 18 }}
            />
          )}

          <div className="work-session-stats">
            <div className="work-session-stat">
              <span className="work-session-stat-icon"><CalendarOutlined /></span>
              <div className="work-session-stat-copy">
                <Text className="work-session-stat-label">{t('Début du service')}</Text>
                <Text className="work-session-stat-value">
                  {active ? formatDateTime(active.start_time, locale) : t('Pas encore commencé')}
                </Text>
              </div>
            </div>
            <div className="work-session-stat">
              <span className="work-session-stat-icon"><ClockCircleOutlined /></span>
              <div className="work-session-stat-copy">
                <Text className="work-session-stat-label">{t('Temps écoulé')}</Text>
                <Text
                  className="work-session-stat-value work-session-elapsed"
                  dir="ltr"
                >
                  {active ? elapsedSince(active.start_time, now) : '—'}
                </Text>
              </div>
            </div>
          </div>

          <div className="work-session-actions">
            {active ? (
              <Popconfirm
                title={t('Terminer le service ?')}
                description={t('L’heure de fin sera enregistrée par le serveur.')}
                okText={t('Terminer')}
                cancelText={t('Annuler')}
                onConfirm={() => endMutation.mutate(active.id)}
              >
                <Button
                  danger
                  icon={<StopOutlined />}
                  loading={endMutation.isPending}
                  className="work-session-action"
                >
                  {t('Terminer mon service')}
                </Button>
              </Popconfirm>
            ) : (
              <Button
                type="primary"
                icon={<PlayCircleOutlined />}
                loading={startMutation.isPending}
                onClick={() => startMutation.mutate(crypto.randomUUID())}
                className="work-session-action"
              >
                {t('Commencer mon service')}
              </Button>
            )}
            {active && (
              <Text className="work-session-action-note">
                {t('Pensez à terminer votre service avant de partir.')}
              </Text>
            )}
          </div>
        </div>

        <aside className="work-session-history">
          <div className="work-session-history-heading">
            <Title level={5}>{t('Derniers services')}</Title>
            <Text>{t('Historique récent')}</Text>
          </div>
          {completedShifts.length ? (
            <ul className="work-session-history-list">
              {completedShifts.map(shift => (
                <li className="work-session-history-item" key={shift.id}>
                  <span className="work-session-history-marker"><CheckCircleOutlined /></span>
                  <div className="work-session-history-copy">
                    <Text className="work-session-history-date">
                      {formatDateTime(shift.start_time, locale)}
                    </Text>
                    <Text className="work-session-history-duration">
                      {shift.duration_minutes ?? 0} {t('minutes')}
                    </Text>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="work-session-empty">
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                imageStyle={{ height: 30, marginBottom: 4 }}
                description={<Text type="secondary">{t('Vos services terminés apparaîtront ici.')}</Text>}
              />
            </div>
          )}
        </aside>
      </div>
    </Card>
  );
};

export default WorkSessionPanel;
