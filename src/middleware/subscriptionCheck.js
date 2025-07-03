const User = require('../models/user');

module.exports = async (req, res, next) => {
  const user = await User.findById(req.user._id);
  
  if (user.typeAbonnement === 'free' && user.analysisCount >= 3) {
    return res.status(403).json({ 
      error: 'Limite atteinte. Passez premium pour continuer.' 
    });
  }
  
  next();
};