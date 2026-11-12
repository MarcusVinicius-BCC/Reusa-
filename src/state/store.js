// controla as funcionalidades do app, como login, registro, feed, threads, notificações, pontos de coleta, favoritos, perfil, busca e formulários de postagem
import { create } from 'zustand';
import { api, clearToken, getToken, setToken } from '../services/api';
import { fallbackPosts } from '../data/fallback-posts';

const initialFormState = {
  interests: []
};

let messageClearRevision = 0;
const notificationThreadId = (notification) => {
  try { return new URL(notification.link, 'https://reusa.invalid').searchParams.get('thread'); }
  catch { return null; }
};

function postRequestBody(payload, editing = false) {
  const images = Array.isArray(payload.images) ? payload.images : payload.image instanceof File ? [payload.image] : [];
  const videos = Array.isArray(payload.videos) ? payload.videos : [];
  if (!images.length && !videos.length && !(editing && (Array.isArray(payload.images) || Array.isArray(payload.videos)))) return payload;
  const body = new FormData();
  Object.entries(payload).forEach(([key, value]) => {
    if (!['image', 'images', 'videos'].includes(key) && value !== undefined) {
      body.append(key, value !== null && typeof value === 'object' ? JSON.stringify(value) : value);
    }
  });
  images.forEach((file) => body.append('images', file));
  videos.forEach((file) => body.append('videos', file));
  return body;
}

