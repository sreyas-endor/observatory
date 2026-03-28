import { file } from "bun";
import { join, extname } from "path";

const MIME: Record<string, string> = {
  ".html": "text/html",
  ".js":   "application/javascript",
  ".css":  "text/css",
  ".png":  "image/png",
  ".jpg":  "image/jpeg",
  ".gif":  "image/gif",
  ".svg":  "image/svg+xml",
  ".ico":  "image/x-icon",
  ".json": "application/json",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

const PUBLIC_DIR = join(import.meta.dir, "..", "public");

export async function serveStatic(pathname: string): Promise<Response> {
  const clean = pathname === "/" ? "/index.html" : pathname;
  const filePath = join(PUBLIC_DIR, clean);

  try {
    const f = file(filePath);
    const exists = await f.exists();
    if (!exists) {
      return new Response("Not found", { status: 404 });
    }
    const ext = extname(filePath);
    const contentType = MIME[ext] ?? "application/octet-stream";
    return new Response(f, {
      headers: { "Content-Type": contentType },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}

export async function readJSON(req: Request): Promise<Record<string, unknown>> {
  try {
    return (await req.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}
