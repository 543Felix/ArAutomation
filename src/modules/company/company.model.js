const mongoose = require('mongoose');

const companySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      maxlength: 200,
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      maxlength: 320,
    },
    addressLine1: { type: String, trim: true, required: true, maxlength: 300 },
    addressLine2: { type: String, trim: true, default: '' },
    city: { type: String, trim: true, default: '' },
    state: { type: String, trim: true, default: '' },
    country: { type: String, trim: true, default: '' },
    pincode: { type: String, trim: true, default: '' },
    phone: { type: String, trim: true, default: '' },
    website: { type: String, trim: true, default: '' },
    /** India GSTIN or generic tax id */
    taxId: { type: String, trim: true, default: '' },
    notes: { type: String, trim: true, default: '' },
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

module.exports = mongoose.model('Company', companySchema);
