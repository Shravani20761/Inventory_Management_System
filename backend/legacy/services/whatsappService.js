const twilio = require('twilio');

const client = new twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

async function sendQuotationWhatsApp(phoneNumber, quotationData, pdfUrl) {
  try {
    // Format phone number (ensure it has +91 for India)
    let formattedPhone = phoneNumber;
    if (!phoneNumber.startsWith('+')) {
      formattedPhone = `+91${phoneNumber}`;
    }

    const message = `
🔋 *Quotation from PowerTech Batteries*

Dear ${quotationData.customerName},

Thank you for your enquiry! Please find attached your quotation for ${quotationData.flatType} with ${quotationData.backupHours} hours backup.

*Quotation Details:*
• Quotation No: ${quotationData.quotationNumber}
• Valid Till: ${new Date(quotationData.validTill).toLocaleDateString('en-IN')}
• Options: ${quotationData.suggestedOptions?.length || 0} options available

${quotationData.selectedOptionId ? `*Selected Option:* ${quotationData.suggestedOptions?.find(o => o.optionId === quotationData.selectedOptionId)?.type || 'N/A'}` : '*Please select an option from the quotation PDF*'}

For any queries, feel free to contact us.
📞 9876543210

Thank you!
PowerTech Batteries
    `.trim();

    // Send WhatsApp message with PDF
    const twilioMessage = await client.messages.create({
      from: process.env.TWILIO_WHATSAPP_NUMBER,
      to: `whatsapp:${formattedPhone}`,
      body: message,
      mediaUrl: [`${process.env.BASE_URL}${pdfUrl}`]
    });

    return {
      success: true,
      messageId: twilioMessage.sid,
      message: 'WhatsApp sent successfully'
    };
  } catch (error) {
    console.error('WhatsApp Error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

async function sendInvoiceWhatsApp(phoneNumber, invoiceData, pdfUrl) {
  try {
    // Format phone number
    let formattedPhone = phoneNumber;
    if (!phoneNumber.startsWith('+')) {
      formattedPhone = `+91${phoneNumber}`;
    }

    const message = `
🧾 *Invoice from PowerTech Batteries*

Dear ${invoiceData.customerDetails.name},

Thank you for your purchase! Please find attached your invoice.

*Invoice Details:*
• Invoice No: ${invoiceData.invoiceNumber}
• Date: ${new Date(invoiceData.createdAt).toLocaleDateString('en-IN')}
• Total Amount: ₹${invoiceData.totalAmount.toLocaleString('en-IN')}
• Status: ${invoiceData.paymentStatus}

For any queries, feel free to contact us.
📞 9876543210

Thank you!
PowerTech Batteries
    `.trim();

    const twilioMessage = await client.messages.create({
      from: process.env.TWILIO_WHATSAPP_NUMBER,
      to: `whatsapp:${formattedPhone}`,
      body: message,
      mediaUrl: [`${process.env.BASE_URL}${pdfUrl}`]
    });

    return {
      success: true,
      messageId: twilioMessage.sid,
      message: 'WhatsApp sent successfully'
    };
  } catch (error) {
    console.error('WhatsApp Error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = {
  sendQuotationWhatsApp,
  sendInvoiceWhatsApp
};
