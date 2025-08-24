const axios = require('axios');

module.exports = async (req, res, next) => {
  try {
    const response = await axios.get(`${process.env.BDD_SERVICE_URL}/api/user/${req.user._id}`, {
      headers: {
        'Authorization': `Bearer ${req.headers.authorization?.split(' ')[1]}`,
        'Content-Type': 'application/json'
      },
      timeout: 10000,
      validateStatus: function (status) {
        return status >= 200 && status < 500;
      }
    });

    if (response.status !== 200) {
      console.error('BDD Service Error:', response.status, response.data);
      return res.status(500).json({ error: 'Service unavailable' });
    }

    const user = response.data;
    
    if (user.typeAbonnement === 'free' && user.analysisCount >= 3) {
      return res.status(403).json({ 
        error: 'Limite atteinte. Passez premium pour continuer.',
        upgradeUrl: '/api/stripe/create-subscription'
      });
    }
    
    next();
  } catch (error) {
    console.error('Subscription limit check error:', error);
    
    if (error.code === 'ECONNREFUSED') {
      return res.status(503).json({ error: 'BDD service unavailable' });
    }
    
    res.status(500).json({ 
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.message : null
    });
  }
};