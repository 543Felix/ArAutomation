const mongoose = require('mongoose');

const EMAIL_DIRECTION = Object.freeze({
  OUTBOUND: 'OUTBOUND',
  INBOUND: 'INBOUND',
});

const aiAnalysisSchema = new mongoose.Schema(
  {
    intent: { type: String, default: '' },
    summary: { type: String, default: '' },
  },
  { _id: false },
);

const threadMessageSchema = new mongoose.Schema(
  {
    messageId: { type: String, required: true },
    direction: {
      type: String,
      enum: Object.values(EMAIL_DIRECTION),
      required: true,
    },
    from: { type: String, required: true, trim: true, maxlength: 500 },
    to: { type: String, required: true, trim: true, maxlength: 500 },
    subject: { type: String, default: '', trim: true, maxlength: 1000 },
    body: { type: String, default: '', maxlength: 500000 },
    timestamp: { type: Date, required: true },
    aiAnalysis: { type: aiAnalysisSchema },
    metadata: { type: mongoose.Schema.Types.Mixed },
  },
  { _id: false },
);

const emailThreadSchema = new mongoose.Schema(
  {
    arEntryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ArEntry',
      required: true,
    },
    invoiceNo: { type: String, required: true, trim: true, index: true },
    threadId: { type: String, required: true, trim: true, unique: true },
    messages: { type: [threadMessageSchema], default: [] },
  },
  {
    timestamps: true,
    collection: 'emailThreads',
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

emailThreadSchema.index({ arEntryId: 1 }, { unique: true });

const EmailThread = mongoose.model('EmailThread', emailThreadSchema);
EmailThread.EMAIL_DIRECTION = EMAIL_DIRECTION;

module.exports = EmailThread;
