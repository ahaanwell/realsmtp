const { google } = require("googleapis");

const auth = new google.auth.GoogleAuth({
//   keyFile: "credentials.json",
keyFile: "credentials.json",
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

const spreadsheetId = "1zD8cj5BupUUUMofLoY07Me9kK59F67ZtLj5l20g9qwQ";
// const spreadsheetId = "16fxTIPwYVZS2mrqKmEkfGPdqlawE186shhNiIpBUMXY";

async function addLead(data) {
  const client = await auth.getClient();
  const sheets = google.sheets({ version: "v4", auth: client });

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