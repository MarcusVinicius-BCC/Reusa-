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
    if (!session && !['/splash', '/onboarding', '/login', '/criar-conta'].includes(location.pathname)) {
      navigate('/login', { replace: true });
    }
  }, [session, location.pathname, navigate]);

  if (!initialized) return <div className="loading-stage"><span className="material-symbols-outlined">recycling</span><p>Carregando seu espaço...</p></div>;
  return <ScreenRouter location={location.pathname} navigate={navigate} />;
}

function ScreenRouter({ location, navigate }) {
  switch (location) {
    case '/':
      return <Navigate to="/splash" replace />;
    case '/splash':
      return <SplashScreen onContinue={() => navigate('/onboarding')} />;
    case '/onboarding':
      return <OnboardingScreen onSkip={() => navigate('/login')} onStart={() => navigate('/login')} />;
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
      return <NotificationsScreen onBack={() => navigate('/feed')} />;
    case '/mensagens':
      return <MessagesScreen onOpenThread={(threadId) => navigate(`/mensagens/ana?thread=${threadId || 'thread-ana-notebook'}`)} />;
    case '/mensagens/ana':
      return <ChatScreen onBack={() => navigate('/mensagens')} />;
    case '/nova-publicacao':
      return <CreatePostScreen onBack={() => navigate('/feed')} onSuccess={() => navigate('/feed')} />;
    case '/perfil':
      return <ProfileScreen onGoToFeed={() => navigate('/feed')} onSettings={() => navigate('/configuracoes')} />;
    case '/mapa':
      return <MapScreen />;
    case '/configuracoes':
      return <SettingsScreen onBack={() => navigate('/perfil')} onLogout={() => navigate('/login')} />;
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
    <nav className="bottom-nav">
      {[
        ['home', 'Início', 'home'],
        ['explore', 'Explorar', 'explore'],
        ['post', '', 'add'],
        ['map', 'Mapa', 'map'],
        ['profile', 'Perfil', 'person']
      ].map(([key, label, icon]) => {
        const to = nav[key] || navRoutes[key];
        const isAdd = key === 'post';
        return (
          <button
            key={key}
            className={isAdd ? 'nav-add' : active === to ? 'nav-item nav-active' : 'nav-item'}
            onClick={() => {
              window.history.pushState({}, '', to);
              window.dispatchEvent(new PopStateEvent('popstate'));
            }}
          >
            <span className="material-symbols-outlined">{icon}</span>
            {label ? <span>{label}</span> : null}
          </button>
        );
      })}
    </nav>
  );
}

function SplashScreen({ onContinue }) {
  return (
    <div className="center-stage splash-stage" onClick={onContinue} role="button" tabIndex={0}>
      <div className="splash-orb" />
      <div className="logo-badge">
        <img src="https://lh3.googleusercontent.com/aida-public/AB6AXuBOFtyytVWbcN0yp6q-fl1hVuGZc2T-IkiFJZf1JbR8gICaEsLcjvzh0cLTnlkKeFXV0eKB8KGySBJZVI32kemRvuIBroTd7scTzBKsKAYOVCfa27zNu5caOKkTqvovxOyQ64Hoh9gB58Eu8W4bd4FZS_59Jns0yBzldcGWwM1XKO7g8GkM1st1X_H57AEQuitrAETSMgGC_lQ-c8kQ1BhbADOsMOBfKWBjs-xlaG5uL2-op8eOGdUN" alt="REUSA+" />
      </div>
      <h1>REUSA+</h1>
      <p>Desapegue. Reutilize. Reconecte.</p>
      <button className="primary-btn">Entrar</button>
    </div>
  );
}

