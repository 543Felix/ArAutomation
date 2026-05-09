const mongoose = require('mongoose');

const invoiceSchema = new mongoose.Schema(
  {
    invoiceNo: { type: String, required: true, index: true },
    invoiceDate: { type: Date, index: true },
    merchantId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    outletId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    amount: { type: Number, default: 0 },
    pdfDocId: { type: String, index: true },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(_doc, ret) {
        ret.id = ret._id.toString();
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  },
);

invoiceSchema.index({ merchantId: 1, outletId: 1, invoiceNo: 1 });

module.exports = mongoose.model('Invoice', invoiceSchema);
