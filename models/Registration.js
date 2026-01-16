const mongoose = require('mongoose');

const teamMemberSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true },
  phone: { type: String, required: true }
}, { _id: false });

 const paymentScreenshotSchema = new mongoose.Schema({
  fileName: String,
  contentType: String,
  data: Buffer
 }, { _id: false });

const paymentSchema = new mongoose.Schema({
  orderId: String,
  paymentId: String,
  amount: Number,
  originalAmount: Number,
  discountPercent: Number,
  currency: { type: String, default: 'INR' },
  status: { type: String, enum: ['created', 'captured', 'failed'], default: 'created' },
  utrNumber: String,
  screenshot: paymentScreenshotSchema,
  paidAt: Date
}, { _id: false });

const ieeeCertificateSchema = new mongoose.Schema({
  fileName: String,
  contentType: String,
  data: Buffer
}, { _id: false });

const registrationSchema = new mongoose.Schema({
  registrationId: { type: String, required: true, unique: true },
  fullName: { type: String, required: true },
  email: { type: String, required: true },
  phone: { type: String, required: true },
  college: { type: String, required: true },

  event: { type: String, required: true },

  ieeeMember: { type: String, enum: ['yes', 'no'], default: 'no' },
  ieeeId: String,
  ieeeMembershipCertificate: ieeeCertificateSchema,

  isTeam: { type: Boolean, default: false },
  teamName: String,
  teamMembers: [teamMemberSchema],
  status: {
    type: String,
    enum: ['pending_payment', 'under_review', 'confirmed', 'cancelled'],
    default: 'pending_payment'
  },
  qrCode: String,
  payment: paymentSchema,
  utrNumber: String,
  paymentScreenshot: paymentScreenshotSchema,
  registeredAt: { type: Date, default: Date.now }
}, { timestamps: true });

// Indexes
registrationSchema.index({ email: 1, event: 1 }, { unique: true });


module.exports = mongoose.model('Registration', registrationSchema);
