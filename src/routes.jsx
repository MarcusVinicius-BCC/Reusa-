import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { api, clearToken, setToken } from './services/api';
import { useAppStore } from './state/store';
import { fallbackPosts } from './data/fallback-posts';
import { CircleMarker, MapContainer, TileLayer, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import feedLogo from './assets/reusa-logo.png';

const BRAZIL_TIME_ZONE = 'America/Sao_Paulo';
const validDate = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};
const formatBrazilTime = (value) => {
  const date = validDate(value);
  return date ? new Intl.DateTimeFormat('pt-BR', { timeZone: BRAZIL_TIME_ZONE, hour: '2-digit', minute: '2-digit' }).format(date) : '--:--';
};
const formatBrazilDate = (value) => {
  const date = validDate(value);
  return date ? new Intl.DateTimeFormat('pt-BR', { timeZone: BRAZIL_TIME_ZONE, day: '2-digit', month: '2-digit', year: 'numeric' }).format(date) : '--/--/----';
};

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
      return <LandingScreen onCreateAccount={() => navigate('/criar-conta')} onLogin={() => navigate('/login')} onExplore={() => navigate('/feed')} onAbout={() => navigate('/sobre')} />;
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
      return <SettingsScreen onBack={() => navigate('/perfil')} onLogout={() => navigate('/login')} />;
    default:
      return <Navigate to="/feed" replace />;
  }
}

function Shell({ children, nav, active, className = '' }) {
  return (
    <div className={`screen-frame ${className}`.trim()}>
      {children}
      <BottomNav nav={nav} active={active} />
    </div>
  );
}

function BottomNav({ nav, active }) {
  const notifications = useAppStore((state) => state.notifications);
  const unreadMessages = notifications.filter((item) => item.type === 'message' && !item.readAt).length;
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
            <span className="nav-icon-wrap"><span className="material-symbols-outlined">{icon}</span>{key === 'mensagens' && unreadMessages ? <b className="nav-badge">{unreadMessages}</b> : null}</span>
            <span>{label}</span>
          </a>
        );
      })}
    </nav>
  );
}

function UnifiedTopbar({ title, onBack, action, brandHref = '/feed' }) {
  return <header className="topbar unified-topbar">
    <a className="brand unified-brand" href={brandHref} aria-label="ReUsa+, início"><img src={feedLogo} alt="" /><span>ReUsa+</span></a>
    {title ? <h1>{title}</h1> : <span aria-hidden="true" />}
    <div className="unified-topbar-action">{action || (onBack ? <button className="back-btn" onClick={onBack} aria-label="Voltar"><span className="material-symbols-outlined">arrow_back</span></button> : <HeaderProfileButton />)}</div>
  </header>;
}

function HeaderProfileButton() {
  const session = useAppStore((state) => state.session);
  return <a className="avatar-btn header-profile-btn" href="/perfil" aria-label="Abrir perfil">{session?.avatar ? <img src={session.avatar} alt="" /> : <span className="material-symbols-outlined">person</span>}</a>;
}

function LandingScreen({ onCreateAccount, onLogin, onExplore, onAbout }) {
  const [featuredPosts, setFeaturedPosts] = useState([]);
  const [postsLoading, setPostsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    api.feed()
      .then((result) => {
        if (active) setFeaturedPosts((result.posts || []).filter((post) => post.status === 'Disponível').slice(0, 2));
      })
      .catch(() => { if (active) setFeaturedPosts([]); })
      .finally(() => { if (active) setPostsLoading(false); });
    return () => { active = false; };
  }, []);

  return (
    <main className="landing-screen">
      <header className="landing-header">
        <button className="landing-brand" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} aria-label="REUSA+, início"><img src={feedLogo} alt="REUSA+" /></button>
        <div className="landing-account-actions"><button className="landing-login" onClick={onLogin}>Fazer login</button><button className="landing-start" onClick={onCreateAccount}>Começar agora</button></div>
      </header>
      <section className="landing-hero" id="como-funciona">
        <div className="landing-copy"><img className="landing-hero-logo" src={feedLogo} alt="REUSA+" /><h1>Você desapega. Uma nova história começa.</h1><p>Na REUSA+, o que você não usa ganha um novo destino e novas possibilidades.</p></div>
        <div className="landing-flow" id="categorias" aria-label="Exemplo de um item ganhando novo ciclo">
          <article className="listing-card listing-card-one"><div className="listing-photo chair-photo"><span>Doação</span></div><div className="listing-content"><small><i />Disponível agora</small><h2>Cadeira Escandinava</h2><p>Madeira nobre · Pinheiros, SP</p><footer>Por Mariana R. <b>Grátis</b></footer></div></article>
          {postsLoading ? <div className="landing-listings-loading"><span className="material-symbols-outlined">progress_activity</span>Carregando anúncios...</div> : featuredPosts.length ? <div className="landing-listings">{featuredPosts.map((post, index) => <React.Fragment key={post.id}><article className={`listing-card ${index === 0 ? 'listing-card-one' : 'listing-card-two'}`}><div className="listing-photo"><img src={post.imageUrl} alt={post.title} /><span>{post.goal || 'Anúncio'}</span></div><div className="listing-content"><small><i />Disponível agora</small><h2>{post.title}</h2><p>{post.category} · {post.location}</p><footer>Por {post.author?.name || 'Membro da comunidade'} <b>{post.goal || 'Grátis'}</b></footer></div></article>{index === 0 && featuredPosts.length > 1 ? <div className="landing-cycle"><span className="material-symbols-outlined">sync</span></div> : null}</React.Fragment>)}</div> : <div className="landing-listings-empty"><span className="material-symbols-outlined">inventory_2</span><strong>A comunidade ainda não publicou anúncios.</strong><small>Seja a primeira pessoa a dar um novo ciclo a um item.</small></div>}
          <div className="landing-cycle landing-cycle-legacy"><span className="material-symbols-outlined">sync</span></div>
          <article className="listing-card listing-card-two"><div className="listing-photo plant-photo"><span>Recebido</span></div><div className="listing-content"><small><i />Novo lar encontrado</small><h2>Monstera com Cachepot</h2><p>Planta viva · Vila Mariana, SP</p><footer>Adotado por Lucas T. <b>Com carinho</b></footer></div></article>
          <div className="landing-steps"><div><span className="material-symbols-outlined">add_box</span><strong>Publique</strong><small>o que não usa</small></div><div><span className="material-symbols-outlined">forum</span><strong>Converse</strong><small>com interessados</small></div><div><span className="material-symbols-outlined">group</span><strong>Transforme</strong><small>o descarte</small></div></div>
          <div className="landing-conversion"><button onClick={onCreateAccount}>Criar minha conta <span className="material-symbols-outlined">arrow_forward</span></button><button onClick={onExplore}><span className="material-symbols-outlined">search</span>Explorar anúncios sem entrar</button></div>
        </div>
      </section>
      <footer className="landing-footer"><p>© 2025 REUSA+. Economia sustentável feita por pessoas.</p><div><a href="#termos">Termos de uso</a><a href="#privacidade">Política de privacidade</a><a href="#ajuda">Central de ajuda</a></div></footer>
    </main>
  );
}

