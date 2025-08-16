const { dialogflowConfig, intentsClient } = require('../config/dialogflow');

/**
 * ดึงข้อมูล Intents ทั้งหมดจาก Dialogflow
 * @returns {Promise<Array>} รายการ Intents ทั้งหมดพร้อม Training Phrases
 */
async function getAllIntents() {
  try {
    if (!dialogflowConfig.isConfigured || !intentsClient) {
      console.log('❌ Dialogflow intents client not configured');
      return [];
    }

    console.log('Fetching all intents from Dialogflow...');
    const projectAgentPath = intentsClient.projectAgentPath(dialogflowConfig.projectId);
    
    // ดึงข้อมูล intents ทั้งหมด
    const [response] = await intentsClient.listIntents({
      parent: projectAgentPath,
      intentView: 'INTENT_VIEW_FULL', // เพื่อให้ได้ training phrases ด้วย
    });

    console.log(`✅ Fetched ${response.length} intents successfully`);
    
    // แปลงข้อมูลให้ใช้งานง่ายขึ้น
    const intents = response.map(intent => {
      // ดึง training phrases
      const trainingPhrases = intent.trainingPhrases
        ? intent.trainingPhrases.map(phrase => {
            // แปลง parts เป็นข้อความเต็ม
            return phrase.parts.map(part => part.text).join(' ');
          })
        : [];

      // ดึง responses
      const responses = intent.messages && intent.messages.length > 0
        ? intent.messages.map(message => {
            // ตรวจสอบประเภทของ message
            if (message.text && message.text.text) {
              return message.text.text;
            }
            return null;
          }).filter(msg => msg !== null)
        : [];

      return {
        id: intent.name,
        displayName: intent.displayName,
        trainingPhrases: trainingPhrases,
        responses: responses.flat() // flatten array เพราะ text.text อาจเป็น array
      };
    });

    return intents;
  } catch (error) {
    console.error('❌ Error fetching intents:', error);
    console.error(error.stack);
    return [];
  }
}

// Cache สำหรับเก็บข้อมูล intents (เพื่อลดการเรียก API บ่อยๆ)
let intentsCache = [];
let lastFetchTime = 0;
const CACHE_TTL = 60 * 60 * 1000; // 1 ชั่วโมง

/**
 * ดึงข้อมูล Intents ทั้งหมด (จาก cache หรือ Dialogflow)
 * @param {boolean} forceRefresh - บังคับให้ดึงข้อมูลใหม่
 * @returns {Promise<Array>} รายการ Intents ทั้งหมด
 */
async function getCachedIntents(forceRefresh = false) {
  const now = Date.now();
  
  // ตรวจสอบว่าควรดึงข้อมูลใหม่หรือไม่
  if (forceRefresh || intentsCache.length === 0 || (now - lastFetchTime) > CACHE_TTL) {
    console.log('Cache expired or forced refresh, fetching fresh intents...');
    intentsCache = await getAllIntents();
    lastFetchTime = now;
  } else {
    console.log('Using cached intents data');
  }
  
  return intentsCache;
}

/**
 * ค้นหา intent ตามข้อความ
 * @param {string} text - ข้อความที่ต้องการค้นหา
 * @returns {Promise<Object|null>} Intent ที่พบหรือ null ถ้าไม่พบ
 */
async function findIntentByText(text) {
  try {
    const intents = await getCachedIntents();
    console.log(`Searching for "${text}" among ${intents.length} intents...`);
    
    // คำที่ต้องการค้นหา (แปลงเป็นตัวพิมพ์เล็กและตัดช่องว่างหัวท้าย)
    const searchText = text.toLowerCase().trim();
    
    // 1. ค้นหาจากชื่อ intent ที่ตรงกัน (exact match)
    const exactNameMatch = intents.find(intent => 
      intent.displayName.toLowerCase() === searchText
    );
    
    if (exactNameMatch) {
      console.log(`✅ Found exact name match: ${exactNameMatch.displayName}`);
      return exactNameMatch;
    }
    
    // 2. ค้นหาจาก training phrases ที่ตรงกัน (exact match)
    const exactPhraseMatch = intents.find(intent => 
      intent.trainingPhrases.some(phrase => 
        phrase.toLowerCase() === searchText
      )
    );
    
    if (exactPhraseMatch) {
      console.log(`✅ Found exact training phrase match in intent: ${exactPhraseMatch.displayName}`);
      return exactPhraseMatch;
    }
    
    // 3. ค้นหาจากชื่อ intent ที่มีคำนั้นเป็นส่วนหนึ่ง (partial match)
    const partialNameMatch = intents.find(intent => 
      intent.displayName.toLowerCase().includes(searchText)
    );
    
    if (partialNameMatch) {
      console.log(`✅ Found partial name match: ${partialNameMatch.displayName}`);
      return partialNameMatch;
    }
    
    // 4. ค้นหาจาก training phrases ที่มีคำนั้นเป็นส่วนหนึ่ง (partial match)
    const partialPhraseMatch = intents.find(intent => 
      intent.trainingPhrases.some(phrase => 
        phrase.toLowerCase().includes(searchText)
      )
    );
    
    if (partialPhraseMatch) {
      console.log(`✅ Found partial training phrase match in intent: ${partialPhraseMatch.displayName}`);
      return partialPhraseMatch;
    }
    
    console.log(`❌ No intent found for: ${text}`);
    return null;
  } catch (error) {
    console.error('❌ Error finding intent by text:', error);
    console.error(error.stack);
    return null;
  }
}

module.exports = {
  getAllIntents,
  getCachedIntents,
  findIntentByText
};