import { Router } from 'express';
import Stripe from 'stripe';
import Busboy from 'busboy';
import { supabase } from '../services/storage.js';

const router = Router();

async function getStripeKey(userId) {
  const { data } = await supabase
    .from('integrations')
    .select('api_key')
    .eq('user_id', userId)
    .eq('provider', 'stripe')
    .eq('is_active', true)
    .single();
  if (!data?.api_key) throw new Error('Stripe not connected. Go to Settings to connect your Stripe account.');
  return data.api_key;
}

async function getWhopKey(userId) {
  const { data } = await supabase
    .from('integrations')
    .select('api_key')
    .eq('user_id', userId)
    .eq('provider', 'whop')
    .eq('is_active', true)
    .single();
  if (!data?.api_key) throw new Error('Whop not connected. Go to Settings to connect your Whop account.');
  return data.api_key;
}


// ─── Imported products (Shopify / Kajabi from integration_data) ───
router.get('/api/products/imported', async (req, res) => {
  const userId = req.user.id;
  if (userId === 'anonymous') return res.json({ products: [] });

  const { data, error } = await supabase
    .from('integration_data')
    .select('*')
    .eq('user_id', userId)
    .eq('data_type', 'product')
    .in('provider', ['shopify', 'kajabi'])
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });

  const products = (data || []).map((item) => ({
    id: item.id,
    provider: item.provider,
    name: item.title || item.name || 'Untitled',
    description: item.description || '',
    price: item.metadata?.price || null,
    image_url: item.metadata?.image_url || null,
    status: item.metadata?.status || 'active',
    checkout_url: item.metadata?.checkout_url || null,
    external_id: item.external_id,
    metadata: item.metadata,
    synced_at: item.updated_at || item.created_at,
  }));

  res.json({ products });
});

// ─── List products ───
router.get('/api/products', async (req, res) => {
  const userId = req.user.id;
  if (userId === 'anonymous') return res.json({ products: [] });

  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json({ products: data });
});

// ─── Create product ───
router.post('/api/products', async (req, res) => {
  const userId = req.user.id;
  if (userId === 'anonymous') return res.status(401).json({ error: 'Auth required' });

  const { name, description, type, price, priceMode, paymentProcessor } = req.body;
  if (!name || !type || !price) return res.status(400).json({ error: 'name, type, and price are required' });

  const priceCents = Math.round(parseFloat(price) * 100);
  if (isNaN(priceCents) || priceCents <= 0) return res.status(400).json({ error: 'Invalid price' });

  const processor = paymentProcessor || 'none';
  const isMonthly = priceMode === 'Monthly';

  try {
    const dbRow = {
      user_id: userId,
      name,
      description: description || '',
      type,
      price_cents: priceCents,
      price_mode: isMonthly ? 'monthly' : 'one_time',
      photos: [],
      payment_processor: processor,
    };

    if (processor === 'stripe') {
      const apiKey = await getStripeKey(userId);
      const stripe = new Stripe(apiKey);

      const stripeProduct = await stripe.products.create({
        name,
        description: description || undefined,
        metadata: { type, created_by: 'aiceo' },
      });

      const priceParams = {
        product: stripeProduct.id,
        unit_amount: priceCents,
        currency: 'usd',
      };
      if (isMonthly) priceParams.recurring = { interval: 'month' };
      const stripePrice = await stripe.prices.create(priceParams);

      const paymentLink = await stripe.paymentLinks.create({
        line_items: [{ price: stripePrice.id, quantity: 1 }],
      });

      dbRow.stripe_product_id = stripeProduct.id;
      dbRow.stripe_price_id = stripePrice.id;
      dbRow.stripe_payment_link_id = paymentLink.id;
      dbRow.payment_link_url = paymentLink.url;
    } else if (processor === 'whop') {
      const apiKey = await getWhopKey(userId);

      // Create Whop product
      const createRes = await fetch('https://api.whop.com/api/v5/products', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name,
          description: description || undefined,
        }),
      });

      if (!createRes.ok) {
        const errBody = await createRes.text();
        throw new Error(`Whop product creation failed: ${errBody}`);
      }

      const whopProduct = await createRes.json();

      // Create Whop plan (price)
      const planRes = await fetch('https://api.whop.com/api/v5/plans', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          product_id: whopProduct.id,
          plan_type: isMonthly ? 'renewal' : 'one_time',
          initial_price: priceCents,
          currency: 'usd',
          ...(isMonthly ? { renewal_period: 'monthly', renewal_price: priceCents } : {}),
        }),
      });

      if (!planRes.ok) {
        const errBody = await planRes.text();
        throw new Error(`Whop plan creation failed: ${errBody}`);
      }

      const whopPlan = await planRes.json();

      dbRow.whop_product_id = whopProduct.id;
      dbRow.whop_plan_id = whopPlan.id;
      dbRow.payment_link_url = whopPlan.checkout_link || whopProduct.checkout_link || null;
    }
    // processor === 'none' — just save to DB, no external API calls

    const { data, error } = await supabase
      .from('products')
      .insert(dbRow)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });

    console.log(`[products] Created "${name}" (${processor}) for user ${userId}`);
    res.json({ product: data });
  } catch (err) {
    console.log(`[products] Create error: ${err.message}`);
    res.status(400).json({ error: err.message });
  }
});

