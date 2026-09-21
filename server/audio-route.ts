import type { Request, Response } from 'express';
import { Archive, AUDIO_CHUNK } from './archive.js';
export function audioRoute(archive: Archive) {
  return async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const meta = await archive.audioMeta(id);
    if (!meta) {
      res.status(404).json({ error: 'Audio is still being prepared' });
      return;
    }
    let start = 0,
      end = meta.bytes - 1;
    const range = req.headers.range;
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (!match || (!match[1] && !match[2])) {
        res.setHeader('Content-Range', `bytes */${meta.bytes}`);
        res.sendStatus(416);
        return;
      }
      if (!match[1]) start = Math.max(0, meta.bytes - Number(match[2]));
      else {
        start = Number(match[1]);
        if (match[2]) end = Math.min(end, Number(match[2]));
      }
      if (
        !Number.isSafeInteger(start) ||
        !Number.isSafeInteger(end) ||
        start > end ||
        start >= meta.bytes
      ) {
        res.setHeader('Content-Range', `bytes */${meta.bytes}`);
        res.sendStatus(416);
        return;
      }
      res.status(206).setHeader('Content-Range', `bytes ${start}-${end}/${meta.bytes}`);
    }
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Length', end - start + 1);
    res.setHeader('ETag', `"${meta.sha256}"`);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    try {
      for (
        let index = Math.floor(start / AUDIO_CHUNK);
        index <= Math.floor(end / AUDIO_CHUNK);
        index++
      ) {
        if (res.destroyed) return;
        const chunk = await archive.audioChunk(id, index);
        const bytes = chunk.subarray(
          Math.max(0, start - index * AUDIO_CHUNK),
          Math.min(chunk.length, end - index * AUDIO_CHUNK + 1),
        );
        if (!res.write(bytes))
          await new Promise<void>((resolve) => {
            const done = () => {
              res.off('drain', done);
              res.off('close', done);
              resolve();
            };
            res.once('drain', done);
            res.once('close', done);
          });
      }
      res.end();
    } catch {
      res.destroy();
    }
  };
}
