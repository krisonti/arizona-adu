// SOKO Development — QR landing page lead handler
// Creates a lead on the Monday.com "ADU Investor" board (New Leads group)
// with Lead Source auto-tagged: CA Investor + Direct Mail.
//
// Setup: in Netlify → Site settings → Environment variables, add:
//   MONDAY_API_KEY = <your Monday API token>
// (Monday: click your avatar → Developers → My access tokens → copy token)

const BOARD_ID = 18416938131; // ADU Investor board
const GROUP_ID = 'topics';    // "New Leads" group

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let data;
  try {
    data = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, body: 'Bad request' };
  }

  const { name, phone, email, address, owns, notes } = data;
  if (!name || !phone || !email || !address) {
    return { statusCode: 400, body: 'Missing required fields' };
  }

  const today = new Date().toISOString().slice(0, 10);

  const columnValues = {
    text_mm2h8zc7: String(phone).slice(0, 120),                    // Phone
    email_mm2hny1k: { email: String(email).slice(0, 200), text: String(email).slice(0, 200) }, // Email
    date4: { date: today },                                        // Date
    dropdown_mm2hbadt: { labels: ['ADU'] },                        // Project Type
    dropdown_mm45mskn: { labels: [owns === 'No' ? 'No' : owns === 'Unsure' ? 'Unsure' : 'Yes'] }, // Owns the Lot?
    dropdown_mm45aggs: { labels: ['CA Investor', 'Direct Mail'] }, // Lead Source
    text_mm45qcc4: String(address).slice(0, 250),                  // Property City/ZIP (full address)
    text_mm2hg88v: [
      `Address: ${address}`,
      notes ? `Notes: ${notes}` : null,
      'Source: QR landing page (rental-income)',
    ].filter(Boolean).join(' | ').slice(0, 2000),                  // Notes/Comments
  };

  const query = `
    mutation ($board: ID!, $group: String!, $name: String!, $cols: JSON!) {
      create_item (board_id: $board, group_id: $group, item_name: $name, column_values: $cols) {
        id
      }
    }`;

  try {
    const res = await fetch('https://api.monday.com/v2', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: process.env.MONDAY_API_TOKEN || process.env.MONDAY_API_KEY,
        'API-Version': '2024-10',
      },
      body: JSON.stringify({
        query,
        variables: {
          board: BOARD_ID,
          group: GROUP_ID,
          name: String(name).slice(0, 250),
          cols: JSON.stringify(columnValues),
        },
      }),
    });

    const out = await res.json();
    if (out.errors || !out.data || !out.data.create_item) {
      console.error('Monday API error:', JSON.stringify(out));
      return { statusCode: 502, body: 'Upstream error' };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true, id: out.data.create_item.id }),
    };
  } catch (err) {
    console.error('Lead handler error:', err);
    return { statusCode: 500, body: 'Server error' };
  }
};
