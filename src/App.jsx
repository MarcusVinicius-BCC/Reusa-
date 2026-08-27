import React, { useEffect, useMemo, useState } from 'react';
import { api, clearToken, getToken, setToken } from './api';
import { fallbackPosts } from './data';

const screenRoutes = {
  '/': '/splash',
  '/splash': '/splash',
  '/onboarding': '/onboarding',
  '/login': '/login',
  '/criar-conta': '/criar-conta',
  '/feed': '/feed',
  '/mensagens': '/mensagens',
  '/mensagens/ana': '/mensagens/ana',
  '/nova-publicacao': '/nova-publicacao',
  '/perfil': '/perfil',
  '/mapa': '/mapa',
  '/configuracoes': '/configuracoes'
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
  mensagens: '/mensagens'
};

function normalizePath(pathname) {
  return screenRoutes[pathname] || pathname || '/feed';
}

function navigate(pathname) {
  window.history.pushState({}, '', pathname);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

function App() {
  const [route, setRoute] = useState(normalizePath(window.location.pathname));
  const [session, setSession] = useState(null);
  const [posts, setPosts] = useState(fallbackPosts);
  const [threads, setThreads] = useState([]);
  const [collectionPoints, setCollectionPoints] = useState([]);
  const [profile, setProfile] = useState(null);
  const [formState, setFormState] = useState({});
  const [search, setSearch] = useState('');

  useEffect(() => {
    const onPop = () => setRoute(normalizePath(window.location.pathname));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    if (getToken()) {
      api.me()
        .then((result) => setSession(result.user))
        .catch(() => clearToken());
    }
  }, []);

  useEffect(() => {
    if (route === '/feed') {
      api.feed().then((result) => setPosts(result.posts || fallbackPosts)).catch(() => setPosts(fallbackPosts));
    }
    if (route === '/mensagens') {
      api.threads().then((result) => setThreads(result.threads || [])).catch(() => setThreads([]));
    }
    if (route === '/perfil') {
      api.profile().then((result) => setProfile(result)).catch(() => setProfile(null));
    }
    if (route === '/mapa') {
      api.collectionPoints().then((result) => setCollectionPoints(result.collectionPoints || [])).catch(() => setCollectionPoints([]));
    }
  }, [route]);

  const filteredPosts = useMemo(() => {
    if (!search) {
      return posts;
    }

    const query = search.toLowerCase();
    return posts.filter((post) => [post.title, post.description, post.category, post.author?.name].some((value) => String(value || '').toLowerCase().includes(query)));
  }, [posts, search]);

  function handleAuthLogin(event) {
    event.preventDefault();
    const body = {
      email: formState.email || '',
      password: formState.password || ''
    };

    api.login(body)
      .then((result) => {
        setToken(result.token);
        setSession(result.user);
        navigate('/feed');
      })
      .catch((error) => alert(error.message));
  }

  function handleRegister(event) {
    event.preventDefault();
    api.register({
      name: formState.name || '',
      email: formState.email || '',
      password: formState.password || '',
      city: formState.city || '',
      interests: formState.interests || []
    })
      .then((result) => {
        setToken(result.token);
        setSession(result.user);
        navigate('/feed');
      })
      .catch((error) => alert(error.message));
  }

  function handleCreatePost(event) {
    event.preventDefault();
    api.createPost({
      title: formState.title || '',
      description: formState.description || '',
      category: formState.category || 'outros',
      condition: formState.condition || 'Bom estado',
      goal: formState.goal || 'Doação',
      location: formState.location || session?.city || 'Santarém, PA',
      chipLabel: formState.goal || 'Doação',
      chipIcon: formState.goal === 'Troca' ? 'swap_horiz' : 'volunteer_activism'
    })
      .then(() => navigate('/feed'))
      .catch((error) => alert(error.message));
  }

  function renderScreen() {
    switch (route) {
      case '/splash':
        return <SplashScreen onContinue={() => navigate('/onboarding')} />;
      case '/onboarding':
        return <OnboardingScreen onSkip={() => navigate('/login')} onStart={() => navigate('/login')} />;
      case '/login':
        return <LoginScreen formState={formState} setFormState={setFormState} onSubmit={handleAuthLogin} onGoToRegister={() => navigate('/criar-conta')} />;
      case '/criar-conta':
        return <RegisterScreen formState={formState} setFormState={setFormState} onSubmit={handleRegister} onGoToLogin={() => navigate('/login')} />;
      case '/feed':
        return <FeedScreen search={search} setSearch={setSearch} posts={filteredPosts} onNavigate={navigate} />;
      case '/mensagens':
        return <MessagesScreen threads={threads} onOpenThread={() => navigate('/mensagens/ana')} />;
      case '/mensagens/ana':
        return <ChatScreen onBack={() => navigate('/mensagens')} onSend={(text) => api.sendMessage('thread-ana-notebook', { text })} />;
      case '/nova-publicacao':
        return <CreatePostScreen formState={formState} setFormState={setFormState} onSubmit={handleCreatePost} onBack={() => navigate('/feed')} />;
      case '/perfil':
        return <ProfileScreen data={profile} onGoToFeed={() => navigate('/feed')} />;
      case '/mapa':
        return <MapScreen points={collectionPoints} onGoToFeed={() => navigate('/feed')} />;
      case '/configuracoes':
        return <SettingsScreen onBack={() => navigate('/perfil')} />;
      default:
        return <FeedScreen search={search} setSearch={setSearch} posts={filteredPosts} onNavigate={navigate} />;
    }
  }

  return (
    <div className="app-shell">
      {renderScreen()}
    </div>
  );
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
          <button key={key} className={isAdd ? 'nav-add' : active === to ? 'nav-item nav-active' : 'nav-item'} onClick={() => navigate(to)}>
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

function LoginScreen({ formState, setFormState, onSubmit, onGoToRegister }) {
  return (
    <div className="auth-layout">
      <div className="auth-card">
        <div className="auth-logo"><img src="https://lh3.googleusercontent.com/aida/AEtjO1VOja6lawait8cD7S4qIsbQT98rITCBL6-POGM3Xx0XjHBo5cAU4kPuywpjwlZoU_y6mmt78ljE-YUp9F773y7Z2Oa6Ve8eiRe7o7q_FSCqHh4RDQRkqXF-qFmWwPB6tdbSl3y2Ih37wzyRcRd4UqnnLybL_2ZAMcWMTPY7ua2MjgD3RzNkykyWgJPAfwsciiNoasg-mgoQNU4TCU0Yvz60CZ6T4Yfg3TsAAHs_dv1SPtQfPYynmlvcEwc" alt="REUSA+ Logo" /></div>
        <h2>Bem-vindo de volta!</h2>
        <p>Pronto para causar impacto hoje?</p>
        <form onSubmit={onSubmit} className="auth-form">
          <Field label="E-mail" icon="mail" value={formState.email || ''} onChange={(value) => setFormState((prev) => ({ ...prev, email: value }))} placeholder="seu@email.com" />
          <Field label="Senha" icon="lock" type="password" value={formState.password || ''} onChange={(value) => setFormState((prev) => ({ ...prev, password: value }))} placeholder="••••••••" />
          <button type="submit" className="primary-btn full">Entrar <span className="material-symbols-outlined">arrow_forward</span></button>
        </form>
        <div className="auth-footer">Não tem uma conta? <button className="text-btn" onClick={onGoToRegister}>Cadastre-se</button></div>
      </div>
    </div>
  );
}

function RegisterScreen({ formState, setFormState, onSubmit, onGoToLogin }) {
  const interests = ['Eletrônicos', 'Roupas', 'Móveis', 'Livros', 'Outros'];
  return (
    <div className="auth-layout">
      <div className="auth-card large">
        <h2>Crie sua conta</h2>
        <p>Junte-se à maior comunidade de economia circular.</p>
        <form onSubmit={onSubmit} className="auth-form">
          <Field label="Nome completo" icon="person" value={formState.name || ''} onChange={(value) => setFormState((prev) => ({ ...prev, name: value }))} placeholder="Como devemos chamar você?" />
          <Field label="E-mail" icon="mail" value={formState.email || ''} onChange={(value) => setFormState((prev) => ({ ...prev, email: value }))} placeholder="seu@email.com.br" />
          <Field label="Senha" icon="lock" type="password" value={formState.password || ''} onChange={(value) => setFormState((prev) => ({ ...prev, password: value }))} placeholder="Mínimo 8 caracteres" />
          <Field label="Cidade" icon="location_on" value={formState.city || ''} onChange={(value) => setFormState((prev) => ({ ...prev, city: value }))} placeholder="Ex: São Paulo, SP" />
          <div className="chip-box">
            <label>O que você mais se interessa em reutilizar?</label>
            <div className="chip-row">
              {interests.map((interest) => {
                const selected = (formState.interests || []).includes(interest);
                return (
                  <button key={interest} type="button" className={selected ? 'chip chip-active' : 'chip'} onClick={() => setFormState((prev) => {
                    const current = prev.interests || [];
                    return { ...prev, interests: current.includes(interest) ? current.filter((item) => item !== interest) : [...current, interest] };
                  })}>{interest}</button>
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

function FeedScreen({ search, setSearch, posts, onNavigate }) {
  return (
    <Shell nav={navRoutes} active="/feed">
      <header className="topbar">
        <div className="brand"><img src="https://lh3.googleusercontent.com/aida-public/AB6AXuBOFtyytVWbcN0yp6q-fl1hVuGZc2T-IkiFJZf1JbR8gICaEsLcjvzh0cLTnlkKeFXV0eKB8KGySBJZVI32kemRvuIBroTd7scTzBKsKAYOVCfa27zNu5caOKkTqvovxOyQ64Hoh9gB58Eu8W4bd4FZS_59Jns0yBzldcGWwM1XKO7g8GkM1st1X_H57AEQuitrAETSMgGC_lQ-c8kQ1BhbADOsMOBfKWBjs-xlaG5uL2-op8eOGdUN" alt="REUSA+" /><span>REUSA+</span></div>
        <label className="searchbar"><span className="material-symbols-outlined">search</span><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search" /></label>
        <button className="avatar-btn" onClick={() => onNavigate('/perfil')}><img src="https://lh3.googleusercontent.com/aida-public/AB6AXuDfKn67wUHUzena6GPilhlMnfDTrX-AWCwJhpH14zxiCoejXVjCmxTucAueuPpn8n-U7rlurleOutdAv9CDYPpbq_d_piVERXOSL9LlJEldAYneOM-xWur8isWTqBuxA_ft7dzi7Timk6eUEJCDUm4nfvwZJ8jrPK8xrShXRX2SD8w4XW2jVbrB8or5gfnOPiF82d6nji601xBCm_Ngt9MkRuR_c4rTOstyZqS4B3TfM7ejEF6ZgsGV" alt="Profile" /></button>
      </header>
      <main className="feed-page">
        <CategoryBar />
        <div className="feed-list">
          {posts.map((post) => <FeedCard key={post.id} post={post} onOpenChat={() => onNavigate('/mensagens/ana')} />)}
        </div>
      </main>
    </Shell>
  );
}

function CategoryBar() {
  const items = ['Todos', 'Eletrônicos', 'Roupas', 'Móveis', 'Livros', 'Plástico'];
  return <div className="category-scroll">{items.map((item, index) => <button key={item} className={index === 0 ? 'pill pill-active' : 'pill'}>{item}</button>)}</div>;
}

function FeedCard({ post, onOpenChat }) {
  return (
    <article className="card post-card">
      <div className="post-head">
        <img className="avatar" src={post.author.avatar} alt={post.author.name} />
        <div className="post-meta"><strong>{post.author.name}</strong><span>Há 2 horas • {post.author.city}</span></div>
        <button className="icon-btn"><span className="material-symbols-outlined">more_horiz</span></button>
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
        <div className="post-stats"><button className="ghost-inline"><span className="material-symbols-outlined">favorite</span>{post.likes}</button><button className="ghost-inline"><span className="material-symbols-outlined">chat_bubble</span>{post.comments}</button></div>
        <button className="primary-btn compact" onClick={onOpenChat}><span className="material-symbols-outlined">handshake</span>{post.goal === 'Troca' ? 'Fazer oferta' : 'Tenho interesse'}</button>
      </div>
    </article>
  );
}

function MessagesScreen({ threads, onOpenThread }) {
  return (
    <Shell nav={navRoutes} active="/mensagens">
      <header className="topbar compact-topbar"><h1>Mensagens</h1><button className="icon-btn"><span className="material-symbols-outlined">search</span></button></header>
      <main className="page padded-top">
        <div className="search-shell"><span className="material-symbols-outlined">search</span><input placeholder="Pesquisar conversas..." /></div>
        <div className="thread-list">
          {(threads.length ? threads : [{ title: 'Ana Costa', subtitle: 'Olá! Tenho interesse nesse aparelho...', time: '14:20', unreadCount: 2 }]).map((thread) => <button key={thread.id || thread.title} className="thread-card" onClick={onOpenThread}><div className="thread-avatar"><span>{(thread.title || 'A').slice(0, 1)}</span></div><div className="thread-content"><div><strong>{thread.title}</strong><span>{thread.time}</span></div><p>{thread.subtitle}</p></div>{thread.unreadCount ? <div className="unread">{thread.unreadCount}</div> : null}</button>)}
        </div>
      </main>
    </Shell>
  );
}

function ChatScreen({ onBack, onSend }) {
  const [text, setText] = useState('');
  const [messages, setMessages] = useState([
    { id: 1, mine: true, text: 'Olá! Tenho interesse nesse aparelho. Ainda está disponível?', time: '10:42' },
    { id: 2, mine: false, text: 'Sim, ainda está disponível.', time: '10:45' }
  ]);

  async function send() {
    if (!text.trim()) return;
    await onSend(text);
    setMessages((current) => [...current, { id: Date.now(), mine: true, text, time: 'Agora' }]);
    setText('');
  }

  return (
    <div className="chat-screen">
      <header className="topbar compact-topbar"><button className="back-btn" onClick={onBack}><span className="material-symbols-outlined">arrow_back_ios_new</span></button><h1>Conversa Direta</h1></header>
      <div className="chat-banner"><img src="https://lh3.googleusercontent.com/aida-public/AB6AXuD2Yt8UCZV3PjzQhY0IRhfZ8fhxt2-1023KsI5RudFqBRuj0uDTidKC4KXxG5DYeOdqYiOqUmHKuUGbX2_anxp7v2g9mToB86gBq7mYJxPrM2LEK_lqRLFUtFYHjCVtuqXVRrIOHS3yA17Jo2hhK8GIQmWQwn9WkNa8UG_sR8ze_ul0Fx-BOmMkY91YhBEmlOHyYP9A6yhty_lqfM8vJ_t__plfmQMSWD9jVzzkhl9ECYLeJ9Nar7YJ" alt="Item" /><div><strong>Notebook antigo para reaproveitamento</strong><span>Combinar com Ana Costa</span></div></div>
      <main className="chat-body">{messages.map((message) => <div key={message.id} className={message.mine ? 'bubble mine' : 'bubble'}><p>{message.text}</p><span>{message.time}</span></div>)}</main>
      <footer className="chat-compose"><textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Digite sua mensagem..." rows={1} /><button className="send-btn" onClick={send}><span className="material-symbols-outlined">send</span></button></footer>
    </div>
  );
}

function CreatePostScreen({ formState, setFormState, onSubmit, onBack }) {
  return (
    <div className="post-screen">
      <header className="topbar compact-topbar"><button className="back-btn" onClick={onBack}><span className="material-symbols-outlined">arrow_back_ios_new</span></button><h1>Post</h1></header>
      <main className="page padded-bottom">
        <section className="composer-card">
          <h2>O que você quer dar um novo destino?</h2>
          <p>Compartilhe os detalhes do seu item.</p>
          <form onSubmit={onSubmit} className="composer-form">
            <Field label="Título do item" icon="title" value={formState.title || ''} onChange={(value) => setFormState((prev) => ({ ...prev, title: value }))} placeholder="Ex: Cadeira de madeira antiga" />
            <Field label="Descrição" icon="description" value={formState.description || ''} onChange={(value) => setFormState((prev) => ({ ...prev, description: value }))} placeholder="Descreva os detalhes..." multiline />
            <label className="field"><span>Categoria</span><select value={formState.category || 'moveis'} onChange={(e) => setFormState((prev) => ({ ...prev, category: e.target.value }))}><option value="moveis">Móveis</option><option value="eletronicos">Eletrônicos</option><option value="roupas">Roupas</option><option value="livros">Livros</option><option value="outros">Outros</option></select></label>
            <div className="chip-box"><label>Condição</label><div className="chip-row"><button type="button" className={formState.condition === 'Novo' || !formState.condition ? 'chip chip-active' : 'chip'} onClick={() => setFormState((prev) => ({ ...prev, condition: 'Novo' }))}>Novo</button><button type="button" className={formState.condition === 'Bom estado' ? 'chip chip-active' : 'chip'} onClick={() => setFormState((prev) => ({ ...prev, condition: 'Bom estado' }))}>Bom estado</button><button type="button" className={formState.condition === 'Marcas de uso' ? 'chip chip-active' : 'chip'} onClick={() => setFormState((prev) => ({ ...prev, condition: 'Marcas de uso' }))}>Marcas de uso</button><button type="button" className={formState.condition === 'Para conserto' ? 'chip chip-active' : 'chip'} onClick={() => setFormState((prev) => ({ ...prev, condition: 'Para conserto' }))}>Para conserto</button></div></div>
            <div className="dual-choice"><button type="button" className={formState.goal !== 'Troca' ? 'choice choice-active' : 'choice'} onClick={() => setFormState((prev) => ({ ...prev, goal: 'Doação' }))}>Doar</button><button type="button" className={formState.goal === 'Troca' ? 'choice choice-active' : 'choice'} onClick={() => setFormState((prev) => ({ ...prev, goal: 'Troca' }))}>Trocar</button></div>
            <Field label="Localização" icon="location_on" value={formState.location || ''} onChange={(value) => setFormState((prev) => ({ ...prev, location: value }))} placeholder="Usar minha localização atual" />
            <button type="submit" className="primary-btn full">Publicar anúncio <span className="material-symbols-outlined">send</span></button>
          </form>
        </section>
      </main>
    </div>
  );
}

function ProfileScreen({ data, onGoToFeed }) {
  const user = data?.user || { name: 'Mariana Silva', city: 'Santarém, PA', avatar: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDfKn67wUHUzena6GPilhlMnfDTrX-AWCwJhpH14zxiCoejXVjCmxTucAueuPpn8n-U7rlurleOutdAv9CDYPpbq_d_piVERXOSL9LlJEldAYneOM-xWur8isWTqBuxA_ft7dzi7Timk6eUEJCDUm4nfvwZJ8jrPK8xrShXRX2SD8w4XW2jVbrB8or5gfnOPiF82d6nji601xBCm_Ngt9MkRuR_c4rTOstyZqS4B3TfM7ejEF6ZgsGV' };
  const stats = data?.stats || { donations: 12, received: 5, rating: 4.8 };
  return (
    <Shell nav={navRoutes} active="/perfil">
      <main className="page profile-page">
        <section className="profile-header">
          <div className="avatar-wrap"><img src={user.avatar} alt={user.name} /><span className="verified material-symbols-outlined">verified</span></div>
          <h1>{user.name}</h1>
          <div className="subtle-row"><span className="material-symbols-outlined">location_on</span><span>{user.city}</span></div>
        </section>
        <section className="stats-row"><Stat value={stats.donations} label="Doações" tone="primary" /><Stat value={stats.received} label="Recebidos" tone="secondary" /><Stat value={stats.rating} label="Avaliação" tone="primary" star /></section>
        <section className="impact-card"><div className="impact-head"><h2>Meu Impacto</h2></div><div className="impact-grid"><MiniImpact icon="devices" value="12" label="Eletrônicos" /><MiniImpact icon="recycling" value="8kg" label="Papel" /></div><div className="tracker"><div><span>Meta de carbono salvo</span><span>65%</span></div><div className="tracker-bar"><div style={{ width: '65%' }} /></div></div></section>
        <section className="badge-row"><Badge tone="mint" icon="local_fire_department" label="Doador Ativo" /><Badge tone="coral" icon="handshake" label="Parceiro Ambiental" /><Badge tone="stone" icon="military_tech" label="Pioneiro" /></section>
        <section className="tabs"><button className="tab tab-active" onClick={onGoToFeed}>Publicações</button><button className="tab">Salvos</button><button className="tab">Contribuições</button></section>
        <section className="profile-grid">
          {fallbackPosts.map((post) => <div key={post.id} className="mini-post"><div className="mini-post-thumb"><img src={post.imageUrl} alt={post.title} /><span>{post.category}</span></div><strong>{post.title}</strong><p>Doado há 2 dias</p></div>)}
        </section>
      </main>
    </Shell>
  );
}

function MapScreen({ points }) {
  return (
    <Shell nav={navRoutes} active="/mapa">
      <main className="map-page">
        <div className="map-overlay" />
        <div className="map-chips"><button className="pill pill-active">Todos</button><button className="pill">Eletrônicos</button><button className="pill">Pilhas</button><button className="pill">Óleo</button><button className="pill">Cooperativas</button></div>
        <div className="map-pin pin-primary"><span className="material-symbols-outlined">recycling</span></div>
        <div className="map-pin pin-secondary"><span className="material-symbols-outlined">memory</span></div>
        <div className="map-pin pin-tertiary"><span className="material-symbols-outlined">opacity</span></div>
        <div className="map-card">
          <div className="map-card-head"><div><span>Centro de coleta</span><h2>{points[0]?.name || 'EcoCentro Santarém'}</h2></div><button className="icon-btn"><span className="material-symbols-outlined">close</span></button></div>
          <div className="map-card-body"><div><span className="material-symbols-outlined">recycling</span><span>{(points[0]?.categories || ['Eletrônicos', 'plástico', 'metal']).join(', ')}</span></div><div><span className="material-symbols-outlined">schedule</span><span>{points[0]?.hours || '08:00 – 17:00'}</span></div></div>
          <div className="map-actions"><button className="ghost-btn">Ver detalhes</button><button className="primary-btn">Como chegar <span className="material-symbols-outlined">navigation</span></button></div>
        </div>
      </main>
    </Shell>
  );
}

function SettingsScreen({ onBack }) {
  return (
    <Shell nav={navRoutes} active="/configuracoes">
      <main className="page settings-page"><button className="back-link" onClick={onBack}>Voltar</button><section className="card"><h2>Configurações</h2><p>Esta tela foi preservada como ponto de entrada para preferências e conta.</p></section></main>
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
  return <div className={`stat stat-${tone}`}>{star ? <div className="stat-rating"><strong>{value}</strong><span className="material-symbols-outlined">star</span></div> : <strong>{value}</strong>}<span>{label}</span></div>;
}

function MiniImpact({ icon, value, label }) {
  return <div className="mini-impact"><span className="material-symbols-outlined">{icon}</span><strong>{value}</strong><p>{label}</p></div>;
}

function Badge({ tone, icon, label }) {
  return <div className={`badge badge-${tone}`}><span className="material-symbols-outlined">{icon}</span><strong>{label}</strong></div>;
}

export { default } from './routes';