import { createServer } from 'http';
import express from 'express';
import cors from 'cors';
import { Server } from 'colyseus';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { ArenaRoom } from './ArenaRoom';

const port = Number(process.env.PORT) || 2567;

const app = express();
app.use(cors());
app.get('/', (_req, res) => { res.send('Mini Soldier Arena server is running.'); });
app.get('/health', (_req, res) => { res.json({ ok: true }); });

const httpServer = createServer(app);
const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer, pingInterval: 15000, pingMaxRetries: 4 }),
});

// "code" separates public quick-play rooms ("PUBLIC") from private rooms (random room code)
gameServer.define('arena', ArenaRoom).filterBy(['code']);

gameServer.listen(port).then(() => {
  console.log(`Mini Soldier Arena server listening on port ${port}`);
});
