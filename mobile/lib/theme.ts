export const colors = {
  brand: '#2563eb',
  brandDark: '#1d4ed8',
  brandLight: '#eff6ff',
  danger: '#dc2626',
  dangerLight: '#fef2f2',
  success: '#059669',
  successLight: '#ecfdf5',
  warn: '#d97706',
  warnLight: '#fffbeb',
  text: '#0f172a',
  textMuted: '#64748b',
  border: '#e2e8f0',
  surface: '#ffffff',
  background: '#f8fafc',
};

export const statusColor: Record<string, { bg: string; fg: string }> = {
  pending: { bg: '#fef3c7', fg: '#92400e' },
  accepted: { bg: '#dbeafe', fg: '#1e40af' },
  arrived: { bg: '#e0e7ff', fg: '#3730a3' },
  in_progress: { bg: '#ede9fe', fg: '#5b21b6' },
  completed: { bg: '#d1fae5', fg: '#065f46' },
  cancelled: { bg: '#e2e8f0', fg: '#475569' },
  paid: { bg: '#d1fae5', fg: '#065f46' },
  unpaid: { bg: '#fee2e2', fg: '#991b1b' },
};

export const shadow = {
  shadowColor: '#0f172a',
  shadowOpacity: 0.06,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 4 },
  elevation: 2,
};
