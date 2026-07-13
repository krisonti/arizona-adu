// Receives the consult form submission from index.html and pushes the lead
// straight into the Monday.com board as a new item + a comment/update with
// the full details. No API token lives in this file — it's read from the
// MONDAY_API_TOKEN environment variable, set in Netlify's dashboard.

const MONDAY_API_URL = "https://api.monday.com/v2";
const DEFAULT_BOARD_ID = "18416938131"; // sokodesignazs-team board: ADU Investor Leads

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  let data;
  try {
    data = JSON.parse(event.body || "{}");
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid submission." }) };
  }

  // Honeypot: bots fill hidden fields, humans never see this one.
  if (data.company) {
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  }

  const name = (data.name || "").trim();
  const email = (data.email || "").trim();
  const phone = (data.phone || "").trim();
  const address = (data.address || "").trim();
  const message = (data.message || "").trim();

  if (!name || !email || !phone) {
    return { statusCode: 400, body: JSON.stringify({ error: "Name, email, and phone are required." }) };
  }

  const token = process.env.MONDAY_API_TOKEN;
  const boardId = process.env.MONDAY_BOARD_ID || DEFAULT_BOARD_ID;

  if (!token) {
    console.error("Missing MONDAY_API_TOKEN environment variable.");
    return { statusCode: 500, body: JSON.stringify({ error: "Server not configured." }) };
  }

  const itemName = `${name} — ${phone}`;

  const createItemQuery = `
    mutation ($boardId: ID!, $itemName: String!) {
      create_item (board_id: $boardId, item_name: $itemName) {
        id
      }
    }
  `;

  try {
    const createRes = await fetch(MONDAY_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": token,
        "API-Version": "2024-01",
      },
      body: JSON.stringify({
        query: createItemQuery,
        variables: { boardId: String(boardId), itemName },
      }),
    });

    const createJson = await createRes.json();

    if (createJson.errors || !createJson.data || !createJson.data.create_item) {
      console.error("Monday create_item error:", JSON.stringify(createJson.errors || createJson));
      return { statusCode: 502, body: JSON.stringify({ error: "Could not create the lead in Monday." }) };
    }

    const itemId = createJson.data.create_item.id;

    const bodyLines = [
      `Email: ${email}`,
      `Phone: ${phone}`,
      address ? `Property address: ${address}` : null,
      message ? `Message: ${message}` : null,
      `Submitted: ${new Date().toISOString()}`,
    ].filter(Boolean).join("\n");

    const createUpdateQuery = `
      mutation ($itemId: ID!, $body: String!) {
        create_update (item_id: $itemId, body: $body) {
          id
        }
      }
    `;

    const updateRes = await fetch(MONDAY_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": token,
        "API-Version": "2024-01",
      },
      body: JSON.stringify({
        query: createUpdateQuery,
        variables: { itemId: String(itemId), body: bodyLines },
      }),
    });

    const updateJson = await updateRes.json();
    if (updateJson.errors) {
      // Item was created successfully; the follow-up comment failing isn't fatal.
      console.error("Monday create_update error:", JSON.stringify(updateJson.errors));
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    console.error("Monday API request failed:", err);
    return { statusCode: 502, body: JSON.stringify({ error: "Could not reach Monday." }) };
  }
};
