const express = require('express');
const router = express.Router();
const Quotation = require('../models/Quotation');
const Product = require('../models/Product');
const { buildQuotationOptions, FLAT_RULES } = require('../services/recommendationEngine');
const { generateQuotationPDF } = require('../services/pdfService');
const { sendQuotationWhatsApp } = require('../services/whatsappService');

// GET all quotations
router.get('/', async (req, res) => {
  try {
    const { status, customerPhone } = req.query;
    let query = {};

    if (status) query.status = status;
    if (customerPhone) query.customerPhone = customerPhone;

    const quotations = await Quotation.find(query).sort({ createdAt: -1 });
    res.json(quotations);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET single quotation
router.get('/:id', async (req, res) => {
  try {
    const quotation = await Quotation.findById(req.params.id);
    if (!quotation) {
      return res.status(404).json({ error: 'Quotation not found' });
    }
    res.json(quotation);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST generate quotation
router.post('/generate', async (req, res) => {
  try {
    const {
      customerName,
      customerPhone,
      flatType,
      backupHours,
      budgetType,
      preferredBrand,
      maxBudget,
      preparedBy
    } = req.body;

    // Get available inventory
    const inventory = await Product.find({ quantity: { $gt: 0 }, availability: true });

    // Build quotation options using recommendation engine
    const suggestedOptions = buildQuotationOptions(inventory, {
      flatType,
      backupHours,
      budgetType,
      preferredBrand,
      maxBudget
    });

    // Generate quotation number
    const count = await Quotation.countDocuments();
    const quotationNumber = `QT-${String(count + 1).padStart(4, '0')}`;

    // Calculate valid till date (7 days from now)
    const validTill = new Date();
    validTill.setDate(validTill.getDate() + 7);

    // Create quotation
    const quotation = new Quotation({
      customerName,
      customerPhone,
      flatType,
      backupHours,
      budgetType,
      preferredBrand,
      suggestedOptions,
      quotationNumber,
      preparedBy: preparedBy || 'Sales Executive',
      validTill,
      status: 'Option Pending'
    });

    const savedQuotation = await quotation.save();

    // Generate PDF
    const pdfResult = await generateQuotationPDF({
      ...savedQuotation._doc,
      flatRule: FLAT_RULES[flatType]
    });

    // Update quotation with PDF URL
    savedQuotation.quotationPdfUrl = pdfResult.pdfUrl;
    await savedQuotation.save();

    // Send WhatsApp
    const whatsappResult = await sendQuotationWhatsApp(
      customerPhone,
      savedQuotation._doc,
      pdfResult.pdfUrl
    );

    // Update WhatsApp status
    savedQuotation.whatsappSent = whatsappResult.success;
    savedQuotation.sentAt = whatsappResult.success ? new Date() : null;
    await savedQuotation.save();

    res.status(201).json({
      quotation: savedQuotation,
      pdfUrl: pdfResult.pdfUrl,
      whatsapp: whatsappResult
    });
  } catch (error) {
    console.error('Quotation Generation Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST select option
router.post('/:id/select-option', async (req, res) => {
  try {
    const { optionId } = req.body;
    const quotation = await Quotation.findById(req.params.id);

    if (!quotation) {
      return res.status(404).json({ error: 'Quotation not found' });
    }

    const selectedOption = quotation.suggestedOptions.find(o => o.optionId === optionId);
    if (!selectedOption) {
      return res.status(400).json({ error: 'Option not found' });
    }

    quotation.selectedOptionId = optionId;
    quotation.status = 'Pending';
    await quotation.save();

    res.json(quotation);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PATCH update quotation
router.patch('/:id', async (req, res) => {
  try {
    const quotation = await Quotation.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    if (!quotation) {
      return res.status(404).json({ error: 'Quotation not found' });
    }
    res.json(quotation);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// DELETE quotation
router.delete('/:id', async (req, res) => {
  try {
    const quotation = await Quotation.findByIdAndDelete(req.params.id);
    if (!quotation) {
      return res.status(404).json({ error: 'Quotation not found' });
    }
    res.json({ message: 'Quotation deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
