import nodemailer from "nodemailer";

export const DEFAULT_RECEIPT_FOOTER = "Please keep this email as your receipt. To change or cancel a submitted offering, please call Rakeshbhai or Sagarbhai.";

function isMailConfigured() {
  return Boolean(
    process.env.SMTP_HOST &&
      process.env.SMTP_PORT &&
      process.env.SMTP_USER &&
      process.env.SMTP_PASS &&
      process.env.SMTP_FROM
  );
}

function buildTransport() {
  const baseConfig = {
    secure: String(process.env.SMTP_SECURE || "false").toLowerCase() === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  };

  if (process.env.SMTP_SERVICE) {
    return nodemailer.createTransport({
      service: process.env.SMTP_SERVICE,
      ...baseConfig,
    });
  }

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    ...baseConfig,
  });
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function buildReceiptHtml(offering, footerMessage = DEFAULT_RECEIPT_FOOTER) {
  const devotee = offering.devotee || {};
  const submittedAt = offering.createdAt ? new Date(offering.createdAt).toLocaleString() : "";
  const totalItems = (offering.items || []).length;
  const itemsHtml = (offering.items || [])
    .map(
      (item) => `
        <tr>
          <td class="receipt-cell" style="padding:12px 4px;border-bottom:1px dotted #d9c3a7;color:#3a251a;">${escapeHtml(item.name)}</td>
        </tr>
      `
    )
    .join("");

  return `<!doctype html>
  <html>
    <head>
      <meta name="color-scheme" content="light dark">
      <meta name="supported-color-schemes" content="light dark">
      <style>
        :root { color-scheme: light dark; supported-color-schemes: light dark; }
        .email-page { background-color: #f4eadc !important; }
        .email-receipt { background-color: #fffaf1 !important; color: #3a251a !important; }
        .email-header { background-color: #6e2116 !important; color: #fff7ef !important; }
        .email-header * { color: #fff7ef !important; }
        .email-label { color: #8b5e34 !important; }
        .email-muted { color: #7a5a49 !important; }
        @media (prefers-color-scheme: dark) {
          .email-page { background-color: #120b09 !important; }
          .email-receipt { background-color: #241713 !important; color: #fff7ef !important; border-color: #5f4637 !important; }
          .email-header { background-color: #7d2a1b !important; color: #fffaf1 !important; }
          .email-header * { color: #fffaf1 !important; }
          .email-label { color: #efbf82 !important; }
          .email-muted { color: #d8c2ad !important; }
          .receipt-cell { color: #fff7ef !important; border-color: #654b3a !important; }
          .receipt-rule { border-color: #654b3a !important; }
        }
        [data-ogsc] .email-page { background-color: #120b09 !important; }
        [data-ogsc] .email-receipt { background-color: #241713 !important; color: #fff7ef !important; }
        [data-ogsc] .email-header, [data-ogsc] .email-header * { background-color: #7d2a1b !important; color: #fffaf1 !important; }
      </style>
    </head>
    <body class="email-page" style="margin:0;padding:0;background-color:#f4eadc;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" class="email-page" style="width:100%;background-color:#f4eadc;">
        <tr>
          <td style="padding:24px 12px;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" class="email-receipt" style="width:100%;max-width:620px;margin:0 auto;background-color:#fffaf1;color:#3a251a;border:1px solid #eadbc6;border-radius:8px;font-family:Arial,Helvetica,sans-serif;">
              <tr>
                <td class="email-header" style="padding:26px 28px;background-color:#6e2116;color:#fff7ef;border-radius:8px 8px 0 0;">
                  <div style="font-size:11px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:#fff7ef;">Offering Receipt</div>
                  <div style="margin-top:7px;font-size:29px;font-weight:700;line-height:1.1;color:#fff7ef;">Annakut Offering Confirmation</div>
                  <div style="margin-top:8px;font-size:14px;line-height:1.5;color:#fff7ef;">Thank you for offering with devotion.</div>
                </td>
              </tr>
              <tr>
                <td style="padding:0 28px;">
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" class="receipt-rule" style="border-bottom:1px dashed #d9c3a7;">
                    <tr>
                      <td style="padding:18px 0;vertical-align:top;">
                        <div class="email-label" style="font-size:10px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#8b5e34;">Receipt</div>
                        <div style="margin-top:5px;font-weight:700;">${escapeHtml(offering.receiptNo)}</div>
                      </td>
                      <td style="padding:18px 0;text-align:right;vertical-align:top;">
                        <div class="email-label" style="font-size:10px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#8b5e34;">Submitted</div>
                        <div style="margin-top:5px;font-size:13px;">${escapeHtml(submittedAt)}</div>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr><td class="receipt-rule" style="padding:18px 28px;border-bottom:1px dashed #d9c3a7;"><div class="email-label" style="font-size:10px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#8b5e34;">Devotee</div><div style="margin-top:7px;font-size:18px;font-weight:700;">${escapeHtml(devotee.full_name)}</div><div style="margin-top:7px;line-height:1.6;">${escapeHtml(devotee.phone)}<br>${escapeHtml(devotee.email)}</div></td></tr>
              <tr><td class="receipt-rule" style="padding:18px 28px;border-bottom:1px dashed #d9c3a7;"><div class="email-label" style="font-size:10px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#8b5e34;">Pickup Address</div><div style="margin-top:7px;line-height:1.6;">${escapeHtml(devotee.address)}</div></td></tr>
              <tr>
                <td style="padding:18px 28px 8px;">
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;">
                    <thead><tr><th class="email-label" style="padding:0 4px 9px;text-align:left;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#8b5e34;">Offering</th></tr></thead>
                    <tbody>${itemsHtml}</tbody>
                    <tfoot><tr><td style="padding:14px 4px;border-top:2px solid #6e3d27;font-weight:700;">Total items: ${totalItems}</td></tr></tfoot>
                  </table>
                </td>
              </tr>
              <tr><td class="email-muted" style="padding:8px 28px 26px;text-align:center;color:#7a5a49;font-size:13px;line-height:1.6;">${escapeHtml(footerMessage).replaceAll("\n", "<br>")}</td></tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
  </html>
  `;
}

