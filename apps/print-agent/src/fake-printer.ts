import net from 'node:net';

export interface FakePrinterOptions {
  port?: number;
  status?: [number, number, number];
  silent?: boolean;
}

export interface FakePrinter {
  port: number;
  jobs: Uint8Array[];
  setStatus(s: [number, number, number]): void;
  stop(): Promise<void>;
}

// Test double for the Xprinter: accepts one TCP connection at a time, answers a
// `DLE EOT n` status query with the configured status byte (or stays `silent`),
// and records everything else it receives as a finished "job" once the
// connection closes.
export function startFakePrinter(opts: FakePrinterOptions = {}): Promise<FakePrinter> {
  let status: [number, number, number] = opts.status ?? [0x12, 0x12, 0x12];
  const silent = opts.silent ?? false;
  const jobs: Uint8Array[] = [];
  const sockets = new Set<net.Socket>();

  const server = net.createServer((socket) => {
    sockets.add(socket);
    const job: number[] = [];

    socket.on('data', (data: Buffer) => {
      let i = 0;
      while (i < data.length) {
        const b0 = data[i];
        if (b0 === undefined) break;
        const b1 = data[i + 1];
        const b2 = data[i + 2];
        if (b0 === 0x10 && b1 === 0x04 && (b2 === 0x01 || b2 === 0x02 || b2 === 0x04)) {
          if (!silent) {
            const idx = b2 === 0x01 ? 0 : b2 === 0x02 ? 1 : 2;
            socket.write(Uint8Array.from([status[idx]]));
          }
          i += 3;
          continue;
        }
        job.push(b0);
        i += 1;
      }
    });
    socket.on('close', () => {
      sockets.delete(socket);
      if (job.length > 0) jobs.push(Uint8Array.from(job));
    });
    socket.on('error', () => {
      // A client that resets the connection (e.g. after a timeout) must not crash the fake printer.
    });
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(opts.port ?? 0, '127.0.0.1', () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr !== null ? addr.port : (opts.port ?? 0);
      resolve({
        port,
        jobs,
        setStatus(s) {
          status = s;
        },
        stop: () =>
          new Promise<void>((res) => {
            for (const s of sockets) s.destroy();
            server.close(() => res());
          }),
      });
    });
  });
}
