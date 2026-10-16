import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { api, clearToken, setToken } from './services/api';
import { useAppStore } from './state/store';
import { fallbackPosts } from './data/fallback-posts';
import { CircleMarker, MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import { divIcon } from 'leaflet';
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
const formatRelativeTime = (value, now = Date.now()) => {
  const timestamp = validDate(value)?.getTime();
  if (!timestamp) return 'Data desconhecida';
  const seconds = Math.max(0, Math.floor((now - timestamp) / 1000));
  if (seconds < 60) return 'Há alguns segundos';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `Há ${minutes} minuto${minutes === 1 ? '' : 's'}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Há ${hours} hora${hours === 1 ? '' : 's'}`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `Há ${days} dia${days === 1 ? '' : 's'}`;
  const months = Math.floor(days / 30);
  if (months < 12) return `Há ${months} mês${months === 1 ? '' : 'es'}`;
  const years = Math.floor(months / 12);
  return `Há ${years} ano${years === 1 ? '' : 's'}`;
};
const formatMoneyInput = (value) => {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  return (Number(digits) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};
function showBrowserNotification(notification) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  const browserNotification = new Notification(notification.title, {
    body: notification.text,
    tag: notification.id,
    icon: feedLogo
  });
  browserNotification.onclick = () => {
    window.focus();
    if (notification.link) window.location.assign(notification.link);
    browserNotification.close();
  };
}

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

const collectionPointMarkerIcon = (selected = false) => divIcon({
  className: selected ? 'collection-point-marker is-selected' : 'collection-point-marker',
  html: '<span class="collection-point-marker-symbol material-symbols-outlined" aria-hidden="true">recycling</span>',
  iconSize: [20, 20],
  iconAnchor: [10, 10],
  tooltipAnchor: [0, -14]
});

function formatRouteDistance(distance) {
  const meters = Number(distance);
  if (!Number.isFinite(meters)) return '';
  return meters >= 1000 ? `${(meters / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km` : `${Math.round(meters)} m`;
}

function formatRouteDuration(duration) {
  const minutes = Math.max(1, Math.round(Number(duration) / 60));
  if (!Number.isFinite(minutes)) return '';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes ? `${hours} h ${remainingMinutes} min` : `${hours} h`;
}

function finiteCoordinate(value) {
  if (value === null || value === undefined || (typeof value === 'string' && !value.trim())) return null;
  const coordinate = Number(value);
  return Number.isFinite(coordinate) ? coordinate : null;
}

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
      return <LandingScreen onCreateAccount={() => navigate('/criar-conta')} onLogin={() => navigate('/login')} onAbout={() => navigate('/sobre')} />;
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
      return <MessagesScreen onOpenThread={(threadId) => threadId && navigate(`/mensagens/ana?thread=${threadId}`)} />;
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
            className={`nav-item${isAdd ? ' nav-add' : ''}${isActive ? ' nav-active' : ''}`}
            aria-current={isActive ? 'page' : undefined}
            aria-label={label}
          >
            <span className={`nav-icon-wrap${isAdd ? ' nav-add-icon' : ''}`}><span className="material-symbols-outlined">{icon}</span>{key === 'mensagens' && unreadMessages ? <b className="nav-badge">{unreadMessages}</b> : null}</span>
            <span className={isAdd ? 'nav-add-label' : undefined}>{label}</span>
          </a>
        );
      })}
    </nav>
  );
}

function UnifiedTopbar({ onBack, action, brandHref = '/feed' }) {
  return <header className="topbar unified-topbar">
    <div className="unified-topbar-leading">
      {onBack ? <button className="back-btn" onClick={onBack} aria-label="Voltar"><span className="material-symbols-outlined">arrow_back</span></button> : null}
      <a className="brand unified-brand" href={brandHref} aria-label="ReUsa+, início"><img src={feedLogo} alt="ReUsa+" /><span>ReUsa+</span></a>
    </div>
    <div className="unified-topbar-action">{action || <HeaderProfileButton />}</div>
  </header>;
}

function HeaderProfileButton() {
  const session = useAppStore((state) => state.session);
  return <a className="avatar-btn header-profile-btn" href="/perfil" aria-label="Abrir perfil">{session?.avatar ? <img src={session.avatar} alt="" /> : <span className="material-symbols-outlined">person</span>}</a>;
}

function LandingScreen({ onCreateAccount, onLogin, onAbout }) {
  const [featuredPosts, setFeaturedPosts] = useState([]);
  const [postsLoading, setPostsLoading] = useState(true);

  async function loadFeaturedPosts(showLoading = true) {
    if (showLoading) setPostsLoading(true);
    try {
      const result = await api.feed();
      setFeaturedPosts((result.posts || []).filter((post) => post.status === 'Disponível').slice(0, 2));
    } catch (error) {
      console.error('Não foi possível atualizar os anúncios da splash', error);
    } finally {
      setPostsLoading(false);
    }
  }

  useEffect(() => {
    loadFeaturedPosts(false);
  }, []);

  return (
    <main className="landing-screen">
      <header className="landing-header">
        <button className="landing-brand" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} aria-label="REUSA+, início"><img src={feedLogo} alt="REUSA+" /></button>
        <div className="landing-account-actions"><button className="landing-login" onClick={onLogin}>Fazer login</button><button className="landing-start" onClick={onCreateAccount}>Começar agora</button></div>
      </header>
      <section className="landing-hero" id="como-funciona">
        <div className="landing-copy"><img className="landing-hero-logo" src={feedLogo} alt="REUSA+" /><h1>Dê novos caminhos <span>ao que ainda tem valor.</span></h1><p>Na REUSA+, o que você não usa ganha um novo destino e novas possibilidades.</p></div>
        <div className="landing-flow" id="categorias" aria-label="Exemplo de um item ganhando novo ciclo">
          <article className="listing-card listing-card-one"><div className="listing-photo chair-photo"><span>Doação</span></div><div className="listing-content"><small><i />Disponível agora</small><h2>Cadeira Escandinava</h2><p>Madeira nobre · Pinheiros, SP</p><footer>Por Mariana R. <b>Grátis</b></footer></div></article>
          {postsLoading ? <div className="landing-listings-loading"><span className="material-symbols-outlined">progress_activity</span>Carregando anúncios...</div> : featuredPosts.length ? <div className="landing-listings">{featuredPosts.map((post, index) => <React.Fragment key={post.id}><article className={`listing-card ${index === 0 ? 'listing-card-one' : 'listing-card-two'}`}><div className="listing-photo"><img src={post.imageUrl} alt={post.title} /><span>{post.goal || 'Anúncio'}</span></div><div className="listing-content"><small><i />Disponível agora</small><h2>{post.title}</h2><p>{post.category} · {post.location}</p><footer>Por {post.author?.name || 'Membro da comunidade'} <b>{post.goal || 'Grátis'}</b></footer></div></article>{index === 0 && featuredPosts.length > 1 ? <button type="button" className="landing-cycle" onClick={() => loadFeaturedPosts()} disabled={postsLoading} aria-label="Atualizar anúncios exibidos"><span className="material-symbols-outlined">sync</span></button> : null}</React.Fragment>)}</div> : <div className="landing-listings-empty"><span className="material-symbols-outlined">inventory_2</span><strong>A comunidade ainda não publicou anúncios.</strong><small>Seja a primeira pessoa a dar um novo ciclo a um item.</small></div>}
          <button type="button" className="landing-cycle landing-cycle-legacy" onClick={() => loadFeaturedPosts()} disabled={postsLoading} aria-label="Atualizar anúncios exibidos"><span className="material-symbols-outlined">sync</span></button>
          <article className="listing-card listing-card-two"><div className="listing-photo plant-photo"><span>Recebido</span></div><div className="listing-content"><small><i />Novo lar encontrado</small><h2>Monstera com Cachepot</h2><p>Planta viva · Vila Mariana, SP</p><footer>Adotado por Lucas T. <b>Com carinho</b></footer></div></article>
          <div className="landing-steps"><div><span className="material-symbols-outlined">add_box</span><strong>Publique</strong><small>o que não usa</small></div><div><span className="material-symbols-outlined">forum</span><strong>Converse</strong><small>com interessados</small></div><div><span className="material-symbols-outlined">group</span><strong>Transforme</strong><small>o descarte</small></div></div>
          <div className="landing-conversion"><button onClick={onCreateAccount}>Criar minha conta</button></div>
        </div>
      </section>
      <footer className="landing-footer"><p>© 2026 REUSA+. Economia sustentável feita por pessoas.</p><div><span>Termos de uso</span><span>Política de privacidade</span><span>Central de ajuda</span></div></footer>
    </main>
  );
}

function SplashScreen({ onCreateAccount, onLogin, onAbout }) {
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
    if (fragment.get('email_verified') === '1') alert('E-mail confirmado. Agora você já pode entrar.');
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
      alert('Cadastro criado. Enviamos um link de confirmação para seu e-mail.');
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
      setFormState((prev) => ({ ...prev, cep, city: `${address.localidade}${address.uf ? `, ${address.uf}` : ''}`, neighborhood: address.bairro || prev.neighborhood, address: [address.logradouro, address.bairro].filter(Boolean).join(', ') }));
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

  return <div className={iconOnly ? 'google-auth google-auth-icon-only' : 'google-auth'}>{iconOnly ? null : <span>ou</span>}<button type="button" className={iconOnly ? 'google-auth-btn google-auth-icon' : 'google-auth-btn'} onClick={start} disabled={busy} aria-label={busy ? 'Abrindo Google' : label} title={label}><GoogleIcon />{iconOnly ? null : busy ? 'Abrindo Google...' : label}</button></div>;
}

function GoogleIcon() {
  return (
    <svg className="google-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path fill="#4285F4" d="M21.35 12.27c0-.72-.06-1.42-.18-2.09H12v3.96h5.23a4.47 4.47 0 0 1-1.94 2.93v2.43h3.14c1.84-1.69 2.92-4.18 2.92-7.23Z" />
      <path fill="#34A853" d="M12 21.71c2.63 0 4.84-.87 6.45-2.36l-3.14-2.43c-.87.58-1.98.92-3.31.92-2.54 0-4.69-1.72-5.46-4.03H3.3v2.51A9.75 9.75 0 0 0 12 21.71Z" />
      <path fill="#FBBC05" d="M6.54 13.81a5.86 5.86 0 0 1 0-3.62V7.68H3.3a9.75 9.75 0 0 0 0 8.64l3.24-2.51Z" />
      <path fill="#EA4335" d="M12 6.16c1.43 0 2.71.49 3.72 1.46l2.79-2.79C16.84 3.27 14.63 2.29 12 2.29a9.75 9.75 0 0 0-8.7 5.39l3.24 2.51C7.31 7.88 9.46 6.16 12 6.16Z" />
    </svg>
  );
}

