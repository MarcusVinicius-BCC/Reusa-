import React, { useEffect, useMemo, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { api } from './api';
import { useAppStore } from './store';
import { fallbackPosts } from './data';
import { CircleMarker, MapContainer, TileLayer, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

const navRoutes = {
  home: '/feed',
  inicio: '/feed',
  explore: '/mapa',
  explorar: '/mapa',
  post: '/nova-publicacao',
  publicar: '/nova-publicacao',
  map: '/mapa',
  profile: '/perfil',
  perfil: '/perfil',
  mensagens: '/mensagens',
  inspiracoes: '/inspiracoes'
};

export function AppRoutes() {
  const location = useLocation();
  const navigate = useNavigate();
  const initialize = useAppStore((state) => state.initialize);
  const session = useAppStore((state) => state.session);
  const initialized = useAppStore((state) => state.initialized);

  useEffect(() => {
    initialize();
  }, [initialize]);

  useEffect(() => {
    const publicRoute = ['/splash', '/login', '/criar-conta', '/feed', '/mapa', '/inspiracoes', '/mensagens', '/mensagens/ana', '/nova-publicacao', '/perfil', '/sobre'].includes(location.pathname) || location.pathname.startsWith('/anuncios/');
    if (!session && !publicRoute) {
      navigate('/login', { replace: true });
    }
  }, [session, location.pathname, navigate]);

  if (!initialized) return <div className="loading-stage"><span className="material-symbols-outlined">recycling</span><p>Carregando seu espaço...</p></div>;
  return <ScreenErrorBoundary><ScreenRouter location={location.pathname} navigate={navigate} /></ScreenErrorBoundary>;
}

class ScreenErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: false };
  }

  static getDerivedStateFromError() {
    return { error: true };
  }

  componentDidCatch(error) {
    console.error('Erro ao renderizar tela ReUsa+', error);
  }

  render() {
    if (this.state.error) {
      return <main className="screen-error"><span className="material-symbols-outlined">error</span><h1>Não foi possível carregar esta tela</h1><p>Atualize a página para tentar novamente.</p><button className="primary-btn" onClick={() => window.location.reload()}>Atualizar página</button><a className="text-btn" href="/feed">Voltar ao Feed</a></main>;
    }
    return this.props.children;
  }
}

function ScreenRouter({ location, navigate }) {
  if (location.startsWith('/anuncios/')) {
    return <PostDetailScreen postId={location.split('/').pop()} onBack={() => navigate('/feed')} onNavigate={navigate} />;
  }
  switch (location) {
    case '/':
      return <Navigate to="/splash" replace />;
    case '/splash':
      return <SplashScreen onCreateAccount={() => navigate('/criar-conta')} onLogin={() => navigate('/login')} />;
    case '/onboarding':
      return <Navigate to="/login" replace />;
    case '/login':
      return <LoginScreen onGoToRegister={() => navigate('/criar-conta')} onSuccess={() => navigate('/feed')} />;
    case '/criar-conta':
      return <RegisterScreen onGoToLogin={() => navigate('/login')} onSuccess={() => navigate('/feed')} />;
    case '/feed':
      return <FeedScreen onNavigate={navigate} />;
    case '/inspiracoes':
      return <InspirationsScreen onNavigate={navigate} />;
    case '/nova-inspiracao':
      return <CreateInspirationScreen onBack={() => navigate('/inspiracoes')} onSuccess={() => navigate('/inspiracoes')} />;
    case '/ana-ia':
      return <AiIdeasScreen onBack={() => navigate('/feed')} />;
    case '/notificacoes':
      return <NotificationsScreen onBack={() => navigate('/feed')} onNavigate={navigate} />;
    case '/mensagens':
      return <MessagesScreen onOpenThread={(threadId) => navigate(`/mensagens/ana?thread=${threadId || 'thread-ana-notebook'}`)} />;
    case '/mensagens/ana':
      return <ChatScreen onBack={() => navigate('/mensagens')} />;
    case '/nova-publicacao':
      return <CreatePostScreen onBack={() => navigate('/feed')} onSuccess={() => navigate('/feed')} />;
    case '/perfil':
      return <ProfileScreen onGoToFeed={() => navigate('/feed')} onSettings={() => navigate('/configuracoes')} onSaved={() => navigate('/itens-salvos')} onMyPosts={() => navigate('/meus-anuncios')} onAdmin={() => navigate('/admin')} />;
    case '/mapa':
      return <MapScreen onSuggest={() => navigate('/sugerir-ponto')} />;
    case '/itens-salvos':
      return <SavedItemsScreen onBack={() => navigate('/perfil')} onOpenPost={(id) => navigate(`/anuncios/${id}`)} />;
    case '/meus-anuncios':
      return <MyPostsScreen onBack={() => navigate('/perfil')} onOpenPost={(id) => navigate(`/anuncios/${id}`)} />;
    case '/sugerir-ponto':
      return <SuggestCollectionPointScreen onBack={() => navigate('/mapa')} />;
    case '/admin':
      return <AdminScreen onBack={() => navigate('/perfil')} />;
    case '/sobre':
      return <AboutScreen onBack={() => navigate('/splash')} />;
    case '/configuracoes':
      return <SettingsScreen onBack={() => navigate('/perfil')} onLogout={() => navigate('/login')} onAbout={() => navigate('/sobre')} />;
    default:
      return <Navigate to="/feed" replace />;
  }
}

function Shell({ children, nav, active }) {
  return (
    <div className="screen-frame">
      {children}
      <BottomNav nav={nav} active={active} />
    </div>
  );
}

function BottomNav({ nav, active }) {
  return (
    <nav className="bottom-nav" aria-label="Navegação principal">
      {[
        ['home', 'Início', 'home'],
        ['map', 'Mapa', 'map'],
        ['post', 'Publicar', 'add'],
        ['mensagens', 'Mensagens', 'chat_bubble'],
        ['profile', 'Perfil', 'person']
      ].map(([key, label, icon]) => {
        const to = nav[key] || navRoutes[key];
        const isAdd = key === 'post';
        const isActive = active === to;
        return (
          <a
            key={key}
            href={to}
            className={isAdd ? 'nav-item nav-add' : isActive ? 'nav-item nav-active' : 'nav-item'}
            aria-current={isActive ? 'page' : undefined}
            aria-label={label}
          >
            <span className="material-symbols-outlined">{icon}</span>
            <span>{label}</span>
          </a>
        );
      })}
    </nav>
  );
}

function SplashScreen({ onCreateAccount, onLogin }) {
  return (
    <main className="center-stage splash-stage">
      <div className="splash-orb" />
      <div className="logo-badge">
        <img src="https://lh3.googleusercontent.com/aida-public/AB6AXuBOFtyytVWbcN0yp6q-fl1hVuGZc2T-IkiFJZf1JbR8gICaEsLcjvzh0cLTnlkKeFXV0eKB8KGySBJZVI32kemRvuIBroTd7scTzBKsKAYOVCfa27zNu5caOKkTqvovxOyQ64Hoh9gB58Eu8W4bd4FZS_59Jns0yBzldcGWwM1XKO7g8GkM1st1X_H57AEQuitrAETSMgGC_lQ-c8kQ1BhbADOsMOBfKWBjs-xlaG5uL2-op8eOGdUN" alt="REUSA+" />
      </div>
      <h1>REUSA+</h1>
      <p>Desapegue. Reutilize. Reconecte.</p>
      <div className="splash-actions">
        <button className="primary-btn full" onClick={onCreateAccount}>Criar nova conta</button>
        <p>Já tem uma conta? <button className="text-btn" onClick={onLogin}>Entrar</button></p>
        <small>Ao continuar, você concorda com os termos de uso da REUSA+.</small>
      </div>
    </main>
  );
}

function LoginScreen({ onGoToRegister, onSuccess }) {
  const login = useAppStore((state) => state.login);
  const [formState, setFormState] = useState({ email: '', password: '' });

  async function submit(event) {
    event.preventDefault();
    try {
      await login(formState);
      onSuccess();
    } catch (error) {
      alert(error.message);
    }
  }

  return (
    <div className="auth-layout">
      <div className="auth-card">
        <div className="auth-logo"><img src="https://lh3.googleusercontent.com/aida-public/AB6AXuBOFtyytVWbcN0yp6q-fl1hVuGZc2T-IkiFJZf1JbR8gICaEsLcjvzh0cLTnlkKeFXV0eKB8KGySBJZVI32kemRvuIBroTd7scTzBKsKAYOVCfa27zNu5caOKkTqvovxOyQ64Hoh9gB58Eu8W4bd4FZS_59Jns0yBzldcGWwM1XKO7g8GkM1st1X_H57AEQuitrAETSMgGC_lQ-c8kQ1BhbADOsMOBfKWBjs-xlaG5uL2-op8eOGdUN" alt="REUSA+" /></div>
        <h2>Bem-vindo de volta!</h2>
        <p>Pronto para causar impacto hoje?</p>
        <form onSubmit={submit} className="auth-form">
          <Field label="E-mail" icon="mail" value={formState.email} onChange={(value) => setFormState((prev) => ({ ...prev, email: value }))} placeholder="seu@email.com" />
          <Field label="Senha" icon="lock" type="password" value={formState.password} onChange={(value) => setFormState((prev) => ({ ...prev, password: value }))} placeholder="••••••••" />
          <button type="submit" className="primary-btn full">Entrar <span className="material-symbols-outlined">arrow_forward</span></button>
        </form>
        <div className="auth-footer">Não tem uma conta? <button className="text-btn" onClick={onGoToRegister}>Cadastre-se</button></div>
      </div>
    </div>
  );
}