function SplashScreen({ onCreateAccount, onLogin, onExplore, onAbout }) {
  return (
    <main className="welcome-screen">
      <div className="welcome-glow welcome-glow-one" />
      <div className="welcome-glow welcome-glow-two" />
      <header className="welcome-header">
        <div className="welcome-brand-logo" aria-label="ReUsa+">
          <img src={feedLogo} alt="REUSA+" />
        </div>
        <button className="welcome-about" onClick={onAbout}>Sobre</button>
      </header>

      <section className="welcome-hero">
        <span className="welcome-eyebrow"><span className="material-symbols-outlined">eco</span> Comunidade circular</span>
        <h1>O que você não usa pode ganhar um <em>novo começo.</em></h1>
        <p>Doe, troque e descubra objetos que ainda têm muito a oferecer — perto de você.</p>
      </section>

      <section className="welcome-showcase" aria-label="Como o ReUsa+ conecta pessoas">
        <div className="showcase-item showcase-item-top"><span className="material-symbols-outlined">chair</span><div><strong>Uma cadeira</strong><small>pronta para recomeçar</small></div></div>
        <div className="showcase-cycle"><span className="material-symbols-outlined">sync</span></div>
        <div className="showcase-item showcase-item-bottom"><span className="material-symbols-outlined">volunteer_activism</span><div><strong>Um novo lar</strong><small>na sua comunidade</small></div></div>
        <div className="showcase-leaf leaf-one">✦</div><div className="showcase-leaf leaf-two">✦</div>
      </section>

      <section className="welcome-steps" aria-label="Como funciona">
        <div><span className="material-symbols-outlined">add_box</span><p><strong>Publique</strong> o que não usa</p></div>
        <div><span className="material-symbols-outlined">forum</span><p><strong>Converse</strong> com interessados</p></div>
        <div><span className="material-symbols-outlined">handshake</span><p><strong>Transforme</strong> o descarte</p></div>
      </section>

      <section className="welcome-actions">
        <button className="primary-btn full welcome-main-action" onClick={onCreateAccount}>Criar minha conta <span className="material-symbols-outlined">arrow_forward</span></button>
        <button className="welcome-explore" onClick={onExplore}><span className="material-symbols-outlined">travel_explore</span> Explorar anúncios sem entrar</button>
        <p>Já faz parte da comunidade? <button className="text-btn" onClick={onLogin}>Fazer login</button></p>
      </section>

      <footer className="welcome-footer"><span className="material-symbols-outlined">verified_user</span> Seu endereço nunca é exibido publicamente.</footer>
    </main>
  );
}

function LoginScreen({ onGoToRegister, onSuccess }) {
  const login = useAppStore((state) => state.login);
  const [formState, setFormState] = useState({ email: '', password: '' });

  useEffect(() => {
    const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const token = fragment.get('reusa_token');
    const error = fragment.get('auth_error');
    if (!token && !error) return;

    window.history.replaceState({}, '', `${window.location.pathname}${window.location.search}`);
    if (error) {
      const messages = {
        google_not_configured: 'O login com Google ainda não foi configurado.',
        google_cancelled: 'O login com Google foi cancelado.',
        account_suspended: 'Esta conta está suspensa.',
        google_login_failed: 'Não foi possível entrar com o Google. Tente novamente.'
      };
      alert(messages[error] || 'Não foi possível concluir o login com Google.');
      return;
    }

    setToken(token);
    api.me()
      .then(({ user }) => {
        useAppStore.setState({ session: user });
        onSuccess();
      })
      .catch(() => {
        clearToken();
        alert('Não foi possível concluir o login com Google. Tente novamente.');
      });
  }, [onSuccess]);

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
    <div className="auth-layout login-layout">
      <UnifiedTopbar brandHref="/splash" action={<a className="avatar-btn" href="/login" aria-label="Área de login"><span className="material-symbols-outlined">person</span></a>} />
      <div className="login-orb login-orb-one" /><div className="login-orb login-orb-two" />
      <div className="auth-card login-card">
        <div className="auth-logo"><img src={feedLogo} alt="REUSA+" /></div>
        <h2>Bem-vindo de volta!</h2>
        <p>Pronto para causar impacto hoje?</p>
        <form onSubmit={submit} className="auth-form">
          <Field label="E-mail" icon="mail" value={formState.email} onChange={(value) => setFormState((prev) => ({ ...prev, email: value }))} placeholder="seu@email.com" />
          <Field label="Senha" icon="lock" type="password" value={formState.password} onChange={(value) => setFormState((prev) => ({ ...prev, password: value }))} placeholder="••••••••" />
          <button type="submit" className="primary-btn full">Entrar <span className="material-symbols-outlined">arrow_forward</span></button>
        </form>
        <GoogleSignInButton iconOnly />
        <div className="auth-footer">Não tem uma conta? <button className="text-btn" onClick={onGoToRegister}>Cadastre-se</button></div>
      </div>
    </div>
  );
}

function RegisterScreen({ onGoToLogin, onSuccess }) {
  const register = useAppStore((state) => state.register);
  const [formState, setFormState] = useState({ name: '', email: '', password: '', cep: '', address: '', city: '', neighborhood: '', accountType: 'person', businessName: '', cnpj: '', interests: [] });
  const [cepBusy, setCepBusy] = useState(false);
  const [cnpjBusy, setCnpjBusy] = useState(false);
  const [cnpjNotice, setCnpjNotice] = useState('');

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
    <div className="auth-layout register-layout">
      <UnifiedTopbar brandHref="/splash" action={<a className="avatar-btn" href="/login" aria-label="Entrar"><span className="material-symbols-outlined">person</span></a>} />
      <div className="register-orb register-orb-one" /><div className="register-orb register-orb-two" />
      <div className="auth-card large register-card">
        <header className="register-header">
          <div className="register-brand" aria-label="ReUsa+"><img src={feedLogo} alt="ReUsa+" /></div>
          <h2>Faça o descarte<br /><em>virar recomeço.</em></h2>
          <p>Uma comunidade local para doar, trocar e reutilizar com propósito.</p>
        </header>
        <form onSubmit={submit} className="auth-form register-form">
          <Field label="Nome completo" icon="person" value={formState.name} onChange={(value) => setFormState((prev) => ({ ...prev, name: value }))} placeholder="Como devemos chamar você?" />
          <Field label="E-mail" icon="mail" value={formState.email} onChange={(value) => setFormState((prev) => ({ ...prev, email: value }))} placeholder="seu@email.com.br" />
          <Field label="Senha" icon="lock" type="password" value={formState.password} onChange={(value) => setFormState((prev) => ({ ...prev, password: value }))} placeholder="Mínimo 8 caracteres" />
          <Field label="CEP" icon="markunread_mailbox" value={formState.cep} onChange={lookupCep} placeholder="00000-000" />
          {formState.address ? <div className="address-preview"><span className="material-symbols-outlined">location_on</span><span>{formState.address} · {formState.city}</span>{cepBusy ? <span>Consultando...</span> : null}</div> : null}
          <Field label="Cidade" icon="location_on" value={formState.city} onChange={(value) => setFormState((prev) => ({ ...prev, city: value }))} placeholder="Ex: São Paulo, SP" />
          <Field label="Bairro público" icon="location_city" value={formState.neighborhood} onChange={(value) => setFormState((prev) => ({ ...prev, neighborhood: value }))} placeholder="Ex: Vila Madalena" />
          <div className="chip-box"><label>Tipo de conta</label><div className="chip-row"><button type="button" className={formState.accountType === 'person' ? 'chip chip-active' : 'chip'} onClick={() => setFormState((prev) => ({ ...prev, accountType: 'person' }))}>Pessoa</button><button type="button" className={formState.accountType === 'business' ? 'chip chip-active' : 'chip'} onClick={() => setFormState((prev) => ({ ...prev, accountType: 'business' }))}>Empresa</button></div></div>
          {formState.accountType === 'business' ? <><Field label="Razão social" icon="business" value={formState.businessName} onChange={(value) => setFormState((prev) => ({ ...prev, businessName: value }))} placeholder="Nome da empresa" /><Field label={cnpjBusy ? 'Consultando CNPJ...' : 'CNPJ'} icon="badge" value={formState.cnpj} onChange={lookupCnpj} placeholder="00.000.000/0001-00" />{cnpjNotice ? <div className="cnpj-lookup"><span className="material-symbols-outlined">{cnpjNotice.startsWith('Dados') ? 'verified' : 'info'}</span>{cnpjNotice}</div> : null}</> : null}
          <button type="submit" className="primary-btn full register-submit">Criar minha conta <span className="material-symbols-outlined">arrow_forward</span></button>
        </form>
        <div className="register-footer"><span>ou entre em segundos</span><GoogleSignInButton iconOnly /><p>Já faz parte? <button className="text-btn" onClick={onGoToLogin}>Fazer login</button></p></div>
      </div>
    </div>
  );
}

