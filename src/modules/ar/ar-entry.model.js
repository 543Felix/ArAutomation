const mongoose = require('mongoose');
const { AR_STATUS } = require('./ar.constants');

const chequeDetailSchema = new mongoose.Schema(
  {
    chequeNo: { type: String, required: true },
    chequeDate: { type: Date },
  },
  { _id: false },
);

const arLogSchema = new mongoose.Schema(
  {
    step: { type: String, required: true },
    level: { type: String, default: 'info' },
    message: { type: String, default: '' },
    meta: { type: mongoose.Schema.Types.Mixed },
    at: { type: Date, default: () => new Date() },
  },
  { _id: false },
);

const arEntrySchema = new mongoose.Schema(
  {
    arId: { type: String, index: true },
    invoiceNo: { type: String, required: true, index: true },
    invoiceDate: { type: Date },
    /** From Ecobillz posted-entry rows — used to build tax-invoice API date range */
    arrivalDate: { type: Date },
    departureDate: { type: Date },
    businessDate: { type: Date },

    merchantId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    outletId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    amount: { type: Number, default: 0 },

    /** Ecobillz `/ar-posted-entries` row `_id` (external system) */
    sourceRowId: { type: String, index: true },
    /** Document / bill no. from API (`no`) */
    documentNo: { type: String, index: true },
    guestFullName: { type: String },
    guestId: { type: String, index: true },
    /** Corporate / ledger identifier (e.g. `identifier`) */
    billingIdentifier: { type: String, index: true },
    roomNo: { type: String },
    taxInvoiceNo: { type: String, index: true },
    /** Tax invoice date from API field `date` (may align with `invoiceDate`) */
    taxInvoiceDate: { type: Date },
    confirmationNo: { type: String },
    lineDescription: { type: String },
    transCode: { type: String },
    reservationNo: { type: String },
    remarks: { type: String },
    outletChecks: { type: mongoose.Schema.Types.Mixed },
    companyName: { type: String, index: true },
    /** Guest/customer snapshot from API e.g. `{ address1 }` */
    customer: { type: mongoose.Schema.Types.Mixed },
    folioType: { type: String },
    hsnDescription: { type: String },
    hsnCode: { type: String },
    grossAmount: { type: Number },
    cgst: { type: Number },
    sgst: { type: Number },
    /** External API timestamps when present on the row */
    sourceCreatedAt: { type: Date },
    sourceUpdatedAt: { type: Date },

    /** Passed through from Ecobillz `/get-cheques` lookups where upstream supplied cheque rows */
    chequeDetails: { type: [chequeDetailSchema], default: [] },

    status: {
      type: String,
      enum: Object.values(AR_STATUS),
      default: AR_STATUS.PENDING,
      index: true,
    },
    invoiceLinked: { type: Boolean, default: false },
    invoiceRefId: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice' },

    matchedChecks: { type: Number, default: 0 },
    expectedChecks: { type: Number, default: 0 },
    missingChecks: { type: Number, default: 0 },
    missingCheckNos: { type: [String], default: [] },

    confidenceScore: { type: Number, default: 0, min: 0, max: 1 },

    finalPdfUrl: { type: String, default: null },

    emailSentAt: { type: Date, default: null },
    lastEmailSubject: { type: String, default: '' },
    lastEmailBody: { type: String, default: '' },

    /** Latest milestone from AR tracking timeline (operational summary; workflow status stays in `status`). */
    trackingCurrentStatus: { type: String, default: '', index: true },
    trackingLastUpdatedAt: { type: Date, default: null, index: true },

    logs: { type: [arLogSchema], default: [] },
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

arEntrySchema.index({ merchantId: 1, outletId: 1, invoiceNo: 1 }, { unique: false });

module.exports = mongoose.model('ArEntry', arEntrySchema);
