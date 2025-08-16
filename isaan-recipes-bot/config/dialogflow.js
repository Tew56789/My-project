const dialogflow = require('@google-cloud/dialogflow');
const uuid = require('uuid');
require('dotenv').config();

// ตรวจสอบว่ามีการตั้งค่าหรือไม่
const projectId = process.env.DIALOGFLOW_PROJECT_ID;
const sessionClient = projectId ? new dialogflow.SessionsClient() : null;

// สร้าง client สำหรับเข้าถึง intents โดยตรง
const intentsClient = projectId ? new dialogflow.IntentsClient() : null;

/**
 * สร้าง config สำหรับ Dialogflow
 */
const dialogflowConfig = {
  projectId: projectId,
  isConfigured: !!projectId,
};

module.exports = {
  dialogflowConfig,
  sessionClient,
  intentsClient
};