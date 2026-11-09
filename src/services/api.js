// conexão frontend com backend
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
    const requestId = response.headers.get('x-correlation-id') || payload?.requestId;
    const message = payload?.error || 'Request failed';
    const error = new Error(requestId ? `${message} (ID: ${requestId})` : message);
    error.requestId = requestId || '';
    throw error;
  }

  return payload;
}

export const api = {
  negotiations: () => request('/negotiations'),
  reportDeliveryIncident: (id, body) => request('/collection-deliveries/'+id+'/incidents', { method: 'POST', body: JSON.stringify(body) }),
  alerts: () => request('/search-alerts'),
  createAlert: body => request('/search-alerts',{method:'POST',body:JSON.stringify(body)}),
  deleteAlert: id => request('/search-alerts/'+id,{method:'DELETE'}),
  nearby: (lat,lng,radius) => request('/discovery/nearby?lat='+encodeURIComponent(Math.round(lat*100)/100)+'&lng='+encodeURIComponent(Math.round(lng*100)/100)+'&radius='+radius),
  questions: id => request('/posts/'+id+'/questions'),
  askQuestion: (id,question) => request('/posts/'+id+'/questions',{method:'POST',body:JSON.stringify({question})}),
  answerQuestion: (id,answer) => request('/questions/'+id+'/answer',{method:'POST',body:JSON.stringify({answer})}),
  saveTransport: (id,body) => request('/posts/'+id+'/transport',{method:'PUT',body:JSON.stringify(body)}),
  needs: () => request('/needs'),
  createNeed: body => request('/needs',{method:'POST',body:JSON.stringify(body)}),
  closeNeed: id => request('/needs/'+id+'/close',{method:'PATCH'}),
  needOffers: id => request('/needs/'+id+'/offers'),
  offerNeed: (id,postId) => request('/needs/'+id+'/offers',{method:'POST',body:JSON.stringify({postId})}),
  negotiationProblem: (id,body) => request('/negotiations/'+id+'/problem',{method:'POST',body:JSON.stringify(body)}),
  health: () => request('/health'),
  login: (body) => request('/auth/login', { method: 'POST', body: JSON.stringify(body) }),
  register: (body) => request('/auth/register', { method: 'POST', body: JSON.stringify(body) }),
  resendVerification: () => request('/auth/resend-verification', { method: 'POST' }),
  me: () => request('/auth/me'),
  businessByCnpj: (cnpj) => request(`/businesses/cnpj/${encodeURIComponent(String(cnpj || '').replace(/\D/g, ''))}`),
  feed: () => request('/feed'),
  campaigns: () => request('/campaigns'),
  createCampaign: (body) => request('/campaigns', { method: 'POST', body: JSON.stringify(body) }),
  campaignContributions: (id) => request(`/campaigns/${id}/contributions`),
  contributeCampaign: (id, body) => request(`/campaigns/${id}/contributions`, { method: 'POST', body: JSON.stringify(body) }),
  updateCampaignContribution: (id, contributionId, status) => request(`/campaigns/${id}/contributions/${contributionId}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  replyCampaignContribution: (id, contributionId, reply) => request(`/campaigns/${id}/contributions/${contributionId}/reply`, { method: 'PATCH', body: JSON.stringify({ reply }) }),
  closeCampaign: (id) => request(`/campaigns/${id}/close`, { method: 'PATCH' }),
  inspirations: () => request('/inspirations'),
  createInspiration: (body) => request('/inspirations', { method: 'POST', body: JSON.stringify(body) }),
  aiIdeas: (body) => request('/ai/ideas', { method: 'POST', body: JSON.stringify(typeof body === 'string' ? { prompt: body } : body) }),
  profile: () => request('/profile'),
  updateAvatar: (file) => {
    const body = new FormData();
    body.append('avatar', file);
    return request('/profile/avatar', { method: 'POST', body });
  },
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
  createProposal: (negotiationId, body) => request(`/negotiations/${negotiationId}/proposal`, { method: 'POST', body: JSON.stringify(body) }),
  cancelAcceptedProposal: (id) => request(`/negotiations/${id}/cancel-acceptance`, { method: 'POST' }),
  decideProposal: (negotiationId, decision) => request(`/negotiations/${negotiationId}/proposal`, { method: 'PATCH', body: JSON.stringify({ decision }) }),
  payment: (negotiationId) => request(`/negotiations/${negotiationId}/payment`),
  collection: (negotiationId) => request(`/negotiations/${negotiationId}/collection`),
  scheduleCollection: (negotiationId, body) => request(`/negotiations/${negotiationId}/collection`, { method: 'POST', body: JSON.stringify(body) }),
  acceptCollection: (id) => request(`/collection-deliveries/${id}/accept`, { method: 'POST' }),
  confirmCollection: (id, token) => request(`/collection-deliveries/${id}/confirm`, { method: 'POST', body: JSON.stringify({ token }) }),
  updateCollectionStatus: (id, status) => request(`/collection-deliveries/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  paymentItems: () => request('/profile/payment-items'),
  stripeConnect: () => request('/payments/stripe/connect'),
  stripeStatus: () => request('/payments/stripe/status'),
  stripeDashboard: () => request('/payments/stripe/dashboard', { method:'POST' }),
  switchOfferToCard: (id) => request(`/negotiations/${id}/switch-to-card`, { method:'POST' }),
  refundPayment: (id) => request(`/negotiations/${id}/refund`, { method:'POST' }),
  createPayment: (negotiationId, body) => request(`/negotiations/${negotiationId}/payment`, { method: 'POST', body: JSON.stringify(body) }),
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
  readThreadNotifications: (threadId) => request(`/notifications/read-thread/${encodeURIComponent(threadId)}`, { method: 'POST' }),
  createThread: (body) => request('/messages/threads', { method: 'POST', body: JSON.stringify(body) }),
  threads: () => request('/messages/threads'),
  thread: (id) => request(`/messages/threads/${id}`),
  sendMessage: (id, body) => request(`/messages/threads/${id}/messages`, { method: 'POST', body: JSON.stringify(body) }),
  clearThreadMessages: (id) => request(`/messages/threads/${id}/messages`, { method: 'DELETE' }),
  clearAllMessages: () => request('/messages/threads', { method: 'DELETE' }),
  collectionPoints: () => request('/collection-points'),
  collectionPointsNearby: (city) => request(`/collection-points/nearby?city=${encodeURIComponent(city || '')}`),
  mapRoute: ({ fromLat, fromLng, toLat, toLng }) => request(`/map-route?fromLat=${encodeURIComponent(fromLat)}&fromLng=${encodeURIComponent(fromLng)}&toLat=${encodeURIComponent(toLat)}&toLng=${encodeURIComponent(toLng)}`),
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
  createAdminCollectionPoint: (body) => request('/admin/collection-points', { method: 'POST', body: JSON.stringify(body) }),
  updateAdminCollectionPoint: (id, body) => request(`/admin/collection-points/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  removeAdminCollectionPoint: (id) => request(`/admin/collection-points/${id}`, { method: 'DELETE' }),
  reviewPointSuggestion: (id, decision) => request(`/admin/collection-point-suggestions/${id}`, { method: 'PATCH', body: JSON.stringify({ decision }) })
};