function FeedScreen({ onNavigate }) {
  const posts = useAppStore((state) => state.posts);
  const favorites = useAppStore((state) => state.favorites);
  const search = useAppStore((state) => state.search);
  const setSearch = useAppStore((state) => state.setSearch);
  const loadFeed = useAppStore((state) => state.loadFeed);
  const loadFavorites = useAppStore((state) => state.loadFavorites);
  const loadNotifications = useAppStore((state) => state.loadNotifications);
  const session = useAppStore((state) => state.session);
  const [category, setCategory] = useState('Todos');
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [headerHidden, setHeaderHidden] = useState(false);
  const notifiedIds = useRef(new Set(JSON.parse(window.localStorage.getItem('reusa_browser_notifications') || '[]')));
  const feedPosts = category === 'Salvos' ? favorites : posts;
  const filteredPosts = useMemo(() => {
    const query = search.trim().toLowerCase();
    return feedPosts.filter((post) => {
      const matchesCategory = category === 'Todos' || category === 'Salvos' || String(post.category || '').toLowerCase() === category.toLowerCase();
      const matchesSearch = !query || [post.title, post.description, post.category, post.author?.name].some((value) => String(value || '').toLowerCase().includes(query));
      return matchesCategory && matchesSearch;
    }).filter(Boolean);
  }, [feedPosts, search, category]);

  useEffect(() => {
    loadFeed().catch(() => {});
    if (session) loadFavorites().catch(() => {});
    const syncNotifications = () => loadNotifications().then((items) => {
      if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
      const unseen = items.filter((item) => !item.readAt && !notifiedIds.current.has(item.id)).slice(0, 3);
      unseen.forEach((item) => {
        showBrowserNotification(item);
        notifiedIds.current.add(item.id);
      });
      window.localStorage.setItem('reusa_browser_notifications', JSON.stringify([...notifiedIds.current].slice(-100)));
    }).catch(() => {});
    syncNotifications();
    const timer = window.setInterval(syncNotifications, 15000);
    return () => window.clearInterval(timer);
  }, [loadFeed, loadFavorites, loadNotifications, session]);

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
        <a className="brand unified-brand" href="/feed" aria-label="ReUsa+, início"><img className="feed-logo" src={feedLogo} alt="ReUsa+" /></a>
        {searchOpen ? <label className="searchbar feed-search-expanded"><span className="material-symbols-outlined">search</span><input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(event) => { if (event.key === 'Escape') setSearchOpen(false); }} placeholder="Buscar anúncios" autoFocus /><button type="button" className={categoriesOpen ? 'category-trigger category-trigger-active' : 'category-trigger'} onClick={toggleCategories} aria-expanded={categoriesOpen} aria-label="Escolher categoria"><span className="material-symbols-outlined">category</span></button><button type="button" className="feed-search-close" onClick={() => setSearchOpen(false)} aria-label="Fechar busca"><span className="material-symbols-outlined">close</span></button></label> : <div className="feed-search-tools"><button type="button" className="icon-btn feed-search-trigger" onClick={() => setSearchOpen(true)} aria-label="Abrir busca"><span className="material-symbols-outlined">search</span></button><button type="button" className={categoriesOpen ? 'category-trigger category-trigger-active' : 'category-trigger'} onClick={toggleCategories} aria-expanded={categoriesOpen} aria-label="Escolher categoria"><span className="material-symbols-outlined">category</span></button></div>}
        <div className="topbar-actions"><HeaderProfileButton /></div>
      </header>
      <div className="feed-category-popover">{categoriesOpen ? <CategoryBar selected={category} onChange={(value) => { setCategory(value); setCategoriesOpen(false); }} showSaved={Boolean(session)} savedCount={favorites.length} /> : null}</div>
      <main className="feed-page">
        <section className="feed-intro"><div><span className="eyebrow">Economia circular local</span><h1>Encontre um novo ciclo</h1><p>Itens compartilhados pela comunidade para doar, trocar e reaproveitar.</p></div><span className="feed-count">{filteredPosts.length} {filteredPosts.length === 1 ? 'anúncio' : 'anúncios'}</span></section>
        <div className="feed-list">
          {filteredPosts.length ? filteredPosts.map((post) => <FeedCard key={post.id} post={post} onNavigate={onNavigate} onOpenChat={async () => { try { const thread = await useAppStore.getState().createThread(post.id); onNavigate(`/mensagens/ana?thread=${thread.id}`); } catch (error) { alert(error.message); } }} onOpenPayment={async () => useAppStore.getState().createThread(post.id)} />) : <div className="empty-state"><span className="material-symbols-outlined">{category === 'Salvos' ? 'bookmark_border' : 'search_off'}</span><h2>{category === 'Salvos' ? 'Nenhum item salvo' : 'Nada encontrado'}</h2><p>{category === 'Salvos' ? 'Toque no marcador de um anúncio para encontrá-lo aqui.' : 'Tente outra busca ou categoria.'}</p></div>}
        </div>
      </main>
    </Shell>
  );
}

