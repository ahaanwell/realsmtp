const { google } = require("googleapis");

const credentials = process.env.GOOGLE_CREDENTIALS_B64
  ? JSON.parse(Buffer.from(process.env.GOOGLE_CREDENTIALS_B64, "base64").toString("utf8"))
  : require("./credentials.json");

const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

const spreadsheetId = "1zD8cj5BupUUUMofLoY07Me9kK59F67ZtLj5l20g9qwQ";
// const spreadsheetId = "16fxTIPwYVZS2mrqKmEkfGPdqlawE186shhNiIpBUMXY";

// Create the Sheets client once and reuse it for every lead
let sheetsPromise;
function getSheets() {
  if (!sheetsPromise) {
    sheetsPromise = auth.getClient()
      .then((client) => google.sheets({ version: "v4", auth: client }))
      .catch((err) => { sheetsPromise = null; throw err; });
  }
  return sheetsPromise;
}

// Warm up auth at startup so the first lead isn't slow
getSheets().catch(() => {});

async function addLead(data) {
  const sheets = await getSheets();

  const now = new Date();

  const date = now.toLocaleDateString("en-IN");
  const time = now.toLocaleTimeString("en-IN");

  // Make country code text safe
  const countryCode = data.country_code ? `'${data.country_code}` : "";

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: "Sheet1!A:G",
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [[
        data.name,
        data.email,
        countryCode,
        data.number,
        data.project_name,
        date,
        time
      ]]
    }
  });
}

module.exports = addLead;