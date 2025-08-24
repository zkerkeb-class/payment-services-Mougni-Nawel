const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    password: {
      type: String,
      required: function () { return !this.googleId; }
    },
    googleId: {
      type: String,
      unique: true,
      sparse: true
    },
    firstname: {
      type: String,
      required: true,
      trim: true,
    },
    lastname: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
    },
    typeAbonnement: {
      type: String,
      enum: ['free', 'premium'],
      default: 'free',
    },
    stripeCustomerId: {
    type: String,
    unique: true,
    sparse: true
  },
  subscriptionId: {
    type: String,
    unique: true,
    sparse: true
  },
    analysisCount: {
      type: Number,
      default: 0
    },
    lastLogin: {
      type: Date
    }
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.models.User || mongoose.model('User', userSchema);