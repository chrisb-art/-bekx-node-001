const { adminCall } = require('./_supabase');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const id = String(req.body?.id || '').trim();
    if (!id) return res.status(400).json({ error: 'missing_id' });

    const rows = await adminCall(
      `social_posts?select=id,platform,account_handle,body,status&id=eq.${encodeURIComponent(id)}&limit=1`
    );
    const post = rows?.[0];

    if (!post) return res.status(404).json({ error: 'not_found' });
    if (post.platform !== 'X') return res.status(400).json({ error: 'wrong_platform' });
    if (post.status !== 'APPROVED') {
      return res.status(409).json({ error: 'not_approved', status: post.status });
    }

    const token = process.env.X_ACCESS_TOKEN;
    if (!token) return res.status(500).json({ error: 'x_token_missing' });

    await adminCall(`social_posts?id=eq.${id}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        status: 'PUBLISHING',
        updated_at: new Date().toISOString(),
        error: null
      })
    });

    const xr = await fetch('https://api.x.com/2/tweets', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ text: post.body })
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
    const url = `https://x.com/${post.account_handle.replace(/^@/, '')}/status/${externalId}`;

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
      external_post_id: externalId,
      url
    });
  } catch (err) {
    console.error('X_PUBLISH', err?.message || err);
    return res.status(500).json({ error: 'internal_error' });
  }
};
