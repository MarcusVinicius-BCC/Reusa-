const API_BASE = '/api';
const TOKEN_KEY = 'reusa_token';

export function getToken() {
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  window.localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  window.localStorage.removeItem(TOKEN_KEY);
}

async function request(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (!(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const token = getToken();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers
  });

  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json') ? await response.json() : await response.text();

  if (!response.ok) {
    throw new Error(payload?.error || 'Request failed');
  }

  return payload;
}

export const api = {
  health: () => request('/health'),
  login: (body) => request('/auth/login', { method: 'POST', body: JSON.stringify(body) }),
  register: (body) => request('/auth/register', { method: 'POST', body: JSON.stringify(body) }),
  me: () => request('/auth/me'),
  feed: () => request('/feed'),
  inspirations: () => request('/inspirations'),
  createInspiration: (body) => request('/inspirations', { method: 'POST', body: JSON.stringify(body) }),
  aiIdeas: (prompt) => request('/ai/ideas', { method: 'POST', body: JSON.stringify({ prompt }) }),
  profile: () => request('/profile'),
  updateProfile: (body) => request('/profile', { method: 'PUT', body: JSON.stringify(body) }),
  posts: () => request('/posts'),
  createPost: (body) => request('/posts', { method: 'POST', body: body instanceof FormData ? body : JSON.stringify(body) }),
  toggleLike: (id) => request(`/posts/${id}/like`, { method: 'POST' }),
  deletePost: (id) => request(`/posts/${id}`, { method: 'DELETE' }),
  comments: (id) => request(`/posts/${id}/comments`),
  addComment: (id, text) => request(`/posts/${id}/comments`, { method: 'POST', body: JSON.stringify({ text }) }),
  notifications: () => request('/notifications'),
  readNotifications: () => request('/notifications/read', { method: 'POST' }),
  createThread: (body) => request('/messages/threads', { method: 'POST', body: JSON.stringify(body) }),
  threads: () => request('/messages/threads'),
  thread: (id) => request(`/messages/threads/${id}`),
  sendMessage: (id, body) => request(`/messages/threads/${id}/messages`, { method: 'POST', body: JSON.stringify(body) }),
  collectionPoints: () => request('/collection-points'),
  collectionPointsNearby: (city) => request(`/collection-points/nearby?city=${encodeURIComponent(city || '')}`)
};