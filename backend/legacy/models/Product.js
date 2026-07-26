const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  modelName: {
    type: String,
    required: true,
    trim: true
  },
  brand: {
    type: String,
    required: true,
    trim: true
  },
  category: {
    type: String,
    required: true,
    enum: ['Car', 'Bike', 'Inverter', 'Truck', 'UPS']
  },
  quantity: {
    type: Number,
    required: true,
    min: 0,
    default: 0
  },
  purchaseRate: {
    type: Number,
    required: true,
    min: 0
  },
  sellingRate: {
    type: Number,
    required: true,
    min: 0
  },
  warranty: {
    type: String,
    default: '60 Months'
  },
  capacityAh: {
    type: Number,
    default: 0
  },
  inverterVA: {
    type: Number,
    default: 0
  },
  batteryType: {
    type: String,
    enum: ['Tubular', 'Flat Plate', 'VRLA', 'Lithium'],
    default: 'Tubular'
  },
  imageUrl: {
    type: String,
    default: ''
  },
  availability: {
    type: Boolean,
    default: true
  },
  supplier: {
    type: String,
    default: ''
  },
  invoiceNo: {
    type: String,
    default: ''
  }
}, {
  timestamps: true
});

// Index for faster searches
productSchema.index({ modelName: 1, brand: 1 });
productSchema.index({ category: 1 });
productSchema.index({ availability: 1 });

module.exports = mongoose.model('Product', productSchema);
