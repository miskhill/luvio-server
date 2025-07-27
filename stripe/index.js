const stripe = require('./config');
const paymentService = require('./paymentService');
const stripeRoutes = require('./routes');

module.exports = {
  stripe,
  paymentService,
  routes: stripeRoutes
};
