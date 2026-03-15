import { Router } from 'express';
import { supabase } from '../services/storage.js';
import { syncContactToGHL, syncContactFromGHL, sync as syncGHL } from '../services/integrations/gohighlevel.js';

const router = Router();

// Helper: get active GHL integration for a user
async function getGHLIntegration(userId) {
  const { data } = await supabase
    .from('integrations')
    .select('*')
    .eq('user_id', userId)
    .eq('provider', 'gohighlevel')
    .eq('is_active', true)
    .single();
  return data;
}

// ─── List all contacts ───
router.get('/api/contacts', async (req, res) => {
  const userId = req.user.id;
  if (userId === 'anonymous') return res.json({ contacts: [] });

  const { data, error } = await supabase
    .from('contacts')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json({ contacts: data });
});

// ─── Create contact ───
router.post('/api/contacts', async (req, res) => {
  const userId = req.user.id;
  if (userId === 'anonymous') return res.status(401).json({ error: 'Auth required' });

  const { name, phone, email, business, status, tags, notes, socials } = req.body;
  if (!name && !email) return res.status(400).json({ error: 'name or email is required' });

  // Check for duplicate email (only if email is provided)
  if (email?.trim()) {
    const { data: existing } = await supabase
      .from('contacts')
      .select('id')
      .eq('user_id', userId)
      .eq('email', email.trim())
      .maybeSingle();
    if (existing) return res.status(409).json({ error: 'A contact with this email already exists' });
  }

  const { data, error } = await supabase
    .from('contacts')
    .insert({
      user_id: userId,
      name: name || '',
      phone: phone || '',
      email: email || '',
      business: business || '',
      status: status || 'New Lead',
      tags: tags || [],
      notes: notes || '',
      socials: socials || { instagram: [], linkedin: [], x: [] },
      source: 'manual',
      ghl_sync_status: 'pending',
    })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });

  // Push to GHL in background (fire-and-forget)
  getGHLIntegration(userId).then(integration => {
    if (integration) {
      syncContactToGHL(data, { ...integration, user_id: userId }).catch(err => {
        console.log(`[contacts] GHL push failed for new contact: ${err.message}`);
      });
    } else {
      // No GHL integration, set status back to none
      supabase.from('contacts').update({ ghl_sync_status: 'none' }).eq('id', data.id).then(() => {});
    }
  });

  res.json({ contact: data });
});

// ─── Update contact ───
router.put('/api/contacts/:id', async (req, res) => {
  const userId = req.user.id;
  if (userId === 'anonymous') return res.status(401).json({ error: 'Auth required' });

  const updates = { updated_at: new Date().toISOString() };
  const allowed = ['name', 'phone', 'email', 'business', 'status', 'tags', 'notes', 'socials'];
  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }

  const { data, error } = await supabase
    .from('contacts')
    .update(updates)
    .eq('id', req.params.id)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });

  // Push update to GHL in background
  getGHLIntegration(userId).then(integration => {
    if (integration) {
      syncContactToGHL(data, { ...integration, user_id: userId }).catch(err => {
        console.log(`[contacts] GHL push failed for update: ${err.message}`);
      });
    }
  });

  res.json({ contact: data });
});

