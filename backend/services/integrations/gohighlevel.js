import { supabase } from '../storage.js';

const GHL_API = 'https://rest.gohighlevel.com/v1';

// In-memory set of contact IDs currently being synced (prevents sync loops)
const syncingContacts = new Map(); // contactId -> timestamp

function isSyncing(contactId) {
  const ts = syncingContacts.get(contactId);
  if (!ts) return false;
  if (Date.now() - ts > 10000) { // 10s TTL
    syncingContacts.delete(contactId);
    return false;
  }
  return true;
}

function markSyncing(contactId) {
  syncingContacts.set(contactId, Date.now());
  setTimeout(() => syncingContacts.delete(contactId), 10000);
}

function ghlHeaders(apiKey) {
  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };
}

// ─── GHL API Helpers ───

export async function createGHLContact(apiKey, contactData) {
  const res = await fetch(`${GHL_API}/contacts/`, {
    method: 'POST',
    headers: ghlHeaders(apiKey),
    body: JSON.stringify(contactData),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `GHL create contact failed (${res.status})`);
  }
  return res.json();
}

export async function updateGHLContact(apiKey, ghlContactId, contactData) {
  const res = await fetch(`${GHL_API}/contacts/${ghlContactId}`, {
    method: 'PUT',
    headers: ghlHeaders(apiKey),
    body: JSON.stringify(contactData),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `GHL update contact failed (${res.status})`);
  }
  return res.json();
}