function NotificationsScreen({ onBack, onNavigate }) {
  const [notifications, setNotifications] = useState([]);
  const loadNotifications = useAppStore((state) => state.loadNotifications);
  const [browserPermission, setBrowserPermission] = useState(typeof Notification === 'undefined' ? 'unsupported' : Notification.permission);
  useEffect(() => {
    let active = true;
    const syncNotifications = () => loadNotifications().then((items) => {
      if (active) setNotifications(items);
    }).catch(() => {});
    syncNotifications();
    const timer = window.setInterval(syncNotifications, 15000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [loadNotifications]);
  async function enableBrowserNotifications() {
    if (typeof Notification === 'undefined') return;
    const permission = await Notification.requestPermission();
    setBrowserPermission(permission);
    if (permission === 'granted') showBrowserNotification({ id: 'browser-permission', title: 'Notificações ativadas', text: 'Você receberá avisos do ReUsa+ neste navegador.' });
  }
  const iconFor = (type) => ({ message: 'chat', comment: 'chat_bubble', like: 'favorite', interest: 'handshake', negotiation: 'swap_horiz', review: 'star', system: 'notifications' }[type] || 'notifications');
  async function openNotification(notification) {
    try { await api.readNotification(notification.id); setNotifications((items) => items.map((item) => item.id === notification.id ? { ...item, readAt: new Date().toISOString() } : item)); await loadNotifications(); } catch {}
    onNavigate(notification.link || '/feed');
  }
  return <Shell nav={navRoutes} active="/notificacoes"><UnifiedTopbar onBack={onBack} /><main className="page padded-top"><section className="browser-notification-card"><div><span className="eyebrow">Notificações do sistema</span><p>Receba avisos do ReUsa+ neste navegador enquanto a página estiver aberta.</p></div>{browserPermission === 'granted' ? <span className="notification-enabled"><span className="material-symbols-outlined">check_circle</span>Ativadas</span> : browserPermission === 'unsupported' ? <small>Navegador incompatível</small> : browserPermission === 'denied' ? <small>Permissão bloqueada. Libere as notificações nas configurações do navegador.</small> : <button className="secondary-btn" onClick={enableBrowserNotifications}><span className="material-symbols-outlined">notifications_active</span>Ativar no navegador</button>}</section><div className="notification-list">{notifications.length ? notifications.map((notification) => <button className={notification.readAt ? 'notification-item' : 'notification-item notification-unread'} key={notification.id} onClick={() => openNotification(notification)}><span className="notification-icon material-symbols-outlined">{iconFor(notification.type)}</span><span><strong>{notification.title}</strong><p>{notification.text}</p><small>{formatBrazilDate(notification.createdAt)} às {formatBrazilTime(notification.createdAt)}</small></span></button>) : <EmptyState icon="notifications_none" title="Nenhuma notificação nova" text="Quando algo acontecer na sua comunidade, avisaremos por aqui." />}</div></main></Shell>;
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
      <UnifiedTopbar onBack={() => onNavigate('/feed')} />
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
  return <div className="post-screen"><UnifiedTopbar onBack={onBack} /><main className="page padded-bottom"><section className="composer-card"><span className="eyebrow">Vitrine circular</span><h2>Mostre o que você criou</h2><p>Compartilhe um produto feito com materiais reaproveitados.</p><form className="composer-form" onSubmit={submit}><Field label="Nome do produto" icon="title" value={form.title} onChange={(value) => setForm((current) => ({ ...current, title: value }))} placeholder="Ex: Luminária de garrafas" /><Field label="Material reaproveitado" icon="recycling" value={form.material} onChange={(value) => setForm((current) => ({ ...current, material: value }))} placeholder="Ex: garrafas de vidro" /><Field label="Preço" icon="payments" value={form.price} onChange={(value) => setForm((current) => ({ ...current, price: value }))} placeholder="Ex: R$ 80,00" /><Field label="Descrição" icon="description" value={form.description} onChange={(value) => setForm((current) => ({ ...current, description: value }))} placeholder="Conte como a peça foi feita..." multiline /><Field label="URL da foto (opcional)" icon="image" value={form.imageUrl} onChange={(value) => setForm((current) => ({ ...current, imageUrl: value }))} placeholder="https://..." /><button className="primary-btn full" disabled={busy}>{busy ? 'Publicando...' : 'Publicar na vitrine'}<span className="material-symbols-outlined">send</span></button></form></section></main></div>;
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

  return <div className="ai-page"><UnifiedTopbar onBack={onBack} /><main className="ai-content"><div className="ai-hero"><span className="ai-icon material-symbols-outlined">auto_awesome</span><span className="eyebrow">Assistente de reaproveitamento</span><h2>O que você quer reaproveitar?</h2><p>Conte sobre os materiais e a Ana sugere uma ideia prática e segura.</p></div><form className="ai-form" onSubmit={ask}><textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Material disponível: ex. garrafas de vidro" rows={3} /><div className="ai-preferences"><input value={quantity} onChange={(event) => setQuantity(event.target.value)} placeholder="Quantidade aproximada" /><input value={objective} onChange={(event) => setObjective(event.target.value)} placeholder="Objetivo (decorar, organizar...)" /><select value={difficulty} onChange={(event) => setDifficulty(event.target.value)}><option>Fácil</option><option>Média</option><option>Avançada</option></select></div><button className="primary-btn full" disabled={busy}>{busy ? 'Pensando...' : 'Gerar ideia'}<span className="material-symbols-outlined">arrow_forward</span></button></form>{result ? <section className="ai-result"><span className="eyebrow">Sugestão da Ana · {result.difficulty}</span><h2>{result.title}</h2><p>{result.reuse || result.summary}</p><div className="ai-facts"><div><strong>Tempo</strong><span>{result.time}</span></div><div><strong>Materiais</strong><span>{result.materials.join(', ')}</span></div></div><h3>Como poderia ser reaproveitado</h3><ol>{result.steps.map((step) => <li key={step}>{step}</li>)}</ol><div className="ai-care"><span className="material-symbols-outlined">health_and_safety</span><span>{result.care}</span></div><button className="secondary-btn full" onClick={publishInspiration}><span className="material-symbols-outlined">storefront</span>Publicar como inspiração</button></section> : <div className="ai-prompts"><span>Tente perguntar:</span><button onClick={() => setPrompt('garrafas de vidro')}>garrafas de vidro</button><button onClick={() => setPrompt('madeira e pallet')}>madeira e pallet</button><button onClick={() => setPrompt('latas de alumínio')}>latas</button></div>}</main></div>;
}

function CategoryBar({ selected, onChange, showSaved = false, savedCount = 0 }) {
  const items = ['Todos', 'Eletrônicos', 'Roupas', 'Móveis', 'Livros', 'Plástico'];
  return <section className="category-panel feed-category-panel" aria-label="Categorias de anúncios">{items.map((item) => <button key={item} onClick={() => onChange(item)} className={selected === item ? 'pill pill-active' : 'pill'}>{item}</button>)}{showSaved ? <button onClick={() => onChange('Salvos')} className={selected === 'Salvos' ? 'pill pill-active saved-filter-pill' : 'pill saved-filter-pill'}><span className="material-symbols-outlined">bookmark</span>Salvos{savedCount ? <b>{savedCount}</b> : null}</button> : null}</section>;
}

function FeedCard({ post, onNavigate, onOpenChat, onOpenPayment }) {
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
  const [interestOptionsOpen, setInterestOptionsOpen] = useState(false);
  const [proposalOpen, setProposalOpen] = useState(false);
  const [proposalNegotiation, setProposalNegotiation] = useState(null);
  const [proposalForm, setProposalForm] = useState({ amount: '', method: 'pix' });
  const [proposalBusy, setProposalBusy] = useState(false);
  const [proposalSent, setProposalSent] = useState(false);
  const [offerStatus, setOfferStatus] = useState(post.offerStatus || 'none');
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);

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

  async function openProposal() {
    if (offerStatus !== 'none') {
      alert('Você já enviou uma oferta para este anúncio.');
      return;
    }
    setInterestOptionsOpen(false);
    setProposalOpen(true);
    setProposalSent(false);
    try {
      await onOpenPayment();
      const result = await api.negotiation(post.id);
      if (result.negotiation?.status === 'reserved') {
        setProposalOpen(false);
        alert('Este anúncio já foi reservado para você. Abra o anúncio para realizar o pagamento simulado.');
        onNavigate(`/anuncios/${post.id}`);
        return;
      }
      setProposalNegotiation(result.negotiation);
    } catch (error) {
      setProposalOpen(false);
      alert(error.message);
    }
  }

  async function submitProposal(event) {
    event.preventDefault();
    if (!proposalNegotiation || proposalBusy) return;
    const digits = String(proposalForm.amount).replace(/\D/g, '');
    const amountCents = Number(digits);
    if (!Number.isSafeInteger(amountCents) || amountCents < 100) return alert('Informe um valor válido a partir de R$ 1,00.');
    setProposalBusy(true);
    try {
      await api.createProposal(proposalNegotiation.id, { amountCents, method: proposalForm.method });
      setOfferStatus('pending');
      setProposalSent(true);
    } catch (error) {
      alert(error.message);
    } finally {
      setProposalBusy(false);
    }
  }

  return (
    <article className="card post-card">
      <div className="post-head">
        <button className={saved ? 'icon-btn saved-btn' : 'icon-btn'} onClick={favorite} aria-label={saved ? 'Remover dos salvos' : 'Salvar anúncio'}><span key={saveAnimationKey} className={saved ? 'material-symbols-outlined save-icon saved-bookmark' : 'material-symbols-outlined save-icon'}>{saved ? 'bookmark' : 'bookmark_border'}</span></button>
        {post.author.avatar ? <img className="avatar" src={post.author.avatar} alt={post.author.name} /> : <span className="avatar avatar-placeholder material-symbols-outlined" aria-label={`Perfil de ${post.author.name}`}>person</span>}
        <div className="post-meta"><strong>{post.author.name}</strong><span>{formatRelativeTime(post.createdAt, now)} • {post.author.city}</span></div>
        {post.authorId === session?.id ? <button className="icon-btn" onClick={removePost} title="Excluir anúncio" aria-label="Excluir anúncio"><span className="material-symbols-outlined">delete</span></button> : null}
      </div>
      <div className="post-image-wrap post-card-clickable" onClick={() => onNavigate(`/anuncios/${post.id}`)} role="link" tabIndex="0" onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') onNavigate(`/anuncios/${post.id}`); }}>
        <img className="post-image" src={post.imageUrl} alt={post.title} />
        {post.imageUrls?.length > 1 ? <span className="post-image-count"><span className="material-symbols-outlined">photo_library</span>{post.imageUrls.length}</span> : null}
        <div className="chip-float"><span className="material-symbols-outlined">{post.chipIcon}</span>{post.chipLabel}</div>
      </div>
      <div className="post-body">
        <h3><a className="post-title-link" href={`/anuncios/${post.id}`}>{post.title}</a></h3>
        <p>{post.description}</p>
      </div>
      <div className="tag-row feed-post-tags"><span>{post.category}</span><span>{post.condition}</span><span className={`status-tag status-${String(post.status || 'Disponível').toLowerCase().replace(/\s+/g, '-')}`}>{post.status || 'Disponível'}</span></div>
      {post.offerStatus && post.offerStatus !== 'none' ? <div className={`offer-status offer-status-${post.offerStatus}`}><span className="material-symbols-outlined">{post.offerStatus === 'accepted' ? 'check_circle' : post.offerStatus === 'rejected' ? 'cancel' : 'schedule'}</span>{post.offerStatus === 'accepted' ? 'Oferta aceita' : post.offerStatus === 'rejected' ? 'Oferta recusada' : 'Proposta aguardando resposta'}</div> : null}
      <div className="post-actions">
        <div className="post-stats"><button className={liked ? 'ghost-inline liked' : 'ghost-inline'} onClick={like}><span key={heartAnimationKey} className={liked ? 'material-symbols-outlined like-icon liked-heart' : 'material-symbols-outlined like-icon'}>{liked ? 'favorite' : 'favorite_border'}</span>{likes}</button><button className="ghost-inline" onClick={toggleComments}><span className="material-symbols-outlined">chat_bubble</span>{commentCount}</button></div>
        {post.authorId !== session?.id ? <button className="primary-btn compact" disabled={offerStatus !== 'none'} onClick={() => setInterestOptionsOpen(true)}><span className="material-symbols-outlined">handshake</span>{offerStatus !== 'none' ? 'Oferta enviada' : 'Tenho interesse'}</button> : <span className="post-owner-label">Seu anúncio</span>}
      </div>
      {commentsOpen ? <section className="comments-panel"><div className="comments-list">{comments.length ? comments.map((comment) => <div className="comment" key={comment.id}>{comment.avatar ? <img src={comment.avatar} alt="" /> : <span className="avatar-placeholder material-symbols-outlined" aria-hidden="true">person</span>}<div><strong>{comment.name}</strong><p>{comment.text}</p></div></div>) : commentCount === 0 ? <p className="comments-empty">Ainda não há comentários. Seja o primeiro.</p> : null}</div><form className="comment-form" onSubmit={addComment}><input value={commentText} maxLength="500" onChange={(event) => setCommentText(event.target.value)} placeholder="Escreva um comentário..." /><button className="send-btn" disabled={commentBusy} aria-label="Publicar comentário"><span className="material-symbols-outlined">send</span></button></form></section> : null}
      {interestOptionsOpen ? <div className="interest-modal-backdrop" role="presentation" onClick={() => setInterestOptionsOpen(false)}><section className="interest-modal" role="dialog" aria-modal="true" aria-labelledby={`interest-title-${post.id}`} onClick={(event) => event.stopPropagation()}><button type="button" className="interest-modal-close" onClick={() => setInterestOptionsOpen(false)} aria-label="Fechar opções"><span className="material-symbols-outlined">close</span></button><div className="interest-modal-heading"><span className="interest-modal-badge"><span className="material-symbols-outlined">handshake</span></span><span className="eyebrow">Tenho interesse</span></div><h2 id={`interest-title-${post.id}`}>Como você quer continuar?</h2><p>Escolha uma forma de iniciar sua negociação com o anunciante.</p><div className="interest-modal-actions"><button type="button" className="interest-choice interest-choice-message" onClick={() => { setInterestOptionsOpen(false); onOpenChat(); }}><span className="interest-choice-icon"><span className="material-symbols-outlined">chat_bubble</span></span><span className="interest-choice-copy"><strong>Conversar por mensagem</strong><small>Combine os detalhes pelo chat</small></span><span className="material-symbols-outlined interest-choice-arrow">arrow_forward</span></button><button type="button" className="interest-choice interest-choice-payment" onClick={openProposal}><span className="interest-choice-icon"><span className="material-symbols-outlined">payments</span></span><span className="interest-choice-copy"><strong>Fazer oferta com pagamento</strong><small>Pagamento simulado após a reserva</small></span><span className="material-symbols-outlined interest-choice-arrow">arrow_forward</span></button></div><small className="interest-modal-note"><span className="material-symbols-outlined">info</span>O pagamento só será liberado depois que o vendedor reservar o item para você.</small></section></div> : null}
      {proposalOpen ? <div className="interest-modal-backdrop" role="presentation" onClick={() => setProposalOpen(false)}><section className="interest-modal proposal-modal" role="dialog" aria-modal="true" aria-labelledby={`proposal-title-${post.id}`} onClick={(event) => event.stopPropagation()}><button type="button" className="interest-modal-close" onClick={() => setProposalOpen(false)} aria-label="Fechar proposta"><span className="material-symbols-outlined">close</span></button><div className="interest-modal-heading"><span className="interest-modal-badge proposal-modal-badge"><span className="material-symbols-outlined">payments</span></span><span className="eyebrow">Oferta de pagamento</span></div>{proposalSent ? <><h2 id={`proposal-title-${post.id}`}>Proposta enviada!</h2><p>Sua oferta foi enviada e aguarda a resposta do vendedor.</p><div className="proposal-success"><span className="material-symbols-outlined">schedule</span><strong>Você poderá pagar depois que o vendedor aceitar e reservar o anúncio.</strong></div><button type="button" className="primary-btn proposal-close-action" onClick={() => setProposalOpen(false)}>Voltar ao feed</button></> : <><h2 id={`proposal-title-${post.id}`}>Envie sua proposta</h2><p>Informe o valor e a forma de pagamento para o vendedor analisar.</p>{proposalNegotiation ? <form className="proposal-modal-form" onSubmit={submitProposal}><label>Valor da oferta (R$)<input inputMode="decimal" value={proposalForm.amount} onChange={(event) => setProposalForm((current) => ({ ...current, amount: formatMoneyInput(event.target.value) }))} placeholder="10,00" required /></label><label>Forma de pagamento<select value={proposalForm.method} onChange={(event) => setProposalForm((current) => ({ ...current, method: event.target.value }))}><option value="pix">PIX simulado</option><option value="card">Cartão simulado</option><option value="boleto">Boleto simulado</option></select></label><button className="primary-btn" disabled={proposalBusy}>{proposalBusy ? 'Enviando...' : 'Enviar proposta'}<span className="material-symbols-outlined">send</span></button></form> : <div className="proposal-loading"><span className="material-symbols-outlined">progress_activity</span>Preparando sua proposta...</div>}</>}</section></div> : null}
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
  async function clearAll() {
    if (!threads.length || !window.confirm('Limpar todas as conversas deste dispositivo? O histórico dos outros participantes será preservado.')) return;
    try {
      await api.clearAllMessages();
      await loadThreads();
    } catch (error) {
      alert(error.message);
    }
  }
  return (
    <Shell nav={navRoutes} active="/mensagens">
      <UnifiedTopbar />
      <main className="page messages-page">
        <section className="messages-intro"><span className="eyebrow">Sua caixa de entrada</span><button className="ghost-btn" type="button" onClick={clearAll} disabled={!threads.length}><span className="material-symbols-outlined">delete_sweep</span>Limpar todas</button></section>
        <label className="search-shell messages-search"><span className="material-symbols-outlined">search</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Pesquisar por pessoa ou mensagem..." /></label>
        <div className="thread-list">
          {visibleThreads.map((thread) => (
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
  const threadId = new URLSearchParams(window.location.search).get('thread');

  useEffect(() => {
    if (!threadId) return undefined;
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
    if (!threadId) return;
    if (!session) {
      alert('Entre na sua conta para enviar mensagens.');
      return;
    }

    async function clearConversation() {
      if (!threadId || !window.confirm('Limpar esta conversa? O histórico dos outros participantes será preservado.')) return;
      try {
        await api.clearThreadMessages(threadId);
        setMessages([]);
        setThread((current) => current ? { ...current, last_message_at: null } : current);
      } catch (error) {
        alert(error.message);
      }
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
      <UnifiedTopbar onBack={onBack} />
      <div className="chat-banner">{thread?.avatar ? <img className="chat-person-avatar" src={thread.avatar} alt="" /> : <span className="chat-person-avatar material-symbols-outlined" aria-label={`Perfil de ${thread?.title || 'conversa'}`}>person</span>}<div><strong>{thread?.title || 'Conversa'}</strong><span>Negocie com segurança e combine a retirada</span></div><button className="icon-btn" type="button" onClick={clearConversation} aria-label="Limpar conversa" title="Limpar conversa"><span className="material-symbols-outlined">delete_sweep</span></button></div>
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
  const [images, setImages] = useState([]);
  const imagePreviews = useMemo(() => images.map((image) => URL.createObjectURL(image)), [images]);

  useEffect(() => () => imagePreviews.forEach((preview) => URL.revokeObjectURL(preview)), [imagePreviews]);
  const categories = [
    ['moveis', 'chair', 'Móveis'],
    ['eletronicos', 'devices', 'Eletrônicos'],
    ['roupas', 'checkroom', 'Roupas'],
    ['livros', 'menu_book', 'Livros'],
    ['plastico', 'recycling', 'Plástico'],
    ['outros', 'category', 'Outros']
  ];

  useEffect(() => {
  }, []);

  async function submit(event) {
    event.preventDefault();
    if (!postForm.title?.trim() || !postForm.description?.trim()) return;
    if (!images.length) {
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
      await createPost({ ...postPayload, category, images });
      setPostForm({});
      setImages([]);
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
            <label className={images.length ? 'publish-image-picker has-image' : 'publish-image-picker'}>
              {images.length ? <div className="publish-image-previews">{images.map((image, index) => <span key={`${image.name}-${index}`}><img src={imagePreviews[index]} alt={`Prévia ${index + 1}`} /><button type="button" onClick={(event) => { event.preventDefault(); setImages((current) => current.filter((_, imageIndex) => imageIndex !== index)); }} aria-label={`Remover foto ${index + 1}`}>×</button></span>)}</div> : <><span className="publish-image-icon material-symbols-outlined">add_a_photo</span><strong>Adicionar fotos</strong><small>Até 8 imagens • JPG, PNG, WebP ou GIF • até 5 MB cada</small></>}
              <input type="file" multiple accept="image/jpeg,image/png,image/gif,image/webp,image/avif" onChange={(event) => setImages((current) => [...current, ...Array.from(event.target.files || [])].slice(0, 8))} />
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
  const [payment, setPayment] = useState(null);
  const [paymentForm, setPaymentForm] = useState({ amount: '', method: 'pix' });
  const [paymentBusy, setPaymentBusy] = useState(false);
  const [proposalForm, setProposalForm] = useState({ amount: '', method: 'pix' });
  const [proposalBusy, setProposalBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [editImages, setEditImages] = useState([]);
  const [editImagePreviews, setEditImagePreviews] = useState([]);
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
      setEditImages((postResult.post.imageUrls || [postResult.post.imageUrl]).map((url) => ({ url })));
      setComments(commentResult.comments || []);
    }).catch((error) => alert(error.message)).finally(() => setBusy(false));
    if (session) api.negotiation(postId).then(async (result) => {
      setNegotiation(result.negotiation);
      if (result.negotiation) {
        const paymentResult = await api.payment(result.negotiation.id);
        setPayment(paymentResult.payment);
      }
    }).catch(() => {});
  }, [postId, session?.id]);

  useEffect(() => {
    const previews = editImages.map((image) => image.file ? URL.createObjectURL(image.file) : image.url);
    setEditImagePreviews(previews);
    return () => previews.forEach((preview, index) => {
      if (editImages[index]?.file) URL.revokeObjectURL(preview);
    });
  }, [editImages]);

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

  async function submitPayment(event) {
    event.preventDefault();
    if (!negotiation || paymentBusy) return;
    const amountCents = Number(String(paymentForm.amount).replace(/\D/g, ''));
    if (!Number.isSafeInteger(amountCents) || amountCents < 100) return alert('Informe um valor válido a partir de R$ 1,00.');
    setPaymentBusy(true);
    try {
      const result = await api.createPayment(negotiation.id, {
        amountCents,
        method: paymentForm.method,
        idempotencyKey: `web-${session.id}-${negotiation.id}-${Date.now()}`
      });
      setPayment(result.payment);
      alert(result.payment.status === 'succeeded' ? 'Pagamento simulado confirmado.' : 'O provedor simulado recusou o pagamento.');
    } catch (error) {
      alert(error.message);
    } finally {
      setPaymentBusy(false);
    }
  }

  async function submitProposal(event) {
      event.preventDefault();
      if (!negotiation || proposalBusy) return;
      const amountCents = Number(String(proposalForm.amount).replace(/\D/g, ''));
      if (!Number.isSafeInteger(amountCents) || amountCents < 100) return alert('Informe um valor válido a partir de R$ 1,00.');
      setProposalBusy(true);
      try {
        const result = await api.createProposal(negotiation.id, { amountCents, method: proposalForm.method });
        setNegotiation((current) => ({ ...current, proposalStatus: result.proposal.status, proposalAmountCents: result.proposal.amountCents, proposalMethod: result.proposal.method, proposalCreatedAt: result.proposal.createdAt }));
        alert('Proposta enviada. Aguarde a resposta do vendedor.');
      } catch (error) {
        alert(error.message);
      } finally {
        setProposalBusy(false);
    }
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
    if (!editImages.length) {
      alert('O anúncio precisa ter pelo menos uma foto.');
      return;
    }
    try {
      const newFiles = editImages.filter((image) => image.file).map((image) => image.file);
      const imageOrder = editImages.map((image) => image.file
        ? `new:${newFiles.indexOf(image.file)}`
        : `existing:${image.url}`);
      const updated = await useAppStore.getState().updatePost(post.id, { ...editForm, images: newFiles, imageOrder });
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

  return <div className="detail-screen"><UnifiedTopbar onBack={onBack} /><main className="detail-page">
    <section className="detail-image"><img src={post.imageUrl} alt={post.title} /><span className={`status-tag status-${String(post.status || 'Disponível').toLowerCase().replace(/\s+/g, '-')}`}>{post.status || 'Disponível'}</span>{post.imageUrls?.length > 1 ? <div className="detail-gallery-thumbs">{post.imageUrls.map((imageUrl) => <button type="button" key={imageUrl} onClick={() => setPost((current) => ({ ...current, imageUrl }))}><img src={imageUrl} alt="" /></button>)}</div> : null}</section>
    <section className="detail-summary"><div className="detail-kicker"><span>{post.category}</span><span>{post.condition}</span></div><h1>{post.title}</h1><p>{post.description}</p><div className="detail-info"><span><i className="material-symbols-outlined">swap_horiz</i>{post.goal}</span><span><i className="material-symbols-outlined">location_on</i>{post.location}</span><span><i className="material-symbols-outlined">schedule</i>{formatBrazilDate(post.createdAt)} às {formatBrazilTime(post.createdAt)}</span></div><div className="detail-actions"><button className={post.saved ? 'secondary-btn saved-btn' : 'secondary-btn'} onClick={save} title={post.saved ? 'Remover dos salvos' : 'Salvar anúncio'} aria-label={post.saved ? 'Remover dos salvos' : 'Salvar anúncio'}><span className="material-symbols-outlined">{post.saved ? 'bookmark' : 'bookmark_border'}</span>{post.saved ? 'Salvo' : 'Salvar'}</button><button className="secondary-btn" onClick={share} title="Compartilhar anúncio" aria-label="Compartilhar anúncio"><span className="material-symbols-outlined">share</span>Compartilhar</button>{!ownPost ? <button className="primary-btn" disabled={post.status !== 'Disponível'} onClick={startConversation}><span className="material-symbols-outlined">handshake</span>Tenho interesse</button> : null}</div></section>
    <section className="detail-owner"><div>{post.author.avatar ? <img src={post.author.avatar} alt={post.author.name} /> : <span className="avatar-placeholder material-symbols-outlined">person</span>}</div><div><span>Anunciante</span><h2>{post.author.name}</h2><p>{post.author.city} · {post.authorReputation ? `⭐ ${post.authorReputation.toFixed(1)} (${post.authorReviewCount})` : 'Novo na comunidade'}</p></div>{!ownPost ? <div className="owner-actions"><button className="text-btn" onClick={blockAuthor} title="Bloquear anunciante" aria-label="Bloquear anunciante">Bloquear</button><button className="text-btn" onClick={() => openReport('user', post.authorId)} title="Denunciar anunciante" aria-label="Denunciar anunciante">Denunciar</button></div> : null}</section>
    {ownPost ? <section className="owner-management"><div className="section-title"><div><span className="eyebrow">Gerenciar anúncio</span><h2>Negociação e status</h2></div><div><button className="text-btn" onClick={() => { setEditImages((post.imageUrls || [post.imageUrl]).map((url) => ({ url }))); setEditing((value) => !value); }}>Editar</button><button className="secondary-btn" onClick={loadInterested}>Interessados ({post.interestedCount || 0})</button><button className="text-btn danger-text" onClick={removeOwnedPost}>Excluir</button></div></div>{editing ?     <form className="edit-post-form" onSubmit={saveEdit}><div className="edit-gallery"><div className="edit-gallery-heading"><div><span className="eyebrow">Fotos do anúncio</span><p>Use os controles para remover ou reordenar. A primeira foto será a principal.</p></div><label className="secondary-btn edit-gallery-add"><span className="material-symbols-outlined">add_photo_alternate</span>Adicionar fotos<input type="file" multiple accept="image/jpeg,image/png,image/gif,image/webp,image/avif" onChange={(event) => setEditImages((current) => [...current, ...Array.from(event.target.files || []).map((file) => ({ file }))].slice(0, 8))} /></label></div><div className="edit-gallery-grid">{editImages.map((image, index) => <article className={index === 0 ? 'edit-gallery-item is-primary' : 'edit-gallery-item'} key={image.file ? `${image.file.name}-${index}` : image.url}><img src={editImagePreviews[index]} alt={`Foto ${index + 1}`} /><div><strong>{index === 0 ? 'Principal' : `Foto ${index + 1}`}</strong><div className="edit-gallery-controls"><button type="button" disabled={index === 0} onClick={() => setEditImages((current) => { const next = [...current]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; return next; })} aria-label="Mover foto para a esquerda"><span className="material-symbols-outlined">arrow_back</span></button><button type="button" disabled={index === editImages.length - 1} onClick={() => setEditImages((current) => { const next = [...current]; [next[index], next[index + 1]] = [next[index + 1], next[index]]; return next; })} aria-label="Mover foto para a direita"><span className="material-symbols-outlined">arrow_forward</span></button><button type="button" disabled={editImages.length === 1} onClick={() => setEditImages((current) => current.filter((_, imageIndex) => imageIndex !== index))} aria-label="Remover foto"><span className="material-symbols-outlined">delete</span></button></div></div></article>)}</div></div><Field label="Título" icon="title" value={editForm.title || ''} onChange={(value) => setEditForm((current) => ({ ...current, title: value }))} /><Field label="Descrição" icon="description" multiline value={editForm.description || ''} onChange={(value) => setEditForm((current) => ({ ...current, description: value }))} /><Field label="Categoria" icon="category" value={editForm.category || ''} onChange={(value) => setEditForm((current) => ({ ...current, category: value }))} /><Field label="Localização aproximada" icon="location_on" value={editForm.location || ''} onChange={(value) => setEditForm((current) => ({ ...current, location: value }))} /><button className="primary-btn">Salvar edição</button></form> : null}<div className="status-controls"><button onClick={() => useAppStore.getState().updatePostStatus(post.id, 'Disponível').then(setPost).catch((error) => alert(error.message))}>Disponível</button><button onClick={() => useAppStore.getState().updatePostStatus(post.id, 'Encerrado').then(setPost).catch((error) => alert(error.message))}>Encerrar</button>{post.status === 'Reservado' ? <><button onClick={() => complete('Doado')}>Marcar doado</button><button onClick={() => complete('Trocado')}>Marcar trocado</button></> : null}</div>{interested.length ? <div className="interested-list">{interested.map((item) => <article key={item.id}><span className="avatar-placeholder material-symbols-outlined">person</span><div><strong>{item.user?.name || 'Usuário'}</strong><small>{item.user?.city} · {item.status}</small>{item.proposalStatus !== 'none' ? <small>Proposta: R$ {((item.proposalAmountCents || 0) / 100).toFixed(2).replace('.', ',')} · {item.proposalStatus}</small> : null}</div>{item.proposalStatus === 'pending' ? <><button className="secondary-btn" onClick={() => api.decideProposal(item.id, 'rejected').then(loadInterested).catch((error) => alert(error.message))}>Recusar</button><button className="primary-btn" onClick={() => api.decideProposal(item.id, 'accepted').then(loadInterested).catch((error) => alert(error.message))}>Aceitar</button></> : null}{(post.status === 'Disponível' || post.status === 'Reservado') && item.proposalStatus !== 'rejected' ? <button className="secondary-btn" onClick={() => reserve(item.user.id)}>Reservar</button> : null}</article>)}</div> : null}</section> : null}
    {!ownPost && negotiation?.status === 'interested' && negotiation.proposalStatus === 'none' ? <section className="review-form-card proposal-card"><span className="eyebrow">Oferta com pagamento</span><h2>Envie sua proposta</h2><p>Informe o valor e a forma de pagamento. O vendedor receberá sua proposta para análise.</p><form onSubmit={submitProposal}><label>Valor da oferta (R$)<input inputMode="decimal" value={proposalForm.amount} onChange={(event) => setProposalForm((current) => ({ ...current, amount: formatMoneyInput(event.target.value) }))} placeholder="10,00" required /></label><label>Forma de pagamento<select value={proposalForm.method} onChange={(event) => setProposalForm((current) => ({ ...current, method: event.target.value }))}><option value="pix">PIX simulado</option><option value="card">Cartão simulado</option><option value="boleto">Boleto simulado</option></select></label><button className="primary-btn" disabled={proposalBusy}>{proposalBusy ? 'Enviando...' : 'Enviar proposta'}<span className="material-symbols-outlined">send</span></button></form></section> : null}
    {!ownPost && negotiation?.status === 'interested' && negotiation.proposalStatus === 'pending' ? <section className="payment-waiting-card"><div className="payment-waiting-icon"><span className="material-symbols-outlined">hourglass_top</span></div><div><span className="eyebrow">Proposta enviada</span><h2>Aguardando resposta do vendedor</h2><p>Sua oferta de R$ {((negotiation.proposalAmountCents || 0) / 100).toFixed(2).replace('.', ',')} foi enviada. O pagamento ficará disponível depois que o vendedor aceitar e reservar o item.</p></div><button className="secondary-btn" onClick={startConversation}><span className="material-symbols-outlined">chat_bubble</span>Conversar com o anunciante</button></section> : null}
    {!ownPost && negotiation?.status === 'reserved' && !payment ? <section className="review-form-card proposal-card"><span className="eyebrow">Pagamento liberado</span><h2>Finalize sua contribuição</h2><p>O vendedor reservou este anúncio para você. Escolha a forma de pagamento simulado para concluir.</p><form onSubmit={submitPayment}><label>Valor do pagamento (R$)<input inputMode="decimal" value={paymentForm.amount || (negotiation.proposalAmountCents ? formatMoneyInput(String(negotiation.proposalAmountCents)) : '')} onChange={(event) => setPaymentForm((current) => ({ ...current, amount: formatMoneyInput(event.target.value) }))} placeholder="10,00" required /></label><label>Forma de pagamento<select value={paymentForm.method} onChange={(event) => setPaymentForm((current) => ({ ...current, method: event.target.value }))}><option value="pix">PIX simulado</option><option value="card">Cartão simulado</option><option value="boleto">Boleto simulado</option></select></label><button className="primary-btn" disabled={paymentBusy}>{paymentBusy ? 'Processando...' : 'Pagar simulação'}<span className="material-symbols-outlined">payments</span></button></form></section> : null}
    {!ownPost && payment ? <section className="payment-waiting-card"><div className="payment-waiting-icon"><span className="material-symbols-outlined">{payment.status === 'succeeded' ? 'check_circle' : 'error'}</span></div><div><span className="eyebrow">Pagamento simulado</span><h2>{payment.status === 'succeeded' ? 'Pagamento confirmado' : 'Pagamento não aprovado'}</h2><p>Valor: R$ {(payment.amountCents / 100).toFixed(2).replace('.', ',')} · Método: {payment.method.toUpperCase()}</p></div></section> : null}
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
  return <div className="subpage"><UnifiedTopbar onBack={onBack} /><main className="page saved-page">{favorites.length ? <div className="saved-list">{favorites.map((post) => <article className="saved-item" key={post.id}><img src={post.imageUrl} alt={post.title} /><div><span>{post.status}</span><h2>{post.title}</h2><p>{post.location}</p><div><button className="text-btn" onClick={() => onOpenPost(post.id)}>Ver anúncio</button><button className="text-btn" onClick={() => toggleFavorite(post.id)}>Remover</button></div></div></article>)}</div> : <EmptyState icon="bookmark_border" title="Nenhum item salvo" text="Salve anúncios para encontrá-los rapidamente depois." action="Explorar anúncios" onAction={() => window.location.assign('/feed')} />}</main></div>;
}

function MyPostsScreen({ onBack, onOpenPost }) {
  const profile = useAppStore((state) => state.profile);
  const loadProfile = useAppStore((state) => state.loadProfile);
  const [tab, setTab] = useState('Ativos');
  useEffect(() => { loadProfile().catch((error) => alert(error.message)); }, [loadProfile]);
  const posts = profile?.posts || [];
  const visible = posts.filter((post) => tab === 'Ativos' ? post.status === 'Disponível' : tab === 'Reservados' ? post.status === 'Reservado' : ['Doado', 'Trocado', 'Encerrado'].includes(post.status));
  return <div className="subpage"><UnifiedTopbar onBack={onBack} /><main className="page my-posts-page"><div className="segmented-tabs">{['Ativos', 'Reservados', 'Concluídos'].map((item) => <button className={tab === item ? 'active' : ''} key={item} onClick={() => setTab(item)}>{item}</button>)}</div>{visible.length ? <div className="saved-list">{visible.map((post) => <article className="saved-item" key={post.id}><img src={post.imageUrl} alt={post.title} /><div><span className={`status-tag status-${String(post.status).toLowerCase()}`}>{post.status}</span><h2>{post.title}</h2><p>{post.likes} curtidas · {post.comments} comentários · {post.views || 0} visualizações</p><button className="text-btn" onClick={() => onOpenPost(post.id)}>Gerenciar anúncio</button></div></article>)}</div> : <EmptyState icon="inventory_2" title="Você ainda não possui anúncios nesta seção" text="Publique um item e encontre quem pode dar a ele uma nova história." action="Criar publicação" onAction={() => window.location.assign('/nova-publicacao')} />}</main></div>;
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
  const [routeOrigin, setRouteOrigin] = useState([-2.4431, -54.7083]);
  const [route, setRoute] = useState(null);
  const [routeBusy, setRouteBusy] = useState(false);
  const [routeError, setRouteError] = useState('');
  const [searchBusy, setSearchBusy] = useState(false);
  const routeRequest = useRef(0);

  const mapPoints = collectionPoints.map((point, index) => {
    const latitude = finiteCoordinate(point.latitude);
    const longitude = finiteCoordinate(point.longitude);
    const hasCoordinates = latitude !== null && longitude !== null
      && latitude >= -90 && latitude <= 90
      && longitude >= -180 && longitude <= 180;
    return {
      ...point,
      latitude: hasCoordinates ? latitude : ({ 'point-1': -2.4431, 'point-2': -1.4558 }[point.id] || [-2.4431, -1.4558, -3.119, -2.53][index] || -2.4431),
      longitude: hasCoordinates ? longitude : ({ 'point-1': -54.7083, 'point-2': -48.4902 }[point.id] || [-54.7083, -48.4902, -60.0217, -44.3][index] || -54.7083),
      routeCoordinates: hasCoordinates ? [latitude, longitude] : null
    };
  });
  const visiblePoints = mapPoints.filter((point) => category === 'Todos' || point.categories?.some((item) => item.toLowerCase().includes(category.toLowerCase())));
  const currentSelectedPoint = selectedPoint ? mapPoints.find((point) => point.id === selectedPoint.id) || selectedPoint : null;
  const canRouteToSelectedPoint = Boolean(currentSelectedPoint?.routeCoordinates);

  useEffect(() => {
    if (session?.city) {
      loadCollectionPointsNearby(session.city).then((result) => {
        if (result.center) {
          setMapCenter(result.center);
          updateRouteOrigin(result.center);
        }
      }).catch(() => {});
      return;
    }
    loadCollectionPoints().catch(() => {});
  }, [loadCollectionPoints, loadCollectionPointsNearby, session?.city]);

  useEffect(() => {
    if (!selectedPoint && visiblePoints[0]) setSelectedPoint(visiblePoints[0]);
    if (selectedPoint && !visiblePoints.some((point) => point.id === selectedPoint.id)) setSelectedPoint(visiblePoints[0] || null);
  }, [collectionPoints, category]);

  useEffect(() => {
    clearRoute();
  }, [selectedPoint?.id]);

  function updateRouteOrigin(nextOrigin, clearExistingRoute = false) {
    if (!Array.isArray(nextOrigin)) return;
    const latitude = finiteCoordinate(nextOrigin[0]);
    const longitude = finiteCoordinate(nextOrigin[1]);
    if (latitude === null || longitude === null || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return;
    setRouteOrigin((current) => (
      Math.abs(current[0] - latitude) < 0.000001 && Math.abs(current[1] - longitude) < 0.000001
        ? current
        : [latitude, longitude]
    ));
    if (clearExistingRoute && (Math.abs(routeOrigin[0] - latitude) >= 0.000001 || Math.abs(routeOrigin[1] - longitude) >= 0.000001)) clearRoute();
  }

  function clearRoute() {
    routeRequest.current += 1;
    setRoute(null);
    setRouteBusy(false);
    setRouteError('');
  }

  async function showRoute() {
    const destination = currentSelectedPoint;
    if (!destination?.routeCoordinates) {
      setRouteError('Este ponto ainda não tem coordenadas verificadas para traçar uma rota.');
      return;
    }

    const [fromLat, fromLng] = routeOrigin;
    const [toLat, toLng] = destination.routeCoordinates;
    const requestId = ++routeRequest.current;
    setRouteBusy(true);
    setRouteError('');

    try {
      const result = await api.mapRoute({ fromLat, fromLng, toLat, toLng });
      const routeData = result.route || result;
      const positions = (routeData.geometry?.coordinates || [])
        .map((coordinates) => {
          const [longitude, latitude] = Array.isArray(coordinates) ? coordinates : [];
          return [Number(latitude), Number(longitude)];
        })
        .filter(([latitude, longitude]) => Number.isFinite(latitude) && Number.isFinite(longitude));

      if (positions.length < 2) throw new Error('Não foi possível encontrar uma rota para este ponto.');
      if (requestId !== routeRequest.current) return;

      setRoute({
        positions,
        origin: [fromLat, fromLng],
        distance: routeData.distance,
        duration: routeData.duration
      });
    } catch (error) {
      if (requestId === routeRequest.current) {
        setRoute(null);
        setRouteError(error.message || 'Não foi possível traçar a rota agora.');
      }
    } finally {
      if (requestId === routeRequest.current) setRouteBusy(false);
    }
  }

  async function searchPlace(event) {
    event.preventDefault();
    if (!search.trim()) return;
    setSearchBusy(true);
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=br&q=${encodeURIComponent(search)}`, { headers: { Accept: 'application/json' } });
      const places = await response.json();
      if (!places.length) throw new Error('Local não encontrado');
      const center = [Number(places[0].lat), Number(places[0].lon)];
      setMapCenter(center);
      updateRouteOrigin(center, true);
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
      (position) => {
        const location = [position.coords.latitude, position.coords.longitude];
        setUserLocation(location);
        updateRouteOrigin(location, true);
      },
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
          <MapCenterTracker onChange={(origin) => updateRouteOrigin(origin, true)} />
          {route ? <>
            <Polyline positions={route.positions} pathOptions={{ color: '#ffffff', weight: 8, opacity: 0.9, lineCap: 'round', lineJoin: 'round', interactive: false }} />
            <Polyline positions={route.positions} pathOptions={{ color: '#078b52', weight: 5, opacity: 0.96, lineCap: 'round', lineJoin: 'round', interactive: false }} />
            <CircleMarker center={route.origin} pathOptions={{ color: '#ffffff', fillColor: '#176f9c', fillOpacity: 1, weight: 2, interactive: false }} radius={6} />
            <RouteViewport positions={route.positions} />
          </> : null}
          {visiblePoints.map((point) => <Marker key={point.id} position={[point.latitude, point.longitude]} icon={collectionPointMarkerIcon(selectedPoint?.id === point.id)} title={point.name} alt={point.name} keyboard eventHandlers={{ click: () => setSelectedPoint(point) }}><Tooltip className="collection-point-tooltip" direction="top" offset={[0, -14]} opacity={1}>{point.name || 'Ponto de coleta'}</Tooltip></Marker>)}
          {userLocation ? <><CircleMarker center={userLocation} pathOptions={{ color: '#2459d6', fillColor: '#77a0ff', fillOpacity: 0.9 }} radius={8} /><RecenterMap position={userLocation} /></> : null}
        </MapContainer>
        <form className="map-search" onSubmit={searchPlace}><span className="material-symbols-outlined">search</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar cidade ou endereço" aria-label="Buscar cidade ou endereço" /><button disabled={searchBusy} aria-label="Buscar local"><span className="material-symbols-outlined">arrow_forward</span></button></form>
        <div className="map-chips">
          {['Todos', 'Eletrônicos', 'Pilhas', 'Óleo', 'Cooperativas'].map((item) => <button key={item} className={category === item ? 'pill pill-active' : 'pill'} onClick={() => setCategory(item)}>{item}</button>)}
        </div>
        <button className="map-locate" onClick={locate} title="Usar minha localização (opcional)" aria-label="Usar minha localização (opcional)"><span className="material-symbols-outlined">my_location</span></button>
        {currentSelectedPoint ? <div className="map-card">
          <div className="map-card-head">
            <div>
              <span>Centro de coleta</span>
              <h2>{currentSelectedPoint.name || 'EcoCentro Santarém'}</h2>
            </div>
            <button className="icon-btn" onClick={() => setSelectedPoint(null)} aria-label="Fechar informações"><span className="material-symbols-outlined">close</span></button>
          </div>
          <div className="map-card-body">
            <div><span className="material-symbols-outlined">recycling</span><span>{(currentSelectedPoint.categories || ['Eletrônicos', 'plástico', 'metal']).join(', ')}</span></div>
            <div><span className="material-symbols-outlined">schedule</span><span>{currentSelectedPoint.hours || '08:00 – 17:00'}</span></div>
            <div><span className="material-symbols-outlined">location_on</span><span>{currentSelectedPoint.location || 'Localização não informada'}</span></div>
            <div><span className="material-symbols-outlined">verified</span><span>{currentSelectedPoint.origin || currentSelectedPoint.source || 'Origem não informada'}{currentSelectedPoint.lastUpdated ? ` · atualizado em ${new Date(currentSelectedPoint.lastUpdated).toLocaleDateString('pt-BR')}` : ''}</span></div>
          </div>
          {route ? <div className="map-route-summary" role="status">
            <span className="material-symbols-outlined" aria-hidden="true">route</span>
            <div><strong>Rota exibida no mapa</strong><small>{formatRouteDistance(route.distance)} · cerca de {formatRouteDuration(route.duration)}. A partida está marcada em azul.</small></div>
            <button type="button" onClick={clearRoute} aria-label="Limpar rota" title="Limpar rota"><span className="material-symbols-outlined">close</span></button>
          </div> : null}
          {routeError ? <div className="map-route-error" role="alert"><span className="material-symbols-outlined" aria-hidden="true">error_outline</span><span>{routeError}</span><button type="button" onClick={showRoute}>Tentar novamente</button></div> : null}
          {!canRouteToSelectedPoint ? <p className="map-route-hint">A rota estará disponível quando este ponto tiver coordenadas verificadas.</p> : !route ? <p className="map-route-hint">A saída será o centro atual do mapa; sua localização não será solicitada.</p> : null}
          <button className="primary-btn full map-route-btn" type="button" onClick={showRoute} disabled={routeBusy || !canRouteToSelectedPoint} title={canRouteToSelectedPoint ? 'Exibir rota neste mapa' : 'Este ponto ainda não tem coordenadas verificadas'}>{routeBusy ? 'Traçando rota...' : route ? 'Atualizar rota' : 'Como chegar'} <span className="material-symbols-outlined">navigation</span></button>
        </div> : <div className="map-floating-actions"><button className="map-reopen" onClick={() => setSelectedPoint(visiblePoints[0] || null)}><span className="material-symbols-outlined">info</span>Mostrar ponto selecionado</button><button className="map-suggest" onClick={onSuggest}><span className="material-symbols-outlined">add_location_alt</span>Sugerir ponto</button></div>}
      </main>
    </Shell>
  );
}

const emptyCollectionPointForm = () => ({ name: '', postalCode: '', street: '', number: '', neighborhood: '', city: '', state: '', location: '', hours: '', categories: '' });

function collectionPointFormFromPoint(point) {
  const form = emptyCollectionPointForm();
  if (!point) return form;

  form.name = String(point.name || '');
  form.location = String(point.location || '').trim();
  form.hours = String(point.hours || '');
  form.categories = Array.isArray(point.categories) ? point.categories.join(', ') : String(point.categories || '');

  const originalParts = form.location.split(',').map((part) => part.trim()).filter(Boolean);
  const postalCode = originalParts.find((part) => /^\d{5}-?\d{3}$/.test(part));
  if (postalCode) form.postalCode = postalCode.replace(/\D/g, '');
  const parts = originalParts.filter((part) => !/^brasil$/i.test(part) && part !== postalCode);
  let cityStateIndex = -1;
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    if (/\s-\s/.test(parts[index])) {
      cityStateIndex = index;
      break;
    }
  }

  if (cityStateIndex >= 0) {
    const [city, ...state] = parts[cityStateIndex].split(/\s-\s/);
    form.city = city || '';
    form.state = state.join(' - ');
    const addressParts = parts.slice(0, cityStateIndex);
    if (addressParts.length) {
      form.neighborhood = addressParts.at(-1) || '';
      const streetParts = addressParts.slice(0, -1);
      const candidateNumber = streetParts.at(-1) || '';
      if (/^(?:\d+[\w/-]*|s\/n)$/i.test(candidateNumber)) form.number = streetParts.pop() || '';
      form.street = streetParts.join(', ');
    }
  } else if (parts.length >= 2) {
    form.city = parts.at(-2) || '';
    form.state = parts.at(-1) || '';
  } else {
    form.city = parts[0] || '';
  }

  return form;
}

function CollectionPointFormFields({ form, setForm, cepBusy, setCepBusy, editing = false }) {
  const cepRequest = useRef(0);
  const addressPreview = [form.street, form.neighborhood, [form.city, form.state].filter(Boolean).join(' - ')].filter(Boolean).join(' · ');

  async function lookupCep(value) {
    const postalCode = value.replace(/\D/g, '').slice(0, 8);
    const requestId = ++cepRequest.current;
    if (postalCode.length !== 8) {
      setForm((current) => ({ ...current, postalCode }));
      setCepBusy(false);
      return;
    }

    setForm((current) => ({ ...current, postalCode, street: '', neighborhood: '', city: '', state: '' }));
    setCepBusy(true);
    try {
      const response = await fetch(`https://viacep.com.br/ws/${postalCode}/json/`);
      if (!response.ok) throw new Error('Não foi possível consultar este CEP.');
      const address = await response.json();
      if (address.erro) throw new Error('CEP não encontrado.');
      if (requestId !== cepRequest.current) return;
      setForm((current) => ({
        ...current,
        postalCode,
        street: address.logradouro || current.street,
        neighborhood: address.bairro || current.neighborhood,
        city: address.localidade || current.city,
        state: address.uf || current.state
      }));
    } catch (error) {
      if (requestId === cepRequest.current) alert(error.message || 'Não foi possível consultar este CEP.');
    } finally {
      if (requestId === cepRequest.current) setCepBusy(false);
    }
  }

  return <>
    <Field label="Nome do local" icon="location_city" value={form.name} onChange={(value) => setForm((current) => ({ ...current, name: value }))} placeholder="Ex: Cooperativa do bairro" />
    {editing ? <><div className="point-location-help"><span className="material-symbols-outlined">info</span><span>Confira a localização atual ou use o CEP e os campos abaixo para atualizá-la.</span></div><Field label="Localização pública atual" icon="location_on" value={form.location} onChange={(value) => setForm((current) => ({ ...current, location: value, postalCode: '', street: '', number: '', neighborhood: '', city: '', state: '' }))} placeholder="Ex: Centro, Santarém - PA" /></> : null}
    <Field label={cepBusy ? 'Consultando CEP...' : 'CEP (opcional)'} icon="markunread_mailbox" value={form.postalCode} onChange={lookupCep} placeholder="00000-000" />
    {cepBusy || addressPreview ? <div className="address-preview" role="status"><span className="material-symbols-outlined">{cepBusy ? 'progress_activity' : 'location_on'}</span><span>{cepBusy ? 'Preenchendo o endereço...' : addressPreview}</span></div> : null}
    <div className="point-address-grid">
      <Field label="Rua" icon="signpost" value={form.street} onChange={(value) => setForm((current) => ({ ...current, street: value }))} placeholder="Ex: Rua dos Tapajós" />
      <Field label="Número" icon="pin" value={form.number} onChange={(value) => setForm((current) => ({ ...current, number: value }))} placeholder="Ex: 150" />
      <Field label="Bairro" icon="location_city" value={form.neighborhood} onChange={(value) => setForm((current) => ({ ...current, neighborhood: value }))} placeholder="Ex: Centro" />
      <Field label="Cidade" icon="location_on" value={form.city} onChange={(value) => setForm((current) => ({ ...current, city: value }))} placeholder="Ex: Santarém" />
      <Field label="Estado" icon="map" value={form.state} onChange={(value) => setForm((current) => ({ ...current, state: value }))} placeholder="Ex: PA" />
    </div>
    <Field label="Materiais aceitos" icon="recycling" value={form.categories} onChange={(value) => setForm((current) => ({ ...current, categories: value }))} placeholder="Ex: papel, plástico, eletrônicos" />
    <Field label="Horário (opcional)" icon="schedule" value={form.hours} onChange={(value) => setForm((current) => ({ ...current, hours: value }))} placeholder="Ex: segunda a sexta, 8h às 17h" />
  </>;
}

function CollectionPointFormScreen({ onBack, admin = false, onSuccess, point = null }) {
  const editing = admin && Boolean(point);
  const [form, setForm] = useState(() => editing ? collectionPointFormFromPoint(point) : emptyCollectionPointForm());
  const [busy, setBusy] = useState(false);
  const [cepBusy, setCepBusy] = useState(false);
  const heading = editing ? 'Editar ponto de coleta' : admin ? 'Cadastrar ponto de coleta' : 'Conhece um ponto de coleta?';
  const description = editing ? 'Atualize as informações do local. O CEP preenche os dados de endereço automaticamente.' : admin ? 'Cadastre um local verificado. Informe o CEP para preencher o endereço automaticamente.' : 'Informe um endereço público. Buscamos as coordenadas automaticamente e a equipe verifica antes de publicar.';
  const actionLabel = editing ? 'Salvar alterações' : admin ? 'Cadastrar ponto' : 'Enviar sugestão';

  useEffect(() => {
    setForm(editing ? collectionPointFormFromPoint(point) : emptyCollectionPointForm());
    setCepBusy(false);
  }, [editing, point?.id]);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    try {
      const payload = { ...form, categories: form.categories.split(',').map((item) => item.trim()).filter(Boolean) };
      if (editing) await api.updateAdminCollectionPoint(point.id, payload);
      else if (admin) await api.createAdminCollectionPoint(payload);
      else await api.suggestCollectionPoint(payload);
      alert(editing ? 'Ponto de coleta atualizado.' : admin ? 'Ponto de coleta cadastrado e disponível no mapa.' : 'Sugestão enviada. Ela ficará disponível após aprovação da equipe.');
      if (onSuccess) await onSuccess();
      else onBack();
    } catch (error) { alert(error.message); } finally { setBusy(false); }
  }

  return <div className={admin ? 'admin-screen' : 'subpage'}><UnifiedTopbar onBack={onBack} /><main className="page suggestion-page"><section className={`composer-card collection-point-form-card${editing ? ' is-editing' : ''}`}><span className="eyebrow">{admin ? 'Administração' : 'Mapa colaborativo'}</span><h2>{heading}</h2><p>{description}</p>{editing ? <div className="point-editor-status"><span className="material-symbols-outlined">edit_location_alt</span><span><strong>{point.name}</strong><small>Revise os dados e salve quando terminar.</small></span></div> : null}<form className="composer-form" onSubmit={submit}><CollectionPointFormFields form={form} setForm={setForm} cepBusy={cepBusy} setCepBusy={setCepBusy} editing={editing} /><div className={`collection-point-form-actions${editing ? ' is-editing' : ''}`}>{editing ? <button className="ghost-btn" type="button" onClick={onBack} disabled={busy || cepBusy}><span className="material-symbols-outlined">close</span>Cancelar</button> : null}<button className={`primary-btn${editing ? '' : ' full'}`} type="submit" disabled={busy || cepBusy}>{busy ? (editing ? 'Salvando alterações...' : admin ? 'Cadastrando ponto...' : 'Enviando sugestão...') : cepBusy ? 'Consultando CEP...' : actionLabel}<span className="material-symbols-outlined">{editing ? 'save' : 'send'}</span></button></div></form></section></main></div>;
}

function SuggestCollectionPointScreen({ onBack }) {
  return <CollectionPointFormScreen onBack={onBack} />;
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

function MapCenterTracker({ onChange }) {
  useMapEvents({
    dragend(event) {
      const center = event.target.getCenter();
      onChange([center.lat, center.lng]);
    }
  });
  return null;
}

function RouteViewport({ positions }) {
  const map = useMap();
  useEffect(() => {
    if (!positions?.length) return;
    map.fitBounds(positions, {
      paddingTopLeft: [28, 112],
      paddingBottomRight: [28, 285],
      maxZoom: 14
    });
  }, [map, positions]);
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
        <div className="settings-layout">
          <aside className="settings-menu" aria-label="Seções de configurações">
            <button className={`settings-menu-item ${activeSection === 'perfil' ? 'active' : ''}`} onClick={() => setActiveSection('perfil')}><span className="material-symbols-outlined">person</span><span><strong>Meu perfil</strong></span></button>
            <button className={`settings-menu-item ${activeSection === 'seguranca' ? 'active' : ''}`} onClick={() => setActiveSection('seguranca')}><span className="material-symbols-outlined">shield</span><span><strong>Segurança</strong></span></button>
            <button className={`settings-menu-item ${activeSection === 'notificacoes' ? 'active' : ''}`} onClick={() => setActiveSection('notificacoes')}><span className="material-symbols-outlined">notifications</span><span><strong>Notificações</strong></span></button>
          </aside>
          <div className="settings-content">
            {activeSection === 'perfil' ? <section className="settings-profile-banner">
              <div className="settings-avatar">{profile?.user?.avatar ? <img src={profile.user.avatar} alt={profile.user.name || 'Foto de perfil'} /> : <span className="material-symbols-outlined">person</span>}</div>
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
              <section className="settings-actions" aria-label="Ações da conta">
                <button className="danger-btn" onClick={signOut}><span className="material-symbols-outlined">exit_to_app</span>Sair da conta</button>
                <button className="danger-btn" onClick={removeAccount}><span className="material-symbols-outlined">person_remove</span>Excluir minha conta</button>
              </section>
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
  const [pointEditor, setPointEditor] = useState(null);

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
  if (pointEditor) return <CollectionPointFormScreen key={pointEditor.point?.id || 'new'} admin point={pointEditor.point} onBack={() => setPointEditor(null)} onSuccess={() => { setPointEditor(null); setTab('Pontos'); void load(); }} />;
  const totals = dashboard?.totals || {};
  function createCollectionPoint() { setPointEditor({ point: null }); }
  function editCollectionPoint(point) { setPointEditor({ point }); }
  async function removeCollectionPoint(point) {
    if (!window.confirm(`Excluir o ponto "${point.name}"?`)) return;
    try { await api.removeAdminCollectionPoint(point.id); await load(); } catch (error) { alert(error.message); }
  }
  return <div className="admin-screen"><UnifiedTopbar onBack={onBack} /><main className="page admin-page"><div className="segmented-tabs admin-tabs">{['Visão geral', 'Usuários', 'Anúncios', 'Denúncias', 'Pontos'].map((item) => <button key={item} className={tab === item ? 'active' : ''} onClick={() => setTab(item)}>{item}</button>)}</div>{tab === 'Visão geral' ? <><section className="admin-metrics">{[['group', totals.totalUsers, 'Usuários'], ['bolt', totals.activeUsers, 'Ativos (30 dias)'], ['inventory_2', totals.totalPosts, 'Anúncios'], ['volunteer_activism', totals.donations, 'Doações'], ['swap_horiz', totals.exchanges, 'Trocas'], ['flag', totals.reports, 'Denúncias pendentes']].map(([icon, value, label]) => <article key={label}><span className="material-symbols-outlined">{icon}</span><strong>{value || 0}</strong><small>{label}</small></article>)}</section><section className="admin-section"><h2>Categorias mais publicadas</h2>{dashboard?.categories?.map((item) => <div className="admin-row" key={item.category}><span>{item.category}</span><strong>{item.count}</strong></div>)}</section></> : null}{tab === 'Usuários' ? <section className="admin-section">{users.map((user) => <article className="admin-row" key={user.id}><div><strong>{user.name}</strong><small>{user.email} · {user.city}</small></div><button className={`admin-action-button ${user.suspended ? 'admin-action-reactivate' : 'admin-action-suspend'}`} onClick={async () => { await api.setUserSuspension(user.id, !user.suspended); load(); }}><span className="material-symbols-outlined">{user.suspended ? 'person_check' : 'person_off'}</span>{user.suspended ? 'Reativar' : 'Suspender'}</button></article>)}</section> : null}{tab === 'Anúncios' ? <section className="admin-section">{posts.map((post) => <article className="admin-row" key={post.id}><div><strong>{post.title}</strong><small>{post.author?.name} · {post.status}</small></div><button className="admin-action-button admin-action-remove" onClick={async () => { if (window.confirm('Remover este anúncio?')) { await api.removeAdminPost(post.id); load(); } }}><span className="material-symbols-outlined">delete</span>Remover</button></article>)}</section> : null}{tab === 'Denúncias' ? <section className="admin-section">{reports.length ? reports.map((report) => <article className="admin-row report-row" key={report.id}><div><strong>{report.reason} · {report.targetType}</strong><small>{report.reporterName} · {report.details || 'Sem detalhes'}</small></div><select value={report.status} onChange={async (event) => { await api.updateReport(report.id, event.target.value); load(); }}><option value="pending">Pendente</option><option value="reviewed">Em análise</option><option value="resolved">Resolvida</option><option value="dismissed">Descartada</option></select></article>) : <EmptyState icon="flag" title="Nenhuma denúncia" text="A central está em dia." />}</section> : null}{tab === 'Pontos' ? <section className="admin-section"><div className="admin-section-heading"><h2>Pontos cadastrados</h2><button className="primary-btn compact" onClick={createCollectionPoint}><span className="material-symbols-outlined">add_location_alt</span>Novo ponto</button></div>{points.points?.length ? points.points.map((point) => <article className="admin-row" key={point.id}><div><strong>{point.name}</strong><small>{point.location} · {point.categories.join(', ')}</small></div><div className="admin-point-actions"><button className="secondary-btn admin-point-edit" onClick={() => editCollectionPoint(point)}><span className="material-symbols-outlined">edit</span>Editar</button><button className="danger-btn admin-point-delete" onClick={() => removeCollectionPoint(point)}><span className="material-symbols-outlined">delete</span>Excluir</button></div></article>) : <EmptyState icon="location_off" title="Nenhum ponto cadastrado" text="Cadastre o primeiro ponto verificado." />}<h2>Sugestões da comunidade</h2>{points.suggestions?.length ? points.suggestions.map((point) => <article className="admin-row" key={point.id}><div><strong>{point.name}</strong><small>{point.location} · {point.categories.join(', ')}</small></div>{point.status === 'pending' ? <div><button className="secondary-btn" onClick={async () => { await api.reviewPointSuggestion(point.id, 'rejected'); load(); }}>Recusar</button><button className="primary-btn" onClick={async () => { await api.reviewPointSuggestion(point.id, 'approved'); load(); }}>Aprovar</button></div> : <span>{point.status}</span>}</article>) : <EmptyState icon="add_location_alt" title="Nenhuma sugestão pendente" text="Novas sugestões aparecerão aqui." />}</section> : null}</main></div>;
}

function AboutScreen({ onBack }) {
  return <div className="about-screen"><UnifiedTopbar onBack={onBack} /><main className="page about-page"><section className="about-hero"><span className="material-symbols-outlined">recycling</span><span className="eyebrow">Economia circular</span><h1>Objetos podem ganhar novas histórias.</h1><p>O ReUsa+ conecta pessoas que desejam desapegar, reutilizar e descartar de forma responsável.</p></section><section><h2>O que é o ReUsa+?</h2><p>Uma rede colaborativa para encontrar quem precisa de algo que você não utiliza mais, estimular a reutilização e aproximar a comunidade de pontos de coleta.</p></section><section><h2>Como funciona?</h2><ol><li>Publique algo que não utiliza mais.</li><li>Pessoas próximas demonstram interesse.</li><li>Combine a entrega pelo chat.</li><li>Finalize a doação ou troca.</li><li>O item ganha nova utilidade em vez de ser descartado.</li></ol></section><section><h2>Por que reutilizar?</h2><p>Reutilizar prolonga a vida útil dos itens, evita descarte desnecessário e fortalece uma economia mais circular e solidária.</p></section></main></div>;
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
