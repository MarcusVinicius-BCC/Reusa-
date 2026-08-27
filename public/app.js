(function () {
  const apiBase = window.__REUSA_API__ || '/api';
  const routeMap = window.__REUSA_ROUTES__ || {};
  const currentRoute = window.__REUSA_ROUTE__ || window.location.pathname;
  const tokenKey = 'reusa_token';

  function getToken() {
    return window.localStorage.getItem(tokenKey);
  }

  function setToken(token) {
    window.localStorage.setItem(tokenKey, token);
  }

  function clearToken() {
    window.localStorage.removeItem(tokenKey);
  }

  async function request(path, options = {}) {
    const headers = Object.assign({ 'Content-Type': 'application/json' }, options.headers || {});
    const token = getToken();

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(`${apiBase}${path}`, {
      ...options,
      headers
    });

    const contentType = response.headers.get('content-type') || '';
    const payload = contentType.includes('application/json') ? await response.json() : await response.text();

    if (!response.ok) {
      const message = payload && payload.error ? payload.error : 'Request failed';
      throw new Error(message);
    }

    return payload;
  }

  function navigate(path) {
    window.location.assign(path);
  }

  function routeFor(dataPath, fallback) {
    return routeMap[dataPath] || fallback || '#';
  }

  function bindAnchors() {
    document.querySelectorAll('a').forEach((anchor) => {
      const dataPath = anchor.getAttribute('data-path');

      if (dataPath && (!anchor.getAttribute('href') || anchor.getAttribute('href') === '#')) {
        anchor.setAttribute('href', routeFor(dataPath, '#'));
      }

      if (dataPath && routeMap[dataPath]) {
        anchor.addEventListener('click', (event) => {
          if (anchor.target === '_blank' || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
            return;
          }

          event.preventDefault();
          navigate(routeMap[dataPath]);
        });
      }
    });
  }

  function getSelectedChipText(containerSelector, activeClasses) {
    const container = document.querySelector(containerSelector);

    if (!container) {
      return '';
    }

    const buttons = Array.from(container.querySelectorAll('button'));
    const activeButton = buttons.find((button) => activeClasses.some((className) => button.classList.contains(className))) || buttons[0];
    return activeButton ? activeButton.textContent.trim() : '';
  }

  function bindLoginForm() {
    if (!currentRoute.endsWith('/login')) {
      return;
    }

    const form = document.querySelector('form');
    const submitButton = form ? form.querySelector('button[type="submit"]') : null;
    const loginCta = Array.from(document.querySelectorAll('a, button')).find((element) => /entrar/i.test(element.textContent || '') && !/cadastre-se/i.test(element.textContent || ''));

    if (!form) {
      return;
    }

    async function performLogin(event) {
      if (event) {
        event.preventDefault();
      }

      const email = document.getElementById('email')?.value?.trim();
      const password = document.getElementById('password')?.value || '';

      try {
        const result = await request('/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email, password })
        });
        setToken(result.token);
        navigate(routeFor('home', '/feed'));
      } catch (error) {
        alert(error.message);
      }
    }

    form.addEventListener('submit', performLogin);

    if (submitButton) {
      submitButton.addEventListener('click', performLogin);
    }

    if (loginCta) {
      loginCta.addEventListener('click', performLogin);
    }

    Array.from(document.querySelectorAll('#email, #password')).forEach((input) => {
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          performLogin(event);
        }
      });
    });
  }

  function bindRegisterForm() {
    if (!currentRoute.endsWith('/criar-conta')) {
      return;
    }

    const form = document.querySelector('form');
    if (!form) {
      return;
    }

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const name = document.getElementById('name')?.value?.trim();
      const email = document.getElementById('email')?.value?.trim();
      const password = document.getElementById('password')?.value || '';
      const city = document.getElementById('city')?.value?.trim();
      const interests = Array.from(document.querySelectorAll('#interest-chips .interest-chip.bg-primary-container, #interest-chips .interest-chip.text-on-primary-container')).map((button) => button.textContent.trim());

      try {
        const result = await request('/auth/register', {
          method: 'POST',
          body: JSON.stringify({ name, email, password, city, interests })
        });
        setToken(result.token);
        navigate(routeFor('home', '/feed'));
      } catch (error) {
        alert(error.message);
      }
    });
  }

  function bindPostComposer() {
    if (!currentRoute.endsWith('/nova-publicacao')) {
      return;
    }

    const publishButton = Array.from(document.querySelectorAll('button')).find((button) => /publicar anúncio/i.test(button.textContent));

    if (!publishButton) {
      return;
    }

    publishButton.addEventListener('click', async (event) => {
      event.preventDefault();

      const title = document.getElementById('itemName')?.value?.trim();
      const description = document.getElementById('itemDesc')?.value?.trim();
      const category = document.querySelector('select')?.value || 'outros';
      const condition = getSelectedChipText('#condition-chips', ['bg-secondary-container', 'text-on-secondary-container']) || 'Bom estado';
      const goalButton = Array.from(document.querySelectorAll('button')).find((button) => button.textContent && /doar|trocar/i.test(button.textContent) && button.classList.contains('bg-primary-container'));
      const goal = goalButton && /trocar/i.test(goalButton.textContent) ? 'Troca' : 'Doação';
      const location = document.querySelector('[data-location]')?.getAttribute('data-location') || '';

      try {
        await request('/posts', {
          method: 'POST',
          body: JSON.stringify({
            title,
            description,
            category,
            condition,
            goal,
            location,
            chipLabel: goal,
            chipIcon: goal === 'Troca' ? 'swap_horiz' : 'volunteer_activism'
          })
        });
        navigate(routeFor('home', '/feed'));
      } catch (error) {
        alert(error.message);
      }
    });
  }

  function bindFeedActions() {
    if (!(currentRoute.endsWith('/feed') || currentRoute.endsWith('/feed-base'))) {
      return;
    }

    document.querySelectorAll('button').forEach((button) => {
      if (/tenho interesse|fazer oferta/i.test(button.textContent || '')) {
        button.addEventListener('click', (event) => {
          event.preventDefault();
          navigate(routeMap.SCREEN_6 || '/mensagens/ana');
        });
      }
    });
  }

  function bindMessagesList() {
    if (!currentRoute.endsWith('/mensagens')) {
      return;
    }

    const cards = Array.from(document.querySelectorAll('main .cursor-pointer'));
    cards.forEach((card) => {
      const text = card.textContent || '';
      card.addEventListener('click', () => {
        if (/ana costa/i.test(text)) {
          navigate('/mensagens/ana');
        }
      });
    });
  }

  function bindChatScreen() {
    if (!currentRoute.endsWith('/mensagens/ana')) {
      return;
    }

    const input = document.getElementById('chat-input');
    const sendButton = Array.from(document.querySelectorAll('button')).find((button) => button.getAttribute('aria-label') === 'Send message' || /send/i.test(button.textContent || ''));
    const chatContainer = document.getElementById('chat-container');
    const threadId = 'thread-ana-notebook';

    async function sendMessage() {
      const text = input ? input.value.trim() : '';
      if (!text) {
        return;
      }

      try {
        await request(`/messages/threads/${threadId}/messages`, {
          method: 'POST',
          body: JSON.stringify({ text })
        });

        if (chatContainer) {
          const wrapper = document.createElement('div');
          wrapper.className = 'flex flex-col items-end gap-1 w-full max-w-[85%] self-end';
          wrapper.innerHTML = '<div class="bg-primary text-on-primary rounded-2xl rounded-tr-sm px-4 py-2 shadow-sm"><p class="font-body-md text-body-md"></p></div><span class="font-body-md text-caption text-on-surface-variant px-1 flex items-center gap-1">Agora <span class="material-symbols-outlined text-[14px] text-primary">done_all</span></span>';
          wrapper.querySelector('p').textContent = text;
          chatContainer.appendChild(wrapper);
          chatContainer.scrollTop = chatContainer.scrollHeight;
        }

        input.value = '';
        input.style.height = '48px';
      } catch (error) {
        alert(error.message);
      }
    }

    if (sendButton) {
      sendButton.addEventListener('click', (event) => {
        event.preventDefault();
        sendMessage();
      });
    }

    if (input) {
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault();
          sendMessage();
        }
      });
    }
  }

  function bindProfileScreen() {
    if (!currentRoute.endsWith('/perfil')) {
      return;
    }

    request('/profile', { method: 'GET' })
      .then((payload) => {
        const user = payload.user || {};
        const stats = payload.stats || {};
        const title = document.querySelector('h1');
        const location = Array.from(document.querySelectorAll('span')).find((span) => /santarém|belém/i.test(span.textContent || ''));

        if (title && user.name) {
          title.textContent = user.name;
        }

        if (location && user.city) {
          location.textContent = user.city;
        }

        const statValues = Array.from(document.querySelectorAll('.font-headline-lg-mobile, .text-headline-lg-mobile'));
        if (statValues.length >= 3) {
          statValues[0].textContent = String(stats.donations ?? statValues[0].textContent);
          statValues[1].textContent = String(stats.received ?? statValues[1].textContent);
          statValues[2].textContent = String(stats.rating ?? statValues[2].textContent);
        }
      })
      .catch(() => {});
  }

  function bindLogoutShortcut() {
    const logoutButton = Array.from(document.querySelectorAll('button, a')).find((element) => /sair|logout/i.test(element.textContent || ''));
    if (!logoutButton) {
      return;
    }

    logoutButton.addEventListener('click', () => {
      clearToken();
    });
  }

  function bindQuickReplies() {
    if (!currentRoute.endsWith('/mensagens/ana')) {
      return;
    }

    const input = document.getElementById('chat-input');
    if (!input) {
      return;
    }

    document.querySelectorAll('.bg-secondary-container').forEach((button) => {
      button.addEventListener('click', function (event) {
        event.preventDefault();
        input.value = this.textContent.trim();
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
    });
  }

  bindAnchors();
  bindLoginForm();
  bindRegisterForm();
  bindPostComposer();
  bindFeedActions();
  bindMessagesList();
  bindChatScreen();
  bindProfileScreen();
  bindLogoutShortcut();
  bindQuickReplies();
})();