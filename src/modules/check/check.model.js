const mongoose = require('mongoose');

const checkSchema = new mongoose.Schema(
  {
    checkNo: { type: String, required: true, index: true },
    checkDate: { type: Date, index: true },
    amount: { type: Number, default: 0 },
    merchantId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    outletId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    invoiceNo: { type: String, index: true },
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

checkSchema.index({ merchantId: 1, outletId: 1, checkNo: 1 });

module.exports = mongoose.model('Check', checkSchema);
