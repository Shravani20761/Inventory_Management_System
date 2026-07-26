const mongoose = require('mongoose');

const quotationSchema = new mongoose.Schema({
  customerName: {
    type: String,
    required: true,
    trim: true
  },
  customerPhone: {
    type: String,
    required: true,
    trim: true
  },
  flatType: {
    type: String,
    required: true,
    enum: ['1RK', '1BHK', '2BHK', '3BHK', '4BHK+']
  },
  backupHours: {
    type: Number,
    required: true,
    min: 1
  },
  budgetType: {
    type: String,
    required: true,
    enum: ['Budget', 'Recommended', 'Premium']
  },
  preferredBrand: {
    type: String,
    default: ''
  },
  suggestedOptions: [{
    optionId: String,
    type: String,
    color: String,
    inverterName: String,
    inverterId: mongoose.Schema.Types.ObjectId,
    inverterVA: Number,
    inverterRate: Number,
    batteryName: String,
    batteryId: mongoose.Schema.Types.ObjectId,
    batteryAh: Number,
    batteryRate: Number,
    backup: String,
    warranty: String,
    suitableFor: String,
    total: Number,
    note: String,
    alerts: [String]
  }],
  selectedOptionId: {
    type: String,
    default: ''
  },
  quotationPdfUrl: {
    type: String,
    default: ''
  },
  whatsappSent: {
    type: Boolean,
    default: false
  },
  sentAt: {
    type: Date
  },
  preparedBy: {
    type: String,
    default: 'Sales Executive'
  },
  validTill: {
    type: Date
  },
  status: {
    type: String,
    enum: ['Option Pending', 'Pending', 'Converted', 'Rejected'],
    default: 'Option Pending'
  },
  quotationNumber: {
    type: String,
    unique: true
  }
}, {
  timestamps: true
});

// Index for faster searches
quotationSchema.index({ customerPhone: 1 });
quotationSchema.index({ status: 1 });
quotationSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Quotation', quotationSchema);