function buildReminderHtml({ itemName }) {
  return `
    <div style="font-family:Arial,Helvetica,sans-serif;background:#f7f1e8;padding:24px;color:#3a251a;">
      <div style="max-width:680px;margin:0 auto;background:#fffaf1;border:1px solid #eadbc6;border-radius:24px;overflow:hidden;">
        <div style="padding:24px 28px;background:linear-gradient(135deg,#6e2116,#b55e1d);color:#fff7ef;">
          <div style="font-size:13px;letter-spacing:0.22em;text-transform:uppercase;opacity:.88;">BAPS Swaminarayan Sanstha</div>
          <div style="font-size:28px;font-weight:700;margin-top:8px;">Item Reminder</div>
          <div style="font-size:14px;margin-top:6px;opacity:.9;">A previously held item is now available again.</div>
        </div>
        <div style="padding:24px 28px;line-height:1.7;">
          <p style="margin:0 0 12px;">The following item has just been released and may now be available for seva:</p>
          <div style="padding:16px 18px;border-radius:18px;background:#fff4e5;border:1px solid #eadbc6;font-size:18px;font-weight:700;">
            ${itemName}
          </div>
          <p style="margin:18px 0 0;color:#7a5a49;">Return to the Annakut app to check availability and complete your offering.</p>
        </div>
      </div>
    </div>
  `;
}

export async function sendConfirmationEmail(offering, footerMessage = DEFAULT_RECEIPT_FOOTER) {
  if (!isMailConfigured() || !offering?.devotee?.email) {
    return {
      sent: false,
      error: "SMTP is not fully configured.",
    };
  }

  const transporter = buildTransport();
  await transporter.verify();
  const info = await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to: offering.devotee.email,
    subject: `Annakut Confirmation - ${offering.receiptNo}`,
    html: buildReceiptHtml(offering, footerMessage),
  });

  return {
    sent: true,
    accepted: info.accepted || [],
    rejected: info.rejected || [],
    response: info.response || "",
  };
}

export async function sendReminderEmail({ email, itemName }) {
  if (!isMailConfigured() || !email || !itemName) {
    return {
      sent: false,
      error: "SMTP is not fully configured.",
    };
  }

  const transporter = buildTransport();
  await transporter.verify();
  const info = await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to: email,
    subject: `Annakut Reminder - ${itemName} is available again`,
    html: buildReminderHtml({ itemName }),
  });

  return {
    sent: true,
    accepted: info.accepted || [],
    rejected: info.rejected || [],
    response: info.response || "",
  };
}

export async function sendNotificationEmail({ recipients, subject, heading, lines = [] }) {
  const to = [...new Set((recipients || []).map((email) => String(email || "").trim().toLowerCase()).filter(Boolean))];
  if (!isMailConfigured() || !to.length) {
    return { sent: false, error: to.length ? "SMTP is not fully configured." : "No notification recipients are configured." };
  }

  const body = lines.map((line) => `<div style="padding:8px 0;border-bottom:1px solid #eadbc6;">${escapeHtml(line)}</div>`).join("");
  const transporter = buildTransport();
  await transporter.verify();
  const info = await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to,
    subject,
    html: `<div style="font-family:Arial,Helvetica,sans-serif;background:#f7f1e8;padding:24px;color:#3a251a;"><div style="max-width:680px;margin:0 auto;background:#fffaf1;border:1px solid #eadbc6;border-radius:18px;overflow:hidden;"><div style="padding:22px 26px;background:#6e2116;color:#fff7ef;font-size:24px;font-weight:700;">${escapeHtml(heading)}</div><div style="padding:20px 26px;line-height:1.55;">${body}</div></div></div>`,
  });
  return { sent: true, accepted: info.accepted || [], rejected: info.rejected || [] };
}
