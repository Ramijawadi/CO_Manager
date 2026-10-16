import { apiRequest, jsonBody } from '../../lib/api';
import type { WorkSession } from './api';

export interface EmployeeAccount {
  id: string;
  full_name?: string;
  email: string;
  phone?: string;
  role: 'employee' | 'staff';
  status?: 'pending' | 'active' | 'rejected' | 'disabled';
  created_at?: string;
}

export interface PageResult<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export const getEmployees = (page: number, search: string, status: string): Promise<PageResult<EmployeeAccount>> => {
  const params = new URLSearchParams({ page: String(page), limit: '20' });
  if (search) params.set('search', search);
  if (status) params.set('status', status);
  return apiRequest(`/admin/employees?${params.toString()}`);
};

export const updateEmployeeStatus = (
  id: string, status: string, reason: string,
): Promise<EmployeeAccount> =>
  apiRequest(`/admin/employees/${encodeURIComponent(id)}/status`, {
    method: 'PATCH',
    body: jsonBody({ status, reason }),
  });

export const getWorkSessions = (
  page: number, status: string, employeeId?: string, start?: string, end?: string,
): Promise<PageResult<WorkSession>> => {
  const params = new URLSearchParams({ page: String(page), limit: '20' });
  if (status) params.set('status', status);
  if (employeeId) params.set('employeeId', employeeId);
  if (start) params.set('start', start);
  if (end) params.set('end', end);
  return apiRequest(`/admin/work-sessions?${params.toString()}`);
};

export const closeWorkSession = (id: string, reason: string): Promise<WorkSession> =>
  apiRequest(`/admin/work-sessions/${encodeURIComponent(id)}/end`, {
    method: 'POST',
    body: jsonBody({ reason }),
  });
