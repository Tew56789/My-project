const express = require('express');
const router = express.Router();
const WebhookController = require('../controllers/webhook.controller');
const { lineConfig } = require('../config/line');

// ปิดการตรวจสอบลายเซ็นชั่วคราวเพื่อการทดสอบ (ไม่แนะนำในระบบจริง)
router.post('/', WebhookController.handleWebhook);

module.exports = router;