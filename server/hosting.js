export function hostingConfig(env = process.env) {
  const rawOrigin = env.PUBLIC_ORIGIN || env.RENDER_EXTERNAL_URL;
  const origin = rawOrigin ? new URL(rawOrigin).origin : null;
  return {
    origin,
    hostname: origin ? new URL(origin).hostname : null,
    host: env.HOST || (env.RENDER === 'true' ? '0.0.0.0' : '127.0.0.1'),
    port: Number(env.PORT) || 3000,
  };
}

export function allowedRequest(config, hostname, origin, hostHeader) {
  if (config.origin) {
    return hostname === config.hostname && (!origin || origin === config.origin);
  }
  return ['localhost', '127.0.0.1', '[::1]'].includes(hostname)
    && (!origin || origin === `http://${hostHeader}`);
}
