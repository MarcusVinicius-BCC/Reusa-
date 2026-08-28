import { create } from 'zustand';
import { api, clearToken, getToken, setToken } from './api';
import { fallbackPosts } from './data';

const initialFormState = {
  interests: []
};

export const useAppStore = create((set, get) => ({
  initialized: false,
  session: null,
  posts: fallbackPosts,
  threads: [],
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
    const result = await api.threads();
    set({ threads: result.threads || [] });
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
    const body = payload.image instanceof File ? Object.entries(payload).reduce((formData, [key, value]) => {
      if (key !== 'image' && value !== undefined) formData.append(key, value);
      return formData;
    }, new FormData()) : payload;
    if (payload.image instanceof File) body.append('image', payload.image);
    const result = await api.createPost(body);
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
    const result = await api.updatePost(postId, payload);
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
    return result.message;
  },
  setSearch: (value) => set({ search: value }),
  setPostForm: (updater) => set((state) => ({ postForm: typeof updater === 'function' ? updater(state.postForm) : updater })),
  resetPostForm: () => set({ postForm: initialFormState })
}));
