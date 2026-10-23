import { pool } from '../db/index.ts';
import { decryptSecret } from './credential-crypto.ts';
export async function metaPlatformConfig() {
  const detectedBaseUrl=String(process.env.PUBLIC_BASE_URL || process.env.META_PUBLIC_BASE_URL || process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : '')).trim().replace(/\/$/, '');
  try {
    const result = await pool.query('SELECT meta_app_id, meta_app_secret, embedded_signup_config_id, graph_api_version, public_base_url, webhook_verify_token FROM platform_meta_settings WHERE id = 1 LIMIT 1');
    const row: any = result.rows?.[0];
    if (row) {
      const dbSecret = decryptSecret(row.meta_app_secret);
      if (String(row.meta_app_id || '').trim() || String(row.embedded_signup_config_id || '').trim() || dbSecret) {
        return {
          appId: String(row.meta_app_id || '').trim(),
          appSecret: String(dbSecret || '').trim(),
          configId: String(row.embedded_signup_config_id || '').trim(),
          apiVersion: String(row.graph_api_version || 'v26.0').trim() || 'v26.0',
          publicBaseUrl: process.env.NODE_ENV==='production' && /^https:\/\//i.test(detectedBaseUrl)
            ? detectedBaseUrl : String(row.public_base_url || '').trim().replace(/\/$/, '') || detectedBaseUrl,
          webhookVerifyToken: String(decryptSecret(row.webhook_verify_token) || '').trim() || String(process.env.META_WEBHOOK_VERIFY_TOKEN || '').trim(),
          source: 'database',
        };
      }
    }
  } catch (e: any) {
    console.warn('[Meta] Could not read platform Meta settings from database:', e?.message);
  }
  const envConfig = {
    appId: String(process.env.META_PLATFORM_APP_ID || '').trim(),
    appSecret: String(process.env.META_PLATFORM_APP_SECRET || '').trim(),
    configId: String(process.env.META_EMBEDDED_SIGNUP_CONFIG_ID || '').trim(),
    apiVersion: String(process.env.META_GRAPH_API_VERSION || 'v26.0').trim() || 'v26.0',
    publicBaseUrl: detectedBaseUrl,
    webhookVerifyToken: String(process.env.META_WEBHOOK_VERIFY_TOKEN || '').trim(),
  };
  return {
    ...envConfig,
    source: (envConfig.appId || envConfig.appSecret || envConfig.configId) ? 'environment' : 'not_configured',
  };
}
