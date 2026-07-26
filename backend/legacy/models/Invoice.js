const mongoose = require('mongoose');

const invoiceSchema = new mongoose.Schema({
  invoiceNumber: {
    type: String,
    required: true,
    unique: true
  },
  customerDetails: {
    name: {
      type: String,
      required: true
    },
    phone: {
      type: String,
      required: true
    },
    address: {
      type: String,
      default: ''
    }
  },
  quotationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Quotation'
  },
  products: [{
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product'
    },
    modelName: String,
    quantity: Number,
    purchaseRate: Number,
    sellingRate: Number,
    amount: Number
  }],
  subtotal: {
    type: Number,
    required: true
  },
  gst: {
    type: Number,
    required: true
  },
  totalAmount: {
    type: Number,
    required: true
  },
  paymentStatus: {
    type: String,
    enum: ['Paid', 'Unpaid', 'Partial'],
    default: 'Unpaid'
  },
  invoicePdfUrl: {
    type: String,
    default: ''
  },
  sentToWhatsapp: {
    type: Boolean,
    default: false
  },
  sentAt: {
    type: Date
  }
}, {
  timestamps: true
});

// Index for faster searches
invoiceSchema.index({ invoiceNumber: 1 });
invoiceSchema.index({ 'customerDetails.phone': 1 });
invoiceSchema.index({ paymentStatus: 1 });
invoiceSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Invoice', invoiceSchema);