function OnboardingScreen({ onSkip, onStart }) {
  return (
    <Shell nav={{ home: '/login', explore: '/mapa', post: '/nova-publicacao', map: '/mapa', profile: '/perfil' }} active="/onboarding">
      <div className="hero-card">
        <span className="eyebrow">Economia circular</span>
        <h1>Desapegue e encontre um novo destino para seus itens.</h1>
        <p>Uma experiência limpa, social e funcional, com a mesma identidade visual do protótipo.</p>
        <div className="hero-actions">
          <button className="ghost-btn" onClick={onSkip}>Pular</button>
          <button className="primary-btn" onClick={onStart}>Começar</button>
        </div>
      </div>
    </Shell>
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
        <div className="auth-logo"><img src="https://lh3.googleusercontent.com/aida/AEtjO1VOja6lawait8cD7S4qIsbQT98rITCBL6-POGM3Xx0XjHBo5cAU4kPuywpjwlZoU_y6mmt78ljE-YUp9F773y7Z2Oa6Ve8eiRe7o7q_FSCqHh4RDQRkqXF-qFmWwPB6tdbSl3y2Ih37wzyRcRd4UqnnLybL_2ZAMcWMTPY7ua2MjgD3RzNkykyWgJPAfwsciiNoasg-mgoQNU4TCU0Yvz60CZ6T4Yfg3TsAAHs_dv1SPtQfPYynmlvcEwc" alt="REUSA+ Logo" /></div>
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
  const search = useAppStore((state) => state.search);
  const setSearch = useAppStore((state) => state.setSearch);
  const loadFeed = useAppStore((state) => state.loadFeed);
  const [category, setCategory] = useState('Todos');
  const [notificationCount, setNotificationCount] = useState(0);
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
    api.notifications().then((result) => setNotificationCount(result.unreadCount || 0)).catch(() => {});
  }, [loadFeed]);

  return (
    <Shell nav={navRoutes} active="/feed">
      <header className="topbar">
        <div className="brand"><img src="https://lh3.googleusercontent.com/aida-public/AB6AXuBOFtyytVWbcN0yp6q-fl1hVuGZc2T-IkiFJZf1JbR8gICaEsLcjvzh0cLTnlkKeFXV0eKB8KGySBJZVI32kemRvuIBroTd7scTzBKsKAYOVCfa27zNu5caOKkTqvovxOyQ64Hoh9gB58Eu8W4bd4FZS_59Jns0yBzldcGWwM1XKO7g8GkM1st1X_H57AEQuitrAETSMgGC_lQ-c8kQ1BhbADOsMOBfKWBjs-xlaG5uL2-op8eOGdUN" alt="REUSA+" /><span>REUSA+</span></div>
        <label className="searchbar"><span className="material-symbols-outlined">search</span><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search" /></label>
        <div className="topbar-actions"><button className="icon-btn notification-btn" onClick={() => { api.readNotifications().catch(() => {}); setNotificationCount(0); onNavigate('/notificacoes'); }} aria-label="Notificações"><span className="material-symbols-outlined">notifications</span>{notificationCount ? <b>{notificationCount}</b> : null}</button><button className="avatar-btn" onClick={() => onNavigate('/perfil')}><img src="https://lh3.googleusercontent.com/aida-public/AB6AXuDfKn67wUHUzena6GPilhlMnfDTrX-AWCwJhpH14zxiCoejXVjCmxTucAueuPpn8n-U7rlurleOutdAv9CDYPpbq_d_piVERXOSL9LlJEldAYneOM-xWur8isWTqBuxA_ft7dzi7Timk6eUEJCDUm4nfvwZJ8jrPK8xrShXRX2SD8w4XW2jVbrB8or5gfnOPiF82d6nji601xBCm_Ngt9MkRuR_c4rTOstyZqS4B3TfM7ejEF6ZgsGV" alt="Profile" /></button></div>
      </header>
      <main className="feed-page">
        <CategoryBar selected={category} onChange={setCategory} />
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

function NotificationsScreen({ onBack }) {
  const [notifications, setNotifications] = useState([]);
  useEffect(() => { api.notifications().then((result) => setNotifications(result.notifications || [])).catch(() => {}); }, []);
  return <Shell nav={navRoutes} active="/notificacoes"><header className="topbar compact-topbar"><button className="back-btn" onClick={onBack}><span className="material-symbols-outlined">arrow_back_ios_new</span></button><h1>Notificações</h1></header><main className="page padded-top"><div className="notification-list">{notifications.length ? notifications.map((notification) => <article className="notification-item" key={notification.id}><span className="notification-icon material-symbols-outlined">{notification.type === 'message' ? 'chat' : notification.type === 'comment' ? 'chat_bubble' : 'favorite'}</span><div><strong>{notification.title}</strong><p>{notification.text}</p><small>{new Date(notification.createdAt).toLocaleString('pt-BR')}</small></div></article>) : <div className="empty-state"><span className="material-symbols-outlined">notifications_none</span><h2>Tudo em dia</h2><p>Você ainda não tem notificações.</p></div>}</div></main></Shell>;
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
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  async function ask(event) {
    event.preventDefault();
    if (!prompt.trim()) return;
    setBusy(true);
    try {
      const response = await api.aiIdeas(prompt);
      setResult(response.idea);
    } catch (error) {
      alert(error.message);
    } finally {
      setBusy(false);
    }
  }

  return <div className="ai-page"><header className="topbar compact-topbar"><button className="back-btn" onClick={onBack}><span className="material-symbols-outlined">arrow_back_ios_new</span></button><h1>Ana IA</h1><span className="ai-status">online</span></header><main className="ai-content"><div className="ai-hero"><span className="ai-icon material-symbols-outlined">auto_awesome</span><span className="eyebrow">Assistente de reaproveitamento</span><h2>O que você tem em casa?</h2><p>Conte sobre materiais, objetos ou sobras. A Ana sugere uma ideia prática para dar tudo um novo destino.</p></div><form className="ai-form" onSubmit={ask}><textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Ex: tenho garrafas de vidro e barbante" rows={3} /><button className="primary-btn full" disabled={busy}>{busy ? 'Pensando...' : 'Gerar ideia'}<span className="material-symbols-outlined">arrow_forward</span></button></form>{result ? <section className="ai-result"><span className="eyebrow">Sugestão da Ana</span><h2>{result.title}</h2><p>{result.summary}</p><div className="ai-facts"><div><strong>Tempo</strong><span>{result.time}</span></div><div><strong>Materiais</strong><span>{result.materials.join(', ')}</span></div></div><h3>Como fazer</h3><ol>{result.steps.map((step) => <li key={step}>{step}</li>)}</ol><div className="ai-care"><span className="material-symbols-outlined">health_and_safety</span><span>{result.care}</span></div></section> : <div className="ai-prompts"><span>Tente perguntar:</span><button onClick={() => setPrompt('tenho garrafas de vidro')}>garrafas de vidro</button><button onClick={() => setPrompt('tenho madeira e pallet')}>madeira e pallet</button><button onClick={() => setPrompt('tenho latas de alumínio')}>latas</button></div>}</main></div>;
}

function CategoryBar({ selected, onChange }) {
  const items = ['Todos', 'Eletrônicos', 'Roupas', 'Móveis', 'Livros', 'Plástico'];
  return <div className="category-scroll">{items.map((item) => <button key={item} onClick={() => onChange(item)} className={selected === item ? 'pill pill-active' : 'pill'}>{item}</button>)}</div>;
}

function FeedCard({ post, onOpenChat }) {
  const toggleLike = useAppStore((state) => state.toggleLike);
  const deletePost = useAppStore((state) => state.deletePost);
  const session = useAppStore((state) => state.session);
  const [liked, setLiked] = useState(Boolean(post.liked));
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
        <img className="avatar" src={post.author.avatar} alt={post.author.name} />
        <div className="post-meta"><strong>{post.author.name}</strong><span>Há 2 horas • {post.author.city}</span></div>
        {post.authorId === session?.id ? <button className="icon-btn" onClick={removePost} title="Excluir anúncio" aria-label="Excluir anúncio"><span className="material-symbols-outlined">delete</span></button> : null}
      </div>
      <div className="post-image-wrap">
        <img className="post-image" src={post.imageUrl} alt={post.title} />
        <div className="chip-float"><span className="material-symbols-outlined">{post.chipIcon}</span>{post.chipLabel}</div>
      </div>
      <div className="post-body">
        <h3>{post.title}</h3>
        <p>{post.description}</p>
        <div className="tag-row"><span>{post.category}</span><span>{post.condition}</span></div>
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
    const messageText = text.trim();
    await sendMessage(threadId, { text: messageText });
    setMessages((current) => [...current, { id: Date.now(), sender_id: session?.id, text: messageText, sent_at: new Date().toISOString() }]);
    setText('');
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

  async function submit(event) {
    event.preventDefault();
    if (!postForm.title?.trim() || !postForm.description?.trim()) return;
    try {
      await createPost({ ...postForm, image });
      setPostForm({});
      onSuccess();
    } catch (error) {
      alert(error.message);
    }
  }

  return (
    <div className="post-screen">
      <header className="topbar compact-topbar"><button className="back-btn" onClick={onBack}><span className="material-symbols-outlined">arrow_back_ios_new</span></button><h1>Post</h1></header>
      <main className="page padded-bottom">
        <section className="composer-card">
          <h2>O que você quer dar um novo destino?</h2>
          <p>Compartilhe os detalhes do seu item.</p>
          <form onSubmit={submit} className="composer-form">
            <Field label="Título do item" icon="title" value={postForm.title || ''} onChange={(value) => setPostForm((prev) => ({ ...prev, title: value }))} placeholder="Ex: Cadeira de madeira antiga" />
            <Field label="Descrição" icon="description" value={postForm.description || ''} onChange={(value) => setPostForm((prev) => ({ ...prev, description: value }))} placeholder="Descreva os detalhes..." multiline />
            <label className="field">
              <span>Categoria</span>
              <select value={postForm.category || 'moveis'} onChange={(e) => setPostForm((prev) => ({ ...prev, category: e.target.value }))}>
                <option value="moveis">Móveis</option>
                <option value="eletronicos">Eletrônicos</option>
                <option value="roupas">Roupas</option>
                <option value="livros">Livros</option>
                <option value="outros">Outros</option>
              </select>
            </label>
            <div className="chip-box">
              <label>Condição</label>
              <div className="chip-row">
                <button type="button" className={postForm.condition === 'Novo' || !postForm.condition ? 'chip chip-active' : 'chip'} onClick={() => setPostForm((prev) => ({ ...prev, condition: 'Novo' }))}>Novo</button>
                <button type="button" className={postForm.condition === 'Bom estado' ? 'chip chip-active' : 'chip'} onClick={() => setPostForm((prev) => ({ ...prev, condition: 'Bom estado' }))}>Bom estado</button>
                <button type="button" className={postForm.condition === 'Marcas de uso' ? 'chip chip-active' : 'chip'} onClick={() => setPostForm((prev) => ({ ...prev, condition: 'Marcas de uso' }))}>Marcas de uso</button>
                <button type="button" className={postForm.condition === 'Para conserto' ? 'chip chip-active' : 'chip'} onClick={() => setPostForm((prev) => ({ ...prev, condition: 'Para conserto' }))}>Para conserto</button>
              </div>
            </div>
            <div className="dual-choice">
              <button type="button" className={postForm.goal !== 'Troca' ? 'choice choice-active' : 'choice'} onClick={() => setPostForm((prev) => ({ ...prev, goal: 'Doação' }))}>Doar</button>
              <button type="button" className={postForm.goal === 'Troca' ? 'choice choice-active' : 'choice'} onClick={() => setPostForm((prev) => ({ ...prev, goal: 'Troca' }))}>Trocar</button>
            </div>
            <Field label="Localização" icon="location_on" value={postForm.location || session?.city || ''} onChange={(value) => setPostForm((prev) => ({ ...prev, location: value }))} placeholder="Usar minha localização atual" />
            <label className="upload-field"><span className="material-symbols-outlined">add_photo_alternate</span><span>{image?.name || 'Adicionar foto do item'}</span><input type="file" accept="image/*" onChange={(event) => setImage(event.target.files?.[0] || null)} /></label>
            <button type="submit" className="primary-btn full">Publicar anúncio <span className="material-symbols-outlined">send</span></button>
          </form>
        </section>
      </main>
    </div>
  );
}

function ProfileScreen({ onGoToFeed, onSettings }) {
  const data = useAppStore((state) => state.profile);
  const posts = useAppStore((state) => state.posts);
  const session = useAppStore((state) => state.session);
  const loadProfile = useAppStore((state) => state.loadProfile);
  const user = data?.user || session || { name: 'Seu perfil', city: 'Sua cidade', avatar: 'https://ui-avatars.com/api/?name=Reusa&background=00d67d&color=ffffff' };
  const stats = data?.stats || { donations: 0, received: 0, rating: 0, carbonSavedPercent: 0 };
  const achievements = data?.achievements || user.achievements || [];

  useEffect(() => {
    loadProfile().catch(() => {});
  }, [loadProfile]);

  return (
    <Shell nav={navRoutes} active="/perfil">
      <main className="page profile-page">
        <section className="profile-header">
          <div className="avatar-wrap"><img src={user.avatar} alt={user.name} /><span className="verified material-symbols-outlined">verified</span></div>
          <h1>{user.name}</h1>
          <div className="subtle-row"><span className="material-symbols-outlined">location_on</span><span>{user.city}</span></div>
        </section>
        <section className="stats-row">
          <Stat value={stats.donations} label="Doações" tone="primary" />
          <Stat value={stats.received} label="Recebidos" tone="secondary" />
          <Stat value={stats.rating ? stats.rating.toFixed(1) : 'Nova'} label="Avaliação" tone="primary" star={Boolean(stats.rating)} />
        </section>
        <section className="impact-card">
          <div className="impact-head"><h2>Meu Impacto</h2></div>
          <div className="impact-grid">
            <MiniImpact icon="inventory_2" value={stats.donations} label="Anúncios publicados" />
            <MiniImpact icon="eco" value={`${stats.carbonSavedPercent || 0}%`} label="Impacto registrado" />
          </div>
          <div className="tracker">
            <div><span>Meta de carbono salvo</span><span>{stats.carbonSavedPercent || 0}%</span></div>
            <div className="tracker-bar"><div style={{ width: `${stats.carbonSavedPercent || 0}%` }} /></div>
          </div>
        </section>
        <section className="badge-row">
          {(achievements.length ? achievements : ['Novo membro']).map((achievement, index) => <Badge key={achievement} tone={['mint', 'coral', 'stone'][index % 3]} icon={achievement === 'Novo membro' ? 'person_add' : 'workspace_premium'} label={achievement} />)}
        </section>
        <section className="tabs">
          <button className="tab tab-active" onClick={onGoToFeed}>Publicações</button>
          <button className="tab">Salvos</button>
          <button className="tab" onClick={onSettings}>Config</button>
        </section>
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

function MapScreen() {
  const collectionPoints = useAppStore((state) => state.collectionPoints);
  const session = useAppStore((state) => state.session);
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
    }
  }, [loadCollectionPointsNearby, session?.city]);

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
          </div>
          <div className="map-actions">
            <button className="ghost-btn" onClick={() => selectedPoint && alert(`${selectedPoint.name}\n${selectedPoint.location}`)}>Ver detalhes</button>
            <a className="primary-btn" href={selectedPoint ? `https://www.openstreetmap.org/directions?to=${selectedPoint.latitude}%2C${selectedPoint.longitude}` : '#'} target="_blank" rel="noreferrer">Como chegar <span className="material-symbols-outlined">navigation</span></a>
          </div>
        </div> : <button className="map-reopen" onClick={() => setSelectedPoint(visiblePoints[0] || null)}><span className="material-symbols-outlined">info</span>Mostrar ponto selecionado</button>}
      </main>
    </Shell>
  );
}

function RecenterMap({ position }) {
  const map = useMap();
  useEffect(() => map.flyTo(position, 14), [map, position]);
  return null;
}

function MapViewport({ position }) {
  const map = useMap();
  useEffect(() => map.flyTo(position, 12), [map, position]);
  return null;
}

function SettingsScreen({ onBack, onLogout }) {
  const profile = useAppStore((state) => state.profile);
  const updateProfile = useAppStore((state) => state.updateProfile);
  const logout = useAppStore((state) => state.logout);
  const [form, setForm] = useState({ name: profile?.user?.name || '', city: profile?.user?.city || '', cep: profile?.user?.cep || '', address: profile?.user?.address || '' });

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
          <button className="danger-btn" onClick={signOut}><span className="material-symbols-outlined">logout</span>Sair da conta</button>
        </section>
      </main>
    </Shell>
  );
}

function Field({ label, icon, value, onChange, placeholder, type = 'text', multiline = false }) {
  return (
    <label className="field">
      <span>{label}</span>
      <div className="field-control">
        <span className="material-symbols-outlined">{icon}</span>
        {multiline ? <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={4} /> : <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />}
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