function GoogleSignInButton({ label = 'Continuar com Google', iconOnly = false }) {
  const [busy, setBusy] = useState(false);

  function start() {
    setBusy(true);
    window.location.assign('/api/auth/google?return_to=/login');
  }

  return <div className={iconOnly ? 'google-auth google-auth-icon-only' : 'google-auth'}>{iconOnly ? null : <span>ou</span>}<button type="button" className={iconOnly ? 'google-auth-btn google-auth-icon' : 'google-auth-btn'} onClick={start} disabled={busy} aria-label={busy ? 'Abrindo Google' : label} title={label}><b aria-hidden="true">G</b>{iconOnly ? null : busy ? 'Abrindo Google...' : label}</button></div>;
}

function FeedScreen({ onNavigate }) {
  const posts = useAppStore((state) => state.posts);
  const search = useAppStore((state) => state.search);
  const setSearch = useAppStore((state) => state.setSearch);
  const loadFeed = useAppStore((state) => state.loadFeed);
  const loadNotifications = useAppStore((state) => state.loadNotifications);
  const session = useAppStore((state) => state.session);
  const [category, setCategory] = useState('Todos');
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [headerHidden, setHeaderHidden] = useState(false);
  const filteredPosts = useMemo(() => {
    const query = search.trim().toLowerCase();
    return posts.filter((post) => {
      const matchesCategory = category === 'Todos' || post.category.toLowerCase() === category.toLowerCase();
      const matchesSearch = !query || [post.title, post.description, post.category, post.author?.name].some((value) => String(value || '').toLowerCase().includes(query));
      return matchesCategory && matchesSearch;
    });
  }, [posts, search, category]);

  useEffect(() => {
    loadFeed().catch(() => {});
    loadNotifications().catch(() => {});
    const timer = window.setInterval(() => loadNotifications().catch(() => {}), 15000);
    return () => window.clearInterval(timer);
  }, [loadFeed, loadNotifications]);

  useEffect(() => {
    let previousScroll = window.scrollY;
    const onScroll = () => {
      const currentScroll = window.scrollY;
      const scrollingDown = currentScroll > previousScroll;
      setHeaderHidden(scrollingDown && currentScroll > 80 && !searchOpen);
      previousScroll = currentScroll;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [searchOpen]);

  function toggleCategories() {
    setHeaderHidden(false);
    setCategoriesOpen((open) => !open);
  }

  return (
    <Shell nav={navRoutes} active="/feed" className="feed-shell">
      <header className={headerHidden ? 'topbar feed-topbar feed-topbar-hidden' : 'topbar feed-topbar'}>
        <div className="brand"><img className="feed-logo" src={feedLogo} alt="ReUsa+" /><span>ReUsa+</span></div>
        {searchOpen ? <label className="searchbar feed-search-expanded"><span className="material-symbols-outlined">search</span><input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(event) => { if (event.key === 'Escape') setSearchOpen(false); }} placeholder="Buscar anúncios" autoFocus /><button type="button" className={categoriesOpen ? 'category-trigger category-trigger-active' : 'category-trigger'} onClick={toggleCategories} aria-expanded={categoriesOpen} aria-label="Escolher categoria"><span className="material-symbols-outlined">category</span></button><button type="button" className="feed-search-close" onClick={() => setSearchOpen(false)} aria-label="Fechar busca"><span className="material-symbols-outlined">close</span></button></label> : <div className="feed-search-tools"><button type="button" className="icon-btn feed-search-trigger" onClick={() => setSearchOpen(true)} aria-label="Abrir busca"><span className="material-symbols-outlined">search</span></button><button type="button" className={categoriesOpen ? 'category-trigger category-trigger-active' : 'category-trigger'} onClick={toggleCategories} aria-expanded={categoriesOpen} aria-label="Escolher categoria"><span className="material-symbols-outlined">category</span></button></div>}
        <div className="topbar-actions"><button className="avatar-btn header-profile-btn" onClick={() => onNavigate('/perfil')} aria-label="Abrir perfil">{session?.avatar ? <img src={session.avatar} alt="" /> : <span className="material-symbols-outlined">person</span>}</button></div>
      </header>
      <div className="feed-category-popover">{categoriesOpen ? <CategoryBar selected={category} onChange={(value) => { setCategory(value); setCategoriesOpen(false); }} /> : null}</div>
      <main className="feed-page">
        <div className="feed-list">
          {filteredPosts.length ? filteredPosts.map((post) => <FeedCard key={post.id} post={post} onOpenChat={async () => { try { const thread = await useAppStore.getState().createThread(post.id); onNavigate(`/mensagens/ana?thread=${thread.id}`); } catch (error) { alert(error.message); } }} />) : <div className="empty-state"><span className="material-symbols-outlined">search_off</span><h2>Nada encontrado</h2><p>Tente outra busca ou categoria.</p></div>}
        </div>
      </main>
    </Shell>
  );
}

function NotificationsScreen({ onBack, onNavigate }) {
  const [notifications, setNotifications] = useState([]);
  const loadNotifications = useAppStore((state) => state.loadNotifications);
  useEffect(() => { loadNotifications().then((items) => setNotifications(items)).catch(() => {}); }, [loadNotifications]);
  const iconFor = (type) => ({ message: 'chat', comment: 'chat_bubble', like: 'favorite', interest: 'handshake', negotiation: 'swap_horiz', review: 'star', system: 'notifications' }[type] || 'notifications');
  async function openNotification(notification) {
    try { await api.readNotification(notification.id); setNotifications((items) => items.map((item) => item.id === notification.id ? { ...item, readAt: new Date().toISOString() } : item)); await loadNotifications(); } catch {}
    onNavigate(notification.link || '/feed');
  }
  return <Shell nav={navRoutes} active="/notificacoes"><header className="topbar compact-topbar"><button className="back-btn" onClick={onBack}><span className="material-symbols-outlined">arrow_back_ios_new</span></button><h1>Notificações</h1></header><main className="page padded-top"><div className="notification-list">{notifications.length ? notifications.map((notification) => <button className={notification.readAt ? 'notification-item' : 'notification-item notification-unread'} key={notification.id} onClick={() => openNotification(notification)}><span className="notification-icon material-symbols-outlined">{iconFor(notification.type)}</span><span><strong>{notification.title}</strong><p>{notification.text}</p><small>{formatBrazilDate(notification.createdAt)} às {formatBrazilTime(notification.createdAt)}</small></span></button>) : <EmptyState icon="notifications_none" title="Nenhuma notificação nova" text="Quando algo acontecer na sua comunidade, avisaremos por aqui." />}</div></main></Shell>;
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
      <UnifiedTopbar title="Inspirações" onBack={() => onNavigate('/feed')} action={<button className="icon-btn" onClick={() => onNavigate('/ana-ia')} aria-label="Abrir Ana IA"><span className="material-symbols-outlined">auto_awesome</span></button>} />
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
  return <section className="category-panel feed-category-panel" aria-label="Categorias de anúncios">{items.map((item) => <button key={item} onClick={() => onChange(item)} className={selected === item ? 'pill pill-active' : 'pill'}>{item}</button>)}</section>;
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
  const [heartAnimationKey, setHeartAnimationKey] = useState(0);
  const [saveAnimationKey, setSaveAnimationKey] = useState(0);

  async function like() {
    try {
      const result = await toggleLike(post.id);
      setLiked(result.liked);
      setLikes(result.likes);
      if (result.liked) setHeartAnimationKey((current) => current + 1);
    } catch (error) {
      alert(error.message);
    }
  }

  async function lookupCnpj(value) {
    const cnpj = value.replace(/\D/g, '').slice(0, 14);
    setFormState((prev) => ({ ...prev, cnpj }));
    setCnpjNotice('');
    if (cnpj.length !== 14) return;
    setCnpjBusy(true);
    try {
      const { business } = await api.businessByCnpj(cnpj);
      setFormState((prev) => ({
        ...prev,
        cnpj,
        businessName: business.legalName || business.tradeName || prev.businessName,
        cep: business.cep || prev.cep,
        address: business.address || prev.address,
        neighborhood: business.neighborhood || prev.neighborhood,
        city: business.city || prev.city
      }));
      setCnpjNotice(business.status ? `Dados preenchidos · ${business.status}` : 'Dados da empresa preenchidos.');
    } catch (error) {
      setCnpjNotice(error.message === 'CNPJ not found' ? 'CNPJ não encontrado. Preencha os dados manualmente.' : 'Não foi possível consultar agora. Você pode preencher manualmente.');
    } finally {
      setCnpjBusy(false);
    }
  }

  async function favorite() {
    try {
      const result = await toggleFavorite(post.id);
      setSaved(result.saved);
      if (result.saved) setSaveAnimationKey((current) => current + 1);
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
        <button className={saved ? 'icon-btn saved-btn' : 'icon-btn'} onClick={favorite} aria-label={saved ? 'Remover dos salvos' : 'Salvar anúncio'}><span key={saveAnimationKey} className={saved ? 'material-symbols-outlined save-icon saved-bookmark' : 'material-symbols-outlined save-icon'}>{saved ? 'bookmark' : 'bookmark_border'}</span></button>
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
      </div>
      <div className="tag-row feed-post-tags"><span>{post.category}</span><span>{post.condition}</span><span className={`status-tag status-${String(post.status || 'Disponível').toLowerCase().replace(/\s+/g, '-')}`}>{post.status || 'Disponível'}</span></div>
      <div className="post-actions">
        <div className="post-stats"><button className={liked ? 'ghost-inline liked' : 'ghost-inline'} onClick={like}><span key={heartAnimationKey} className={liked ? 'material-symbols-outlined like-icon liked-heart' : 'material-symbols-outlined like-icon'}>{liked ? 'favorite' : 'favorite_border'}</span>{likes}</button><button className="ghost-inline" onClick={toggleComments}><span className="material-symbols-outlined">chat_bubble</span>{commentCount}</button></div>
        {post.authorId !== session?.id ? <button className="primary-btn compact" onClick={onOpenChat}><span className="material-symbols-outlined">handshake</span>{post.goal === 'Troca' ? 'Fazer oferta' : 'Tenho interesse'}</button> : <span className="post-owner-label">Seu anúncio</span>}
      </div>
      {commentsOpen ? <section className="comments-panel"><div className="comments-list">{comments.length ? comments.map((comment) => <div className="comment" key={comment.id}><img src={comment.avatar} alt="" /><div><strong>{comment.name}</strong><p>{comment.text}</p></div></div>) : commentCount === 0 ? <p className="comments-empty">Ainda não há comentários. Seja o primeiro.</p> : null}</div><form className="comment-form" onSubmit={addComment}><input value={commentText} maxLength="500" onChange={(event) => setCommentText(event.target.value)} placeholder="Escreva um comentário..." /><button className="send-btn" disabled={commentBusy} aria-label="Publicar comentário"><span className="material-symbols-outlined">send</span></button></form></section> : null}
    </article>
  );
}

function MessagesScreen({ onOpenThread }) {
  const threads = useAppStore((state) => state.threads);
  const loadThreads = useAppStore((state) => state.loadThreads);
  const [search, setSearch] = useState('');

  useEffect(() => {
    loadThreads().catch(() => {});
    const timer = window.setInterval(() => loadThreads().catch(() => {}), 3000);
    return () => window.clearInterval(timer);
  }, [loadThreads]);

  const visibleThreads = threads.filter((thread) => `${thread.title} ${thread.subtitle}`.toLowerCase().includes(search.toLowerCase()));
  return (
    <Shell nav={navRoutes} active="/mensagens">
      <UnifiedTopbar />
      <main className="page messages-page">
        <section className="messages-intro"><span className="eyebrow">Sua caixa de entrada</span></section>
        <label className="search-shell messages-search"><span className="material-symbols-outlined">search</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Pesquisar por pessoa ou mensagem..." /></label>
        <div className="thread-list">
          {(visibleThreads.length ? visibleThreads : threads.length ? [] : [{ title: 'Ana Costa', subtitle: 'Olá! Tenho interesse nesse aparelho...', time: '14:20', unreadCount: 2 }]).map((thread) => (
            <button key={thread.id || thread.title} className="thread-card" onClick={() => onOpenThread(thread.id)}>
              <div className="thread-avatar" aria-label={`Perfil de ${thread.title || 'usuário'}`}>{thread.avatar ? <img src={thread.avatar} alt="" /> : <span className="material-symbols-outlined">person</span>}</div>
              <div className="thread-content">
                <div><strong>{thread.title}</strong><span>{formatBrazilTime(thread.time)}</span></div>
                <p>{thread.subtitle}</p>
              </div>
              <div className="thread-card-end">{thread.unreadCount ? <div className="unread">{thread.unreadCount}</div> : null}<span className="material-symbols-outlined thread-chevron">chevron_right</span></div>
            </button>
          ))}
          {threads.length && !visibleThreads.length ? <div className="messages-empty"><span className="material-symbols-outlined">search_off</span><strong>Nenhuma conversa encontrada</strong><small>Tente buscar por outro nome ou mensagem.</small></div> : null}
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
  const readThreadNotifications = useAppStore((state) => state.readThreadNotifications);
  const session = useAppStore((state) => state.session);
  const threadId = new URLSearchParams(window.location.search).get('thread') || 'thread-ana-notebook';

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const result = await api.thread(threadId);
        if (active) {
          setThread(result.thread);
          setMessages(result.messages || []);
          readThreadNotifications(threadId).catch(() => {});
        }
      } catch {}
    };
    refresh();
    const timer = window.setInterval(refresh, 2000);
    return () => { active = false; window.clearInterval(timer); };
  }, [threadId, readThreadNotifications]);

  async function send() {
    if (!text.trim()) return;
    if (!session) {
      alert('Entre na sua conta para enviar mensagens.');
      return;
    }
    const messageText = text.trim();
    try {
      await sendMessage(threadId, { text: messageText });
      const result = await api.thread(threadId);
      setMessages(result.messages || []);
      setThread(result.thread);
      await readThreadNotifications(threadId);
      setText('');
    } catch (error) {
      alert(error.message);
    }
  }

  return (
    <div className="chat-screen">
      <header className="topbar compact-topbar chat-topbar"><button className="back-btn" onClick={onBack} aria-label="Voltar para mensagens"><span className="material-symbols-outlined">arrow_back_ios_new</span></button><h1>Conversa Direta</h1></header>
      <div className="chat-banner">{thread?.avatar ? <img className="chat-person-avatar" src={thread.avatar} alt="" /> : <span className="chat-person-avatar material-symbols-outlined" aria-label={`Perfil de ${thread?.title || 'Ana Costa'}`}>person</span>}<div><strong>{thread?.title || 'Ana Costa'}</strong><span>Negocie com segurança e combine a retirada</span></div></div>
      <main className="chat-body">{messages.map((message) => { const mine = message.sender_id === session?.id; return <div key={message.id} className={mine ? 'bubble mine' : 'bubble'}><p>{message.text}</p><span>{formatBrazilTime(message.sent_at)}</span></div>; })}</main>
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
    ['plastico', 'recycling', 'Plástico'],
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
    if (!image) {
      alert('Adicione uma foto do item para publicar o anúncio.');
      return;
    }
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
      <UnifiedTopbar />
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
    <section className="detail-summary"><div className="detail-kicker"><span>{post.category}</span><span>{post.condition}</span></div><h1>{post.title}</h1><p>{post.description}</p><div className="detail-info"><span><i className="material-symbols-outlined">swap_horiz</i>{post.goal}</span><span><i className="material-symbols-outlined">location_on</i>{post.location}</span><span><i className="material-symbols-outlined">schedule</i>{formatBrazilDate(post.createdAt)} às {formatBrazilTime(post.createdAt)}</span></div><div className="detail-actions"><button className={post.saved ? 'secondary-btn saved-btn' : 'secondary-btn'} onClick={save} title={post.saved ? 'Remover dos salvos' : 'Salvar anúncio'} aria-label={post.saved ? 'Remover dos salvos' : 'Salvar anúncio'}><span className="material-symbols-outlined">{post.saved ? 'bookmark' : 'bookmark_border'}</span>{post.saved ? 'Salvo' : 'Salvar'}</button><button className="secondary-btn" onClick={share} title="Compartilhar anúncio" aria-label="Compartilhar anúncio"><span className="material-symbols-outlined">share</span>Compartilhar</button>{!ownPost ? <button className="primary-btn" disabled={post.status !== 'Disponível'} onClick={startConversation}><span className="material-symbols-outlined">handshake</span>Tenho interesse</button> : null}</div></section>
    <section className="detail-owner"><div>{post.author.avatar ? <img src={post.author.avatar} alt={post.author.name} /> : <span className="avatar-placeholder material-symbols-outlined">person</span>}</div><div><span>Anunciante</span><h2>{post.author.name}</h2><p>{post.author.city} · {post.authorReputation ? `⭐ ${post.authorReputation.toFixed(1)} (${post.authorReviewCount})` : 'Novo na comunidade'}</p></div>{!ownPost ? <div className="owner-actions"><button className="text-btn" onClick={blockAuthor} title="Bloquear anunciante" aria-label="Bloquear anunciante">Bloquear</button><button className="text-btn" onClick={() => openReport('user', post.authorId)} title="Denunciar anunciante" aria-label="Denunciar anunciante">Denunciar</button></div> : null}</section>
    {ownPost ? <section className="owner-management"><div className="section-title"><div><span className="eyebrow">Gerenciar anúncio</span><h2>Negociação e status</h2></div><div><button className="text-btn" onClick={() => setEditing((value) => !value)}>Editar</button><button className="secondary-btn" onClick={loadInterested}>Interessados ({post.interestedCount || 0})</button><button className="text-btn danger-text" onClick={removeOwnedPost}>Excluir</button></div></div>{editing ? <form className="edit-post-form" onSubmit={saveEdit}><Field label="Título" icon="title" value={editForm.title || ''} onChange={(value) => setEditForm((current) => ({ ...current, title: value }))} /><Field label="Descrição" icon="description" multiline value={editForm.description || ''} onChange={(value) => setEditForm((current) => ({ ...current, description: value }))} /><Field label="Categoria" icon="category" value={editForm.category || ''} onChange={(value) => setEditForm((current) => ({ ...current, category: value }))} /><Field label="Localização aproximada" icon="location_on" value={editForm.location || ''} onChange={(value) => setEditForm((current) => ({ ...current, location: value }))} /><button className="primary-btn">Salvar edição</button></form> : null}<div className="status-controls"><button onClick={() => useAppStore.getState().updatePostStatus(post.id, 'Disponível').then(setPost).catch((error) => alert(error.message))}>Disponível</button><button onClick={() => useAppStore.getState().updatePostStatus(post.id, 'Encerrado').then(setPost).catch((error) => alert(error.message))}>Encerrar</button>{post.status === 'Reservado' ? <><button onClick={() => complete('Doado')}>Marcar doado</button><button onClick={() => complete('Trocado')}>Marcar trocado</button></> : null}</div>{interested.length ? <div className="interested-list">{interested.map((item) => <article key={item.id}><span className="avatar-placeholder material-symbols-outlined">person</span><div><strong>{item.user?.name || 'Usuário'}</strong><small>{item.user?.city} · {item.status}</small></div>{post.status === 'Disponível' || post.status === 'Reservado' ? <button className="secondary-btn" onClick={() => reserve(item.user.id)}>Reservar</button> : null}</article>)}</div> : null}</section> : null}
    {negotiation?.status === 'completed' && !reviewed ? <section className="review-form-card"><span className="eyebrow">Negociação concluída</span><h2>Como foi a experiência?</h2><form onSubmit={submitReview}><label>Nota<select value={reviewForm.rating} onChange={(event) => setReviewForm((current) => ({ ...current, rating: Number(event.target.value) }))}>{[5, 4, 3, 2, 1].map((rating) => <option key={rating} value={rating}>{'⭐'.repeat(rating)} ({rating})</option>)}</select></label><textarea value={reviewForm.comment} onChange={(event) => setReviewForm((current) => ({ ...current, comment: event.target.value }))} maxLength="500" placeholder="Comentário opcional" /><button className="primary-btn">Enviar avaliação</button></form></section> : null}
    <section className="detail-comments"><div className="section-title"><h2>Comentários ({post.comments || 0})</h2></div>{comments.length ? comments.map((comment) => <article className="detail-comment" key={comment.id}><span className="avatar-placeholder material-symbols-outlined">person</span><div><strong>{comment.name}</strong><p>{comment.text}</p></div><button className="text-btn" onClick={() => openReport('comment', comment.id)}>Denunciar</button></article>) : <EmptyState icon="chat_bubble" title="Ainda não há comentários" text="Seja a primeira pessoa a conversar sobre este item." /> }<form className="comment-form" onSubmit={submitComment}><input value={commentText} onChange={(event) => setCommentText(event.target.value)} maxLength="500" placeholder="Escreva um comentário..." /><button className="send-btn" aria-label="Enviar comentário"><span className="material-symbols-outlined">send</span></button></form></section>
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
  const updateAvatar = useAppStore((state) => state.updateAvatar);
  const avatarInput = useRef(null);
  const [avatarBusy, setAvatarBusy] = useState(false);

  useEffect(() => {
    loadProfile().catch(() => {});
  }, [loadProfile]);

  useEffect(() => { api.communityImpact().then((result) => setCommunityImpact(result.impact)).catch(() => {}); }, []);

  async function changeAvatar(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setAvatarBusy(true);
    try {
      await updateAvatar(file);
    } catch (error) {
      alert(error.message);
    } finally {
      setAvatarBusy(false);
    }
  }

  return (
    <Shell nav={navRoutes} active="/perfil">
      <UnifiedTopbar />
      <main className="page profile-page">
        <section className="profile-hero">
          <button className="avatar-wrap avatar-upload-button" type="button" onClick={() => avatarInput.current?.click()} aria-label="Alterar foto de perfil" title="Alterar foto de perfil" disabled={avatarBusy}>{user.avatar ? <img src={user.avatar} alt={user.name} /> : <span className="avatar-placeholder material-symbols-outlined" aria-label={`Perfil de ${user.name}`}>person</span>}<span className="avatar-upload-icon material-symbols-outlined">{avatarBusy ? 'progress_activity' : 'photo_camera'}</span><span className="verified material-symbols-outlined">verified</span></button>
          <input ref={avatarInput} className="visually-hidden" type="file" accept="image/jpeg,image/png,image/gif,image/webp,image/avif" onChange={changeAvatar} />
          <div className="profile-identity"><div className="profile-name-row"><h1>{user.accountType === 'business' && user.businessName ? user.businessName : user.name}</h1>{user.accountType === 'business' ? <span className="eyebrow">Empresa parceira</span> : null}</div><div className="subtle-row"><span className="material-symbols-outlined">location_on</span><span>{[user.neighborhood, user.city].filter(Boolean).join(' · ')}</span></div></div>
          <div className="profile-quick-actions"><button className="profile-icon-action" onClick={onSettings} aria-label="Configurações" title="Configurações"><span className="material-symbols-outlined">settings</span></button>{user.role === 'admin' ? <button className="profile-icon-action" onClick={onAdmin} aria-label="Administração" title="Administração"><span className="material-symbols-outlined">admin_panel_settings</span></button> : null}</div>
        </section>
        <section className="stats-row">
          <Stat value={stats.donations} label="Doações" icon="volunteer_activism" tone="primary" />
          <Stat value={stats.received} label="Recebidos" icon="redeem" tone="secondary" />
          <Stat value={stats.rating ? stats.rating.toFixed(1) : '—'} label="Avaliação" icon="star" tone="primary" />
        </section>
        <section className="impact-card">
          <div className="impact-head"><span className="eyebrow">Impacto pessoal</span><h2>Seu impacto no ReUsa+</h2></div>
          <div className="impact-grid">
            <MiniImpact icon="recycling" value={impact.itemsReused} label="Itens reaproveitados" layout="inline" />
            <MiniImpact icon="eco" value={impact.divertedFromDisposal} label="Itens desviados do descarte" layout="inline" />
            <MiniImpact icon="diversity_3" value={impact.beneficiaries} label="Pessoas beneficiadas" layout="inline" />
            <MiniImpact icon="swap_horiz" value={impact.exchanges} label="Trocas realizadas" layout="inline" />
          </div>
        </section>
        {communityImpact ? <section className="community-impact-card"><span className="eyebrow">Comunidade ReUsa+</span><div><MiniImpact icon="recycling" value={communityImpact.itemsReused} label="Reaproveitados" layout="centered" /><MiniImpact icon="diversity_3" value={communityImpact.beneficiaries} label="Beneficiados" layout="centered" /><MiniImpact icon="swap_horiz" value={communityImpact.exchanges} label="Trocas" layout="centered" /></div></section> : null}
        <section className="reputation-card"><div><span className="eyebrow">Reputação</span><h2>{reputation.rating ? `⭐ ${reputation.rating.toFixed(1)}` : 'Sem avaliações'}</h2><p>{reputation.count} avaliações</p></div>{data?.reviews?.length ? <div className="review-preview">{data.reviews.slice(0, 2).map((review) => <p key={review.id}><strong>⭐ {review.rating} · {review.reviewerName}</strong>{review.comment ? ` — ${review.comment}` : ''}</p>)}</div> : null}</section>
        {achievements.length ? <section className="badge-row">{achievements.map((achievement, index) => <Badge key={achievement} tone={['mint', 'coral', 'stone'][index % 3]} icon="workspace_premium" label={achievement} />)}</section> : null}
        <section className="profile-toolbar"><h2>Meus anúncios</h2><div><button className="profile-icon-action active" onClick={onMyPosts} aria-label="Meus anúncios" title="Meus anúncios"><span className="material-symbols-outlined">grid_view</span></button><button className="profile-icon-action" onClick={onSaved} aria-label="Itens salvos" title="Itens salvos"><span className="material-symbols-outlined">bookmark</span></button></div></section>
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
      <UnifiedTopbar />
      <main className="map-page">
        <MapContainer center={mapCenter} zoom={12} scrollWheelZoom className="live-map">
          <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
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

function SuggestCollectionPointScreen({ onBack }) {
  const [form, setForm] = useState({ name: '', street: '', number: '', neighborhood: '', city: '', state: '', postalCode: '', hours: '', categories: '' });
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
  return <div className="subpage"><header className="topbar compact-topbar"><button className="back-btn" onClick={onBack}><span className="material-symbols-outlined">arrow_back_ios_new</span></button><h1>Sugerir ponto</h1><span /></header><main className="page suggestion-page"><section className="composer-card"><span className="eyebrow">Mapa colaborativo</span><h2>Conhece um ponto de coleta?</h2><p>Informe um endereço público. Buscamos as coordenadas automaticamente e a equipe verifica antes de publicar.</p><form className="composer-form" onSubmit={submit}><Field label="Nome do local" icon="location_city" value={form.name} onChange={(value) => setForm((current) => ({ ...current, name: value }))} placeholder="Ex: Cooperativa do bairro" /><div className="point-address-grid"><Field label="Rua" icon="signpost" value={form.street} onChange={(value) => setForm((current) => ({ ...current, street: value }))} placeholder="Ex: Rua dos Tapajós" /><Field label="Número" icon="pin" value={form.number} onChange={(value) => setForm((current) => ({ ...current, number: value }))} placeholder="Ex: 150" /><Field label="Bairro" icon="location_city" value={form.neighborhood} onChange={(value) => setForm((current) => ({ ...current, neighborhood: value }))} placeholder="Ex: Centro" /><Field label="Cidade" icon="location_on" value={form.city} onChange={(value) => setForm((current) => ({ ...current, city: value }))} placeholder="Ex: Santarém" /><Field label="Estado" icon="map" value={form.state} onChange={(value) => setForm((current) => ({ ...current, state: value }))} placeholder="Ex: PA" /><Field label="CEP (opcional)" icon="markunread_mailbox" value={form.postalCode} onChange={(value) => setForm((current) => ({ ...current, postalCode: value }))} placeholder="00000-000" /></div><Field label="Materiais aceitos" icon="recycling" value={form.categories} onChange={(value) => setForm((current) => ({ ...current, categories: value }))} placeholder="Ex: papel, plástico, eletrônicos" /><Field label="Horário (opcional)" icon="schedule" value={form.hours} onChange={(value) => setForm((current) => ({ ...current, hours: value }))} placeholder="Ex: segunda a sexta, 8h às 17h" /><button className="primary-btn full" disabled={busy}>{busy ? 'Buscando localização...' : 'Enviar sugestão'}<span className="material-symbols-outlined">send</span></button></form></section></main></div>;
}

function RecenterMap({ position }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo(position, 14);
  }, [map, position]);
  return null;
}

