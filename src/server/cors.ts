import type { RequestHandler } from 'express';

const LOCAL_WEB_ORIGIN = /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i;

export const localWebCors: RequestHandler = (req, res, next) => {
  const origin = req.get('Origin');
  if (!origin || !LOCAL_WEB_ORIGIN.test(origin)) return next();

  res.vary('Origin');
  res.setHeader('Access-Control-Allow-Origin', origin);

  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Accept, Authorization, Content-Type');
    res.setHeader('Access-Control-Max-Age', '600');
    return res.sendStatus(204);
  }

  return next();
};
