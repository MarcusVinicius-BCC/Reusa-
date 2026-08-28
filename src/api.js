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
  aiIdeas: (body) => request('/ai/ideas', { method: 'POST', body: JSON.stringify(typeof body === 'string' ? { prompt: body } : body) }),
  profile: () => request('/profile'),
  updateProfile: (body) => request('/profile', { method: 'PUT', body: JSON.stringify(body) }),
  posts: () => request('/posts'),
  createPost: (body) => request('/posts', { method: 'POST', body: body instanceof FormData ? body : JSON.stringify(body) }),
  post: (id) => request(`/posts/${id}`),
  updatePost: (id, body) => request(`/posts/${id}`, { method: 'PUT', body: body instanceof FormData ? body : JSON.stringify(body) }),
  updatePostStatus: (id, status) => request(`/posts/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  reservePost: (id, interestedId) => request(`/posts/${id}/reserve`, { method: 'POST', body: JSON.stringify({ interestedId }) }),
  completePost: (id, outcome) => request(`/posts/${id}/complete`, { method: 'POST', body: JSON.stringify({ outcome }) }),
  interested: (id) => request(`/posts/${id}/interested`),
  negotiation: (id) => request(`/posts/${id}/negotiation`),
  favorites: () => request('/favorites'),
  toggleFavorite: (id) => request(`/posts/${id}/favorite`, { method: 'POST' }),
  toggleLike: (id) => request(`/posts/${id}/like`, { method: 'POST' }),
  deletePost: (id) => request(`/posts/${id}`, { method: 'DELETE' }),
  comments: (id) => request(`/posts/${id}/comments`),
  addComment: (id, text) => request(`/posts/${id}/comments`, { method: 'POST', body: JSON.stringify({ text }) }),
  report: (body) => request('/reports', { method: 'POST', body: JSON.stringify(body) }),
  blockUser: (id) => request(`/users/${id}/block`, { method: 'POST' }),
  reviews: (id) => request(`/users/${id}/reviews`),
  createReview: (id, body) => request(`/negotiations/${id}/reviews`, { method: 'POST', body: JSON.stringify(body) }),
  notifications: () => request('/notifications'),
  readNotifications: () => request('/notifications/read', { method: 'POST' }),
  readNotification: (id) => request(`/notifications/${id}/read`, { method: 'POST' }),
  createThread: (body) => request('/messages/threads', { method: 'POST', body: JSON.stringify(body) }),
  threads: () => request('/messages/threads'),
  thread: (id) => request(`/messages/threads/${id}`),
  sendMessage: (id, body) => request(`/messages/threads/${id}/messages`, { method: 'POST', body: JSON.stringify(body) }),
  collectionPoints: () => request('/collection-points'),
  collectionPointsNearby: (city) => request(`/collection-points/nearby?city=${encodeURIComponent(city || '')}`),
  suggestCollectionPoint: (body) => request('/collection-points/suggestions', { method: 'POST', body: JSON.stringify(body) }),
  communityImpact: () => request('/impact/community'),
  updatePreferences: (preferences) => request('/profile/preferences', { method: 'PUT', body: JSON.stringify({ preferences }) }),
  updatePassword: (body) => request('/profile/password', { method: 'PUT', body: JSON.stringify(body) }),
  deleteAccount: (body) => request('/profile', { method: 'DELETE', body: JSON.stringify(body) }),
  adminDashboard: () => request('/admin/dashboard'),
  adminUsers: (query = '') => request(`/admin/users?q=${encodeURIComponent(query)}`),
  setUserSuspension: (id, suspended) => request(`/admin/users/${id}/suspension`, { method: 'PATCH', body: JSON.stringify({ suspended }) }),
  adminPosts: () => request('/admin/posts'),
  removeAdminPost: (id) => request(`/admin/posts/${id}`, { method: 'DELETE' }),
  adminReports: () => request('/admin/reports'),
  updateReport: (id, status) => request(`/admin/reports/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  adminCollectionPoints: () => request('/admin/collection-points'),
  reviewPointSuggestion: (id, decision) => request(`/admin/collection-point-suggestions/${id}`, { method: 'PATCH', body: JSON.stringify({ decision }) })
};
