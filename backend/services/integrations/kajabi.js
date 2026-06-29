// Kajabi Public API integration (v1).
//
// Auth: OAuth 2.0 client_credentials. The user pastes their "API Key"
// (client_id) and "API Secret" (client_secret) from Kajabi → Settings →
// Public API → Create User API Key. We exchange those for a Bearer
// access_token at `/v1/oauth/token`, cache it in `metadata.access_token`
// alongside `access_token_expires_at`, and refresh when within 60s of
// expiry.
//
// Plan gating: the Public API is only available on Pro, or on Growth
// with the $25/mo API add-on. Kickstarter has no API access at all.
// The frontend modal warns the user; `validate()` will surface a
// "invalid_client" error from Kajabi if they paste credentials that
// don't have API access.
//
// Endpoints (https://api.kajabi.com/v1):
//   POST /oauth/token        – token exchange (client_credentials)
//   GET  /sites              – list sites (we use the first as site_id filter)
//   GET  /transactions       – payment transactions (revenue)
//   GET  /offers             – offers (products/courses)
//   GET  /purchases          – purchases incl. subscriptions
//   GET  /contacts           – contacts (≈ customers/members)
//
// Webhooks (separate path, see routes/webhooks.js): Kajabi sends
// outbound webhooks for `payment_succeeded`, `purchase_created`, etc.
// Kajabi does NOT sign these — the auth surface is the URL path itself.

import { supabase } from '../storage.js';

const KAJABI_API = 'https://api.kajabi.com/v1';

// ───────────────────────── OAuth + token caching ─────────────────────────

