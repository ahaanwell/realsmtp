const express = require("express");
const nodemailer = require("nodemailer");
const cors = require("cors");
const dotenv = require("dotenv");

// Load .env before googleSheet.js reads GOOGLE_CREDENTIALS_B64
dotenv.config({ quiet: true });

const addLead = require("./googleSheet");
const WarmMailer = require("./warmMailer");

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({ origin: "*", methods: "GET,HEAD,PUT,PATCH,POST,DELETE" }));
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const MAIL_FROM = `"New Lead" <info@searchmyspace.in>`;
const LEAD_COPY_EMAILS = ["livexcellence9@gmail.com"];

// const smtpPass = process.env.SMTP_PASS_B64
//   ? Buffer.from(process.env.SMTP_PASS_B64, "base64").toString("utf8")
//   : process.env.SMTP_PASS;

const smtpConfig = {
  host: process.env.SMTP_HOST || "smtp.hostinger.com",
  port: 465,
  secure: true,
  auth: {
    user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
};

// Pooled transporter for the background copy emails and as a fallback
const transporter = nodemailer.createTransport({
  ...smtpConfig,
  pool: true,
  maxConnections: 3,
  // Fail fast instead of hanging for minutes on a stuck connection
  connectionTimeout: 10000,
  greetingTimeout: 10000,
  socketTimeout: 15000,
});

// Always-logged-in connection for the company email the response waits on
const warmMailer = new WarmMailer(smtpConfig);

// Retry a few times; throws the last error if every attempt fails
async function sendWithRetry(mailOptions, attempts = 3) {
  for (let i = 1; i <= attempts; i++) {
    try {
      await transporter.sendMail(mailOptions);
      return;
    } catch (err) {
      if (i === attempts) {
        throw err;
      }
      await new Promise((r) => setTimeout(r, 2000 * i));
    }
  }
}

// Try the warm connection first; fall back to a fresh connection if it fails
async function sendCompanyEmail(mailOptions) {
  try {
    await warmMailer.sendMail(mailOptions);
  } catch {
    await sendWithRetry(mailOptions, 1);
  }
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const isValidEmail = (value) => typeof value === "string" && EMAIL_REGEX.test(value.trim());

// Escape user input before putting it into email HTML
const escapeHtml = (value) =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

app.get("/", (req, res) => {
  res.status(200).json({
    message: "SMTP server is running 🚀"
  });
});

app.post("/send-lead", async (req, res) => {
  try {
    const { name, email, number, country_code, project_name, company_email } = req.body;

    // Required field validation
    if (!name || !email || !number || !project_name || !company_email) {
      return res.status(400).json({
        success: false,
        message: "Name, Email, number, Project Name and Company Email are required."
      });
    }

    // Catch bad addresses up front, before any email is attempted
    if (!isValidEmail(email)) {
      return res.status(400).json({ success: false, message: "Please enter a valid email address." });
    }
    if (!isValidEmail(company_email)) {
      return res.status(400).json({ success: false, message: "Invalid company email address." });
    }

    const fullPhone = country_code ? `${country_code} ${number}` : number;
    const subject = `New Enquiry from ${project_name}`;

    const mailOptions = {
      from: MAIL_FROM,
      to: company_email,
      subject,
      html: `
        <h3>New Lead</h3>
        <p><b>Name:</b> ${escapeHtml(name)}</p>
        <p><b>Email:</b> ${escapeHtml(email)}</p>
        <p><b>Phone:</b> ${escapeHtml(fullPhone)}</p>
        <p><b>Project:</b> ${escapeHtml(project_name)}</p>
      `,
    };

    const copyHtml = `
        <h3>New Lead</h3>
        <p><b>Name:</b> ${escapeHtml(name)}</p>
        <p><b>Phone:</b> ${escapeHtml(fullPhone)}</p>
      `;

    // Copy emails and sheet logging run in the background; they never affect the response
    for (const to of LEAD_COPY_EMAILS) {
      sendWithRetry({ from: MAIL_FROM, to, subject, html: copyHtml }).catch(() => {});
    }

    addLead({
      name,
      email,
      number,
      country_code: country_code || "",
      project_name
    }).catch(() => {});

    // The response depends only on the company email
    try {
      await sendCompanyEmail(mailOptions);
    } catch (mailError) {
      return res.status(500).json({
        success: false,
        message: "Could not submit your enquiry. Please try again."
      });
    }

    res.json({
      success: true,
      message: "Thank you! Your enquiry has been submitted successfully."
    });

  } catch {
    res.status(500).json({
      success: false,
      message: "Something went wrong. Please try again."
    });
  }
});

// Log in at startup so the first lead doesn't pay for the SMTP login
warmMailer.start();

app.listen(PORT, "0.0.0.0");