// ─── Delete contact ───
router.delete('/api/contacts/:id', async (req, res) => {
  const userId = req.user.id;
  if (userId === 'anonymous') return res.status(401).json({ error: 'Auth required' });

  // Fetch contact before deleting to log GHL link
  const { data: contact } = await supabase
    .from('contacts')
    .select('ghl_contact_id')
    .eq('id', req.params.id)
    .eq('user_id', userId)
    .single();

  if (contact?.ghl_contact_id) {
    console.log(`[contacts] Deleting locally — GHL contact ${contact.ghl_contact_id} preserved in GHL`);
  }

  const { error } = await supabase
    .from('contacts')
    .delete()
    .eq('id', req.params.id)
    .eq('user_id', userId);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// ─── Manual single-contact GHL sync ───
router.post('/api/contacts/:id/sync-ghl', async (req, res) => {
  const userId = req.user.id;
  if (userId === 'anonymous') return res.status(401).json({ error: 'Auth required' });

  const { data: contact, error: cErr } = await supabase
    .from('contacts')
    .select('*')
    .eq('id', req.params.id)
    .eq('user_id', userId)
    .single();

  if (cErr || !contact) return res.status(404).json({ error: 'Contact not found' });

  const integration = await getGHLIntegration(userId);
  if (!integration) return res.status(400).json({ error: 'GoHighLevel not connected' });

  try {
    await syncContactToGHL(contact, { ...integration, user_id: userId });
    // Re-fetch to get updated sync status
    const { data: updated } = await supabase
      .from('contacts')
      .select('*')
      .eq('id', contact.id)
      .single();
    res.json({ contact: updated || contact });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Get contact detail (recordings, emails, products) ───
router.get('/api/contacts/:id/detail', async (req, res) => {
  const userId = req.user.id;
  if (userId === 'anonymous') return res.status(401).json({ error: 'Auth required' });

  const { data: contact, error: cErr } = await supabase
    .from('contacts')
    .select('*')
    .eq('id', req.params.id)
    .eq('user_id', userId)
    .single();

  if (cErr || !contact) return res.status(404).json({ error: 'Contact not found' });

  const email = contact.email?.toLowerCase();
  const name = contact.name?.toLowerCase();

  // 1. Call recordings from integration_data (fireflies/fathom)
  let recordings = [];
  if (email || name) {
    const { data: transcripts } = await supabase
      .from('integration_data')
      .select('*')
      .eq('user_id', userId)
      .in('provider', ['fireflies', 'fathom'])
      .eq('data_type', 'transcript')
      .order('synced_at', { ascending: false })
      .limit(50);

    if (transcripts) {
      recordings = transcripts.filter(t => {
        const content = (t.content || '').toLowerCase();
        const title = (t.title || '').toLowerCase();
        const participants = JSON.stringify(t.metadata?.participants || []).toLowerCase();
        const attendees = JSON.stringify(t.metadata?.attendees || []).toLowerCase();
        if (email && (content.includes(email) || title.includes(email) || participants.includes(email) || attendees.includes(email))) return true;
        if (name && name.length > 2 && (title.includes(name) || participants.includes(name) || attendees.includes(name))) return true;
        return false;
      }).map(t => ({
        id: t.id,
        name: t.title,
        date: t.metadata?.date || new Date(t.synced_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        duration: t.metadata?.duration || '',
        provider: t.provider,
        summary: t.metadata?.summary || '',
      }));
    }
  }

  // 2. Emails from emails table
  let emails = [];
  if (email) {
    const { data: emailData } = await supabase
      .from('emails')
      .select('id, subject, from_address, to_address, snippet, date, folder')
      .eq('user_id', userId)
      .or(`from_address.ilike.%${email}%,to_address.ilike.%${email}%`)
      .order('date', { ascending: false })
      .limit(20);

    if (emailData) {
      emails = emailData.map(e => ({
        id: e.id,
        subject: e.subject || '(No subject)',
        date: new Date(e.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        snippet: e.snippet || '',
        folder: e.folder,
      }));
    }
  }

  // 3. Products/payments from Stripe integration_data
  let products = [];
  if (email) {
    const { data: payments } = await supabase
      .from('integration_data')
      .select('*')
      .eq('user_id', userId)
      .eq('provider', 'stripe')
      .eq('data_type', 'payment')
      .order('synced_at', { ascending: false })
      .limit(100);

    if (payments) {
      products = payments.filter(p => {
        const receiptEmail = (p.metadata?.receipt_email || '').toLowerCase();
        const custEmail = (p.metadata?.customer_email || '').toLowerCase();
        return receiptEmail === email || custEmail === email;
      }).map(p => ({
        id: p.id,
        name: p.title,
        price: `$${((p.metadata?.amount || 0) / 100).toFixed(2)}`,
        date: p.metadata?.created
          ? new Date(p.metadata.created * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
          : '',
        status: p.metadata?.status,
      }));
    }
  }

  // 4. PurelyPersonal meetings linked to this contact
  let ppMeetings = [];
  const { data: linkedMeetings } = await supabase
    .from('meeting_contacts')
    .select('meeting_id, role')
    .eq('contact_id', req.params.id);

  if (linkedMeetings?.length) {
    const meetingIds = linkedMeetings.map(lm => lm.meeting_id);
    const { data: meetingData } = await supabase
      .from('meetings')
      .select('id, title, platform, started_at, duration_seconds, recall_bot_status, summary')
      .in('id', meetingIds)
      .order('started_at', { ascending: false });

    if (meetingData) {
      ppMeetings = meetingData.map(m => ({
        id: m.id,
        name: m.title || 'Meeting',
        date: m.started_at ? new Date(m.started_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '',
        duration: m.duration_seconds ? `${Math.round(m.duration_seconds / 60)} min` : '',
        provider: 'purelypersonal',
        platform: m.platform,
        summary: m.summary?.overview || '',
        status: m.recall_bot_status,
      }));
    }
  }

  // Merge PurelyPersonal meetings into recordings
  recordings = [...ppMeetings, ...recordings];

  res.json({ recordings, emails, products });
});

// ─── Sync contacts from integrations ───
router.post('/api/contacts/sync', async (req, res) => {
  const userId = req.user.id;
  if (userId === 'anonymous') return res.status(401).json({ error: 'Auth required' });

  let synced = 0;

  // 1. Sync from Stripe customers
  const { data: stripeCustomers } = await supabase
    .from('integration_data')
    .select('*')
    .eq('user_id', userId)
    .eq('provider', 'stripe')
    .eq('data_type', 'customer')
    .limit(200);

  if (stripeCustomers) {
    for (const cust of stripeCustomers) {
      const email = cust.metadata?.email;
      if (!email) continue;

      const { error } = await supabase.from('contacts').upsert({
        user_id: userId,
        name: cust.metadata?.name || cust.title || '',
        email,
        phone: cust.metadata?.phone || '',
        business: '',
        status: 'Contacted',
        tags: ['Stripe Customer'],
        notes: '',
        socials: { instagram: [], linkedin: [], x: [] },
        source: 'stripe',
      }, { onConflict: 'user_id,email', ignoreDuplicates: true });
      if (!error) synced++;
    }
  }

  // 2. Sync from Fireflies/Fathom transcripts (extract participant emails)
  const { data: transcripts } = await supabase
    .from('integration_data')
    .select('*')
    .eq('user_id', userId)
    .in('provider', ['fireflies', 'fathom'])
    .eq('data_type', 'transcript')
    .limit(100);

  if (transcripts) {
    for (const t of transcripts) {
      const participants = t.metadata?.participants || t.metadata?.attendees || [];
      for (const p of participants) {
        const pEmail = (typeof p === 'string') ? p : (p.email || '');
        const pName = (typeof p === 'string') ? '' : (p.name || p.displayName || '');
        if (!pEmail || !pEmail.includes('@')) continue;

        const { error } = await supabase.from('contacts').upsert({
          user_id: userId,
          name: pName,
          email: pEmail.toLowerCase(),
          phone: '',
          business: '',
          status: 'Contacted',
          tags: ['Call Participant'],
          notes: '',
          socials: { instagram: [], linkedin: [], x: [] },
          source: t.provider,
        }, { onConflict: 'user_id,email', ignoreDuplicates: true });
        if (!error) synced++;
      }
    }
  }

  // 3. Sync from emails (unique from/to addresses)
  const { data: emailRows } = await supabase
    .from('emails')
    .select('from_address, from_name, to_address')
    .eq('user_id', userId)
    .order('date', { ascending: false })
    .limit(200);

  if (emailRows) {
    const seen = new Set();
    // Get user's own email accounts to exclude
    const { data: userAccounts } = await supabase
      .from('email_accounts')
      .select('email')
      .eq('user_id', userId);
    const ownEmails = new Set((userAccounts || []).map(a => a.email?.toLowerCase()));

    for (const row of emailRows) {
      // From address
      if (row.from_address && !ownEmails.has(row.from_address.toLowerCase()) && !seen.has(row.from_address.toLowerCase())) {
        seen.add(row.from_address.toLowerCase());
        const { error } = await supabase.from('contacts').upsert({
          user_id: userId,
          name: row.from_name || '',
          email: row.from_address.toLowerCase(),
          phone: '',
          business: '',
          status: 'New Lead',
          tags: ['Email'],
          notes: '',
          socials: { instagram: [], linkedin: [], x: [] },
          source: 'email',
        }, { onConflict: 'user_id,email', ignoreDuplicates: true });
        if (!error) synced++;
      }

      // To addresses (can be comma-separated)
      const toAddrs = (row.to_address || '').split(',').map(s => s.trim().toLowerCase()).filter(s => s.includes('@'));
      for (const to of toAddrs) {
        if (ownEmails.has(to) || seen.has(to)) continue;
        seen.add(to);
        const { error } = await supabase.from('contacts').upsert({
          user_id: userId,
          name: '',
          email: to,
          phone: '',
          business: '',
          status: 'Contacted',
          tags: ['Email'],
          notes: '',
          socials: { instagram: [], linkedin: [], x: [] },
          source: 'email',
        }, { onConflict: 'user_id,email', ignoreDuplicates: true });
        if (!error) synced++;
      }
    }
  }

  // 4. Sync from GoHighLevel — fetch fresh from GHL API, then materialize
  const ghlIntegration = await getGHLIntegration(userId);
  if (ghlIntegration) {
    try {
      const ghlResult = await syncGHL({ ...ghlIntegration, user_id: userId });
      synced += ghlResult.synced || 0;
      console.log(`[contacts] GHL API sync: ${ghlResult.synced} contacts fetched`);
    } catch (err) {
      console.log(`[contacts] GHL API sync failed: ${err.message}`);
    }
  }

  console.log(`[contacts] Synced ${synced} contacts for user ${userId}`);
  res.json({ synced });
});

export default router;