async function exchangeClientCredentials(clientId, clientSecret) {
  const res = await fetch(`${KAJABI_API}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    let msg = `Kajabi token exchange failed (${res.status})`;
    try {
      const parsed = JSON.parse(body);
      if (parsed.error === 'invalid_client') {
        msg = 'Invalid Kajabi API Key or Secret. Make sure your Kajabi plan includes Public API access (Pro, or Growth with the $25/mo API add-on).';
      } else if (parsed.error_description) {
        msg = `Kajabi: ${parsed.error_description}`;
      }
    } catch {
      if (body) msg = `${msg}: ${body.slice(0, 200)}`;
    }
    throw new Error(msg);
  }

  const data = await res.json();
  if (!data.access_token) {
    throw new Error('Kajabi did not return an access_token');
  }
  return {
    access_token: data.access_token,
    expires_at: Math.floor(Date.now() / 1000) + (data.expires_in || 3600),
  };
}

// Returns a valid access_token for the integration. Refreshes via the
// stored client_id/client_secret if the cached one is missing or within
// 60s of expiry. Persists the new token back to the integration row.
async function getAccessToken(integration) {
  const clientId = integration.api_key;
  const clientSecret = integration.metadata?.client_secret;
  if (!clientId || !clientSecret) {
    throw new Error('Kajabi integration is missing client credentials. Please reconnect.');
  }

  const now = Math.floor(Date.now() / 1000);
  const cached = integration.metadata?.access_token;
  const expiresAt = integration.metadata?.access_token_expires_at || 0;

  if (cached && expiresAt - now > 60) {
    return cached;
  }

  const { access_token, expires_at } = await exchangeClientCredentials(clientId, clientSecret);

  await supabase.from('integrations')
    .update({
      metadata: {
        ...integration.metadata,
        access_token,
        access_token_expires_at: expires_at,
      },
      updated_at: new Date().toISOString(),
    })
    .eq('id', integration.id);

  return access_token;
}

async function kajabiGet(path, accessToken, params = {}) {
  const url = new URL(`${KAJABI_API}${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    url.searchParams.set(k, v);
  }
  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Kajabi ${path} failed (${res.status}): ${body.slice(0, 200)}`);
  }
  return res.json();
}

// ───────────────────────────── validate ─────────────────────────────

export async function validate(apiKey, reqMetadata) {
  const clientId = apiKey;
  const clientSecret = reqMetadata?.client_secret;
  if (!clientSecret) {
    throw new Error('Kajabi API Secret is required.');
  }

  const { access_token, expires_at } = await exchangeClientCredentials(clientId, clientSecret);

  // Resolve the user's first site so subsequent sync calls can scope
  // by site_id. Kajabi's list endpoints want it as a filter.
  const sitesResp = await fetch(`${KAJABI_API}/sites?page[size]=10`, {
    headers: { Authorization: `Bearer ${access_token}`, Accept: 'application/json' },
  });
  if (!sitesResp.ok) {
    const body = await sitesResp.text().catch(() => '');
    throw new Error(`Kajabi /sites failed (${sitesResp.status}): ${body.slice(0, 200)}`);
  }
  const sitesData = await sitesResp.json();
  const firstSite = sitesData.data?.[0];
  if (!firstSite) {
    throw new Error('No Kajabi sites found on this account.');
  }

  // Returned object becomes the integration's `metadata`. Sensitive
  // fields (client_secret, access_token) are stripped before the
  // metadata is returned to the frontend by routes/integrations.js.
  return {
    name: firstSite.attributes?.title || 'Kajabi Site',
    site_id: firstSite.id,
    site_title: firstSite.attributes?.title || '',
    client_secret: clientSecret,
    access_token,
    access_token_expires_at: expires_at,
  };
}

// ───────────────────────────── sync ─────────────────────────────

// Walks Kajabi's JSON:API-style paginated list endpoints (page[number] /
// page[size]) up to `maxPages` and yields each item from `data[]`.
async function* paginate(path, accessToken, baseParams, maxPages = 10) {
  for (let page = 1; page <= maxPages; page++) {
    const data = await kajabiGet(path, accessToken, {
      ...baseParams,
      'page[number]': page,
      'page[size]': 100,
    });
    const items = Array.isArray(data?.data) ? data.data : [];
    for (const item of items) yield item;
    const totalPages = data?.meta?.total_pages || 0;
    if (page >= totalPages || items.length < 100) break;
  }
}

export async function sync(integration) {
  const accessToken = await getAccessToken(integration);
  const siteId = integration.metadata?.site_id;
  if (!siteId) {
    throw new Error('Kajabi integration is missing site_id. Please reconnect.');
  }

  const baseFilter = { 'filter[site_id]': siteId };
  let synced = 0;

  // Offers (products / courses).
  try {
    for await (const offer of paginate('/offers', accessToken, baseFilter)) {
      const a = offer.attributes || {};
      const { error } = await supabase.from('integration_data').upsert({
        user_id: integration.user_id,
        integration_id: integration.id,
        provider: 'kajabi',
        data_type: 'product',
        external_id: String(offer.id),
        title: a.title || 'Untitled Offer',
        content: a.description || '',
        metadata: {
          price_in_cents: a.price_in_cents ?? null,
          status: a.status || 'active',
          created_at: a.created_at,
        },
        synced_at: new Date().toISOString(),
      }, { onConflict: 'integration_id,external_id', ignoreDuplicates: false });
      if (!error) synced++;
    }
  } catch (err) {
    console.log(`[kajabi] /offers sync error: ${err.message}`);
  }

  // Transactions (revenue stream — what shows up as "sales").
  try {
    for await (const tx of paginate('/transactions', accessToken, baseFilter)) {
      const a = tx.attributes || {};
      const amountCents = a.amount_in_cents ?? 0;
      const currency = (a.currency || 'usd').toLowerCase();
      const customerId = tx.relationships?.customer?.data?.id || null;
      const { error } = await supabase.from('integration_data').upsert({
        user_id: integration.user_id,
        integration_id: integration.id,
        provider: 'kajabi',
        data_type: 'payment',
        external_id: String(tx.id),
        title: `Sale: ${a.formatted_amount || `${(amountCents / 100).toFixed(2)} ${currency.toUpperCase()}`}`,
        content: '',
        metadata: {
          amount: amountCents,
          currency,
          status: a.state === 'completed' || a.state === 'paid' ? 'succeeded' : a.state,
          customer_id: customerId,
          created: a.created_at ? Math.floor(new Date(a.created_at).getTime() / 1000) : null,
          payment_type: a.payment_type,
          action: a.action,
        },
        synced_at: new Date().toISOString(),
      }, { onConflict: 'integration_id,external_id', ignoreDuplicates: false });
      if (!error) synced++;
    }
  } catch (err) {
    console.log(`[kajabi] /transactions sync error: ${err.message}`);
  }

  // Purchases (includes subscriptions / recurring access).
  try {
    for await (const p of paginate('/purchases', accessToken, baseFilter, 5)) {
      const a = p.attributes || {};
      const isSub = a.recurring === true || a.subscription === true;
      const { error } = await supabase.from('integration_data').upsert({
        user_id: integration.user_id,
        integration_id: integration.id,
        provider: 'kajabi',
        data_type: isSub ? 'subscription' : 'purchase',
        external_id: String(p.id),
        title: `${isSub ? 'Subscription' : 'Purchase'}: ${a.offer_title || a.title || 'Unknown'} — ${a.state || 'active'}`,
        content: '',
        metadata: {
          status: a.state,
          offer_title: a.offer_title || a.title,
          recurring: !!a.recurring,
          created: a.created_at ? Math.floor(new Date(a.created_at).getTime() / 1000) : null,
        },
        synced_at: new Date().toISOString(),
      }, { onConflict: 'integration_id,external_id', ignoreDuplicates: false });
      if (!error) synced++;
    }
  } catch (err) {
    console.log(`[kajabi] /purchases sync error: ${err.message}`);
  }

  // Contacts (members / customers).
  try {
    for await (const c of paginate('/contacts', accessToken, baseFilter, 10)) {
      const a = c.attributes || {};
      const { error } = await supabase.from('integration_data').upsert({
        user_id: integration.user_id,
        integration_id: integration.id,
        provider: 'kajabi',
        data_type: 'customer',
        external_id: String(c.id),
        title: a.name || a.email || 'Unknown Contact',
        content: '',
        metadata: {
          email: a.email,
          name: a.name,
          phone: a.phone_number,
          subscribed: a.subscribed,
          created: a.created_at ? Math.floor(new Date(a.created_at).getTime() / 1000) : null,
        },
        synced_at: new Date().toISOString(),
      }, { onConflict: 'integration_id,external_id', ignoreDuplicates: false });
      if (!error) synced++;
    }
  } catch (err) {
    console.log(`[kajabi] /contacts sync error: ${err.message}`);
  }

  await supabase.from('integrations')
    .update({ last_synced_at: new Date().toISOString() })
    .eq('id', integration.id);

  return { synced, total: synced };
}

// ─────────────────────────── webhook handler ───────────────────────────

// Kajabi outbound webhook events we care about. Payload shape from
// help.kajabi.com/api-reference/webhooks/payment-succeeded-sample (etc).
// Kajabi does NOT HMAC-sign these — auth lives in the URL itself, so the
// per-user route path is the gate.
export async function handleWebhook(payload, integration) {
  if (!payload) return;
  const event = payload.event || payload.type || payload.event_type;
  const data = payload.data || payload;

  if (event === 'payment_succeeded' || event === 'purchase.completed' || event === 'sale.created' || event === 'order_created') {
    const amountCents = Number.isFinite(data.amount_in_cents)
      ? data.amount_in_cents
      : Math.round(parseFloat(data.amount ?? data.total ?? 0) * 100);
    await supabase.from('integration_data').upsert({
      user_id: integration.user_id,
      integration_id: integration.id,
      provider: 'kajabi',
      data_type: 'payment',
      external_id: String(data.id || data.transaction_id || data.order_id || `evt-${Date.now()}`),
      title: `Sale: $${(amountCents / 100).toFixed(2)} — ${data.offer_title || data.product_name || 'Unknown'}`,
      content: '',
      metadata: {
        amount: amountCents,
        currency: (data.currency || 'usd').toLowerCase(),
        status: 'succeeded',
        customer: data.member_email || data.email || null,
        created: Math.floor(Date.now() / 1000),
        offer_title: data.offer_title || data.product_name || null,
        event,
      },
      synced_at: new Date().toISOString(),
    }, { onConflict: 'integration_id,external_id', ignoreDuplicates: false });
  }

  if (event === 'purchase_created' || event === 'subscription.activated' || event === 'subscription.renewed') {
    await supabase.from('integration_data').upsert({
      user_id: integration.user_id,
      integration_id: integration.id,
      provider: 'kajabi',
      data_type: 'subscription',
      external_id: String(data.id || data.subscription_id || `evt-${Date.now()}`),
      title: `Subscription: ${data.offer_title || data.name || 'Unknown'} — active`,
      content: '',
      metadata: {
        status: 'active',
        customer: data.member_email || data.email || null,
        plan: data.offer_title || data.name || 'Unknown',
        event,
      },
      synced_at: new Date().toISOString(),
    }, { onConflict: 'integration_id,external_id', ignoreDuplicates: false });
  }
}
