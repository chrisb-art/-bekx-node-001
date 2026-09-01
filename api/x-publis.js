const crypto = require('crypto');
const { adminCall } = require('./_supabase');

const X_MAX_CHARS = 280;

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
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const id = String(req.body?.id || '').trim();
    if (!id) return res.status(400).json({ error: 'missing_id' });

    const rows = await adminCall(
      `social_posts?select=id,platform,account_handle,body,status,metadata&id=eq.${encodeURIComponent(id)}&limit=1`
    );
    const post = rows?.[0];

    if (!post) return res.status(404).json({ error: 'not_found' });
    if (post.platform !== 'X') return res.status(400).json({ error: 'wrong_platform' });
    if (post.status !== 'APPROVED') {
      return res.status(409).json({ error: 'not_approved', status: post.status });
    }

    const text = String(post.body || '');
    const charCount = Array.from(text).length;

    if (charCount > X_MAX_CHARS) {
      await adminCall(`social_posts?id=eq.${id}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({
          status: 'FAILED',
          error: `X character limit exceeded: ${charCount}/${X_MAX_CHARS}`,
          updated_at: new Date().toISOString(),
          metadata: {
            ...(post.metadata || {}),
            x_character_count: charCount,
            x_character_limit: X_MAX_CHARS
          }
        })
      });

      return res.status(422).json({
        error: 'x_character_limit_exceeded',
        character_count: charCount,
        max_characters: X_MAX_CHARS
      });
    }

    const apiKey = process.env.X_API_KEY;
    const apiSecret = process.env.X_API_SECRET;
    const accessToken = process.env.X_ACCESS_TOKEN;
    const accessSecret = process.env.X_ACCESS_TOKEN_SECRET;

    if (!apiKey || !apiSecret || !accessToken || !accessSecret) {
      return res.status(500).json({ error: 'x_oauth1_credentials_missing' });
    }

    await adminCall(`social_posts?id=eq.${id}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        status: 'PUBLISHING',
        updated_at: new Date().toISOString(),
        error: null,
        metadata: {
          ...(post.metadata || {}),
          x_character_count: charCount,
          x_character_limit: X_MAX_CHARS
        }
      })
    });

    const endpoint = 'https://api.x.com/2/tweets';
    const auth = oauthHeader(
      'POST',
      endpoint,
      apiKey,
      apiSecret,
      accessToken,
      accessSecret
    );

    const xr = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: auth,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ text })
    });

    const xj = await xr.json().catch(() => ({}));

    if (!xr.ok || !xj?.data?.id) {
      await adminCall(`social_posts?id=eq.${id}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({
          status: 'FAILED',
          error: `X ${xr.status}: ${JSON.stringify(xj).slice(0, 1000)}`,
          updated_at: new Date().toISOString()
        })
      });

      return res.status(502).json({
        error: 'x_publish_failed',
        status: xr.status,
        detail: xj
      });
    }

    const externalId = String(xj.data.id);
    const handle = post.account_handle.replace(/^@/, '');
    const url = `https://x.com/${handle}/status/${externalId}`;

    await adminCall(`social_posts?id=eq.${id}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        status: 'PUBLISHED',
        external_post_id: externalId,
        external_post_url: url,
        published_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
    });

    return res.status(200).json({
      ok: true,
      id,
      character_count: charCount,
      external_post_id: externalId,
      url
    });
  } catch (err) {
    console.error('X_PUBLISH', err?.message || err);
    return res.status(500).json({ error: 'internal_error' });
  }
};
