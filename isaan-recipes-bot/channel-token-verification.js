/**
 * ไฟล์นี้ใช้สำหรับทดสอบว่า Channel Access Token ยังใช้งานได้อยู่หรือไม่
 * 
 * วิธีใช้งาน: 
 * 1. บันทึกไฟล์นี้ไว้ในโปรเจกต์ของคุณ
 * 2. รันคำสั่ง node channel-token-verification.js
 * 3. ดูผลลัพธ์ในคอนโซล
 */

const axios = require('axios');
require('dotenv').config();

const CHANNEL_ACCESS_TOKEN = process.env.CHANNEL_ACCESS_TOKEN;

// ฟังก์ชันตรวจสอบสถานะ Channel Access Token
async function verifyChannelToken() {
  try {
    console.log('Verifying LINE Channel Access Token...');
    console.log('Token: ' + CHANNEL_ACCESS_TOKEN.substring(0, 20) + '...');
    
    // ทำการเรียก API เพื่อรับข้อมูลของ Bot
    const response = await axios({
      method: 'get',
      url: 'https://api.line.me/v2/bot/info',
      headers: {
        'Authorization': `Bearer ${CHANNEL_ACCESS_TOKEN}`
      }
    });
    
    console.log('✅ Channel Access Token is valid!');
    console.log('Bot info:', response.data);
    return true;
  } catch (error) {
    console.error('❌ Channel Access Token verification failed!');
    
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Response:', error.response.data);
      
      if (error.response.status === 401) {
        console.error('Token is invalid or expired. Please regenerate a new token in the LINE Developer Console.');
      }
    } else {
      console.error('Error:', error.message);
    }
    
    return false;
  }
}

// ฟังก์ชันสำหรับส่งข้อความทดสอบไปยัง LINE API
async function testPushMessage(userId) {
  try {
    console.log(`Sending test message to user: ${userId}`);
    
    const response = await axios({
      method: 'post',
      url: 'https://api.line.me/v2/bot/message/push',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CHANNEL_ACCESS_TOKEN}`
      },
      data: JSON.stringify({
        to: userId,
        messages: [
          {
            type: 'text',
            text: 'นี่คือข้อความทดสอบ'
          }
        ]
      })
    });
    
    console.log('✅ Test message sent successfully!');
    console.log('Response:', response.data);
    return true;
  } catch (error) {
    console.error('❌ Failed to send test message!');
    
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Response:', error.response.data);
    } else {
      console.error('Error:', error.message);
    }
    
    return false;
  }
}

// รันฟังก์ชันตรวจสอบ
(async () => {
  const isValid = await verifyChannelToken();
  
  if (isValid) {
    console.log('\n--- Channel Access Token is valid and working properly ---');
    console.log('Now you can test sending a push message to a specific user.');
    console.log('To test, run this script with a userId as argument:');
    console.log('node channel-token-verification.js USER_ID');
    
    // ถ้ามีการระบุ userId ให้ทดสอบส่งข้อความ
    if (process.argv.length > 2) {
      const userId = process.argv[2];
      await testPushMessage(userId);
    }
  } else {
    console.log('\n--- Please check your Channel Access Token ---');
    console.log('1. Make sure you have set the correct token in your .env file');
    console.log('2. Regenerate a new token in the LINE Developer Console if needed');
    console.log('3. Make sure your channel is properly configured');
  }
})();