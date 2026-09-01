const crypto = require('crypto');

function pct(value) {
  return encodeURIComponent(String(value))
    .replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}

function oauthHeader(method, url, apiKey, apiSecret, accessToken, accessSecret) {
  const oauth = {
    oauth_consumer_key: apiKey,
    oauth_nonce: crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: accessToken,
    oauth_version: '1.0'
  };

  const params = Object.keys(oauth)
    .sort()
    .map(k => `${pct(k)}=${pct(oauth[k])}`)
    .join('&');

  const baseString = [
    method.toUpperCase(),
    pct(url),
    pct(params)
  ].join('&');

  const signingKey = `${pct(apiSecret)}&${pct(accessSecret)}`;

  oauth.oauth_signature = crypto
    .createHmac('sha1', signingKey)
    .update(baseString)
    .digest('base64');

  return 'OAuth ' + Object.keys(oauth)
    .sort()
    .map(k => `${pct(k)}="${pct(oauth[k])}"`)
    .join(', ');
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  try {
    const apiKey = process.env.X_API_KEY;
    const apiSecret = process.env.X_API_SECRET;
    const accessToken = process.env.X_ACCESS_TOKEN;
    const accessSecret = process.env.X_ACCESS_TOKEN_SECRET;

    if (!apiKey || !apiSecret || !accessToken || !accessSecret) {
      return res.status(500).json({ error: 'x_oauth1_credentials_missing' });
    }

    const endpoint = 'https://api.x.com/2/users/me';
    const auth = oauthHeader(
      'GET',
      endpoint,
      apiKey,
      apiSecret,
      accessToken,
      accessSecret
    );

    const xr = await fetch(endpoint, {
      method: 'GET',
      headers: { Authorization: auth }
    });

    const body = await xr.json().catch(() => ({}));

    return res.status(xr.status).json({
      ok: xr.ok,
      status: xr.status,
      body
    });
  } catch (err) {
    console.error('X_AUTH_TEST', err?.message || err);
    return res.status(500).json({ error: 'internal_error' });
  }
};
