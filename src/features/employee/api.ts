import { apiRequest, jsonBody } from '../../lib/api';

export interface WorkSession {
  id: string;
  employee_id: string;
  start_time: string;
  end_time: string | null;
  duration_minutes: number | null;
  status: 'active' | 'completed';
  created_at: string;
  employee?: { id: string; full_name?: string; email: string } | null;
}

export interface EmployeeWorkSessions {
  active: WorkSession | null;
  history: WorkSession[];
}

export const getMyWorkSessions = (): Promise<EmployeeWorkSessions> =>
  apiRequest('/employee/work-sessions');

export const startWorkSession = (requestId: string): Promise<WorkSession> =>
  apiRequest('/employee/work-sessions', { method: 'POST', body: jsonBody({ requestId }) });

export const endWorkSession = (id: string): Promise<WorkSession> =>
  apiRequest(`/employee/work-sessions/${encodeURIComponent(id)}/end`, {
    method: 'POST',
    body: jsonBody({}),
  });
