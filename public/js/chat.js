import { io } from '/socket.io/socket.io.esm.min.js';

const connectionStatus = document.querySelector('#connection-status');
const connectionLabel = document.querySelector('#connection-label');
const sendHelp = document.querySelector('#send-help');
const form = document.querySelector('#chat-form');
const usernameField = document.querySelector('#username');
const advertisementField = document.querySelector('#advertisement');
const advertisementOptions = document.querySelector('#advertisement-options');
const messageField = document.querySelector('#message');
const sendButton = document.querySelector('#send-button');
const sendLabel = document.querySelector('#send-label');
const formError = document.querySelector('#form-error');
const messageList = document.querySelector('#chat-messages');
const emptyState = document.querySelector('#chat-empty');
const messageCount = document.querySelector('#message-count');
const chatNotice = document.querySelector('#chat-notice');
const socket = io({ autoConnect: false, transports: ['websocket'] });
const visibleIds = new Set();
const ownRequests = new Set();
const clock = new Intl.DateTimeFormat('es-CO', { hour: '2-digit', minute: '2-digit', hour12: false });
let connectionReady = false;
let sending = false;
let pendingRequest = null;
let sendAttempt = 0;
let currentSession = null;

try {
  usernameField.value = sessionStorage.getItem('chat.username') || '';
  const savedRequests = JSON.parse(sessionStorage.getItem('chat.ownRequests') || '[]');
  if (Array.isArray(savedRequests)) {
    for (const id of savedRequests.slice(-100)) if (typeof id === 'string') ownRequests.add(id);
  }
} catch {}

usernameField.addEventListener('input', () => {
  try {
    sessionStorage.setItem('chat.username', usernameField.value);
  } catch {}
});

function updateControls() {
  sendButton.disabled = !connectionReady || sending;
  sendLabel.textContent = sending ? 'Enviando…' : 'Enviar';
  form.setAttribute('aria-busy', String(sending));
  for (const field of [usernameField, advertisementField, messageField]) field.readOnly = sending;
}

function showError(message) {
  formError.textContent = message;
  formError.hidden = false;
}

function confirmMessage(message) {
  if (pendingRequest?.requestId !== message.requestId) return;
  if (messageField.value.trim() === pendingRequest.message) messageField.value = '';
  if (advertisementField.value.trim() === pendingRequest.advertisement) {
    advertisementField.value = '';
    advertisementOptions.open = false;
  }
  pendingRequest = null;
  sending = false;
  sendAttempt++;
  formError.hidden = true;
  updateControls();
  sendHelp.textContent = 'Mensaje enviado. Puedes escribir otro.';
  if (connectionReady) messageField.focus();
}

function renderMessage(message) {
  if (visibleIds.has(message.id)) {
    confirmMessage(message);
    return;
  }
  const nearBottom = messageList.scrollHeight - messageList.scrollTop - messageList.clientHeight < 60;
  const article = document.createElement('article');
  article.className = ownRequests.has(message.requestId) ? 'chat-message is-own' : 'chat-message';
  article.dataset.messageId = message.id;
  const body = document.createElement('div');
  body.className = 'message-body';
  const header = document.createElement('p');
  header.className = 'message-meta';
  const author = document.createElement('strong');
  author.textContent = message.username;
  const time = document.createElement('time');
  time.dateTime = message.sentAt;
  time.textContent = clock.format(new Date(message.sentAt));
  time.title = new Date(message.sentAt).toLocaleString('es-CO');
  header.append(author, ' — ', time);
  const text = document.createElement('p');
  text.className = 'message-text';
  text.textContent = message.message;
  body.append(header, text);
  if (message.advertisement) {
    const advertisement = document.createElement('aside');
    advertisement.className = 'message-advertisement';
    const label = document.createElement('span');
    label.textContent = 'Publicidad adjunta';
    const content = document.createElement('p');
    content.textContent = message.advertisement;
    advertisement.append(label, content);
    body.append(advertisement);
  }
  article.append(body);
  emptyState.hidden = true;
  messageList.append(article);
  visibleIds.add(message.id);
  if (visibleIds.size > 100) {
    const oldest = messageList.querySelector('.chat-message');
    visibleIds.delete(oldest.dataset.messageId);
    oldest.remove();
  }
  messageCount.textContent = `${visibleIds.size} ${visibleIds.size === 1 ? 'mensaje' : 'mensajes'}`;
  if (nearBottom) messageList.scrollTop = messageList.scrollHeight;
  confirmMessage(message);
}