function RegisterScreen({ onGoToLogin, onSuccess }) {
  const register = useAppStore((state) => state.register);
  const [formState, setFormState] = useState({ name: '', email: '', password: '', cep: '', address: '', city: '', interests: [] });
  const [cepBusy, setCepBusy] = useState(false);
  const interests = ['Eletrônicos', 'Roupas', 'Móveis', 'Livros', 'Outros'];

  async function submit(event) {
    event.preventDefault();
    try {
      await register(formState);
      onSuccess();
    } catch (error) {
      alert(error.message);
    }
  }

  async function lookupCep(value) {
    const cep = value.replace(/\D/g, '').slice(0, 8);
    setFormState((prev) => ({ ...prev, cep }));
    if (cep.length !== 8) return;
    setCepBusy(true);
    try {
      const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const address = await response.json();
      if (address.erro) throw new Error('CEP não encontrado');
      setFormState((prev) => ({ ...prev, cep, city: `${address.localidade}${address.uf ? `, ${address.uf}` : ''}`, address: [address.logradouro, address.bairro].filter(Boolean).join(', ') }));
    } catch (error) {
      alert(error.message);
    } finally {
      setCepBusy(false);
    }
  }

  return (
    <div className="auth-layout">
      <div className="auth-card large">
        <h2>Crie sua conta</h2>
        <p>Junte-se à maior comunidade de economia circular.</p>
        <form onSubmit={submit} className="auth-form">
          <Field label="Nome completo" icon="person" value={formState.name} onChange={(value) => setFormState((prev) => ({ ...prev, name: value }))} placeholder="Como devemos chamar você?" />
          <Field label="E-mail" icon="mail" value={formState.email} onChange={(value) => setFormState((prev) => ({ ...prev, email: value }))} placeholder="seu@email.com.br" />
          <Field label="Senha" icon="lock" type="password" value={formState.password} onChange={(value) => setFormState((prev) => ({ ...prev, password: value }))} placeholder="Mínimo 8 caracteres" />
          <Field label="CEP" icon="markunread_mailbox" value={formState.cep} onChange={lookupCep} placeholder="00000-000" />
          {formState.address ? <div className="address-preview"><span className="material-symbols-outlined">location_on</span><span>{formState.address} · {formState.city}</span>{cepBusy ? <span>Consultando...</span> : null}</div> : null}
          <Field label="Cidade" icon="location_on" value={formState.city} onChange={(value) => setFormState((prev) => ({ ...prev, city: value }))} placeholder="Ex: São Paulo, SP" />
          <div className="chip-box">
            <label>O que você mais se interessa em reutilizar?</label>
            <div className="chip-row">
              {interests.map((interest) => {
                const selected = formState.interests.includes(interest);
                return (
                  <button
                    key={interest}
                    type="button"
                    className={selected ? 'chip chip-active' : 'chip'}
                    onClick={() => setFormState((prev) => ({
                      ...prev,
                      interests: prev.interests.includes(interest)
                        ? prev.interests.filter((item) => item !== interest)
                        : [...prev.interests, interest]
                    }))}
                  >
                    {interest}
                  </button>
                );
              })}
            </div>
          </div>
          <button type="submit" className="primary-btn full">Criar Conta <span className="material-symbols-outlined">arrow_forward</span></button>
        </form>
        <div className="auth-footer">Já tem uma conta? <button className="text-btn" onClick={onGoToLogin}>Entre</button></div>
      </div>
    </div>
  );
}

function FeedScreen({ onNavigate }) {
  const posts = useAppStore((state) => state.posts);
  const session = useAppStore((state) => state.session);
  const search = useAppStore((state) => state.search);
  const setSearch = useAppStore((state) => state.setSearch);
  const loadFeed = useAppStore((state) => state.loadFeed);
  const [category, setCategory] = useState('Todos');
  const [notificationCount, setNotificationCount] = useState(0);
  const [filters, setFilters] = useState({ goal: '', condition: '', city: '', status: '', date: '' });
  const [sortBy, setSortBy] = useState('recent');
  const [showFilters, setShowFilters] = useState(false);
  const filteredPosts = useMemo(() => {
    const query = search.trim().toLowerCase();
    return posts.filter((post) => {
      const matchesCategory = category === 'Todos' || post.category.toLowerCase() === category.toLowerCase();
      const matchesSearch = !query || [post.title, post.description, post.category, post.author?.name].some((value) => String(value || '').toLowerCase().includes(query));
      const matchesGoal = !filters.goal || post.goal === filters.goal;
      const matchesCondition = !filters.condition || post.condition === filters.condition;
      const matchesCity = !filters.city || String(post.location || post.author?.city || '').toLowerCase().includes(filters.city.toLowerCase());
      const matchesStatus = !filters.status || post.status === filters.status;
      const matchesDate = !filters.date || String(post.createdAt || '').slice(0, 10) >= filters.date;
      return matchesCategory && matchesSearch && matchesGoal && matchesCondition && matchesCity && matchesStatus && matchesDate;
    }).sort((first, second) => {
      if (sortBy === 'oldest') return new Date(first.createdAt) - new Date(second.createdAt);
      if (sortBy === 'liked') return Number(second.likes || 0) - Number(first.likes || 0);
      if (sortBy === 'nearby') {
        const city = String(session?.city || '').toLowerCase();
        return Number(String(second.location || second.author?.city || '').toLowerCase().includes(city)) - Number(String(first.location || first.author?.city || '').toLowerCase().includes(city));
      }
      return new Date(second.createdAt) - new Date(first.createdAt);
    });
  }, [posts, search, category, filters, sortBy, session?.city]);

  useEffect(() => {
    loadFeed().catch(() => {});
    api.notifications().then((result) => setNotificationCount(result.unreadCount || 0)).catch(() => {});
  }, [loadFeed]);

  return (
    <Shell nav={navRoutes} active="/feed">
      <header className="topbar">
        <div className="brand"><img src="https://lh3.googleusercontent.com/aida-public/AB6AXuBOFtyytVWbcN0yp6q-fl1hVuGZc2T-IkiFJZf1JbR8gICaEsLcjvzh0cLTnlkKeFXV0eKB8KGySBJZVI32kemRvuIBroTd7scTzBKsKAYOVCfa27zNu5caOKkTqvovxOyQ64Hoh9gB58Eu8W4bd4FZS_59Jns0yBzldcGWwM1XKO7g8GkM1st1X_H57AEQuitrAETSMgGC_lQ-c8kQ1BhbADOsMOBfKWBjs-xlaG5uL2-op8eOGdUN" alt="REUSA+" /><span>REUSA+</span></div>
        <label className="searchbar"><span className="material-symbols-outlined">search</span><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search" /></label>
        <div className="topbar-actions"><button className="icon-btn notification-btn" onClick={() => { api.readNotifications().catch(() => {}); setNotificationCount(0); onNavigate('/notificacoes'); }} aria-label="Notificações"><span className="material-symbols-outlined">notifications</span>{notificationCount ? <b>{notificationCount}</b> : null}</button><button className="avatar-btn" onClick={() => onNavigate('/perfil')} aria-label="Abrir perfil"><span className="material-symbols-outlined">person</span></button></div>
      </header>
      <main className="feed-page">
        <CategoryBar selected={category} onChange={setCategory} />
        <section className="feed-filter-bar" aria-label="Filtros de anúncios">
          <button type="button" className={showFilters ? 'filter-toggle filter-toggle-active' : 'filter-toggle'} onClick={() => setShowFilters((value) => !value)}><span className="material-symbols-outlined">tune</span>Filtros</button>
          <label><span>Ordenar</span><select value={sortBy} onChange={(event) => setSortBy(event.target.value)}><option value="recent">Mais recentes</option><option value="oldest">Mais antigos</option><option value="liked">Mais curtidos</option><option value="nearby">Próximos de mim</option></select></label>
        </section>
        {showFilters ? <section className="advanced-filters">
          <label><span>Tipo</span><select value={filters.goal} onChange={(event) => setFilters((current) => ({ ...current, goal: event.target.value }))}><option value="">Todos</option><option value="Doação">Doação</option><option value="Troca">Troca</option></select></label>
          <label><span>Estado</span><select value={filters.condition} onChange={(event) => setFilters((current) => ({ ...current, condition: event.target.value }))}><option value="">Todos</option><option value="Novo">Novo</option><option value="Bom estado">Bom estado</option><option value="Marcas de uso">Marcas de uso</option><option value="Para conserto">Para conserto</option></select></label>
          <label><span>Cidade</span><input value={filters.city} onChange={(event) => setFilters((current) => ({ ...current, city: event.target.value }))} placeholder={session?.city || 'Qualquer cidade'} /></label>
          <label><span>Status</span><select value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}><option value="">Todos</option><option value="Disponível">Disponível</option><option value="Reservado">Reservado</option><option value="Doado">Doado</option><option value="Trocado">Trocado</option><option value="Encerrado">Encerrado</option></select></label>
          <label><span>Publicado após</span><input type="date" value={filters.date} onChange={(event) => setFilters((current) => ({ ...current, date: event.target.value }))} /></label>
          <button type="button" className="text-btn" onClick={() => setFilters({ goal: '', condition: '', city: '', status: '', date: '' })}>Limpar filtros</button>
        </section> : null}
        <div className="community-actions">
          <button className="community-action community-action-ai" onClick={() => onNavigate('/ana-ia')}><span className="material-symbols-outlined">auto_awesome</span><span><strong>Peça uma ideia à Ana IA</strong><small>Descubra o que criar com seus materiais</small></span><span className="material-symbols-outlined">arrow_forward</span></button>
          <button className="community-action" onClick={() => onNavigate('/inspiracoes')}><span className="material-symbols-outlined">storefront</span><span><strong>Feito com reaproveitamento</strong><small>Conheça produtos da comunidade</small></span><span className="material-symbols-outlined">arrow_forward</span></button>
        </div>
        <div className="feed-list">
          {filteredPosts.length ? filteredPosts.map((post) => <FeedCard key={post.id} post={post} onOpenChat={async () => { try { const thread = await useAppStore.getState().createThread(post.id); onNavigate(`/mensagens/ana?thread=${thread.id}`); } catch (error) { alert(error.message); } }} />) : <div className="empty-state"><span className="material-symbols-outlined">search_off</span><h2>Nada encontrado</h2><p>Tente outra busca ou categoria.</p></div>}
        </div>
      </main>
    </Shell>
  );
}

function NotificationsScreen({ onBack, onNavigate }) {
  const [notifications, setNotifications] = useState([]);
  useEffect(() => { api.notifications().then((result) => setNotifications(result.notifications || [])).catch(() => {}); }, []);
  const iconFor = (type) => ({ message: 'chat', comment: 'chat_bubble', like: 'favorite', interest: 'handshake', negotiation: 'swap_horiz', review: 'star', system: 'notifications' }[type] || 'notifications');
  async function openNotification(notification) {
    try { await api.readNotification(notification.id); setNotifications((items) => items.map((item) => item.id === notification.id ? { ...item, readAt: new Date().toISOString() } : item)); } catch {}
    onNavigate(notification.link || '/feed');
  }
  return <Shell nav={navRoutes} active="/notificacoes"><header className="topbar compact-topbar"><button className="back-btn" onClick={onBack}><span className="material-symbols-outlined">arrow_back_ios_new</span></button><h1>Notificações</h1></header><main className="page padded-top"><div className="notification-list">{notifications.length ? notifications.map((notification) => <button className={notification.readAt ? 'notification-item' : 'notification-item notification-unread'} key={notification.id} onClick={() => openNotification(notification)}><span className="notification-icon material-symbols-outlined">{iconFor(notification.type)}</span><span><strong>{notification.title}</strong><p>{notification.text}</p><small>{new Date(notification.createdAt).toLocaleString('pt-BR')}</small></span></button>) : <EmptyState icon="notifications_none" title="Nenhuma notificação nova" text="Quando algo acontecer na sua comunidade, avisaremos por aqui." />}</div></main></Shell>;
}

