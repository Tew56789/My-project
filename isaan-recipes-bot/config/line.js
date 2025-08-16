const { Client } = require('@line/bot-sdk');
require('dotenv').config();

// LINE configuration
const lineConfig = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET || 'your-channel-secret'
};

// Create a new LINE client
const lineClient = new Client(lineConfig);

module.exports = {
  lineConfig,
  lineClient
};