socket.on('chat:state', (state) => {
  if (currentSession && currentSession !== state.sessionId) {
    chatNotice.textContent = 'El servidor se reinició. La conversación anterior ya no está disponible.';
    chatNotice.hidden = false;
  }
  currentSession = state.sessionId;
  messageList.setAttribute('aria-busy', 'true');
  messageList.replaceChildren(emptyState);
  visibleIds.clear();
  emptyState.hidden = false;
  messageCount.textContent = '0 mensajes';
  for (const message of state.messages) renderMessage(message);
  messageList.scrollTop = messageList.scrollHeight;
  messageList.setAttribute('aria-busy', 'false');
});

socket.on('chat:message', renderMessage);

function updateConnection(state, label, description) {
  connectionReady = state === 'connected';
  connectionStatus.dataset.state = state;
  connectionLabel.textContent = label;
  sendHelp.textContent = description;
  updateControls();
}

socket.on('connect', () => {
  const connectionId = socket.id;
  updateConnection('connecting', 'Verificando…', 'Comprobando la comunicación con el servidor.');

  socket.timeout(5000).emit('connection:check', (error, response) => {
    if (!socket.connected || socket.id !== connectionId) return;
    if (error || response?.ok !== true || !Number.isFinite(Date.parse(response.serverTime))) {
      updateConnection('error', 'Conexión sin confirmar', 'No pudimos confirmar la conexión. Recarga la página para volver a intentarlo.');
      return;
    }
    updateConnection('connected', 'Conectado', 'Tu mensaje se compartirá con todos los usuarios conectados.');
  });
});

socket.on('disconnect', () => {
  if (sending) {
    sending = false;
    sendAttempt++;
    showError('El envío se interrumpió. Conservamos el texto; podrás reintentarlo al reconectar.');
  }
  const description = socket.active
    ? 'Se perdió la conexión. Tus campos se conservan mientras intentamos reconectar.'
    : 'La conexión se cerró. Tus campos se conservan; recarga la página para volver a conectar.';
  updateConnection('disconnected', 'Desconectado', description);
});

socket.on('connect_error', () => {
  updateConnection('error', 'Sin conexión', socket.active
    ? 'No se pudo conectar. Se intentará de nuevo automáticamente; tus campos se conservan.'
    : 'No se pudo conectar. Recarga la página para volver a intentarlo.');
});

socket.io.on('reconnect_attempt', () => {
  updateConnection('connecting', 'Reconectando…', 'Intentando recuperar la conexión. Tus campos se conservan.');
});

form.addEventListener('submit', (event) => {
  event.preventDefault();
  if (sending) return;
  if (!connectionReady || !socket.connected) {
    showError('Espera a recuperar la conexión antes de enviar. Tu texto se conserva.');
    return;
  }
  const values = {
    username: usernameField.value.trim().replace(/\s+/g, ' '),
    message: messageField.value.trim(),
    advertisement: advertisementField.value.trim()
  };
  if (!values.username || values.username.length > 40) {
    showError('Escribe un nombre de usuario de entre 1 y 40 caracteres.');
    usernameField.focus();
    return;
  }
  if (!values.message || values.message.length > 1000 || values.advertisement.length > 240) {
    showError('Escribe un mensaje de entre 1 y 1.000 caracteres y publicidad de hasta 240.');
    messageField.focus();
    return;
  }
  const sameRequest = pendingRequest && ['username', 'message', 'advertisement'].every(field => pendingRequest[field] === values[field]);
  if (!sameRequest) pendingRequest = { requestId: crypto.randomUUID(), ...values };
  const request = pendingRequest;
  ownRequests.add(request.requestId);
  if (ownRequests.size > 100) ownRequests.delete(ownRequests.values().next().value);
  try {
    sessionStorage.setItem('chat.ownRequests', JSON.stringify([...ownRequests]));
  } catch {}
  const attempt = ++sendAttempt;
  sending = true;
  formError.hidden = true;
  updateControls();
  sendHelp.textContent = 'Esperando la confirmación del servidor…';
  socket.timeout(5000).volatile.emit('chat:send', request, (error, response) => {
    if (attempt !== sendAttempt || pendingRequest?.requestId !== request.requestId) return;
    if (!error && response?.ok === true && response.message) {
      renderMessage(response.message);
      return;
    }
    sending = false;
    updateControls();
    showError(error ? 'No recibimos confirmación. Tu texto se conserva: pulsa Enviar para reintentar.'
      : response?.error || 'No se pudo enviar el mensaje.');
  });
});

socket.connect();
