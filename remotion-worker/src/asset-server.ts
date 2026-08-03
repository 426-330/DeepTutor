/**
 * Local asset server for audio media (M2).
 *
 * Voiceover/BGM live outside the Remotion bundle (video asset dirs), and
 * headless Chrome refuses `file://` media from the bundle's http origin.
 * So during a render we expose exactly the registered files over
 * http://127.0.0.1:<ephemeral>/asset/<id> — a read-only, token-addressed
 * static server with no directory listing and no path traversal.
 *
 * Process-level singleton: started lazily on the first render that carries
 * audio, closed when the worker process exits.
 */
import {createServer, type Server} from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const MIME: Record<string, string> = {
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.ogg': 'audio/ogg',
  '.flac': 'audio/flac',
};

class AssetServer {
  private server: Server | null = null;
  private starting: Promise<void> | null = null;
  private port = 0;
  private files = new Map<string, string>();
  private nextId = 0;

  private ensureStarted(): Promise<void> {
    // Single shared start promise — concurrent register() calls during the
    // initial listen must not observe port 0.
    if (!this.starting) {
      this.server = createServer((req, res) => {
        const id = (req.url ?? '').replace(/^\/asset\//, '').split('?')[0];
        const file = this.files.get(id);
        if (!file || !fs.existsSync(file)) {
          res.writeHead(404).end('not found');
          return;
        }
        res.writeHead(200, {
          'content-type': MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
          'content-length': fs.statSync(file).size,
          'cache-control': 'no-store',
        });
        fs.createReadStream(file).pipe(res);
      });
      this.starting = new Promise<void>((resolve, reject) => {
        this.server!.once('error', reject);
        this.server!.listen(0, '127.0.0.1', () => {
          const address = this.server!.address();
          if (typeof address === 'object' && address) this.port = address.port;
          resolve();
        });
      });
      // Do not keep the node process alive just for the asset server
      // (one-shot scripts like verify/still must exit after rendering).
      this.server.unref();
    }
    return this.starting;
  }

  /** Register an absolute fs path, returning its http URL for this render. */
  async register(absPath: string): Promise<string> {
    await this.ensureStarted();
    const id = String(this.nextId++);
    this.files.set(id, absPath);
    return `http://127.0.0.1:${this.port}/asset/${id}`;
  }
}

const singleton = new AssetServer();

/**
 * Rewrite `file://` media URLs in composition input props to locally served
 * http URLs. Returns a (possibly new) props object; props without audio pass
 * through untouched.
 */
export async function serveMediaUrls(
  inputProps: Record<string, unknown> | undefined,
): Promise<Record<string, unknown> | undefined> {
  const ir = (inputProps as {ir?: import('./parser/types.js').VideoIR} | undefined)?.ir;
  if (!ir) return inputProps;

  const hasMedia = ir.bgm || ir.scenes.some((s) => s.audioUrl);
  if (!hasMedia) return inputProps;

  const toHttp = async (url: string): Promise<string> => {
    if (!url.startsWith('file://')) return url;
    const {fileURLToPath} = await import('node:url');
    return singleton.register(fileURLToPath(url));
  };

  const scenes = await Promise.all(
    ir.scenes.map(async (s) =>
      s.audioUrl ? {...s, audioUrl: await toHttp(s.audioUrl)} : s,
    ),
  );
  const bgm = ir.bgm ? {...ir.bgm, url: await toHttp(ir.bgm.url)} : undefined;
  return {...inputProps, ir: {...ir, scenes, bgm}};
}
