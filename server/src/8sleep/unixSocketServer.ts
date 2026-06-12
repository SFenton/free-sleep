import { once } from 'events';
import { unlink } from 'fs/promises';
import { createServer, Server, Socket } from 'net';
import logger from '../logger.js';

export class UnixSocketServer {
  private readonly pendingConnections: Socket[] = [];
  private waiting: ((socket: Socket) => void) | undefined;

  public constructor(private readonly server: Server) {
    this.server.on('connection', (socket) => this.handleConnection(socket));
  }

  private handleConnection(socket: Socket) {
    socket.on('error', (error) => logger.error({ error, message: 'Unix socket connection error' }));

    if (this.waiting) {
      const resolve = this.waiting;
      this.waiting = undefined;
      resolve(socket);
      return;
    }

    while (this.pendingConnections.length > 0) {
      const stale = this.pendingConnections.shift();
      stale?.destroy();
    }

    this.pendingConnections.push(socket);
  }

  public async close() {
    this.waiting = undefined;
    this.pendingConnections.splice(0).forEach(socket => socket.destroy());
    this.server.close();
    await once(this.server, 'close');
  }

  public async waitForConnection(): Promise<Socket> {
    if (this.pendingConnections.length > 0) {
      const connection = this.pendingConnections.shift() as Socket;
      return connection;
    }

    logger.debug('Waiting for future connection');
    return new Promise<Socket>((resolve) => this.waiting = resolve);
  }

  public static async start(path: string) {
    logger.debug('Creating socket connection...');
    await UnixSocketServer.tryCleanup(path);
    const unixSocketServer = createServer();
    unixSocketServer.on('error', (error) => logger.error({ error, message: 'Unix socket server error' }));

    await new Promise<void>((resolve) => unixSocketServer.listen(path, resolve));

    const socket = new UnixSocketServer(unixSocketServer);
    logger.debug('Created socket connection!');
    return socket;
  }

  private static async tryCleanup(path: string) {
    try {
      await unlink(path);
    } catch (err) {
      if ((err as any)?.code === 'ENOENT') return;
      throw err;
    }
  }
}
