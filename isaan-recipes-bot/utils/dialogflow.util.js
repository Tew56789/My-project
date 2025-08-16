const uuid = require('uuid');
const { dialogflowConfig, sessionClient } = require('../config/dialogflow');
const IntentSearch = require('./intent-search.util');

/**
 * Dialogflow utility functions
 */
const DialogflowUtil = {
  /**
   * ตรวจสอบว่าตั้งค่า Dialogflow แล้วหรือยัง
   * @returns {boolean} True if configured, false otherwise
   */
  isConfigured: () => {
    return dialogflowConfig.isConfigured && sessionClient !== null;
  },

  /**
 * ส่งคำถามไปยัง Dialogflow
 * @param {string} text - ข้อความคำถาม
 * @param {string} userId - ID ของผู้ใช้
 * @returns {Promise<Object>} คำตอบจาก Dialogflow
 */
detectIntent: async (text, userId) => {
  try {
    console.log('======= DIALOGFLOW REQUEST =======');
    console.log('Query text:', text);
    
    if (!DialogflowUtil.isConfigured()) {
      console.log('❌ Dialogflow not configured');
      return {
        success: false,
        found: false,
        message: 'Dialogflow not configured'
      };
    }
    
    // สร้าง session ID แบบไม่ซ้ำกันสำหรับแต่ละผู้ใช้
    const sessionId = userId || uuid.v4();
    
    try {
      const sessionPath = sessionClient.projectAgentSessionPath(
        dialogflowConfig.projectId,
        sessionId
      );
      
      // สร้างคำขอไปยัง Dialogflow
      const request = {
        session: sessionPath,
        queryInput: {
          text: {
            text: text,
            languageCode: 'th-TH',
          },
        },
        // ต้องการข้อมูลทั้งหมดใน response
        queryParams: {
          returnAllIntentInfo: true,
          analyzeQueryTextSentiment: true
        }
      };
      
      console.log('Sending request to Dialogflow...');
      
      // ส่งคำขอไปยัง Dialogflow ด้วย timeout เพื่อป้องกันการรอนานเกินไป
      const responses = await Promise.race([
        sessionClient.detectIntent(request),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Dialogflow request timeout')), 5000)
        )
      ]);
      
      const result = responses[0].queryResult;
      
      console.log('Dialogflow response:');
      console.log(`  Query: ${result.queryText}`);
      console.log(`  Response: ${result.fulfillmentText}`);
      console.log(`  Intent: ${result.intent ? result.intent.displayName : 'No intent matched'}`);
      console.log(`  Confidence: ${result.intentDetectionConfidence}`);
      
      // ดึงข้อมูลเพิ่มเติมจาก fulfillmentMessages ถ้ามี
      let fullResponse = result.fulfillmentText;
      
      // ถ้ามี fulfillmentMessages ที่มีข้อมูลมากกว่า
      if (result.fulfillmentMessages && result.fulfillmentMessages.length > 0) {
        // ดึงข้อความทั้งหมดจาก fulfillmentMessages
        const allMessages = result.fulfillmentMessages
          .filter(msg => msg.text && msg.text.text && msg.text.text.length > 0)
          .map(msg => msg.text.text)
          .flat();
          
        // ถ้ามีข้อความมากกว่าที่ได้จาก fulfillmentText ใช้ข้อความทั้งหมด
        if (allMessages.length > 0 && allMessages.join('\n').length > fullResponse.length) {
          fullResponse = allMessages.join('\n');
        }
      }
      
      // ลดค่า confidence threshold ลงเพื่อให้ Dialogflow มีโอกาสตอบมากขึ้น
      const intentFound = result.intent && 
                        result.intentDetectionConfidence >= 0.1 && 
                        fullResponse && 
                        fullResponse.trim() !== '';
      
      if (intentFound) {
        console.log('✅ Intent found in Dialogflow');
        return {
          success: true,
          found: true,
          intent: result.intent.displayName,
          confidence: result.intentDetectionConfidence,
          response: fullResponse,  // ใช้ fullResponse แทน result.fulfillmentText
          parameters: result.parameters.fields
        };
      } else {
        console.log('❌ No intent found in Dialogflow');
        return {
          success: true,
          found: false,
          confidence: result.intentDetectionConfidence || 0
        };
      }
    } catch (apiError) {
      // จัดการข้อผิดพลาดที่เกิดขึ้นจาก API โดยเฉพาะ
      console.error('❌ Dialogflow API error:', apiError.message);
      
      // ตรวจสอบประเภทของข้อผิดพลาด
      let errorType = 'api_error';
      let errorMessage = apiError.message || 'Unknown Dialogflow API error';
      
      // ตรวจสอบข้อผิดพลาดเฉพาะกรณี
      if (errorMessage.includes('Intent with id')) {
        errorType = 'intent_not_found';
        console.error('❌ Intent ID not found error. May need to recreate or update intents');
      } else if (errorMessage.includes('DEADLINE_EXCEEDED')) {
        errorType = 'timeout';
        console.error('❌ Dialogflow request timed out');
      } else if (errorMessage.includes('UNAVAILABLE')) {
        errorType = 'service_unavailable';
        console.error('❌ Dialogflow service unavailable');
      } else if (errorMessage.includes('PERMISSION_DENIED')) {
        errorType = 'permission_denied';
        console.error('❌ Permission denied for Dialogflow request');
      }
      
      return {
        success: false,
        found: false,
        message: errorMessage,
        errorType: errorType
      };
    }
  } catch (error) {
    console.error('❌ Error detecting intent with Dialogflow:', error);
    return {
      success: false,
      found: false,
      message: error.message,
      errorType: 'general_error'
    };
  }
},

  /**
   * ค้นหา Intent จากข้อความโดยตรงโดยไม่ผ่าน API (ใช้ข้อมูลที่ cache ไว้)
   * @param {string} text - ข้อความที่ต้องการค้นหา
   * @returns {Promise<Object>} ผลการค้นหา Intent
   */
  searchIntentDirectly: async (text) => {
    try {
      console.log('======= SEARCHING INTENTS DIRECTLY =======');
      console.log('Search text:', text);

      if (!DialogflowUtil.isConfigured()) {
        console.log('❌ Dialogflow not configured for direct intent search');
        return {
          success: false,
          found: false,
          message: 'Dialogflow not configured'
        };
      }

      // ค้นหา intent โดยตรงจากข้อความ
      const foundIntent = await IntentSearch.findIntentByText(text);
      
      if (foundIntent) {
        console.log('✅ Intent found directly:', foundIntent.displayName);
        
        // สร้างคำตอบจาก intent ที่พบ
        const response = foundIntent.responses && foundIntent.responses.length > 0
          ? foundIntent.responses[0] // ใช้คำตอบแรกที่พบ
          : `ข้อมูลเกี่ยวกับ ${foundIntent.displayName}`; // ถ้าไม่มีคำตอบกำหนดไว้
        
        return {
          success: true,
          found: true,
          intent: foundIntent.displayName,
          confidence: 1.0, // กำหนดค่า confidence เต็ม เพราะเป็นการค้นหาโดยตรง
          response: response
        };
      }
      
      console.log('❌ No intent found directly for:', text);
      return {
        success: true,
        found: false
      };
    } catch (error) {
      console.error('❌ Error searching intent directly:', error);
      return {
        success: false,
        found: false,
        message: error.message
      };
    }
  },

  /**
   * ค้นหา Training Phrases จาก Dialogflow และตรวจสอบว่าคำถามตรงกับ training phrases หรือไม่
   * @param {string} text - ข้อความคำถาม
   * @param {string} userId - ID ของผู้ใช้
   * @returns {Promise<Object>} ผลการค้นหา Training Phrases
   */
  matchTrainingPhrases: async (text, userId) => {
    try {
      if (!DialogflowUtil.isConfigured()) {
        console.log('❌ Dialogflow not configured for training phrases matching');
        return {
          success: false,
          found: false,
          message: 'Dialogflow not configured'
        };
      }

      // ใช้ API ของ Dialogflow เพื่อดึงข้อมูล intents และ training phrases
      // ตัวอย่าง: ตรวจสอบด้วยค่า confidence ที่ต่ำมาก เพื่อให้ได้ผลลัพธ์กลับมา
      const intentResult = await DialogflowUtil.detectIntent(text, userId);
      
      // ถ้าพบ intent แล้ว ก็ไม่จำเป็นต้องตรวจสอบ training phrases
      if (intentResult.found) {
        return intentResult;
      }
      
      // ถ้ายังไม่พบ intent ที่มี confidence สูงพอ แต่มีค่า confidence บางระดับ
      // แสดงว่าอาจจะมี training phrases ที่คล้ายกัน
      if (intentResult.confidence > 0.3) {
        console.log('Found similar training phrase with confidence:', intentResult.confidence);
        // ใช้ค่า confidence ที่ต่ำลงเพื่อยอมรับ intent นั้น
        return {
          success: true,
          found: true,
          intent: intentResult.intent,
          confidence: intentResult.confidence,
          response: intentResult.response,
          parameters: intentResult.parameters,
          note: 'Matched by training phrase similarity'
        };
      }

      return {
        success: true,
        found: false,
        message: 'No matching training phrases found'
      };
    } catch (error) {
      console.error('❌ Error matching training phrases:', error);
      return {
        success: false,
        found: false,
        message: error.message
      };
    }
  },
  
  /**
   * ดึงข้อมูล Intents ทั้งหมด
   * @param {boolean} forceRefresh - บังคับให้ดึงข้อมูลใหม่
   * @returns {Promise<Array>} รายการ Intents ทั้งหมด
   */
  getAllIntents: async (forceRefresh = false) => {
    return await IntentSearch.getCachedIntents(forceRefresh);
  },
  
  /**
   * รีเฟรชข้อมูล Intents ใน cache
   * @returns {Promise<Array>} รายการ Intents ที่อัปเดตแล้ว
   */
  refreshIntentsCache: async () => {
    return await IntentSearch.getCachedIntents(true);
  }
};

module.exports = DialogflowUtil;