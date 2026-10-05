export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export function apiUrl(path: string): string {
  const base = (import.meta.env.VITE_API_URL || '/api').replace(/\/+$/, '');
  if (base !== '/api') {
    throw new Error('VITE_API_URL must be /api for this same-origin deployment.');
  }
  return `${base}/${path.replace(/^\/+/, '')}`;
}

export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(apiUrl(path), {
    ...options,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  if (!response.ok) {
    if (response.status === 401 && path !== '/auth/login') {
      window.dispatchEvent(new Event('auth-expired'));
    }
    if (!response.headers.get('content-type')?.includes('application/json')) {
      throw new ApiError('API unavailable. Start the backend and check its MongoDB connection.', response.status);
    }
    const body: unknown = await response.json();
    const message = typeof body === 'object' && body !== null && 'message' in body && typeof body.message === 'string'
      ? body.message : `API request failed (${response.status}).`;
    throw new ApiError(message, response.status);
  }
  if (response.status === 204) return undefined as T;
  return response.json();
}

export const jsonBody = (value: unknown): string => JSON.stringify(value);
