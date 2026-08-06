const express = require("express");
const nodemailer = require("nodemailer");
const bodyParser = require("body-parser");
const cors = require("cors");
const addLead = require("./googleSheet");
const dotenv = require("dotenv");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const corsOptions = {
    origin: "*",
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
};

app.use(cors(corsOptions));
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// app.use(bodyParser.json());

const transporter = nodemailer.createTransport({
  host: "smtp.hostinger.com",
  port: 587,
  secure: false,
  auth: {
    user: "info@searchmyspace.in",
    pass: "Searchmyspace$#321",
  },
});

app.get("/", (req, res) => {
    res.status(200).json({
        message: "SMTP server is running 🚀"
    })
})

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

    const fullPhone = country_code ? `${country_code} ${number}` : number;

    const mailOptions = {
      from: `"New Lead" <info@searchmyspace.in>`,
      to: company_email,
      subject: `New Enquiry from ${project_name}`,
      html: `
        <h3>New Lead</h3>
        <p><b>Name:</b> ${name}</p>
        <p><b>Email:</b> ${email}</p>
        <p><b>Phone:</b> ${fullPhone}</p>
        <p><b>Project:</b> ${project_name}</p>
      `,
    };

    const mailOptions1 = {
      from: `"New Lead" <info@searchmyspace.in>`,
      to: "livexcellence9@gmail.com",
      subject: `New Enquiry from ${project_name}`,
      html: `
        <h3>New Lead</h3>
        <p><b>Name:</b> ${name}</p>
        <p><b>Phone:</b> ${fullPhone}</p>
      `,
    };

    await transporter.sendMail(mailOptions);
    await transporter.sendMail(mailOptions1);

    await addLead({
      name,
      email,
      number,
      country_code: country_code || "",
      project_name
    });

    res.json({
      success: true,
      message: "Processing your request, we will notify you shortly."
    });

  } catch (error) {

  res.status(500).json({
    success: false,
    message: error.message
  });
}
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});