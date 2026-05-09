const mongoose = require('mongoose');

const pdfDocumentSchema = new mongoose.Schema(
  {
    docId: { type: String, required: true, unique: true, index: true },
    s3Url: { type: String, required: true },
    merchantId: { type: mongoose.Schema.Types.ObjectId, index: true },
    outletId: { type: mongoose.Schema.Types.ObjectId, index: true },
    docType: { type: String, default: 'invoice' },
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

module.exports = mongoose.model('PdfDocument', pdfDocumentSchema);