export async function searchGHLContactByEmail(apiKey, email) {
  const res = await fetch(`${GHL_API}/contacts/lookup?email=${encodeURIComponent(email)}`, {
    headers: ghlHeaders(apiKey),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.contacts?.[0] || null;
}

// ─── Inbound: GHL → Local ───

export async function syncContactFromGHL(ghlContact, userId) {
  const name = [ghlContact.firstName, ghlContact.lastName].filter(Boolean).join(' ') || '';
  const email = ghlContact.email || '';
  const phone = ghlContact.phone || '';
  const business = ghlContact.companyName || '';
  const ghlId = ghlContact.id;

  if (!email && !ghlId) return null;

  // Check if contact already exists locally (by email or ghl_contact_id)
  let existing = null;
  if (email) {
    const { data } = await supabase.from('contacts')
      .select('*')
      .eq('user_id', userId)
      .eq('email', email)
      .single();
    existing = data;
  }
  if (!existing && ghlId) {
    const { data } = await supabase.from('contacts')
      .select('*')
      .eq('user_id', userId)
      .eq('ghl_contact_id', ghlId)
      .single();
    existing = data;
  }

  const now = new Date().toISOString();

  if (existing) {
    // Mark syncing to prevent loop
    markSyncing(existing.id);

    // Update: only fill in blank fields, always update GHL link
    const updates = {
      ghl_contact_id: ghlId,
      ghl_sync_status: 'synced',
      ghl_synced_at: now,
      ghl_sync_error: null,
      updated_at: now,
    };
    if (!existing.name && name) updates.name = name;
    if (!existing.phone && phone) updates.phone = phone;
    if (!existing.business && business) updates.business = business;

    const { data, error } = await supabase.from('contacts')
      .update(updates)
      .eq('id', existing.id)
      .select()
      .single();

    if (error) console.log(`[ghl-sync] Update local contact error: ${error.message}`);
    return data || existing;
  } else {
    // Create new local contact
    const contactEmail = email || `ghl-${ghlId}@placeholder.local`;
    const record = {
      user_id: userId,
      name: name || '',
      phone,
      email: contactEmail,
      business,
      status: 'New Lead',
      tags: ghlContact.tags || [],
      notes: '',
      socials: { instagram: [], linkedin: [], x: [] },
      source: 'gohighlevel',
      ghl_contact_id: ghlId,
      ghl_sync_status: 'synced',
      ghl_synced_at: now,
    };

    const { data, error } = await supabase.from('contacts')
      .upsert(record, { onConflict: 'user_id,email', ignoreDuplicates: false })
      .select()
      .single();

    if (data) markSyncing(data.id);
    if (error) console.log(`[ghl-sync] Create local contact error: ${error.message}`);
    return data;
  }
}

// ─── Outbound: Local → GHL ───

export async function syncContactToGHL(contact, integration) {
  if (!integration?.api_key || !integration.is_active) return;
  if (isSyncing(contact.id)) return; // prevent loop

  markSyncing(contact.id);

  const nameParts = (contact.name || '').split(' ');
  const firstName = nameParts[0] || '';
  const lastName = nameParts.slice(1).join(' ') || '';

  const ghlData = {
    firstName,
    lastName,
    email: contact.email || undefined,
    phone: contact.phone || undefined,
    companyName: contact.business || undefined,
  };

  // Remove undefined fields
  Object.keys(ghlData).forEach(k => ghlData[k] === undefined && delete ghlData[k]);

  try {
    let ghlContactId = contact.ghl_contact_id;

    if (ghlContactId) {
      // Update existing GHL contact
      await updateGHLContact(integration.api_key, ghlContactId, ghlData);
    } else {
      // Check for duplicate by email first
      if (contact.email && !contact.email.includes('@placeholder.local')) {
        const existing = await searchGHLContactByEmail(integration.api_key, contact.email);
        if (existing) {
          ghlContactId = existing.id;
          await updateGHLContact(integration.api_key, ghlContactId, ghlData);
        }
      }

      // Create new if no existing found
      if (!ghlContactId) {
        const result = await createGHLContact(integration.api_key, ghlData);
        ghlContactId = result.contact?.id;
      }
    }

    // Update local contact with GHL link
    const now = new Date().toISOString();
    await supabase.from('contacts')
      .update({
        ghl_contact_id: ghlContactId,
        ghl_sync_status: 'synced',
        ghl_synced_at: now,
        ghl_sync_error: null,
        updated_at: now,
      })
      .eq('id', contact.id);

    console.log(`[ghl-sync] Pushed contact ${contact.id} → GHL ${ghlContactId}`);
  } catch (err) {
    console.log(`[ghl-sync] Push failed for ${contact.id}: ${err.message}`);
    await supabase.from('contacts')
      .update({
        ghl_sync_status: 'error',
        ghl_sync_error: err.message,
        updated_at: new Date().toISOString(),
      })
      .eq('id', contact.id);
  }
}

// ─── Webhook Handler ───

export async function handleWebhook(payload, integration) {
  const type = payload.type || payload.event;
  const contactData = payload.contact || payload;

  console.log(`[ghl-webhook] Received ${type} for user ${integration.user_id}`);

  if (type === 'ContactCreate' || type === 'ContactUpdate') {
    // Upsert into integration_data
    const name = [contactData.firstName, contactData.lastName].filter(Boolean).join(' ') || contactData.email || 'Unknown';
    await supabase.from('integration_data').upsert({
      user_id: integration.user_id,
      integration_id: integration.id,
      provider: 'gohighlevel',
      data_type: 'contact',
      external_id: contactData.id,
      title: name,
      content: '',
      metadata: {
        email: contactData.email,
        phone: contactData.phone,
        first_name: contactData.firstName,
        last_name: contactData.lastName,
        company: contactData.companyName,
        tags: contactData.tags,
        source: contactData.source,
        date_added: contactData.dateAdded,
      },
      synced_at: new Date().toISOString(),
    }, { onConflict: 'integration_id,external_id', ignoreDuplicates: false });

    // Materialize into contacts table
    await syncContactFromGHL(contactData, integration.user_id);
  } else if (type === 'ContactDelete') {
    const ghlId = contactData.id;
    if (ghlId) {
      // Mark local contact as local-only, don't delete
      await supabase.from('contacts')
        .update({
          ghl_sync_status: 'local_only',
          ghl_contact_id: null,
          ghl_sync_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', integration.user_id)
        .eq('ghl_contact_id', ghlId);

      // Remove from integration_data
      await supabase.from('integration_data')
        .delete()
        .eq('integration_id', integration.id)
        .eq('external_id', ghlId);
    }
  }
}

// ─── Validation ───

export async function validate(apiKey) {
  const res = await fetch(`${GHL_API}/contacts/?limit=1`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (!res.ok) throw new Error('Invalid GoHighLevel API key');
  return { ok: true };
}

// ─── Full Sync ───

export async function sync(integration) {
  const headers = {
    Authorization: `Bearer ${integration.api_key}`,
  };
  let synced = 0;

  // Fetch contacts with pagination
  let startAfterId = null;
  let totalContactsFetched = 0;
  const maxContacts = 1000;

  do {
    let url = `${GHL_API}/contacts/?limit=100`;
    if (startAfterId) url += `&startAfterId=${startAfterId}`;

    const contactsRes = await fetch(url, { headers });
    if (!contactsRes.ok) break;

    const data = await contactsRes.json();
    const contacts = data.contacts || [];

    for (const contact of contacts) {
      const name = [contact.firstName, contact.lastName].filter(Boolean).join(' ') || contact.email || 'Unknown';

      // Upsert into integration_data
      const { error } = await supabase.from('integration_data').upsert({
        user_id: integration.user_id,
        integration_id: integration.id,
        provider: 'gohighlevel',
        data_type: 'contact',
        external_id: contact.id,
        title: name,
        content: '',
        metadata: {
          email: contact.email,
          phone: contact.phone,
          first_name: contact.firstName,
          last_name: contact.lastName,
          company: contact.companyName,
          tags: contact.tags,
          source: contact.source,
          date_added: contact.dateAdded,
        },
        synced_at: new Date().toISOString(),
      }, { onConflict: 'integration_id,external_id', ignoreDuplicates: false });
      if (!error) synced++;

      // Materialize into contacts table
      await syncContactFromGHL(contact, integration.user_id);

      // Rate limit: 200ms between API-bound operations
      totalContactsFetched++;
    }

    startAfterId = data.meta?.startAfterId || null;
    if (!startAfterId || contacts.length < 100 || totalContactsFetched >= maxContacts) break;

    // Rate limit between pages
    await new Promise(r => setTimeout(r, 200));
  } while (true);

  // Fetch pipelines
  const pipelinesRes = await fetch(`${GHL_API}/pipelines/`, { headers });
  if (pipelinesRes.ok) {
    const { pipelines } = await pipelinesRes.json();
    for (const pipeline of (pipelines || [])) {
      const { error } = await supabase.from('integration_data').upsert({
        user_id: integration.user_id,
        integration_id: integration.id,
        provider: 'gohighlevel',
        data_type: 'pipeline',
        external_id: pipeline.id,
        title: pipeline.name || 'Untitled Pipeline',
        content: '',
        metadata: {
          stages: pipeline.stages?.map(s => ({ id: s.id, name: s.name })) || [],
        },
        synced_at: new Date().toISOString(),
      }, { onConflict: 'integration_id,external_id', ignoreDuplicates: false });
      if (!error) synced++;

      // Fetch opportunities for each pipeline
      const oppsRes = await fetch(`${GHL_API}/pipelines/${pipeline.id}/opportunities?limit=50`, { headers });
      if (oppsRes.ok) {
        const { opportunities } = await oppsRes.json();
        for (const opp of (opportunities || [])) {
          const { error: oppErr } = await supabase.from('integration_data').upsert({
            user_id: integration.user_id,
            integration_id: integration.id,
            provider: 'gohighlevel',
            data_type: 'opportunity',
            external_id: opp.id,
            title: opp.name || opp.contact?.name || 'Untitled Opportunity',
            content: '',
            metadata: {
              status: opp.status,
              pipeline_id: pipeline.id,
              pipeline_name: pipeline.name,
              stage_name: opp.pipelineStageId,
              monetary_value: opp.monetaryValue,
              contact_name: opp.contact?.name,
              contact_email: opp.contact?.email,
              created_at: opp.createdAt,
            },
            synced_at: new Date().toISOString(),
          }, { onConflict: 'integration_id,external_id', ignoreDuplicates: false });
          if (!oppErr) synced++;
        }
      }
    }
  }

  await supabase.from('integrations')
    .update({ last_synced_at: new Date().toISOString() })
    .eq('id', integration.id);

  return { synced, total: synced };
}