function InspirationsScreen({ onNavigate }) {
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    api.inspirations().then((result) => setProducts(result.products || [])).catch(() => {});
  }, []);

  const visibleProducts = products.filter((product) => `${product.title} ${product.material} ${product.creator}`.toLowerCase().includes(search.toLowerCase()));
  return (
    <Shell nav={navRoutes} active="/inspiracoes">
      <header className="topbar compact-topbar"><button className="back-btn" onClick={() => onNavigate('/feed')}><span className="material-symbols-outlined">arrow_back_ios_new</span></button><h1>Inspirações</h1><button className="icon-btn" onClick={() => onNavigate('/ana-ia')}><span className="material-symbols-outlined">auto_awesome</span></button></header>
      <main className="page inspiration-page"><div className="inspiration-intro"><span className="eyebrow">Vitrine circular</span><h2>Produtos com uma segunda vida</h2><p>Descubra criações da comunidade e apoie quem transforma descarte em design.</p><button className="primary-btn" onClick={() => onNavigate('/nova-inspiracao')}><span className="material-symbols-outlined">add</span>Anunciar minha criação</button></div><label className="search-shell"><span className="material-symbols-outlined">search</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por material ou criador" /></label><div className="product-grid">{visibleProducts.map((product) => <article className="product-card" key={product.id}><img src={product.imageUrl} alt={product.title} /><div className="product-card-body"><span className="product-material">{product.material}</span><h3>{product.title}</h3><p>{product.description}</p><div className="product-meta"><strong>{product.price}</strong><span>{product.creator} · {product.city}</span></div><button className="ghost-btn product-contact" onClick={() => onNavigate('/mensagens')}>Conhecer criador</button></div></article>)}</div></main>
    </Shell>
  );
}

function CreateInspirationScreen({ onBack, onSuccess }) {
  const [form, setForm] = useState({ title: '', material: '', price: '', description: '', imageUrl: '' });
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    try { await api.createInspiration(form); onSuccess(); } catch (error) { alert(error.message); } finally { setBusy(false); }
  }
  return <div className="post-screen"><header className="topbar compact-topbar"><button className="back-btn" onClick={onBack}><span className="material-symbols-outlined">arrow_back_ios_new</span></button><h1>Anunciar criação</h1></header><main className="page padded-bottom"><section className="composer-card"><span className="eyebrow">Vitrine circular</span><h2>Mostre o que você criou</h2><p>Compartilhe um produto feito com materiais reaproveitados.</p><form className="composer-form" onSubmit={submit}><Field label="Nome do produto" icon="title" value={form.title} onChange={(value) => setForm((current) => ({ ...current, title: value }))} placeholder="Ex: Luminária de garrafas" /><Field label="Material reaproveitado" icon="recycling" value={form.material} onChange={(value) => setForm((current) => ({ ...current, material: value }))} placeholder="Ex: garrafas de vidro" /><Field label="Preço" icon="payments" value={form.price} onChange={(value) => setForm((current) => ({ ...current, price: value }))} placeholder="Ex: R$ 80,00" /><Field label="Descrição" icon="description" value={form.description} onChange={(value) => setForm((current) => ({ ...current, description: value }))} placeholder="Conte como a peça foi feita..." multiline /><Field label="URL da foto (opcional)" icon="image" value={form.imageUrl} onChange={(value) => setForm((current) => ({ ...current, imageUrl: value }))} placeholder="https://..." /><button className="primary-btn full" disabled={busy}>{busy ? 'Publicando...' : 'Publicar na vitrine'}<span className="material-symbols-outlined">send</span></button></form></section></main></div>;
}