export const useAppStore = create((set, get) => ({
  initialized: false,
  session: null,
  posts: fallbackPosts,
  threads: [],
  notifications: [],
  collectionPoints: [],
  favorites: [],
  profile: null,
  search: '',
  authBusy: false,
  postForm: initialFormState,
  chatDrafts: {},
  initialize: async () => {
    if (get().initialized) {
      return;
    }

    if (!getToken()) {
      set({ initialized: true });
      return;
    }

    try {
      const result = await api.me();
      set({ session: result.user });
    } catch {
      clearToken();
      set({ session: null });
    } finally {
      set({ initialized: true });
    }
  },
  login: async (credentials) => {
    set({ authBusy: true });
    try {
      const result = await api.login(credentials);
      setToken(result.token);
      set({ session: result.user });
      return result.user;
    } finally {
      set({ authBusy: false });
    }
  },
  register: async (payload) => {
    set({ authBusy: true });
    try {
      const result = await api.register(payload);
      setToken(result.token);
      set({ session: result.user });
      return result.user;
    } finally {
      set({ authBusy: false });
    }
  },
  logout: () => {
    clearToken();
    set({ session: null, profile: null, threads: [] });
  },
  loadFeed: async () => {
    const result = await api.feed();
    set({ posts: result.posts || fallbackPosts });
  },
  loadThreads: async () => {
    const revision = messageClearRevision;
    const result = await api.threads();
    if (revision === messageClearRevision) set({ threads: result.threads || [] });
  },
  loadNotifications: async () => {
    const revision = messageClearRevision;
    const result = await api.notifications();
    if (revision === messageClearRevision) set({ notifications: result.notifications || [] });
    return get().notifications;
  },
  clearMessages: async (threadId) => {
    const result = threadId ? await api.clearThreadMessages(threadId) : await api.clearAllMessages();
    if (!result?.ok) throw new Error('Não foi possível limpar as mensagens. Tente novamente.');
    const clearedAt = result.clearedAt || new Date().toISOString();
    const cutoff = Date.parse(clearedAt);
    // Ignore requests started before the clear, so an old poll cannot restore its badge.
    messageClearRevision += 1;
    set((state) => ({
      threads: state.threads.filter((thread) => (threadId && thread.id !== threadId) || Date.parse(thread.time) > cutoff),
      notifications: state.notifications.map((item) => item.type === 'message' && !item.readAt &&
        (!threadId || notificationThreadId(item) === threadId) && Date.parse(item.createdAt) <= cutoff
        ? { ...item, readAt: clearedAt } : item)
    }));
    await Promise.all([get().loadThreads(), get().loadNotifications()]);
    return result;
  },
  readThreadNotifications: async (threadId) => {
    await api.readThreadNotifications(threadId);
    await get().loadNotifications();
  },
  loadCollectionPoints: async () => {
    const result = await api.collectionPoints();
    set({ collectionPoints: result.collectionPoints || [] });
  },
  loadCollectionPointsNearby: async (city) => {
    const result = await api.collectionPointsNearby(city);
    set({ collectionPoints: result.collectionPoints || [] });
    return result;
  },
  loadProfile: async () => {
    const result = await api.profile();
    set({ profile: result });
    return result;
  },
  updateAvatar: async (file) => {
    const result = await api.updateAvatar(file);
    set((state) => ({
      session: state.session ? { ...state.session, avatar: result.user.avatar } : state.session,
      profile: state.profile ? { ...state.profile, user: { ...state.profile.user, avatar: result.user.avatar } } : state.profile,
      posts: state.posts.map((post) => post.authorId === state.session?.id ? { ...post, author: { ...post.author, avatar: result.user.avatar } } : post)
    }));
    return result.user;
  },
  loadFavorites: async () => {
    const result = await api.favorites();
    set({ favorites: result.posts || [] });
    return result.posts || [];
  },
  updateProfile: async (payload) => {
    const result = await api.updateProfile(payload);
    set((state) => ({ profile: state.profile ? { ...state.profile, user: result.user } : { user: result.user } }));
    return result.user;
  },
  createPost: async (payload) => {
    const result = await api.createPost(postRequestBody(payload));
    set((state) => ({ posts: [result.post, ...state.posts] }));
    return result.post;
  },
  createThread: async (postId) => {
    const result = await api.createThread({ postId });
    return result.thread;
  },
  toggleLike: async (postId) => {
    const result = await api.toggleLike(postId);
    set((state) => ({
      posts: state.posts.map((post) => post.id === postId ? { ...post, likes: result.likes, liked: result.liked } : post)
    }));
    return result;
  },
  toggleFavorite: async (postId) => {
    const result = await api.toggleFavorite(postId);
    set((state) => ({
      posts: state.posts.map((post) => post.id === postId ? { ...post, saved: result.saved } : post),
      favorites: result.saved
        ? state.favorites.some((post) => post.id === postId) ? state.favorites : [state.posts.find((post) => post.id === postId), ...state.favorites].filter(Boolean)
        : state.favorites.filter((post) => post.id !== postId)
    }));
    return result;
  },
  updatePost: async (postId, payload) => {
    const result = await api.updatePost(postId, postRequestBody(payload, true));
    set((state) => ({ posts: state.posts.map((post) => post.id === postId ? result.post : post) }));
    return result.post;
  },
  updatePostStatus: async (postId, status) => {
    const result = await api.updatePostStatus(postId, status);
    set((state) => ({ posts: state.posts.map((post) => post.id === postId ? result.post : post) }));
    return result.post;
  },
  reservePost: async (postId, interestedId) => {
    const result = await api.reservePost(postId, interestedId);
    set((state) => ({ posts: state.posts.map((post) => post.id === postId ? result.post : post) }));
    return result.post;
  },
  completePost: async (postId, outcome) => {
    const result = await api.completePost(postId, outcome);
    set((state) => ({ posts: state.posts.map((post) => post.id === postId ? result.post : post) }));
    return result;
  },
  deletePost: async (postId) => {
    await api.deletePost(postId);
    set((state) => ({ posts: state.posts.filter((post) => post.id !== postId) }));
  },
  sendMessage: async (threadId, payload) => {
    const result = await api.sendMessage(threadId, payload);
    get().loadThreads().catch(() => {});
    return result.message;
  },
  setSearch: (value) => set({ search: value }),
  setPostForm: (updater) => set((state) => ({ postForm: typeof updater === 'function' ? updater(state.postForm) : updater })),
  resetPostForm: () => set({ postForm: initialFormState })
}));
