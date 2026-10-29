import express from 'express';
import { engine } from 'express-handlebars';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);
const viewsDirectory = fileURLToPath(new URL('./views/', import.meta.url));
const publicDirectory = fileURLToPath(new URL('./public/', import.meta.url));
const port = Number(process.env.PORT ?? 3000);
const sessionId = randomUUID();
const examples = process.env.DEMO_DATA === 'false' ? []
  : JSON.parse(await readFile(new URL('./data/messages.example.json', import.meta.url), 'utf8'));
const messages = examples.map((example, index) => {
  const values = validateMessage({ ...example, requestId: randomUUID() });
  return {
    id: randomUUID(),
    ...values,
    sentAt: new Date(Date.now() - (examples.length - index) * 60000).toISOString(),
    advertisement: values.advertisement || null
  };
});
const historyLimit = 100;

function validateMessage(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Datos de mensaje inválidos.');
  if (typeof data.requestId !== 'string' || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(data.requestId)) {
    throw new Error('Identificador de envío inválido.');
  }
  const limits = { username: 40, message: 1000, advertisement: 240 };
  const values = { requestId: data.requestId };
  for (const [field, limit] of Object.entries(limits)) {
    const value = data[field] === undefined && field === 'advertisement' ? '' : data[field];
    if (typeof value !== 'string') throw new Error(`Campo inválido: ${field}.`);
    const normalized = field === 'username' ? value.trim().replace(/\s+/g, ' ') : value.trim();
    if (normalized.length > limit || (field !== 'advertisement' && !normalized)) {
      throw new Error(`Revisa ${field}: ${field === 'advertisement' ? 'hasta' : 'entre 1 y'} ${limit} caracteres.`);
    }
    values[field] = normalized;
  }
  return values;
}

app.engine('handlebars', engine({
  defaultLayout: 'main',
  layoutsDir: fileURLToPath(new URL('./views/layouts/', import.meta.url)),
  partialsDir: fileURLToPath(new URL('./views/partials/', import.meta.url))
}));
app.set('view engine', 'handlebars');
app.set('views', viewsDirectory);
app.use(express.static(publicDirectory));

app.get('/', (req, res) => {
  res.render('index', {
    title: 'Chat y publicidad'
  });
});

app.use((req, res) => {
  res.status(404).send('Página no encontrada');
});

app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).send('No se pudo cargar la página');
});

io.on('connection', (socket) => {
  console.log(`Cliente conectado: ${socket.id}`);
  socket.emit('chat:state', { sessionId, messages });

  socket.on('connection:check', (acknowledge) => {
    if (typeof acknowledge === 'function') {
      acknowledge({ ok: true, serverTime: new Date().toISOString() });
    }
  });

  socket.on('chat:send', (data, acknowledge) => {
    const reply = (result) => {
      if (typeof acknowledge === 'function') acknowledge(result);
    };
    let values;
    try {
      values = validateMessage(data);
    } catch (error) {
      reply({ ok: false, error: error.message });
      return;
    }

    const previous = messages.find(message => message.requestId === values.requestId);
    if (previous) {
      const sameContent = previous.username === values.username && previous.message === values.message
        && (previous.advertisement || '') === values.advertisement;
      reply(sameContent ? { ok: true, message: previous }
        : { ok: false, error: 'Este identificador ya corresponde a otro mensaje.' });
      return;
    }

    const message = {
      id: randomUUID(),
      requestId: values.requestId,
      username: values.username,
      message: values.message,
      sentAt: new Date().toISOString(),
      advertisement: values.advertisement || null
    };
    messages.push(message);
    if (messages.length > historyLimit) messages.shift();
    io.emit('chat:message', message);
    reply({ ok: true, message });
  });

  socket.on('disconnect', (reason) => {
    console.log(`Cliente desconectado: ${socket.id} (${reason})`);
  });
});

if (process.env.VERCEL !== '1') {
  httpServer.listen(port, () => {
    console.log(`Aplicación disponible en http://localhost:${port}`);
  });
}

export default httpServer;
