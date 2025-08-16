const { dialogflowConfig, sessionClient } = require('./config/dialogflow');
const DialogflowUtil = require('./utils/dialogflow.util');
const uuid = require('uuid');

async function testDialogflow() {
  console.log('Testing Dialogflow connection...');
  console.log('Config:', dialogflowConfig);
  
  if (!sessionClient) {
    console.error('Session client not initialized');
    return;
  }
  
  try {
    // ทดสอบเรียกใช้ detectIntent
    const query = 'ก้อยเนื้อ ก้อยขม';
    console.log(`Testing intent detection with query: "${query}"`);
    
    const response = await DialogflowUtil.detectIntent(query, 'test-user-id');
    console.log('Dialogflow response:', JSON.stringify(response, null, 2));
    
    if (response.messages) {
      console.log(`Found ${response.messages.length} messages to send:`);
      response.messages.forEach((msg, i) => {
        console.log(`Message ${i+1}:`, JSON.stringify(msg, null, 2));
      });
    }
    
    console.log('✅ Test completed successfully');
  } catch (error) {
    console.error('❌ Test failed:', error);
    console.error(error.stack);
  }
}

testDialogflow();