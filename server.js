require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const slowDown = require('express-slow-down');
const morgan = require('morgan');
const { routes: stripeRoutes } = require('./stripe');

const app = express();
const PORT = process.env.PORT || 3001;

const corsOptions = {
  origin: [
    'http://localhost:3000',     // Development frontend
    'https://luvioband.co.uk',   // Production frontend
    'https://www.luvioband.co.uk' // Production frontend with www
  ],
  credentials: true,
  optionsSuccessStatus: 200
};

// Security middleware lets be safe!
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));

// Request logging
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// Rate limiting for API endpoints
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: {
    error: 'Too many requests from this IP, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Stricter rate limiting for checkout endpoints
const checkoutLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit checkout attempts
  message: {
    error: 'Too many checkout attempts, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Progressive delay for repeated requests
const speedLimiter = slowDown({
  windowMs: 15 * 60 * 1000, // 15 minutes
  delayAfter: 5, // Allow 5 requests per windowMs without delay
  delayMs: 500, // Add 500ms delay per request after delayAfter
  maxDelayMs: 20000, // Maximum delay of 20 seconds
});

// Apply rate limiting to API routes
app.use('/api', apiLimiter);
app.use('/api', speedLimiter);
app.use('/api/stripe/create-checkout-session', checkoutLimiter);

app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.get('/', (req, res) => {
  res.json({ 
    message: 'Welcome to Luvio Server!',
    status: 'Server is running successfully',
    timestamp: new Date().toISOString()
  });
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

app.use('/api/stripe', stripeRoutes);

app.listen(PORT, () => {
  console.log(`🚀 Luvio server is running on port ${PORT}`);
  console.log(`📍 Local: http://localhost:${PORT}`);
});

module.exports = app;
