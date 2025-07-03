module.exports = (mongoose) => {
  const contractSchema = new mongoose.Schema(
    {
      user: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
      },
      content: {
        type: Text,
        required: true
      },
      uploadDate: {
        type: Date,
        default: Date.now
      },
      status: {
        type: String,
        enum: ['pending', 'processed'],
        default: 'pending'
      },
      analysis: {
        type: Schema.Types.ObjectId,
        ref: 'Analysis',
        default: null
      }
    },
    {
      timestamps: true,
    }
  );
  return mongoose.models.Contract || mongoose.model('Contract', contractSchema);
};