// ─── Update product ───
router.put('/api/products/:id', async (req, res) => {
  const userId = req.user.id;
  if (userId === 'anonymous') return res.status(401).json({ error: 'Auth required' });

  const { name, description, type } = req.body;

  // Fetch existing
  const { data: existing, error: fetchErr } = await supabase
    .from('products')
    .select('*')
    .eq('id', req.params.id)
    .eq('user_id', userId)
    .single();

  if (fetchErr || !existing) return res.status(404).json({ error: 'Product not found' });

  try {
    // Update Stripe product name/description if changed
    if (existing.stripe_product_id && (name || description !== undefined)) {
      const apiKey = await getStripeKey(userId);
      const stripe = new Stripe(apiKey);
      const updates = {};
      if (name) updates.name = name;
      if (description !== undefined) updates.description = description;
      await stripe.products.update(existing.stripe_product_id, updates);
    }

    // Update DB
    const dbUpdates = { updated_at: new Date().toISOString() };
    if (name) dbUpdates.name = name;
    if (description !== undefined) dbUpdates.description = description;
    if (type) dbUpdates.type = type;

    const { data, error } = await supabase
      .from('products')
      .update(dbUpdates)
      .eq('id', req.params.id)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    res.json({ product: data });
  } catch (err) {
    console.log(`[products] Update error: ${err.message}`);
    res.status(400).json({ error: err.message });
  }
});

// ─── Delete product ───
router.delete('/api/products/:id', async (req, res) => {
  const userId = req.user.id;
  if (userId === 'anonymous') return res.status(401).json({ error: 'Auth required' });

  const { data: existing } = await supabase
    .from('products')
    .select('stripe_product_id, stripe_payment_link_id, payment_processor')
    .eq('id', req.params.id)
    .eq('user_id', userId)
    .single();

  try {
    if (existing?.stripe_product_id && existing?.payment_processor === 'stripe') {
      const apiKey = await getStripeKey(userId);
      const stripe = new Stripe(apiKey);
      if (existing.stripe_payment_link_id) {
        await stripe.paymentLinks.update(existing.stripe_payment_link_id, { active: false }).catch(() => {});
      }
      await stripe.products.update(existing.stripe_product_id, { active: false }).catch(() => {});
    }
  } catch (err) {
    console.log(`[products] Cleanup error: ${err.message}`);
  }

  const { error } = await supabase
    .from('products')
    .delete()
    .eq('id', req.params.id)
    .eq('user_id', userId);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// ─── Regenerate payment link ───
router.post('/api/products/:id/payment-link', async (req, res) => {
  const userId = req.user.id;
  if (userId === 'anonymous') return res.status(401).json({ error: 'Auth required' });

  const { data: existing, error: fetchErr } = await supabase
    .from('products')
    .select('*')
    .eq('id', req.params.id)
    .eq('user_id', userId)
    .single();

  if (fetchErr || !existing) return res.status(404).json({ error: 'Product not found' });
  if (!existing.stripe_price_id) return res.status(400).json({ error: 'No Stripe price associated' });

  try {
    const apiKey = await getStripeKey(userId);
    const stripe = new Stripe(apiKey);

    // Deactivate old link
    if (existing.stripe_payment_link_id) {
      await stripe.paymentLinks.update(existing.stripe_payment_link_id, { active: false }).catch(() => {});
    }

    // Create new link
    const paymentLink = await stripe.paymentLinks.create({
      line_items: [{ price: existing.stripe_price_id, quantity: 1 }],
    });

    const { data, error } = await supabase
      .from('products')
      .update({
        stripe_payment_link_id: paymentLink.id,
        payment_link_url: paymentLink.url,
        updated_at: new Date().toISOString(),
      })
      .eq('id', req.params.id)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    res.json({ product: data });
  } catch (err) {
    console.log(`[products] Payment link error: ${err.message}`);
    res.status(400).json({ error: err.message });
  }
});

// ─── Upload product photos ───
router.post('/api/products/:id/photos', async (req, res) => {
  const userId = req.user.id;
  if (userId === 'anonymous') return res.status(401).json({ error: 'Auth required' });

  const { data: product, error: fetchErr } = await supabase
    .from('products')
    .select('id, photos')
    .eq('id', req.params.id)
    .eq('user_id', userId)
    .single();

  if (fetchErr || !product) return res.status(404).json({ error: 'Product not found' });

  const existingPhotos = product.photos || [];
  if (existingPhotos.length >= 3) return res.status(400).json({ error: 'Maximum 3 photos allowed' });

  const busboy = Busboy({ headers: req.headers, limits: { files: 3 - existingPhotos.length, fileSize: 10 * 1024 * 1024 } });
  const uploadedPhotos = [];

  busboy.on('file', (fieldname, stream, info) => {
    const { filename, mimeType } = info;
    if (!mimeType.startsWith('image/')) {
      stream.resume();
      return;
    }

    const chunks = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('end', async () => {
      const buffer = Buffer.concat(chunks);
      const ext = filename.split('.').pop() || 'jpg';
      const storagePath = `${userId}/${product.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

      const { error: uploadErr } = await supabase.storage
        .from('product-images')
        .upload(storagePath, buffer, { contentType: mimeType, upsert: true });

      if (!uploadErr) {
        const { data: { publicUrl } } = supabase.storage
          .from('product-images')
          .getPublicUrl(storagePath);

        uploadedPhotos.push({ id: `photo-${Date.now()}-${Math.random().toString(36).slice(2)}`, url: publicUrl });
      }
    });
  });

  busboy.on('finish', async () => {
    const allPhotos = [...existingPhotos, ...uploadedPhotos].slice(0, 3);

    const { data, error } = await supabase
      .from('products')
      .update({ photos: allPhotos, updated_at: new Date().toISOString() })
      .eq('id', product.id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    res.json({ product: data });
  });

  busboy.on('error', (err) => {
    res.status(500).json({ error: err.message });
  });

  req.pipe(busboy);
});

export default router;