function MapViewport({ position }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo(position, 12);
  }, [map, position]);
  return null;
}

function SettingsScreen({ onBack, onLogout }) {
  const profile = useAppStore((state) => state.profile);
  const updateProfile = useAppStore((state) => state.updateProfile);
  const logout = useAppStore((state) => state.logout);
  const [activeSection, setActiveSection] = useState('perfil');
  const [form, setForm] = useState({ name: profile?.user?.name || '', city: profile?.user?.city || '', neighborhood: profile?.user?.neighborhood || '', cep: profile?.user?.cep || '', address: profile?.user?.address || '', businessName: profile?.user?.businessName || '' });
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '' });
  const [preferences, setPreferences] = useState(profile?.user?.notificationPreferences || ['Curtidas', 'Comentários', 'Interesse', 'Mensagens', 'Negociações', 'Avaliações', 'Sistema']);

  useEffect(() => {
    if (profile?.user) setForm({ name: profile.user.name || '', city: profile.user.city || '', neighborhood: profile.user.neighborhood || '', cep: profile.user.cep || '', address: profile.user.address || '', businessName: profile.user.businessName || '' });
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
      <UnifiedTopbar onBack={onBack} />
      <main className="page settings-page">
        <header className="settings-heading">
          <button className="back-link settings-back" onClick={onBack} aria-label="Voltar ao perfil"><span className="material-symbols-outlined">arrow_back</span></button>
          <h1>Configurações</h1>
        </header>
        <div className="settings-layout">
          <aside className="settings-menu" aria-label="Seções de configurações">
            <button className={`settings-menu-item ${activeSection === 'perfil' ? 'active' : ''}`} onClick={() => setActiveSection('perfil')}><span className="material-symbols-outlined">person</span><span><strong>Meu perfil</strong></span></button>
            <button className={`settings-menu-item ${activeSection === 'seguranca' ? 'active' : ''}`} onClick={() => setActiveSection('seguranca')}><span className="material-symbols-outlined">shield</span><span><strong>Segurança</strong></span></button>
            <button className={`settings-menu-item ${activeSection === 'notificacoes' ? 'active' : ''}`} onClick={() => setActiveSection('notificacoes')}><span className="material-symbols-outlined">notifications</span><span><strong>Notificações</strong></span></button>
          </aside>
          <div className="settings-content">
            {activeSection === 'perfil' ? <section className="settings-profile-banner">
              <div className="settings-avatar"><span className="material-symbols-outlined">person</span></div>
              <div><span className="settings-kicker">Perfil ReUsa+</span><h2>{profile?.user?.name || 'Seu perfil'}</h2><p>{profile?.user?.email || 'Atualize seus dados para manter sua comunidade por perto.'}</p></div>
              <span className="settings-status"><span className="material-symbols-outlined">verified</span>Conta ativa</span>
            </section> : null}
            {activeSection === 'perfil' ? <section className="card settings-card settings-panel" id="perfil">
              <div className="settings-panel-heading"><div><span className="settings-panel-icon"><span className="material-symbols-outlined">person</span></span><div><h2>Informações do perfil</h2></div></div></div>
              <form className="settings-form" onSubmit={save}>
                <div className="settings-form-grid">
                  <Field label="Nome" icon="person" value={form.name} onChange={(value) => setForm((current) => ({ ...current, name: value }))} />
                  <Field label="Cidade" icon="location_on" value={form.city} onChange={(value) => setForm((current) => ({ ...current, city: value }))} />
                  <Field label="Bairro público" icon="location_city" value={form.neighborhood} onChange={(value) => setForm((current) => ({ ...current, neighborhood: value }))} />
                  <Field label="CEP" icon="markunread_mailbox" value={form.cep} onChange={(value) => setForm((current) => ({ ...current, cep: value }))} />
                  <div className="settings-field-wide"><Field label="Endereço" icon="home" value={form.address} onChange={(value) => setForm((current) => ({ ...current, address: value }))} /></div>
                  {profile?.user?.accountType === 'business' ? <div className="settings-field-wide"><Field label="Razão social" icon="business" value={form.businessName} onChange={(value) => setForm((current) => ({ ...current, businessName: value }))} /></div> : null}
                </div>
                <div className="settings-form-footer"><small><span className="material-symbols-outlined">lock</span>Seu endereço completo nunca é exibido publicamente.</small><button className="secondary-btn">Salvar alterações</button></div>
              </form>
            </section> : null}
            {activeSection === 'seguranca' ? <section className="card settings-card settings-panel" id="seguranca">
              <div className="settings-panel-heading"><div><span className="settings-panel-icon security"><span className="material-symbols-outlined">shield</span></span><div><h2>Segurança e privacidade</h2></div></div></div>
              <div className="privacy-note"><span className="material-symbols-outlined">visibility_off</span><span><strong>Privacidade por padrão</strong><small>Seus anúncios mostram apenas a localização aproximada.</small></span></div>
              <form className="settings-form" onSubmit={changePassword}><div className="settings-form-grid"><Field label="Senha atual" icon="lock" type="password" value={passwordForm.currentPassword} onChange={(value) => setPasswordForm((current) => ({ ...current, currentPassword: value }))} /><Field label="Nova senha" icon="password" type="password" value={passwordForm.newPassword} onChange={(value) => setPasswordForm((current) => ({ ...current, newPassword: value }))} placeholder="Pelo menos 8 caracteres" /></div><div className="settings-form-footer"><span /><button className="secondary-btn">Alterar senha</button></div></form>
            </section> : null}
            {activeSection === 'notificacoes' ? <section className="card settings-card settings-panel" id="notificacoes">
              <div className="settings-panel-heading"><div><span className="settings-panel-icon notifications"><span className="material-symbols-outlined">notifications</span></span><div><h2>Preferências de notificações</h2></div></div></div>
              <div className="preference-list">{['Curtidas', 'Comentários', 'Interesse', 'Mensagens', 'Negociações', 'Avaliações', 'Sistema'].map((item) => <label className="preference-row" key={item}><span><strong>{item}</strong><small>Atualizações sobre {item.toLowerCase()}</small></span><input type="checkbox" checked={preferences.includes(item)} onChange={() => setPreferences((current) => current.includes(item) ? current.filter((value) => value !== item) : [...current, item])} /><i /></label>)}</div>
              <div className="settings-form-footer"><span /><button className="secondary-btn" onClick={savePreferences}>Salvar preferências</button></div>
            </section> : null}
            <section className="settings-actions"><button className="danger-btn" onClick={signOut}><span className="material-symbols-outlined">logout</span>Sair da conta</button><button className="danger-btn" onClick={removeAccount}><span className="material-symbols-outlined">delete_forever</span>Excluir minha conta</button></section>
          </div>
        </div>
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
  async function createCollectionPoint() {
    const name = window.prompt('Nome do ponto de coleta:');
    if (!name) return;
    const street = window.prompt('Rua (opcional):') || '';
    const number = window.prompt('Número (opcional):') || '';
    const neighborhood = window.prompt('Bairro (opcional):') || '';
    const city = window.prompt('Cidade:');
    if (!city) return;
    const state = window.prompt('Estado / UF (opcional):') || '';
    const postalCode = window.prompt('CEP (opcional):') || '';
    const categories = window.prompt('Materiais aceitos, separados por vírgula:', 'Eletrônicos, Plástico') || '';
    const hours = window.prompt('Horário de funcionamento:', '08:00 - 17:00') || '';
    try { await api.createAdminCollectionPoint({ name, street, number, neighborhood, city, state, postalCode, categories: categories.split(',').map((item) => item.trim()).filter(Boolean), hours }); await load(); } catch (error) { alert(error.message); }
  }
  async function editCollectionPoint(point) {
    const name = window.prompt('Nome do ponto de coleta:', point.name);
    if (!name) return;
    const street = window.prompt('Rua (opcional):') || '';
    const number = window.prompt('Número (opcional):') || '';
    const neighborhood = window.prompt('Bairro (opcional):') || '';
    const city = window.prompt('Cidade:', point.location);
    if (!city) return;
    const state = window.prompt('Estado / UF (opcional):') || '';
    const postalCode = window.prompt('CEP (opcional):') || '';
    const categories = window.prompt('Materiais aceitos, separados por vírgula:', point.categories.join(', ')) || '';
    const hours = window.prompt('Horário de funcionamento:', point.hours) || '';
    try { await api.updateAdminCollectionPoint(point.id, { name, street, number, neighborhood, city, state, postalCode, categories: categories.split(',').map((item) => item.trim()).filter(Boolean), hours }); await load(); } catch (error) { alert(error.message); }
  }
  async function removeCollectionPoint(point) {
    if (!window.confirm(`Excluir o ponto "${point.name}"?`)) return;
    try { await api.removeAdminCollectionPoint(point.id); await load(); } catch (error) { alert(error.message); }
  }
  return <div className="admin-screen"><header className="topbar compact-topbar"><button className="back-btn" onClick={onBack}><span className="material-symbols-outlined">arrow_back_ios_new</span></button><h1>Administração</h1><button className="icon-btn" onClick={load}><span className="material-symbols-outlined">refresh</span></button></header><main className="page admin-page"><section className="admin-hero"><span className="eyebrow">Central de Administração</span><h2>Comunidade segura e circular</h2><p>Acompanhe conteúdos, usuários e contribuições da comunidade.</p></section><div className="segmented-tabs admin-tabs">{['Visão geral', 'Usuários', 'Anúncios', 'Denúncias', 'Pontos'].map((item) => <button key={item} className={tab === item ? 'active' : ''} onClick={() => setTab(item)}>{item}</button>)}</div>{tab === 'Visão geral' ? <><section className="admin-metrics">{[['group', totals.totalUsers, 'Usuários'], ['bolt', totals.activeUsers, 'Ativos (30 dias)'], ['inventory_2', totals.totalPosts, 'Anúncios'], ['volunteer_activism', totals.donations, 'Doações'], ['swap_horiz', totals.exchanges, 'Trocas'], ['flag', totals.reports, 'Denúncias pendentes']].map(([icon, value, label]) => <article key={label}><span className="material-symbols-outlined">{icon}</span><strong>{value || 0}</strong><small>{label}</small></article>)}</section><section className="admin-section"><h2>Categorias mais publicadas</h2>{dashboard?.categories?.map((item) => <div className="admin-row" key={item.category}><span>{item.category}</span><strong>{item.count}</strong></div>)}</section></> : null}{tab === 'Usuários' ? <section className="admin-section">{users.map((user) => <article className="admin-row" key={user.id}><div><strong>{user.name}</strong><small>{user.email} · {user.city}</small></div><button className={user.suspended ? 'secondary-btn' : 'danger-btn'} onClick={async () => { await api.setUserSuspension(user.id, !user.suspended); load(); }}>{user.suspended ? 'Reativar' : 'Suspender'}</button></article>)}</section> : null}{tab === 'Anúncios' ? <section className="admin-section">{posts.map((post) => <article className="admin-row" key={post.id}><div><strong>{post.title}</strong><small>{post.author?.name} · {post.status}</small></div><button className="danger-btn" onClick={async () => { if (window.confirm('Remover este anúncio?')) { await api.removeAdminPost(post.id); load(); } }}>Remover</button></article>)}</section> : null}{tab === 'Denúncias' ? <section className="admin-section">{reports.length ? reports.map((report) => <article className="admin-row report-row" key={report.id}><div><strong>{report.reason} · {report.targetType}</strong><small>{report.reporterName} · {report.details || 'Sem detalhes'}</small></div><select value={report.status} onChange={async (event) => { await api.updateReport(report.id, event.target.value); load(); }}><option value="pending">Pendente</option><option value="reviewed">Em análise</option><option value="resolved">Resolvida</option><option value="dismissed">Descartada</option></select></article>) : <EmptyState icon="flag" title="Nenhuma denúncia" text="A central está em dia." />}</section> : null}{tab === 'Pontos' ? <section className="admin-section"><div className="admin-section-heading"><h2>Pontos cadastrados</h2><button className="primary-btn compact" onClick={createCollectionPoint}><span className="material-symbols-outlined">add_location_alt</span>Novo ponto</button></div>{points.points?.length ? points.points.map((point) => <article className="admin-row" key={point.id}><div><strong>{point.name}</strong><small>{point.location} · {point.categories.join(', ')}</small></div><div><button className="secondary-btn" onClick={() => editCollectionPoint(point)}>Editar</button><button className="danger-btn" onClick={() => removeCollectionPoint(point)}>Excluir</button></div></article>) : <EmptyState icon="location_off" title="Nenhum ponto cadastrado" text="Cadastre o primeiro ponto verificado." />}<h2>Sugestões da comunidade</h2>{points.suggestions?.length ? points.suggestions.map((point) => <article className="admin-row" key={point.id}><div><strong>{point.name}</strong><small>{point.location} · {point.categories.join(', ')}</small></div>{point.status === 'pending' ? <div><button className="secondary-btn" onClick={async () => { await api.reviewPointSuggestion(point.id, 'rejected'); load(); }}>Recusar</button><button className="primary-btn" onClick={async () => { await api.reviewPointSuggestion(point.id, 'approved'); load(); }}>Aprovar</button></div> : <span>{point.status}</span>}</article>) : <EmptyState icon="add_location_alt" title="Nenhuma sugestão pendente" text="Novas sugestões aparecerão aqui." />}</section> : null}</main></div>;
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

function Stat({ value, label, tone, icon }) {
  return (
    <div className={`stat stat-${tone}`}>
      <span className="stat-icon material-symbols-outlined">{icon}</span><strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function MiniImpact({ icon, value, label, layout = 'default' }) {
  return <div className={`mini-impact mini-impact-${layout}`}><div className="mini-impact-value"><span className="material-symbols-outlined">{icon}</span><strong>{value}</strong></div><p>{label}</p></div>;
}

function Badge({ tone, icon, label }) {
  return <div className={`badge badge-${tone}`}><span className="material-symbols-outlined">{icon}</span><strong>{label}</strong></div>;
}

export default AppRoutes;
