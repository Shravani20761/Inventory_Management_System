const express = require('express');
const router = express.Router();
const Invoice = require('../models/Invoice');
const Product = require('../models/Product');
const Quotation = require('../models/Quotation');
const { generateInvoicePDF } = require('../services/pdfService');
const { sendInvoiceWhatsApp } = require('../services/whatsappService');

// GET all invoices
router.get('/', async (req, res) => {
  try {
    const { paymentStatus, customerPhone } = req.query;
    let query = {};

    if (paymentStatus) query.paymentStatus = paymentStatus;
    if (customerPhone) query['customerDetails.phone'] = customerPhone;

    const invoices = await Invoice.find(query).sort({ createdAt: -1 });
    res.json(invoices);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET single invoice
router.get('/:id', async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id).populate('quotationId');
    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }
    res.json(invoice);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST generate invoice
router.post('/generate', async (req, res) => {
  try {
    const {
      customerDetails,
      quotationId,
      products,
      paymentStatus
    } = req.body;

    // Calculate totals
    const subtotal = products.reduce((sum, p) => sum + (p.quantity * p.sellingRate), 0);
    const gst = Math.round(subtotal * 0.18);
    const totalAmount = subtotal + gst;

    // Generate invoice number
    const count = await Invoice.countDocuments();
    const invoiceNumber = `INV-${String(count + 1).padStart(4, '0')}`;

    // Create invoice
    const invoice = new Invoice({
      invoiceNumber,
      customerDetails,
      quotationId,
      products: products.map(p => ({
        ...p,
        amount: p.quantity * p.sellingRate
      })),
      subtotal,
      gst,
      totalAmount,
      paymentStatus: paymentStatus || 'Unpaid'
    });

    const savedInvoice = await invoice.save();

    // Reduce inventory quantity
    for (const product of products) {
      await Product.findByIdAndUpdate(product.productId, {
        $inc: { quantity: -product.quantity }
      });
    }

    // Update quotation status if provided
    if (quotationId) {
      await Quotation.findByIdAndUpdate(quotationId, { status: 'Converted' });
    }

    // Generate PDF
    const pdfResult = await generateInvoicePDF(savedInvoice._doc);

    // Update invoice with PDF URL
    savedInvoice.invoicePdfUrl = pdfResult.pdfUrl;
    await savedInvoice.save();

    // Send WhatsApp
    const whatsappResult = await sendInvoiceWhatsApp(
      customerDetails.phone,
      savedInvoice._doc,
      pdfResult.pdfUrl
    );

    // Update WhatsApp status
    savedInvoice.sentToWhatsapp = whatsappResult.success;
    savedInvoice.sentAt = whatsappResult.success ? new Date() : null;
    await savedInvoice.save();

    res.status(201).json({
      invoice: savedInvoice,
      pdfUrl: pdfResult.pdfUrl,
      whatsapp: whatsappResult
    });
  } catch (error) {
    console.error('Invoice Generation Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// PATCH update invoice
router.patch('/:id', async (req, res) => {
  try {
    const invoice = await Invoice.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }
    res.json(invoice);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// PATCH mark as paid
router.patch('/:id/mark-paid', async (req, res) => {
  try {
    const invoice = await Invoice.findByIdAndUpdate(
      req.params.id,
      { paymentStatus: 'Paid' },
      { new: true }
    );
    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }
    res.json(invoice);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE invoice
router.delete('/:id', async (req, res) => {
  try {
    const invoice = await Invoice.findByIdAndDelete(req.params.id);
    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }
    res.json({ message: 'Invoice deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
