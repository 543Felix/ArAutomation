const mongoose = require('mongoose');

const timelineEventSchema = new mongoose.Schema(
  {
    status: { type: String, required: true, index: true },
    label: { type: String, required: true },
    description: { type: String, default: '' },
    timestamp: { type: Date, default: () => new Date(), index: true },
    metadata: { type: mongoose.Schema.Types.Mixed },
  },
  { _id: true },
);

const arTrackingSchema = new mongoose.Schema(
  {
    arEntryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ArEntry',
      required: true,
      unique: true,
      index: true,
    },
    invoiceNo: { type: String, default: '', index: true },
    timeline: { type: [timelineEventSchema], default: [] },
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

module.exports = mongoose.model('ArTracking', arTrackingSchema);
