import client from './client'

export interface NotificationItem {
  id: number
  notification_type: 'new_vote' | 'new_legislation'
  title: string
  body: string
  is_read: boolean
  created_at: string
  representative_name: string
  representative_id: number
  metadata: Record<string, unknown>
}

export async function getNotifications(): Promise<NotificationItem[]> {
  const { data } = await client.get('/api/v1/notifications/')
  return data
}

export async function getUnreadCount(): Promise<number> {
  const { data } = await client.get('/api/v1/notifications/unread-count/')
  return data.count
}

export async function markAsRead(notificationId: number): Promise<void> {
  await client.post(`/api/v1/notifications/${notificationId}/read/`)
}

export async function markAllAsRead(): Promise<void> {
  await client.post('/api/v1/notifications/read-all/')
}
