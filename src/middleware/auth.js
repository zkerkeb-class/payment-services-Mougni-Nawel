// middlewares/auth.js
const jwt = require('jsonwebtoken');
const User = require('../models/user');


module.exports = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.user = await User.findById(decoded.id);
    console.log('tete : ', req.user);

    if (!req.user) return res.status(401).json({ error: 'User not found' });

    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
};