function AiIdeasScreen({ onBack }) {
  const [prompt, setPrompt] = useState('');
  const [quantity, setQuantity] = useState('');
  const [objective, setObjective] = useState('');
  const [difficulty, setDifficulty] = useState('Fácil');
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  async function ask(event) {
    event.preventDefault();
    if (!prompt.trim()) return;
    setBusy(true);
    try {
      const response = await api.aiIdeas({ material: prompt, quantity, objective, difficulty });
      setResult(response.idea);
    } catch (error) {
      alert(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function publishInspiration() {
    try {
      await api.createInspiration({ title: result.title, material: result.materials.join(', '), price: 'Compartilhado pela comunidade', description: result.summary, imageUrl: '' });
      alert('Ideia publicada na área de Inspirações.');
    } catch (error) { alert(error.message); }
  }

  return <div className="ai-page"><header className="topbar compact-topbar"><button className="back-btn" onClick={onBack}><span className="material-symbols-outlined">arrow_back_ios_new</span></button><h1>Ana IA</h1><span className="ai-status">online</span></header><main className="ai-content"><div className="ai-hero"><span className="ai-icon material-symbols-outlined">auto_awesome</span><span className="eyebrow">Assistente de reaproveitamento</span><h2>O que você quer reaproveitar?</h2><p>Conte sobre os materiais e a Ana sugere uma ideia prática e segura.</p></div><form className="ai-form" onSubmit={ask}><textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Material disponível: ex. garrafas de vidro" rows={3} /><div className="ai-preferences"><input value={quantity} onChange={(event) => setQuantity(event.target.value)} placeholder="Quantidade aproximada" /><input value={objective} onChange={(event) => setObjective(event.target.value)} placeholder="Objetivo (decorar, organizar...)" /><select value={difficulty} onChange={(event) => setDifficulty(event.target.value)}><option>Fácil</option><option>Média</option><option>Avançada</option></select></div><button className="primary-btn full" disabled={busy}>{busy ? 'Pensando...' : 'Gerar ideia'}<span className="material-symbols-outlined">arrow_forward</span></button></form>{result ? <section className="ai-result"><span className="eyebrow">Sugestão da Ana · {result.difficulty}</span><h2>{result.title}</h2><p>{result.reuse || result.summary}</p><div className="ai-facts"><div><strong>Tempo</strong><span>{result.time}</span></div><div><strong>Materiais</strong><span>{result.materials.join(', ')}</span></div></div><h3>Como poderia ser reaproveitado</h3><ol>{result.steps.map((step) => <li key={step}>{step}</li>)}</ol><div className="ai-care"><span className="material-symbols-outlined">health_and_safety</span><span>{result.care}</span></div><button className="secondary-btn full" onClick={publishInspiration}><span className="material-symbols-outlined">storefront</span>Publicar como inspiração</button></section> : <div className="ai-prompts"><span>Tente perguntar:</span><button onClick={() => setPrompt('garrafas de vidro')}>garrafas de vidro</button><button onClick={() => setPrompt('madeira e pallet')}>madeira e pallet</button><button onClick={() => setPrompt('latas de alumínio')}>latas</button></div>}</main></div>;
}

function CategoryBar({ selected, onChange }) {
  const items = ['Todos', 'Eletrônicos', 'Roupas', 'Móveis', 'Livros', 'Plástico'];
  return <div className="category-scroll">{items.map((item) => <button key={item} onClick={() => onChange(item)} className={selected === item ? 'pill pill-active' : 'pill'}>{item}</button>)}</div>;
}

function FeedCard({ post, onOpenChat }) {
  const toggleLike = useAppStore((state) => state.toggleLike);
  const toggleFavorite = useAppStore((state) => state.toggleFavorite);
  const deletePost = useAppStore((state) => state.deletePost);
  const session = useAppStore((state) => state.session);
  const [liked, setLiked] = useState(Boolean(post.liked));
  const [saved, setSaved] = useState(Boolean(post.saved));
  const [likes, setLikes] = useState(post.likes || 0);
  const [commentCount, setCommentCount] = useState(post.comments || 0);
  const [comments, setComments] = useState([]);
  const [commentText, setCommentText] = useState('');
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [commentBusy, setCommentBusy] = useState(false);

  async function like() {
    try {
      const result = await toggleLike(post.id);
      setLiked(result.liked);
      setLikes(result.likes);
    } catch (error) {
      alert(error.message);
    }
  }

  async function favorite() {
    try {
      const result = await toggleFavorite(post.id);
      setSaved(result.saved);
    } catch (error) {
      alert(error.message);
    }
  }

  async function toggleComments() {
    setCommentsOpen((current) => !current);
    if (!commentsOpen) {
      try { const result = await api.comments(post.id); setComments(result.comments || []); } catch (error) { alert(error.message); }
    }
  }

  async function addComment(event) {
    event.preventDefault();
    if (!commentText.trim()) return;
    setCommentBusy(true);
    try {
      const result = await api.addComment(post.id, commentText);
      setComments((current) => [...current, result.comment]);
      setCommentCount(result.comments);
      setCommentText('');
    } catch (error) { alert(error.message); } finally { setCommentBusy(false); }
  }

  async function removePost() {
    if (post.authorId !== session?.id || !window.confirm('Excluir este anúncio?')) return;
    try { await deletePost(post.id); } catch (error) { alert(error.message); }
  }

  return (
    <article className="card post-card">
      <div className="post-head">
        <button className={saved ? 'icon-btn saved-btn' : 'icon-btn'} onClick={favorite} aria-label={saved ? 'Remover dos salvos' : 'Salvar anúncio'}><span className="material-symbols-outlined">{saved ? 'bookmark' : 'bookmark_border'}</span></button>
        {post.author.avatar ? <img className="avatar" src={post.author.avatar} alt={post.author.name} /> : <span className="avatar avatar-placeholder material-symbols-outlined" aria-label={`Perfil de ${post.author.name}`}>person</span>}
        <div className="post-meta"><strong>{post.author.name}</strong><span>Há 2 horas • {post.author.city}</span></div>
        {post.authorId === session?.id ? <button className="icon-btn" onClick={removePost} title="Excluir anúncio" aria-label="Excluir anúncio"><span className="material-symbols-outlined">delete</span></button> : null}
      </div>
      <div className="post-image-wrap">
        <img className="post-image" src={post.imageUrl} alt={post.title} />
        <div className="chip-float"><span className="material-symbols-outlined">{post.chipIcon}</span>{post.chipLabel}</div>
      </div>
      <div className="post-body">
        <h3><a className="post-title-link" href={`/anuncios/${post.id}`}>{post.title}</a></h3>
        <p>{post.description}</p>
        <div className="tag-row"><span>{post.category}</span><span>{post.condition}</span><span className={`status-tag status-${String(post.status || 'Disponível').toLowerCase().replace(/\s+/g, '-')}`}>{post.status || 'Disponível'}</span></div>
      </div>
      <div className="post-actions">
        <div className="post-stats"><button className={liked ? 'ghost-inline liked' : 'ghost-inline'} onClick={like}><span className="material-symbols-outlined">{liked ? 'favorite' : 'favorite_border'}</span>{likes}</button><button className="ghost-inline" onClick={toggleComments}><span className="material-symbols-outlined">chat_bubble</span>{commentCount}</button></div>
        <button className="primary-btn compact" onClick={onOpenChat}><span className="material-symbols-outlined">handshake</span>{post.goal === 'Troca' ? 'Fazer oferta' : 'Tenho interesse'}</button>
      </div>
      {commentsOpen ? <section className="comments-panel"><div className="comments-list">{comments.length ? comments.map((comment) => <div className="comment" key={comment.id}><img src={comment.avatar} alt="" /><div><strong>{comment.name}</strong><p>{comment.text}</p></div></div>) : <p className="comments-empty">Ainda não há comentários. Seja o primeiro.</p>}</div><form className="comment-form" onSubmit={addComment}><input value={commentText} maxLength="500" onChange={(event) => setCommentText(event.target.value)} placeholder="Escreva um comentário..." /><button className="send-btn" disabled={commentBusy} aria-label="Publicar comentário"><span className="material-symbols-outlined">send</span></button></form></section> : null}
    </article>
  );
}

function MessagesScreen({ onOpenThread }) {
  const threads = useAppStore((state) => state.threads);
  const loadThreads = useAppStore((state) => state.loadThreads);
  const [search, setSearch] = useState('');

  useEffect(() => {
    loadThreads().catch(() => {});
  }, [loadThreads]);

  const visibleThreads = threads.filter((thread) => `${thread.title} ${thread.subtitle}`.toLowerCase().includes(search.toLowerCase()));

  return (
    <Shell nav={navRoutes} active="/mensagens">
      <header className="topbar compact-topbar"><h1>Mensagens</h1><button className="icon-btn"><span className="material-symbols-outlined">search</span></button></header>
      <main className="page padded-top">
        <label className="search-shell"><span className="material-symbols-outlined">search</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Pesquisar conversas..." /></label>
        <div className="thread-list">
          {(visibleThreads.length ? visibleThreads : threads.length ? [] : [{ title: 'Ana Costa', subtitle: 'Olá! Tenho interesse nesse aparelho...', time: '14:20', unreadCount: 2 }]).map((thread) => (
            <button key={thread.id || thread.title} className="thread-card" onClick={() => onOpenThread(thread.id)}>
              <div className="thread-avatar"><span>{(thread.title || 'A').slice(0, 1)}</span></div>
              <div className="thread-content">
                <div><strong>{thread.title}</strong><span>{thread.time}</span></div>
                <p>{thread.subtitle}</p>
              </div>
              {thread.unreadCount ? <div className="unread">{thread.unreadCount}</div> : null}
            </button>
          ))}
        </div>
      </main>
    </Shell>
  );
}

function ChatScreen({ onBack }) {
  const [text, setText] = useState('');
  const [messages, setMessages] = useState([]);
  const [thread, setThread] = useState(null);
  const sendMessage = useAppStore((state) => state.sendMessage);
  const session = useAppStore((state) => state.session);
  const threadId = new URLSearchParams(window.location.search).get('thread') || 'thread-ana-notebook';

  useEffect(() => {
    api.thread(threadId).then((result) => {
      setThread(result.thread);
      setMessages(result.messages || []);
    }).catch(() => {});
  }, [threadId]);

  async function send() {
    if (!text.trim()) return;
    if (!session) {
      alert('Entre na sua conta para enviar mensagens.');
      return;
    }
    const messageText = text.trim();
    try {
      await sendMessage(threadId, { text: messageText });
      setMessages((current) => [...current, { id: Date.now(), sender_id: session.id, text: messageText, sent_at: new Date().toISOString() }]);
      setText('');
    } catch (error) {
      alert(error.message);
    }
  }

  return (
    <div className="chat-screen">
      <header className="topbar compact-topbar"><button className="back-btn" onClick={onBack}><span className="material-symbols-outlined">arrow_back_ios_new</span></button><h1>Conversa Direta</h1></header>
      <div className="chat-banner"><img src="https://lh3.googleusercontent.com/aida-public/AB6AXuD2Yt8UCZV3PjzQhY0IRhfZ8fhxt2-1023KsI5RudFqBRuj0uDTidKC4KXxG5DYeOdqYiOqUmHKuUGbX2_anxp7v2g9mToB86gBq7mYJxPrM2LEK_lqRLFUtFYHjCVtuqXVRrIOHS3yA17Jo2hhK8GIQmWQwn9WkNa8UG_sR8ze_ul0Fx-BOmMkY91YhBEmlOHyYP9A6yhty_lqfM8vJ_t__plfmQMSWD9jVzzkhl9ECYLeJ9Nar7YJ" alt="Item" /><div><strong>{thread?.title || 'Conversa'}</strong><span>Negocie com segurança e combine a retirada</span></div></div>
      <main className="chat-body">{messages.map((message) => { const mine = message.sender_id === session?.id; return <div key={message.id} className={mine ? 'bubble mine' : 'bubble'}><p>{message.text}</p><span>{new Date(message.sent_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span></div>; })}</main>
      <footer className="chat-compose"><textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Digite sua mensagem..." rows={1} /><button className="send-btn" onClick={send}><span className="material-symbols-outlined">send</span></button></footer>
    </div>
  );
}

function CreatePostScreen({ onBack, onSuccess }) {
  const createPost = useAppStore((state) => state.createPost);
  const postForm = useAppStore((state) => state.postForm);
  const setPostForm = useAppStore((state) => state.setPostForm);
  const session = useAppStore((state) => state.session);
  const [image, setImage] = useState(null);
  const [imagePreview, setImagePreview] = useState('');
  const categories = [
    ['moveis', 'chair', 'Móveis'],
    ['eletronicos', 'devices', 'Eletrônicos'],
    ['roupas', 'checkroom', 'Roupas'],
    ['livros', 'menu_book', 'Livros'],
    ['outros', 'category', 'Outros']
  ];

  useEffect(() => {
    if (!image) {
      setImagePreview('');
      return undefined;
    }
    const previewUrl = URL.createObjectURL(image);
    setImagePreview(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [image]);

  async function submit(event) {
    event.preventDefault();
    if (!postForm.title?.trim() || !postForm.description?.trim()) return;
    const customCategory = String(postForm.customCategory || '').trim();
    const category = postForm.category === 'outros' ? customCategory : (postForm.category || 'moveis');
    if (!category) {
      alert('Informe a categoria do produto.');
      return;
    }
    if (!session) {
      alert('Entre na sua conta para publicar um anúncio.');
      return;
    }
    try {
      const { customCategory: ignoredCustomCategory, ...postPayload } = postForm;
      await createPost({ ...postPayload, category, image });
      setPostForm({});
      setImage(null);
      onSuccess();
    } catch (error) {
      alert(error.message);
    }
  }

  return (
    <div className="post-screen publish-screen">
      <header className="topbar compact-topbar publish-topbar"><button className="back-btn" onClick={onBack} aria-label="Voltar"><span className="material-symbols-outlined">arrow_back_ios_new</span></button><h1>Novo anúncio</h1><span className="publish-progress">1 de 1</span></header>
      <main className="page publish-page">
        <section className="publish-hero">
          <span className="publish-hero-icon material-symbols-outlined">volunteer_activism</span>
          <div><span className="eyebrow">Dê um novo ciclo</span><h2>O que vai ganhar uma nova história?</h2><p>Capriche nos detalhes para encontrar a pessoa certa.</p></div>
        </section>
        <form onSubmit={submit} className="publish-form">
          <section className="publish-section publish-photo-section">
            <div className="publish-section-head"><div><span className="publish-step">01</span><h3>Mostre seu item</h3></div><span>Uma boa foto faz diferença</span></div>
            <label className={imagePreview ? 'publish-image-picker has-image' : 'publish-image-picker'}>
              {imagePreview ? <><img src={imagePreview} alt="Prévia do item" /><span className="publish-change-photo"><span className="material-symbols-outlined">edit</span>Trocar foto</span></> : <><span className="publish-image-icon material-symbols-outlined">add_a_photo</span><strong>Adicionar foto</strong><small>JPG, PNG, WebP ou GIF • até 5 MB</small></>}
              <input type="file" accept="image/jpeg,image/png,image/gif,image/webp,image/avif" onChange={(event) => setImage(event.target.files?.[0] || null)} />
            </label>
          </section>

          <section className="publish-section">
            <div className="publish-section-head"><div><span className="publish-step">02</span><h3>Conte sobre ele</h3></div><span>Seja direto e honesto</span></div>
            <div className="publish-fields">
              <Field label="Título do item" icon="title" value={postForm.title || ''} onChange={(value) => setPostForm((prev) => ({ ...prev, title: value }))} placeholder="Ex: Cadeira de madeira antiga" />
              <Field label="Descrição" icon="description" value={postForm.description || ''} onChange={(value) => setPostForm((prev) => ({ ...prev, description: value }))} placeholder="Estado, medidas e outros detalhes..." multiline />
            </div>
          </section>

          <section className="publish-section">
            <div className="publish-section-head"><div><span className="publish-step">03</span><h3>Escolha a categoria</h3></div></div>
            <div className="publish-categories">
              {categories.map(([value, icon, label]) => <button type="button" key={value} className={(postForm.category || 'moveis') === value ? 'publish-category publish-category-active' : 'publish-category'} onClick={() => setPostForm((prev) => ({ ...prev, category: value }))} aria-pressed={(postForm.category || 'moveis') === value}><span className="material-symbols-outlined">{icon}</span><span>{label}</span></button>)}
            </div>
            {postForm.category === 'outros' && <div className="publish-custom-category"><Field label="Qual é a categoria?" icon="sell" value={postForm.customCategory || ''} onChange={(value) => setPostForm((prev) => ({ ...prev, customCategory: value }))} placeholder="Ex: Esportes, jardinagem, brinquedos..." maxLength={60} autoFocus /><small>Ela aparecerá no anúncio como a categoria do produto.</small></div>}
          </section>

          <section className="publish-section">
            <div className="publish-section-head"><div><span className="publish-step">04</span><h3>Como está o item?</h3></div></div>
            <div className="publish-options">
              {['Novo', 'Bom estado', 'Marcas de uso', 'Para conserto'].map((condition) => <button type="button" key={condition} className={postForm.condition === condition || (!postForm.condition && condition === 'Novo') ? 'publish-option publish-option-active' : 'publish-option'} onClick={() => setPostForm((prev) => ({ ...prev, condition }))}>{condition}</button>)}
            </div>
          </section>

          <section className="publish-section">
            <div className="publish-section-head"><div><span className="publish-step">05</span><h3>Qual é a sua intenção?</h3></div></div>
            <div className="publish-goals">
              <button type="button" className={postForm.goal !== 'Troca' ? 'publish-goal publish-goal-active' : 'publish-goal'} onClick={() => setPostForm((prev) => ({ ...prev, goal: 'Doação' }))}><span className="material-symbols-outlined">volunteer_activism</span><span><strong>Doar</strong><small>Encontrar um novo lar</small></span></button>
              <button type="button" className={postForm.goal === 'Troca' ? 'publish-goal publish-goal-active' : 'publish-goal'} onClick={() => setPostForm((prev) => ({ ...prev, goal: 'Troca' }))}><span className="material-symbols-outlined">swap_horiz</span><span><strong>Trocar</strong><small>Receber algo em troca</small></span></button>
            </div>
          </section>

          <section className="publish-section">
            <div className="publish-section-head"><div><span className="publish-step">06</span><h3>Onde ele está?</h3></div></div>
            <Field label="Localização" icon="location_on" value={postForm.location || session?.city || ''} onChange={(value) => setPostForm((prev) => ({ ...prev, location: value }))} placeholder="Ex: Santarém, PA" />
          </section>

          <aside className="publish-tip"><span className="material-symbols-outlined">tips_and_updates</span><span><strong>Dica REUSA+</strong> Fotos claras e uma descrição sincera aumentam as chances de um novo encontro.</span></aside>
          <div className="publish-submit"><button type="submit" className="primary-btn full">Publicar anúncio <span className="material-symbols-outlined">arrow_forward</span></button><small>Você poderá conversar com interessados depois da publicação.</small></div>
        </form>
      </main>
    </div>
  );
}

function PostDetailScreen({ postId, onBack, onNavigate }) {
  const session = useAppStore((state) => state.session);
  const toggleFavorite = useAppStore((state) => state.toggleFavorite);
  const [post, setPost] = useState(null);
  const [comments, setComments] = useState([]);
  const [commentText, setCommentText] = useState('');
  const [interested, setInterested] = useState([]);
  const [negotiation, setNegotiation] = useState(null);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [reviewForm, setReviewForm] = useState({ rating: 5, comment: '' });
  const [reviewed, setReviewed] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportTarget, setReportTarget] = useState({ type: 'post', id: postId });
  const [reportReason, setReportReason] = useState('Spam');
  const [reportDetails, setReportDetails] = useState('');
  const [busy, setBusy] = useState(false);

  const ownPost = post?.authorId === session?.id;

  useEffect(() => {
    setBusy(true);
    Promise.all([api.post(postId), api.comments(postId)]).then(([postResult, commentResult]) => {
      setPost(postResult.post);
      setEditForm({ title: postResult.post.title, description: postResult.post.description, category: postResult.post.category, condition: postResult.post.condition, goal: postResult.post.goal, location: postResult.post.location });
      setComments(commentResult.comments || []);
    }).catch((error) => alert(error.message)).finally(() => setBusy(false));
    if (session) api.negotiation(postId).then((result) => setNegotiation(result.negotiation)).catch(() => {});
  }, [postId, session?.id]);

  async function refreshPost() {
    const result = await api.post(postId);
    setPost(result.post);
  }

  async function startConversation() {
    if (!session) return onNavigate('/login');
    try {
      const thread = await useAppStore.getState().createThread(post.id);
      onNavigate(`/mensagens/ana?thread=${thread.id}`);
    } catch (error) { alert(error.message); }
  }

  async function save() {
    if (!session) return onNavigate('/login');
    try { await toggleFavorite(post.id); setPost((current) => ({ ...current, saved: !current.saved })); } catch (error) { alert(error.message); }
  }

  async function share() {
    const shareData = { title: post.title, text: `Veja ${post.title} no ReUsa+`, url: window.location.href };
    try {
      if (navigator.share) await navigator.share(shareData);
      else { await navigator.clipboard.writeText(shareData.url); alert('Link copiado para a área de transferência.'); }
    } catch (error) {
      if (error.name !== 'AbortError') alert('Não foi possível compartilhar agora.');
    }
  }

  async function submitComment(event) {
    event.preventDefault();
    if (!session) return onNavigate('/login');
    if (!commentText.trim()) return;
    try {
      const result = await api.addComment(post.id, commentText);
      setComments((current) => [...current, result.comment]);
      setPost((current) => ({ ...current, comments: result.comments }));
      setCommentText('');
    } catch (error) { alert(error.message); }
  }

  async function submitReport(event) {
    event.preventDefault();
    if (!session) return onNavigate('/login');
    try {
      await api.report({ targetType: reportTarget.type, targetId: reportTarget.id, reason: reportReason, details: reportDetails });
      setReportOpen(false); setReportDetails(''); alert('Denúncia enviada para análise.');
    } catch (error) { alert(error.message); }
  }

  function openReport(type, id) {
    setReportTarget({ type, id });
    setReportOpen(true);
  }

  async function blockAuthor() {
    if (!session) return onNavigate('/login');
    if (!window.confirm(`Bloquear ${post.author.name}? Novas conversas serão impedidas.`)) return;
    try { const result = await api.blockUser(post.authorId); alert(result.blocked ? 'Usuário bloqueado.' : 'Usuário desbloqueado.'); } catch (error) { alert(error.message); }
  }

  async function loadInterested() {
    try { const result = await api.interested(post.id); setInterested(result.negotiations || []); } catch (error) { alert(error.message); }
  }

  async function reserve(interestedId) {
    try { await useAppStore.getState().reservePost(post.id, interestedId); await refreshPost(); await loadInterested(); } catch (error) { alert(error.message); }
  }

  async function complete(outcome) {
    if (!window.confirm(`Confirmar que o item foi ${outcome.toLowerCase()}?`)) return;
    try { await useAppStore.getState().completePost(post.id, outcome); await refreshPost(); alert('Negociação concluída. As avaliações foram liberadas.'); } catch (error) { alert(error.message); }
  }

  async function saveEdit(event) {
    event.preventDefault();
    try {
      const updated = await useAppStore.getState().updatePost(post.id, editForm);
      setPost(updated); setEditing(false);
    } catch (error) { alert(error.message); }
  }

  async function removeOwnedPost() {
    if (!window.confirm('Excluir este anúncio permanentemente?')) return;
    try { await useAppStore.getState().deletePost(post.id); onNavigate('/meus-anuncios'); } catch (error) { alert(error.message); }
  }

  async function submitReview(event) {
    event.preventDefault();
    try {
      await api.createReview(negotiation.id, reviewForm);
      setReviewed(true); alert('Avaliação enviada. Obrigado por fortalecer a comunidade!');
    } catch (error) { alert(error.message); }
  }

  if (busy || !post) return <div className="loading-stage"><span className="material-symbols-outlined">recycling</span><p>Carregando anúncio...</p></div>;

  return <div className="detail-screen"><header className="topbar compact-topbar"><button className="back-btn" onClick={onBack} aria-label="Voltar"><span className="material-symbols-outlined">arrow_back_ios_new</span></button><h1>Anúncio</h1><button className="icon-btn" onClick={share} aria-label="Compartilhar"><span className="material-symbols-outlined">ios_share</span></button></header><main className="detail-page">
    <section className="detail-image"><img src={post.imageUrl} alt={post.title} /><span className={`status-tag status-${String(post.status || 'Disponível').toLowerCase().replace(/\s+/g, '-')}`}>{post.status || 'Disponível'}</span></section>
    <section className="detail-summary"><div className="detail-kicker"><span>{post.category}</span><span>{post.condition}</span></div><h1>{post.title}</h1><p>{post.description}</p><div className="detail-info"><span><i className="material-symbols-outlined">swap_horiz</i>{post.goal}</span><span><i className="material-symbols-outlined">location_on</i>{post.location}</span><span><i className="material-symbols-outlined">schedule</i>{new Date(post.createdAt).toLocaleDateString('pt-BR')}</span></div><div className="detail-actions"><button className={post.saved ? 'secondary-btn saved-btn' : 'secondary-btn'} onClick={save}><span className="material-symbols-outlined">{post.saved ? 'bookmark' : 'bookmark_border'}</span>{post.saved ? 'Salvo' : 'Salvar'}</button><button className="secondary-btn" onClick={share}><span className="material-symbols-outlined">share</span>Compartilhar</button>{!ownPost ? <button className="primary-btn" disabled={post.status !== 'Disponível'} onClick={startConversation}><span className="material-symbols-outlined">handshake</span>Tenho interesse</button> : null}</div></section>
    <section className="detail-owner"><div>{post.author.avatar ? <img src={post.author.avatar} alt={post.author.name} /> : <span className="avatar-placeholder material-symbols-outlined">person</span>}</div><div><span>Anunciante</span><h2>{post.author.name}</h2><p>{post.author.city} · {post.authorReputation ? `⭐ ${post.authorReputation.toFixed(1)} (${post.authorReviewCount})` : 'Novo na comunidade'}</p></div>{!ownPost ? <div className="owner-actions"><button className="text-btn" onClick={blockAuthor}>Bloquear</button><button className="text-btn" onClick={() => openReport('user', post.authorId)}>Denunciar</button></div> : null}</section>
    {ownPost ? <section className="owner-management"><div className="section-title"><div><span className="eyebrow">Gerenciar anúncio</span><h2>Negociação e status</h2></div><div><button className="text-btn" onClick={() => setEditing((value) => !value)}>Editar</button><button className="secondary-btn" onClick={loadInterested}>Interessados ({post.interestedCount || 0})</button><button className="text-btn danger-text" onClick={removeOwnedPost}>Excluir</button></div></div>{editing ? <form className="edit-post-form" onSubmit={saveEdit}><Field label="Título" icon="title" value={editForm.title || ''} onChange={(value) => setEditForm((current) => ({ ...current, title: value }))} /><Field label="Descrição" icon="description" multiline value={editForm.description || ''} onChange={(value) => setEditForm((current) => ({ ...current, description: value }))} /><Field label="Categoria" icon="category" value={editForm.category || ''} onChange={(value) => setEditForm((current) => ({ ...current, category: value }))} /><Field label="Localização aproximada" icon="location_on" value={editForm.location || ''} onChange={(value) => setEditForm((current) => ({ ...current, location: value }))} /><button className="primary-btn">Salvar edição</button></form> : null}<div className="status-controls"><button onClick={() => useAppStore.getState().updatePostStatus(post.id, 'Disponível').then(setPost).catch((error) => alert(error.message))}>Disponível</button><button onClick={() => useAppStore.getState().updatePostStatus(post.id, 'Encerrado').then(setPost).catch((error) => alert(error.message))}>Encerrar</button>{post.status === 'Reservado' ? <><button onClick={() => complete('Doado')}>Marcar doado</button><button onClick={() => complete('Trocado')}>Marcar trocado</button></> : null}</div>{interested.length ? <div className="interested-list">{interested.map((item) => <article key={item.id}><span className="avatar-placeholder material-symbols-outlined">person</span><div><strong>{item.user?.name || 'Usuário'}</strong><small>{item.user?.city} · {item.status}</small></div>{post.status === 'Disponível' || post.status === 'Reservado' ? <button className="secondary-btn" onClick={() => reserve(item.user.id)}>Reservar</button> : null}</article>)}</div> : null}</section> : null}
    {negotiation?.status === 'completed' && !reviewed ? <section className="review-form-card"><span className="eyebrow">Negociação concluída</span><h2>Como foi a experiência?</h2><form onSubmit={submitReview}><label>Nota<select value={reviewForm.rating} onChange={(event) => setReviewForm((current) => ({ ...current, rating: Number(event.target.value) }))}>{[5, 4, 3, 2, 1].map((rating) => <option key={rating} value={rating}>{'⭐'.repeat(rating)} ({rating})</option>)}</select></label><textarea value={reviewForm.comment} onChange={(event) => setReviewForm((current) => ({ ...current, comment: event.target.value }))} maxLength="500" placeholder="Comentário opcional" /><button className="primary-btn">Enviar avaliação</button></form></section> : null}
    <section className="detail-comments"><div className="section-title"><h2>Comentários ({post.comments || 0})</h2><button className="text-btn" onClick={() => openReport('post', post.id)}>Denunciar anúncio</button></div>{comments.length ? comments.map((comment) => <article className="detail-comment" key={comment.id}><span className="avatar-placeholder material-symbols-outlined">person</span><div><strong>{comment.name}</strong><p>{comment.text}</p></div><button className="text-btn" onClick={() => openReport('comment', comment.id)}>Denunciar</button></article>) : <EmptyState icon="chat_bubble" title="Ainda não há comentários" text="Seja a primeira pessoa a conversar sobre este item." /> }<form className="comment-form" onSubmit={submitComment}><input value={commentText} onChange={(event) => setCommentText(event.target.value)} maxLength="500" placeholder="Escreva um comentário..." /><button className="send-btn" aria-label="Enviar comentário"><span className="material-symbols-outlined">send</span></button></form></section>
    {reportOpen ? <form className="report-panel" onSubmit={submitReport}><h2>Denunciar anúncio</h2><select value={reportReason} onChange={(event) => setReportReason(event.target.value)}>{['Spam', 'Informação falsa', 'Conteúdo impróprio', 'Tentativa de golpe', 'Material proibido', 'Comportamento ofensivo', 'Outro'].map((reason) => <option key={reason}>{reason}</option>)}</select><textarea value={reportDetails} onChange={(event) => setReportDetails(event.target.value)} maxLength="1000" placeholder="Conte mais detalhes (opcional)" /><div><button type="button" className="secondary-btn" onClick={() => setReportOpen(false)}>Cancelar</button><button className="primary-btn">Enviar denúncia</button></div></form> : null}
  </main></div>;
}

function SavedItemsScreen({ onBack, onOpenPost }) {
  const favorites = useAppStore((state) => state.favorites);
  const loadFavorites = useAppStore((state) => state.loadFavorites);
  const toggleFavorite = useAppStore((state) => state.toggleFavorite);
  const [busy, setBusy] = useState(true);
  useEffect(() => { loadFavorites().catch((error) => alert(error.message)).finally(() => setBusy(false)); }, [loadFavorites]);
  if (busy) return <div className="loading-stage"><span className="material-symbols-outlined">bookmark</span></div>;
  return <div className="subpage"><header className="topbar compact-topbar"><button className="back-btn" onClick={onBack}><span className="material-symbols-outlined">arrow_back_ios_new</span></button><h1>Itens salvos</h1><span /></header><main className="page saved-page">{favorites.length ? <div className="saved-list">{favorites.map((post) => <article className="saved-item" key={post.id}><img src={post.imageUrl} alt={post.title} /><div><span>{post.status}</span><h2>{post.title}</h2><p>{post.location}</p><div><button className="text-btn" onClick={() => onOpenPost(post.id)}>Ver anúncio</button><button className="text-btn" onClick={() => toggleFavorite(post.id)}>Remover</button></div></div></article>)}</div> : <EmptyState icon="bookmark_border" title="Nenhum item salvo" text="Salve anúncios para encontrá-los rapidamente depois." action="Explorar anúncios" onAction={() => window.location.assign('/feed')} />}</main></div>;
}

function MyPostsScreen({ onBack, onOpenPost }) {
  const profile = useAppStore((state) => state.profile);
  const loadProfile = useAppStore((state) => state.loadProfile);
  const [tab, setTab] = useState('Ativos');
  useEffect(() => { loadProfile().catch((error) => alert(error.message)); }, [loadProfile]);
  const posts = profile?.posts || [];
  const visible = posts.filter((post) => tab === 'Ativos' ? post.status === 'Disponível' : tab === 'Reservados' ? post.status === 'Reservado' : ['Doado', 'Trocado', 'Encerrado'].includes(post.status));
  return <div className="subpage"><header className="topbar compact-topbar"><button className="back-btn" onClick={onBack}><span className="material-symbols-outlined">arrow_back_ios_new</span></button><h1>Meus anúncios</h1><span /></header><main className="page my-posts-page"><div className="segmented-tabs">{['Ativos', 'Reservados', 'Concluídos'].map((item) => <button className={tab === item ? 'active' : ''} key={item} onClick={() => setTab(item)}>{item}</button>)}</div>{visible.length ? <div className="saved-list">{visible.map((post) => <article className="saved-item" key={post.id}><img src={post.imageUrl} alt={post.title} /><div><span className={`status-tag status-${String(post.status).toLowerCase()}`}>{post.status}</span><h2>{post.title}</h2><p>{post.likes} curtidas · {post.comments} comentários · {post.views || 0} visualizações</p><button className="text-btn" onClick={() => onOpenPost(post.id)}>Gerenciar anúncio</button></div></article>)}</div> : <EmptyState icon="inventory_2" title="Você ainda não possui anúncios nesta seção" text="Publique um item e encontre quem pode dar a ele uma nova história." action="Criar publicação" onAction={() => window.location.assign('/nova-publicacao')} />}</main></div>;
}

function ProfileScreen({ onGoToFeed, onSettings, onSaved, onMyPosts, onAdmin }) {
  const data = useAppStore((state) => state.profile);
  const posts = useAppStore((state) => state.posts);
  const session = useAppStore((state) => state.session);
  const loadProfile = useAppStore((state) => state.loadProfile);
  const user = data?.user || session || { name: 'Seu perfil', city: 'Sua cidade', avatar: '' };
  const stats = data?.stats || { donations: 0, received: 0, rating: 0, carbonSavedPercent: 0 };
  const achievements = data?.achievements || user.achievements || [];
  const impact = data?.impact || { itemsReused: 0, divertedFromDisposal: 0, beneficiaries: 0, exchanges: 0, publications: 0, estimated: true };
  const reputation = data?.reputation || { rating: 0, count: 0 };
  const [communityImpact, setCommunityImpact] = useState(null);

  useEffect(() => {
    loadProfile().catch(() => {});
  }, [loadProfile]);

  useEffect(() => { api.communityImpact().then((result) => setCommunityImpact(result.impact)).catch(() => {}); }, []);

  return (
    <Shell nav={navRoutes} active="/perfil">
      <main className="page profile-page">
        <section className="profile-header">
          <div className="avatar-wrap">{user.avatar ? <img src={user.avatar} alt={user.name} /> : <span className="avatar-placeholder material-symbols-outlined" aria-label={`Perfil de ${user.name}`}>person</span>}<span className="verified material-symbols-outlined">verified</span></div>
          <h1>{user.name}</h1>
          <div className="subtle-row"><span className="material-symbols-outlined">location_on</span><span>{user.city}</span></div>
        </section>
        <section className="stats-row">
          <Stat value={stats.donations} label="Doações" tone="primary" />
          <Stat value={stats.received} label="Recebidos" tone="secondary" />
          <Stat value={stats.rating ? stats.rating.toFixed(1) : 'Nova'} label="Avaliação" tone="primary" star={Boolean(stats.rating)} />
        </section>
        <section className="impact-card">
          <div className="impact-head"><h2>Seu impacto no ReUsa+</h2><small>Indicadores estimados a partir de negociações concluídas.</small></div>
          <div className="impact-grid">
            <MiniImpact icon="recycling" value={impact.itemsReused} label="Itens reaproveitados" />
            <MiniImpact icon="eco" value={impact.divertedFromDisposal} label="Itens desviados do descarte" />
            <MiniImpact icon="diversity_3" value={impact.beneficiaries} label="Pessoas beneficiadas" />
            <MiniImpact icon="swap_horiz" value={impact.exchanges} label="Trocas realizadas" />
          </div>
        </section>
        {communityImpact ? <section className="community-impact-card"><span className="eyebrow">Impacto da comunidade ReUsa+</span><div><MiniImpact icon="recycling" value={communityImpact.itemsReused} label="Itens reaproveitados" /><MiniImpact icon="diversity_3" value={communityImpact.beneficiaries} label="Pessoas beneficiadas" /><MiniImpact icon="swap_horiz" value={communityImpact.exchanges} label="Trocas concluídas" /></div><small>Indicadores estimados a partir das negociações concluídas na plataforma.</small></section> : null}
        <section className="reputation-card"><div><span className="eyebrow">Reputação</span><h2>{reputation.rating ? `⭐ ${reputation.rating.toFixed(1)}` : 'Ainda sem avaliações'}</h2><p>{reputation.count} avaliações recebidas</p></div>{data?.reviews?.length ? <div className="review-preview">{data.reviews.slice(0, 2).map((review) => <p key={review.id}><strong>⭐ {review.rating} · {review.reviewerName}</strong>{review.comment ? ` — ${review.comment}` : ''}</p>)}</div> : null}</section>
        <section className="badge-row">
          {(achievements.length ? achievements : ['Novo membro']).map((achievement, index) => <Badge key={achievement} tone={['mint', 'coral', 'stone'][index % 3]} icon={achievement === 'Novo membro' ? 'person_add' : 'workspace_premium'} label={achievement} />)}
        </section>
        <section className="tabs">
          <button className="tab tab-active" onClick={onMyPosts}>Meus anúncios</button>
          <button className="tab" onClick={onSaved}>Itens salvos</button>
          <button className="tab" onClick={onSettings}>Config</button>
        </section>
        {user.role === 'admin' ? <button className="admin-entry" onClick={onAdmin}><span className="material-symbols-outlined">admin_panel_settings</span><span><strong>Central de Administração</strong><small>Gerencie usuários, conteúdos e denúncias</small></span><span className="material-symbols-outlined">arrow_forward</span></button> : null}
        <section className="profile-grid">
          {posts.filter((post) => post.authorId === user.id || post.author?.id === user.id).map((post) => (
            <div key={post.id} className="mini-post">
              <div className="mini-post-thumb"><img src={post.imageUrl} alt={post.title} /><span>{post.category}</span></div>
              <strong>{post.title}</strong>
              <p>Doado há 2 dias</p>
            </div>
          ))}
        </section>
      </main>
    </Shell>
  );
}

function MapScreen({ onSuggest }) {
  const collectionPoints = useAppStore((state) => state.collectionPoints);
  const session = useAppStore((state) => state.session);
  const loadCollectionPoints = useAppStore((state) => state.loadCollectionPoints);
  const loadCollectionPointsNearby = useAppStore((state) => state.loadCollectionPointsNearby);
  const [selectedPoint, setSelectedPoint] = useState(null);
  const [userLocation, setUserLocation] = useState(null);
  const [category, setCategory] = useState('Todos');
  const [search, setSearch] = useState('');
  const [mapCenter, setMapCenter] = useState([-2.4431, -54.7083]);
  const [searchBusy, setSearchBusy] = useState(false);

  const mapPoints = collectionPoints.map((point, index) => ({
    ...point,
    latitude: point.latitude || { 'point-1': -2.4431, 'point-2': -1.4558 }[point.id] || [-2.4431, -1.4558, -3.119, -2.53][index] || -2.4431,
    longitude: point.longitude || { 'point-1': -54.7083, 'point-2': -48.4902 }[point.id] || [-54.7083, -48.4902, -60.0217, -44.3][index] || -54.7083
  }));
  const visiblePoints = mapPoints.filter((point) => category === 'Todos' || point.categories?.some((item) => item.toLowerCase().includes(category.toLowerCase())));

  useEffect(() => {
    if (session?.city) {
      loadCollectionPointsNearby(session.city).then((result) => {
        if (result.center) setMapCenter(result.center);
      }).catch(() => {});
      return;
    }
    loadCollectionPoints().catch(() => {});
  }, [loadCollectionPoints, loadCollectionPointsNearby, session?.city]);

  useEffect(() => {
    if (!selectedPoint && visiblePoints[0]) setSelectedPoint(visiblePoints[0]);
    if (selectedPoint && !visiblePoints.some((point) => point.id === selectedPoint.id)) setSelectedPoint(visiblePoints[0] || null);
  }, [collectionPoints, category]);

  async function searchPlace(event) {
    event.preventDefault();
    if (!search.trim()) return;
    setSearchBusy(true);
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=br&q=${encodeURIComponent(search)}`, { headers: { Accept: 'application/json' } });
      const places = await response.json();
      if (!places.length) throw new Error('Local não encontrado');
      setMapCenter([Number(places[0].lat), Number(places[0].lon)]);
    } catch (error) {
      alert(error.message);
    } finally {
      setSearchBusy(false);
    }
  }

  function locate() {
    if (!navigator.geolocation) {
      alert('Seu navegador não oferece geolocalização.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => setUserLocation([position.coords.latitude, position.coords.longitude]),
      () => alert('Não foi possível acessar sua localização.')
    );
  }

  return (
    <Shell nav={navRoutes} active="/mapa">
      <main className="map-page">
        <MapContainer center={mapCenter} zoom={12} scrollWheelZoom className="live-map">
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapViewport position={mapCenter} />
          {visiblePoints.map((point) => <CircleMarker key={point.id} center={[point.latitude, point.longitude]} pathOptions={{ color: '#006d3d', fillColor: '#00d67d', fillOpacity: 0.9 }} radius={10} eventHandlers={{ click: () => setSelectedPoint(point) }} />)}
          {userLocation ? <><CircleMarker center={userLocation} pathOptions={{ color: '#2459d6', fillColor: '#77a0ff', fillOpacity: 0.9 }} radius={8} /><RecenterMap position={userLocation} /></> : null}
        </MapContainer>
        <form className="map-search" onSubmit={searchPlace}><span className="material-symbols-outlined">search</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar cidade ou endereço" /><button disabled={searchBusy} aria-label="Buscar local"><span className="material-symbols-outlined">arrow_forward</span></button></form>
        <div className="map-chips">
          {['Todos', 'Eletrônicos', 'Pilhas', 'Óleo', 'Cooperativas'].map((item) => <button key={item} className={category === item ? 'pill pill-active' : 'pill'} onClick={() => setCategory(item)}>{item}</button>)}
        </div>
        <button className="map-locate" onClick={locate} title="Usar minha localização"><span className="material-symbols-outlined">my_location</span></button>
        {selectedPoint ? <div className="map-card">
          <div className="map-card-head">
            <div>
              <span>Centro de coleta</span>
              <h2>{selectedPoint?.name || 'EcoCentro Santarém'}</h2>
            </div>
            <button className="icon-btn" onClick={() => setSelectedPoint(null)} aria-label="Fechar informações"><span className="material-symbols-outlined">close</span></button>
          </div>
          <div className="map-card-body">
            <div><span className="material-symbols-outlined">recycling</span><span>{(selectedPoint?.categories || ['Eletrônicos', 'plástico', 'metal']).join(', ')}</span></div>
            <div><span className="material-symbols-outlined">schedule</span><span>{selectedPoint?.hours || '08:00 – 17:00'}</span></div>
            <div><span className="material-symbols-outlined">location_on</span><span>{selectedPoint?.location || 'Localização não informada'}</span></div>
            <div><span className="material-symbols-outlined">verified</span><span>{selectedPoint?.origin || selectedPoint?.source || 'Origem não informada'}{selectedPoint?.lastUpdated ? ` · atualizado em ${new Date(selectedPoint.lastUpdated).toLocaleDateString('pt-BR')}` : ''}</span></div>
          </div>
          <div className="map-actions">
            <button className="ghost-btn" onClick={() => selectedPoint && alert(`${selectedPoint.name}\n${selectedPoint.location}`)}>Ver detalhes</button>
            <a className="primary-btn" href={selectedPoint ? `https://www.openstreetmap.org/directions?to=${selectedPoint.latitude}%2C${selectedPoint.longitude}` : '#'} target="_blank" rel="noreferrer">Como chegar <span className="material-symbols-outlined">navigation</span></a>
          </div>
        </div> : <div className="map-floating-actions"><button className="map-reopen" onClick={() => setSelectedPoint(visiblePoints[0] || null)}><span className="material-symbols-outlined">info</span>Mostrar ponto selecionado</button><button className="map-suggest" onClick={onSuggest}><span className="material-symbols-outlined">add_location_alt</span>Sugerir ponto</button></div>}
      </main>
    </Shell>
  );
}

function RecenterMap({ position }) {
  const map = useMap();
  useEffect(() => map.flyTo(position, 14), [map, position]);
  return null;
}

function SuggestCollectionPointScreen({ onBack }) {
  const [form, setForm] = useState({ name: '', location: '', hours: '', categories: '' });
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    try {
      await api.suggestCollectionPoint({ ...form, categories: form.categories.split(',').map((item) => item.trim()).filter(Boolean) });
      alert('Sugestão enviada. Ela ficará disponível após aprovação da equipe.');
      onBack();
    } catch (error) { alert(error.message); } finally { setBusy(false); }
  }
  return <div className="subpage"><header className="topbar compact-topbar"><button className="back-btn" onClick={onBack}><span className="material-symbols-outlined">arrow_back_ios_new</span></button><h1>Sugerir ponto</h1><span /></header><main className="page suggestion-page"><section className="composer-card"><span className="eyebrow">Mapa colaborativo</span><h2>Conhece um ponto de coleta?</h2><p>Envie as informações. A equipe ReUsa+ verifica antes de publicar no mapa.</p><form className="composer-form" onSubmit={submit}><Field label="Nome do local" icon="location_city" value={form.name} onChange={(value) => setForm((current) => ({ ...current, name: value }))} placeholder="Ex: Cooperativa do bairro" /><Field label="Endereço ou cidade" icon="location_on" value={form.location} onChange={(value) => setForm((current) => ({ ...current, location: value }))} placeholder="Ex: Bairro Centro, Santarém - PA" /><Field label="Materiais aceitos" icon="recycling" value={form.categories} onChange={(value) => setForm((current) => ({ ...current, categories: value }))} placeholder="Ex: papel, plástico, eletrônicos" /><Field label="Horário (opcional)" icon="schedule" value={form.hours} onChange={(value) => setForm((current) => ({ ...current, hours: value }))} placeholder="Ex: segunda a sexta, 8h às 17h" /><button className="primary-btn full" disabled={busy}>{busy ? 'Enviando...' : 'Enviar sugestão'}<span className="material-symbols-outlined">send</span></button></form></section></main></div>;
}

function MapViewport({ position }) {
  const map = useMap();
  useEffect(() => map.flyTo(position, 12), [map, position]);
  return null;
}

function SettingsScreen({ onBack, onLogout, onAbout }) {
  const profile = useAppStore((state) => state.profile);
  const updateProfile = useAppStore((state) => state.updateProfile);
  const logout = useAppStore((state) => state.logout);
  const [form, setForm] = useState({ name: profile?.user?.name || '', city: profile?.user?.city || '', cep: profile?.user?.cep || '', address: profile?.user?.address || '' });
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '' });
  const [preferences, setPreferences] = useState(profile?.user?.notificationPreferences || ['Curtidas', 'Comentários', 'Interesse', 'Mensagens', 'Negociações', 'Avaliações', 'Sistema']);

  useEffect(() => {
    if (profile?.user) setForm({ name: profile.user.name || '', city: profile.user.city || '', cep: profile.user.cep || '', address: profile.user.address || '' });
  }, [profile]);

  async function save(event) {
    event.preventDefault();
    await updateProfile(form);
    alert('Perfil atualizado.');
  }

  function signOut() {
    logout();
    onLogout();
  }

  async function changePassword(event) {
    event.preventDefault();
    try { await api.updatePassword(passwordForm); setPasswordForm({ currentPassword: '', newPassword: '' }); alert('Senha alterada com segurança.'); } catch (error) { alert(error.message); }
  }

  async function savePreferences() {
    try { await api.updatePreferences(preferences); alert('Preferências de notificações atualizadas.'); } catch (error) { alert(error.message); }
  }

  async function removeAccount() {
    const confirmation = window.prompt('Digite EXCLUIR para confirmar a exclusão da conta.');
    if (confirmation !== 'EXCLUIR') return;
    const password = window.prompt('Digite sua senha atual para confirmar.');
    if (!password) return;
    try { await api.deleteAccount({ confirmation, password }); logout(); onLogout(); } catch (error) { alert(error.message); }
  }

  return (
    <Shell nav={navRoutes} active="/configuracoes">
      <main className="page settings-page">
        <button className="back-link" onClick={onBack}>Voltar</button>
        <section className="card settings-card">
          <h2>Configurações</h2>
          <p>Atualize seus dados para manter sua comunidade por perto.</p>
          <form className="auth-form" onSubmit={save}>
            <Field label="Nome" icon="person" value={form.name} onChange={(value) => setForm((current) => ({ ...current, name: value }))} />
            <Field label="Cidade" icon="location_on" value={form.city} onChange={(value) => setForm((current) => ({ ...current, city: value }))} />
            <Field label="CEP" icon="markunread_mailbox" value={form.cep} onChange={(value) => setForm((current) => ({ ...current, cep: value }))} />
            <Field label="Endereço" icon="home" value={form.address} onChange={(value) => setForm((current) => ({ ...current, address: value }))} />
            <button className="primary-btn full">Salvar alterações</button>
          </form>
          <section className="settings-section"><h3>Privacidade e conta</h3><p>Seu endereço completo nunca é exibido publicamente. Os anúncios mostram apenas a localização aproximada.</p><form className="auth-form" onSubmit={changePassword}><Field label="Senha atual" icon="lock" type="password" value={passwordForm.currentPassword} onChange={(value) => setPasswordForm((current) => ({ ...current, currentPassword: value }))} /><Field label="Nova senha" icon="password" type="password" value={passwordForm.newPassword} onChange={(value) => setPasswordForm((current) => ({ ...current, newPassword: value }))} placeholder="Pelo menos 8 caracteres" /><button className="secondary-btn">Alterar senha</button></form></section>
          <section className="settings-section"><h3>Preferências de notificações</h3><div className="preference-list">{['Curtidas', 'Comentários', 'Interesse', 'Mensagens', 'Negociações', 'Avaliações', 'Sistema'].map((item) => <label key={item}><input type="checkbox" checked={preferences.includes(item)} onChange={() => setPreferences((current) => current.includes(item) ? current.filter((value) => value !== item) : [...current, item])} />{item}</label>)}</div><button className="secondary-btn" onClick={savePreferences}>Salvar preferências</button></section>
          <button className="secondary-btn full" onClick={onAbout}><span className="material-symbols-outlined">info</span>Sobre o ReUsa+</button>
          <button className="danger-btn" onClick={signOut}><span className="material-symbols-outlined">logout</span>Sair da conta</button>
          <button className="danger-btn" onClick={removeAccount}><span className="material-symbols-outlined">delete_forever</span>Excluir minha conta</button>
        </section>
      </main>
    </Shell>
  );
}

function AdminScreen({ onBack }) {
  const session = useAppStore((state) => state.session);
  const [tab, setTab] = useState('Visão geral');
  const [dashboard, setDashboard] = useState(null);
  const [users, setUsers] = useState([]);
  const [posts, setPosts] = useState([]);
  const [reports, setReports] = useState([]);
  const [points, setPoints] = useState({ points: [], suggestions: [] });
  const [busy, setBusy] = useState(true);

  const load = async () => {
    setBusy(true);
    try {
      const [dashboardResult, usersResult, postsResult, reportsResult, pointsResult] = await Promise.all([api.adminDashboard(), api.adminUsers(), api.adminPosts(), api.adminReports(), api.adminCollectionPoints()]);
      setDashboard(dashboardResult); setUsers(usersResult.users || []); setPosts(postsResult.posts || []); setReports(reportsResult.reports || []); setPoints(pointsResult);
    } catch (error) { alert(error.message); } finally { setBusy(false); }
  };
  useEffect(() => { if (session?.role === 'admin') load(); else setBusy(false); }, [session?.role]);
  if (session?.role !== 'admin') return <div className="access-denied"><span className="material-symbols-outlined">admin_panel_settings</span><h1>Acesso restrito</h1><p>Esta área é exclusiva para administradores.</p><button className="primary-btn" onClick={onBack}>Voltar ao perfil</button></div>;
  if (busy) return <div className="loading-stage"><span className="material-symbols-outlined">admin_panel_settings</span></div>;
  const totals = dashboard?.totals || {};
  return <div className="admin-screen"><header className="topbar compact-topbar"><button className="back-btn" onClick={onBack}><span className="material-symbols-outlined">arrow_back_ios_new</span></button><h1>Administração</h1><button className="icon-btn" onClick={load}><span className="material-symbols-outlined">refresh</span></button></header><main className="page admin-page"><section className="admin-hero"><span className="eyebrow">Central de Administração</span><h2>Comunidade segura e circular</h2><p>Acompanhe conteúdos, usuários e contribuições da comunidade.</p></section><div className="segmented-tabs admin-tabs">{['Visão geral', 'Usuários', 'Anúncios', 'Denúncias', 'Pontos'].map((item) => <button key={item} className={tab === item ? 'active' : ''} onClick={() => setTab(item)}>{item}</button>)}</div>{tab === 'Visão geral' ? <><section className="admin-metrics">{[['group', totals.totalUsers, 'Usuários'], ['bolt', totals.activeUsers, 'Ativos (30 dias)'], ['inventory_2', totals.totalPosts, 'Anúncios'], ['volunteer_activism', totals.donations, 'Doações'], ['swap_horiz', totals.exchanges, 'Trocas'], ['flag', totals.reports, 'Denúncias pendentes']].map(([icon, value, label]) => <article key={label}><span className="material-symbols-outlined">{icon}</span><strong>{value || 0}</strong><small>{label}</small></article>)}</section><section className="admin-section"><h2>Categorias mais publicadas</h2>{dashboard?.categories?.map((item) => <div className="admin-row" key={item.category}><span>{item.category}</span><strong>{item.count}</strong></div>)}</section></> : null}{tab === 'Usuários' ? <section className="admin-section">{users.map((user) => <article className="admin-row" key={user.id}><div><strong>{user.name}</strong><small>{user.email} · {user.city}</small></div><button className={user.suspended ? 'secondary-btn' : 'danger-btn'} onClick={async () => { await api.setUserSuspension(user.id, !user.suspended); load(); }}>{user.suspended ? 'Reativar' : 'Suspender'}</button></article>)}</section> : null}{tab === 'Anúncios' ? <section className="admin-section">{posts.map((post) => <article className="admin-row" key={post.id}><div><strong>{post.title}</strong><small>{post.author?.name} · {post.status}</small></div><button className="danger-btn" onClick={async () => { if (window.confirm('Remover este anúncio?')) { await api.removeAdminPost(post.id); load(); } }}>Remover</button></article>)}</section> : null}{tab === 'Denúncias' ? <section className="admin-section">{reports.length ? reports.map((report) => <article className="admin-row report-row" key={report.id}><div><strong>{report.reason} · {report.targetType}</strong><small>{report.reporterName} · {report.details || 'Sem detalhes'}</small></div><select value={report.status} onChange={async (event) => { await api.updateReport(report.id, event.target.value); load(); }}><option value="pending">Pendente</option><option value="reviewed">Em análise</option><option value="resolved">Resolvida</option><option value="dismissed">Descartada</option></select></article>) : <EmptyState icon="flag" title="Nenhuma denúncia" text="A central está em dia." />}</section> : null}{tab === 'Pontos' ? <section className="admin-section"><h2>Sugestões da comunidade</h2>{points.suggestions?.length ? points.suggestions.map((point) => <article className="admin-row" key={point.id}><div><strong>{point.name}</strong><small>{point.location} · {point.categories.join(', ')}</small></div>{point.status === 'pending' ? <div><button className="secondary-btn" onClick={async () => { await api.reviewPointSuggestion(point.id, 'rejected'); load(); }}>Recusar</button><button className="primary-btn" onClick={async () => { await api.reviewPointSuggestion(point.id, 'approved'); load(); }}>Aprovar</button></div> : <span>{point.status}</span>}</article>) : <EmptyState icon="add_location_alt" title="Nenhuma sugestão pendente" text="Novas sugestões aparecerão aqui." />}</section> : null}</main></div>;
}

function AboutScreen({ onBack }) {
  return <div className="about-screen"><header className="topbar compact-topbar"><button className="back-btn" onClick={onBack}><span className="material-symbols-outlined">arrow_back_ios_new</span></button><h1>Sobre o ReUsa+</h1><span /></header><main className="page about-page"><section className="about-hero"><span className="material-symbols-outlined">recycling</span><span className="eyebrow">Economia circular</span><h1>Objetos podem ganhar novas histórias.</h1><p>O ReUsa+ conecta pessoas que desejam desapegar, reutilizar e descartar de forma responsável.</p></section><section><h2>O que é o ReUsa+?</h2><p>Uma rede colaborativa para encontrar quem precisa de algo que você não utiliza mais, estimular a reutilização e aproximar a comunidade de pontos de coleta.</p></section><section><h2>Como funciona?</h2><ol><li>Publique algo que não utiliza mais.</li><li>Pessoas próximas demonstram interesse.</li><li>Combine a entrega pelo chat.</li><li>Finalize a doação ou troca.</li><li>O item ganha nova utilidade em vez de ser descartado.</li></ol></section><section><h2>Por que reutilizar?</h2><p>Reutilizar prolonga a vida útil dos itens, evita descarte desnecessário e fortalece uma economia mais circular e solidária.</p></section></main></div>;
}

function EmptyState({ icon = 'inbox', title, text, action, onAction }) {
  return <section className="empty-state"><span className="material-symbols-outlined">{icon}</span><h2>{title}</h2><p>{text}</p>{action ? <button className="primary-btn" onClick={onAction}>{action}</button> : null}</section>;
}

function Field({ label, icon, value, onChange, placeholder, type = 'text', multiline = false, maxLength, autoFocus = false }) {
  return (
    <label className="field">
      <span>{label}</span>
      <div className="field-control">
        <span className="material-symbols-outlined">{icon}</span>
        {multiline ? <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={4} maxLength={maxLength} autoFocus={autoFocus} /> : <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} maxLength={maxLength} autoFocus={autoFocus} />}
      </div>
    </label>
  );
}

function Stat({ value, label, tone, star }) {
  return (
    <div className={`stat stat-${tone}`}>
      {star ? <div className="stat-rating"><strong>{value}</strong><span className="material-symbols-outlined">star</span></div> : <strong>{value}</strong>}
      <span>{label}</span>
    </div>
  );
}

function MiniImpact({ icon, value, label }) {
  return <div className="mini-impact"><span className="material-symbols-outlined">{icon}</span><strong>{value}</strong><p>{label}</p></div>;
}

function Badge({ tone, icon, label }) {
  return <div className={`badge badge-${tone}`}><span className="material-symbols-outlined">{icon}</span><strong>{label}</strong></div>;
}

export default AppRoutes;
