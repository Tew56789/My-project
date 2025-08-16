const express = require('express');
const cors = require('cors');
require('dotenv').config();

// Import routes
const webhookRoutes = require('./routes/webhook.route');
const apiRoutes = require('./routes/api.route');

// Import models
const RecipeModel = require('./models/recipe.model');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors());

// Request logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/webhook', webhookRoutes);
app.use('/api', apiRoutes);

// Root route
app.get('/', (req, res) => {
  res.send('Isaan Recipes Bot API is running');
});

// Start server
app.listen(PORT, () => {
  console.log(`======= SERVER STARTED =======`);
  console.log(`Server is running on port ${PORT}`);
  console.log(`Webhook URL: http://your-domain.com:${PORT}/webhook`);
  console.log(`API URL: http://your-domain.com:${PORT}/api`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`LINE Channel configured: ${process.env.CHANNEL_SECRET ? 'YES' : 'NO'}`);
  console.log(`Gemini API configured: ${process.env.API_KEY ? 'YES' : 'NO'}`);
  console.log(`Firebase configured: YES`);
  console.log(`===============================`);
});

module.exports = app;