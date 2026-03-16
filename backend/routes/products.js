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

  const { name, description, type, price, priceMode, paymentProcessor, pricingOptions } = req.body;

  // Build normalized pricing options array (supports both old single-price and new multi-price)
  let options;
  if (Array.isArray(pricingOptions) && pricingOptions.length > 0) {
    options = pricingOptions.map((opt) => {
      const cents = Math.round(parseFloat(opt.price) * 100);
      if (isNaN(cents) || cents <= 0) throw new Error('Invalid price in pricing options');
      return { price_cents: cents, price_mode: opt.priceMode === 'Monthly' ? 'monthly' : 'one_time' };
    });
  } else if (price) {
    const cents = Math.round(parseFloat(price) * 100);
    if (isNaN(cents) || cents <= 0) return res.status(400).json({ error: 'Invalid price' });
    options = [{ price_cents: cents, price_mode: priceMode === 'Monthly' ? 'monthly' : 'one_time' }];
  } else {
    return res.status(400).json({ error: 'name, type, and at least one pricing option are required' });
  }

  if (!name || !type) return res.status(400).json({ error: 'name and type are required' });

  const processor = paymentProcessor || 'none';

  try {
    // Use first option for the legacy single-price columns
    const dbRow = {
      user_id: userId,
      name,
      description: description || '',
      type,
      price_cents: options[0].price_cents,
      price_mode: options[0].price_mode,
      photos: [],
      payment_processor: processor,
      pricing_options: options, // will be enriched with Stripe/Whop IDs below
    };

    if (processor === 'stripe') {
      const apiKey = await getStripeKey(userId);
      const stripe = new Stripe(apiKey);

      // One Stripe product for all pricing options
      const stripeProduct = await stripe.products.create({
        name,
        description: description || undefined,
        metadata: { type, created_by: 'aiceo' },
      });

      dbRow.stripe_product_id = stripeProduct.id;

      // Create a price + payment link per pricing option
      for (const opt of options) {
        const priceParams = {
          product: stripeProduct.id,
          unit_amount: opt.price_cents,
          currency: 'usd',
        };
        if (opt.price_mode === 'monthly') priceParams.recurring = { interval: 'month' };
        const stripePrice = await stripe.prices.create(priceParams);

        const paymentLink = await stripe.paymentLinks.create({
          line_items: [{ price: stripePrice.id, quantity: 1 }],
        });

        opt.stripe_price_id = stripePrice.id;
        opt.stripe_payment_link_id = paymentLink.id;
        opt.payment_link_url = paymentLink.url;
      }

      // Legacy columns: use first option
      dbRow.stripe_price_id = options[0].stripe_price_id;
      dbRow.stripe_payment_link_id = options[0].stripe_payment_link_id;
      dbRow.payment_link_url = options[0].payment_link_url;
    } else if (processor === 'whop') {
      const apiKey = await getWhopKey(userId);

      // One Whop product
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
      dbRow.whop_product_id = whopProduct.id;

      // Create a plan per pricing option
      for (const opt of options) {
        const isMonthly = opt.price_mode === 'monthly';
        const planRes = await fetch('https://api.whop.com/api/v5/plans', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            product_id: whopProduct.id,
            plan_type: isMonthly ? 'renewal' : 'one_time',
            initial_price: opt.price_cents,
            currency: 'usd',
            ...(isMonthly ? { renewal_period: 'monthly', renewal_price: opt.price_cents } : {}),
          }),
        });

        if (!planRes.ok) {
          const errBody = await planRes.text();
          throw new Error(`Whop plan creation failed: ${errBody}`);
        }

        const whopPlan = await planRes.json();
        opt.whop_plan_id = whopPlan.id;
        opt.payment_link_url = whopPlan.checkout_link || whopProduct.checkout_link || null;
      }

      dbRow.whop_plan_id = options[0].whop_plan_id || null;
      dbRow.payment_link_url = options[0].payment_link_url || null;
    }
    // processor === 'none' — just save to DB, no external API calls

    dbRow.pricing_options = options;

    let { data, error } = await supabase
      .from('products')
      .insert(dbRow)
      .select()
      .single();

    // If pricing_options column doesn't exist yet, retry without it
    if (error && error.message && error.message.includes('pricing_options')) {
      console.log('[products] pricing_options column not found, inserting without it');
      delete dbRow.pricing_options;
      const retry = await supabase.from('products').insert(dbRow).select().single();
      data = retry.data;
      error = retry.error;
    }

    if (error) return res.status(500).json({ error: error.message });

    console.log(`[products] Created "${name}" (${processor}, ${options.length} pricing option${options.length > 1 ? 's' : ''}) for user ${userId}`);
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

  const { name, description, type, photos } = req.body;

  // Fetch existing
  const { data: existing, error: fetchErr } = await supabase
    .from('products')
    .select('*')
    .eq('id', req.params.id)
    .eq('user_id', userId)
    .single();

  if (fetchErr || !existing) return res.status(404).json({ error: 'Product not found' });

  try {
    // Update Stripe product name/description/images if changed
    if (existing.stripe_product_id && (name || description !== undefined || photos !== undefined)) {
      const apiKey = await getStripeKey(userId);
      const stripe = new Stripe(apiKey);
      const updates = {};
      if (name) updates.name = name;
      if (description !== undefined) updates.description = description;
      if (photos !== undefined) updates.images = photos.map(p => p.url).slice(0, 8);
      await stripe.products.update(existing.stripe_product_id, updates);
    }

    // Update DB
    const dbUpdates = { updated_at: new Date().toISOString() };
    if (name) dbUpdates.name = name;
    if (description !== undefined) dbUpdates.description = description;
    if (type) dbUpdates.type = type;
    if (photos !== undefined) dbUpdates.photos = photos;

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

  let { data: existing } = await supabase
    .from('products')
    .select('stripe_product_id, stripe_payment_link_id, payment_processor, pricing_options')
    .eq('id', req.params.id)
    .eq('user_id', userId)
    .single();

  // Fallback if pricing_options column doesn't exist yet
  if (!existing) {
    const fallback = await supabase
      .from('products')
      .select('stripe_product_id, stripe_payment_link_id, payment_processor')
      .eq('id', req.params.id)
      .eq('user_id', userId)
      .single();
    existing = fallback.data;
  }

  try {
    if (existing?.stripe_product_id && existing?.payment_processor === 'stripe') {
      const apiKey = await getStripeKey(userId);
      const stripe = new Stripe(apiKey);
      // Deactivate all payment links from pricing_options
      const opts = existing.pricing_options || [];
      for (const opt of opts) {
        if (opt.stripe_payment_link_id) {
          await stripe.paymentLinks.update(opt.stripe_payment_link_id, { active: false }).catch(() => {});
        }
      }
      // Also deactivate legacy single link if present
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
  const uploadPromises = [];

  busboy.on('file', (fieldname, stream, info) => {
    const { filename, mimeType } = info;
    if (!mimeType.startsWith('image/')) {
      stream.resume();
      return;
    }

    const chunks = [];
    stream.on('data', (chunk) => chunks.push(chunk));

    const uploadDone = new Promise((resolve) => {
      stream.on('end', async () => {
        try {
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

            resolve({ id: `photo-${Date.now()}-${Math.random().toString(36).slice(2)}`, url: publicUrl });
          } else {
            console.log(`[products] Photo upload error: ${uploadErr.message}`);
            resolve(null);
          }
        } catch (err) {
          console.log(`[products] Photo upload exception: ${err.message}`);
          resolve(null);
        }
      });
    });

    uploadPromises.push(uploadDone);
  });

  busboy.on('finish', async () => {
    // Wait for all uploads to actually complete
    const results = await Promise.all(uploadPromises);
    const uploadedPhotos = results.filter(Boolean);

    const allPhotos = [...existingPhotos, ...uploadedPhotos].slice(0, 3);

    const { data, error } = await supabase
      .from('products')
      .update({ photos: allPhotos, updated_at: new Date().toISOString() })
      .eq('id', product.id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });

    // Sync images to Stripe product so payment link shows them
    if (data.stripe_product_id && allPhotos.length > 0) {
      try {
        const apiKey = await getStripeKey(userId);
        const stripe = new Stripe(apiKey);
        await stripe.products.update(data.stripe_product_id, {
          images: allPhotos.map(p => p.url).slice(0, 8),
        });
      } catch (stripeErr) {
        console.log(`[products] Stripe image sync error: ${stripeErr.message}`);
      }
    }

    res.json({ product: data });
  });

  busboy.on('error', (err) => {
    res.status(500).json({ error: err.message });
  });

  req.pipe(busboy);
});

export default router;
