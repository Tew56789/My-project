const UserModel = require("../models/user.model");
const RecipeModel = require("../models/recipe.model");
const LineUtil = require("../utils/line.util");
const GeminiUtil = require("../utils/gemini.util");
const DialogflowUtil = require("../utils/dialogflow.util");
const TrackingUtil = require("../utils/tracking.util");
const { db } = require("../config/firebase");

/**
 * Webhook controller for handling LINE events
 */
const WebhookController = {
  /**
   * Handle LINE webhook events
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  handleWebhook: async (req, res) => {
    try {
      console.log("======= WEBHOOK TRIGGERED =======");
      console.log("Request method:", req.method);
      console.log("Request headers:", JSON.stringify(req.headers, null, 2));
      console.log("Request body:", JSON.stringify(req.body, null, 2));

      if (req.method !== "POST") {
        console.log("❌ Method not allowed:", req.method);
        return res.status(405).send("Method Not Allowed");
      }

      const events = req.body.events;
      if (!events || events.length === 0) {
        console.log("❌ No events in request body");
        return res.status(200).send("No events");
      }

      console.log(`✅ Received ${events.length} events`);

      // Process each event
      for (const event of events) {
        console.log("Processing event:", JSON.stringify(event, null, 2));
        await processEvent(event);
      }

      console.log("✅ All events processed successfully");
      return res.status(200).send("OK");
    } catch (error) {
      console.error("❌ Error handling webhook:", error);
      return res.status(500).send("Internal Server Error");
    }
  },
};

/**
 * Process a LINE event
 * @param {Object} event - LINE event object
 */
async function processEvent(event) {
  try {
    console.log("======= PROCESSING EVENT =======");
    console.log("Event type:", event.type);
    console.log("Event timestamp:", event.timestamp);
    console.log("Current time:", Date.now());

    // ตรวจสอบว่า event เก่าเกินไปหรือไม่
    const eventTime = event.timestamp;
    const currentTime = Date.now();
    const timeDiff = currentTime - eventTime;

    // ถ้าเวลาผ่านไปเกิน 25 วินาที ให้ข้ามการตอบกลับ
    if (timeDiff > 25000) {
      console.log(
        "⚠️ Event is too old, replyToken might be expired:",
        timeDiff,
        "ms"
      );
      return;
    }

    // Handle only message events for now
    if (event.type !== "message") {
      console.log("❌ Ignoring non-message event");
      return;
    }

    const userId = event.source.userId;
    const replyToken = event.replyToken;
    console.log(`User ID: ${userId}, Reply Token: ${replyToken}`);

    // Get or create user session
    console.log("Fetching user session...");
    let user = await UserModel.getUserSession(userId);
    if (!user) {
      console.log("User not found, creating new session...");
      try {
        const profile = await LineUtil.getUserProfile(userId);
        console.log("User profile:", JSON.stringify(profile, null, 2));

        // สร้าง object ข้อมูล profile ที่จำเป็น
        const userProfile = {
          displayName: profile.displayName || "User",
          pictureUrl: profile.pictureUrl || "",
        };

        // เพิ่ม statusMessage เฉพาะเมื่อมีค่า
        if (profile.statusMessage) {
          userProfile.statusMessage = profile.statusMessage;
        }

        user = await UserModel.updateUserSession(userId, {
          profile: userProfile,
          mode: "default",
          created: new Date().toISOString(),
        });
        console.log("New user session created");
      } catch (profileError) {
        console.error("❌ Error creating user session:", profileError);
        // ถ้าไม่สามารถบันทึกข้อมูลผู้ใช้ได้ ให้สร้างข้อมูลผู้ใช้ขั้นต่ำ
        user = {
          profile: {
            displayName: "User",
            pictureUrl: "",
          },
          mode: "default",
        };
      }
    } else {
      console.log("User session found:", JSON.stringify(user, null, 2));
    }

    // Handle different message types
    console.log("Message type:", event.message.type);
    try {
      switch (event.message.type) {
        case "text":
          console.log("Handling text message:", event.message.text);
          await handleTextMessage(event, user);
          break;

        case "image":
          console.log("Handling image message");
          await handleImageMessage(event, user);
          break;

        default:
          console.log("Unsupported message type");
          await LineUtil.reply(replyToken, [
            {
              type: "text",
              text: "ขออภัย ฉันยังไม่รองรับข้อความประเภทนี้",
            },
          ]);
      }
      console.log("✅ Event processed successfully");
    } catch (messageError) {
      console.error("❌ Error processing message:", messageError);

      // ตรวจสอบว่า replyToken ยังใช้ได้หรือไม่ก่อนพยายามตอบกลับ
      if (timeDiff <= 25000) {
        try {
          await LineUtil.reply(replyToken, [
            {
              type: "text",
              text: "ขออภัย เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง",
            },
          ]);
        } catch (replyError) {
          console.error("❌ Cannot send error reply:", replyError);
        }
      } else {
        console.log(
          "⚠️ Skip sending error reply because replyToken might be expired"
        );
      }
    }
  } catch (error) {
    console.error("❌ Error processing event:", error);
    console.error(error.stack);
  }
}

/**
 * Handle text message
 * @param {Object} event - LINE event object
 * @param {Object} user - User session data
 */
async function handleTextMessage(event, user) {
  const text = event.message.text;
  const userId = event.source.userId;
  const replyToken = event.replyToken;

  console.log(`======= HANDLING TEXT MESSAGE =======`);
  console.log(`User ${userId} sent: ${text}`);

  // Check for reset command
  if (text.toLowerCase() === "reset") {
    console.log("Reset command detected");
    await UserModel.resetUserSession(userId);
    await LineUtil.reply(replyToken, [
      {
        type: "text",
        text: "ระบบได้รีเซ็ตการสนทนาแล้ว คุณสามารถสอบถามได้ตามปกติ",
      },
    ]);
    return;
  }

  // Check for menu command
  if (text.toLowerCase() === "เมนู" || text.toLowerCase() === "menu") {
    console.log("Menu command detected");
    await handleMenuCommand(event, user);
    console.log("Menu response sent");
    return;
  }

  // Check for "รายการอาหาร" command to show all Isaan dishes
  if (text === "รายการอาหาร") {
    console.log("Show all dishes command detected");
    await handleShowAllDishes(event, user);
    console.log("All dishes response sent");
    return;
  }

  // Check for "คำถามที่บ่อย" command to show popular queries
  if (
    text === "คำถามที่ถามบ่อย" ||
    text.toLowerCase() === "popular" ||
    text.toLowerCase() === "faq"
  ) {
    console.log("Show popular queries command detected");
    await handlePopularQueries(event, user);
    console.log("Popular queries response sent");
    return;
  }

  // ตรวจสอบว่าผู้ใช้มีบริบทอาหารหรือไม่
  let foodContext = await UserModel.getFoodContext(userId);
  console.log(
    "Current food context:",
    foodContext ? JSON.stringify(foodContext, null, 2) : "None"
  );

  // เพิ่มการตรวจสอบว่าคำถามใหม่เกี่ยวข้องกับบริบทเดิมหรือไม่
  if (foodContext) {
    // ตรวจสอบความเกี่ยวข้องกับบริบท
    const isRelated = isRelatedToContext(text, foodContext);
    console.log(`Query related to current context: ${isRelated}`);

    // ถ้าไม่เกี่ยวข้อง ให้ reset บริบทอัตโนมัติ
    if (!isRelated) {
      console.log(
        "Query not related to current context, auto resetting context"
      );
      await UserModel.resetUserSession(userId);
      foodContext = null; // ล้างบริบทสำหรับการประมวลผลในรอบนี้
    }
  }

  // Check if asking for recipe details
  if (text.startsWith("วิธีทำ")) {
    const recipeName = text.replace("วิธีทำ", "").trim();
    console.log(`Recipe detail requested: ${recipeName}`);

    // Process the recipe detail request
    const result = await handleRecipeDetail(recipeName, event, user);

    // If a recipe is found, store it in context for future Gemini queries
    if (result && result.recipe) {
      await UserModel.setFoodContext(userId, result.recipe);
    }
    return;
  }

  // Track food-related queries
  if (isFoodQuery(text)) {
    console.log("Food-related query detected, tracking...");
    await RecipeModel.trackPopularQuery(text);
  }

  // ตรวจสอบว่าเป็นคำถามที่อาจจะต้องการบริบทหรือไม่
  const isGenericQuestion = isGenericFoodQuestion(text);

  // ถ้าเป็นคำถามทั่วไปที่ต้องการบริบท และยังไม่มีบริบท
  // ให้พยายามค้นหาบริบทจากคำถามล่าสุด
  if (isGenericQuestion && !foodContext) {
    console.log(
      "Generic question detected, attempting to find context from history"
    );
    foodContext = await findContextFromHistory(userId);

    if (foodContext) {
      console.log(
        "Found context from history:",
        JSON.stringify(foodContext, null, 2)
      );
      // อัปเดตบริบทให้เป็นปัจจุบัน
      await UserModel.setFoodContext(userId, foodContext);
    }
  }

  // ถ้ามีบริบทอาหารให้ใช้ Gemini พร้อมบริบท
  if (foodContext) {
    console.log("Using Gemini with food context");
    await handleGeminiWithContext(text, foodContext, event, user);

    // บันทึกคำถามลงในประวัติการถามของผู้ใช้
    await saveQueryHistory(userId, text);
    return;
  }

  // บันทึกคำถามลงในประวัติการถามของผู้ใช้
  await saveQueryHistory(userId, text);

  // ขั้นตอนการค้นหาคำตอบสำหรับคำถามทั่วไป:
  // 1. ปรับ confidence threshold ลงสำหรับคำถามที่อาจเป็นชื่ออาหารโดยตรง
  // 2. ใช้ Dialogflow API (detectIntent)
  // 3. ถ้าไม่พบ ใช้ Gemini

  try {
    if (DialogflowUtil.isConfigured()) {
      // ปรับ confidence threshold ลงสำหรับคำถามที่อาจเป็นชื่ออาหารโดยตรง
      const isDirectFoodQuery = checkIfDirectFoodQuery(text);
      const confidenceThreshold = isDirectFoodQuery ? 0.3 : 0.5;

      console.log(
        `Checking Dialogflow for intent with threshold: ${confidenceThreshold}`
      );
      console.log(`Is direct food query: ${isDirectFoodQuery}`);

      try {
        // 1. ใช้ Dialogflow API (detectIntent)
        const dialogflowResponse = await DialogflowUtil.detectIntent(
          text,
          userId
        );

        // ใน handleTextMessage ในส่วนของการตรวจสอบ Dialogflow
        if (dialogflowResponse.success) {
          if (dialogflowResponse.found) {
            // ตรวจสอบว่าคำตอบเป็นข้อความปฏิเสธหรือไม่
            const rejectResponses = [
              "ขอโทษ",
              "ขอโทษนะ",
              "ฉันเป็นผู้เชี่ยวชาญด้านอาหารอีสานเท่านั้น",
              "ไม่สามารถตอบคำถามได้",
              "ไม่เข้าใจคำถาม",
            ];

            const isRejectionResponse = rejectResponses.some((phrase) =>
              dialogflowResponse.response
                .toLowerCase()
                .includes(phrase.toLowerCase())
            );

            if (!isRejectionResponse) {
              // ถ้าไม่ใช่คำปฏิเสธ ให้ใช้คำตอบจาก Dialogflow
              console.log("Using valid response from Dialogflow");
              await LineUtil.reply(replyToken, [
                {
                  type: "text",
                  text: dialogflowResponse.response,
                },
              ]);

              // ถ้าเป็นคำถามเกี่ยวกับอาหารโดยตรง ให้เก็บไว้ในบริบท
              if (isDirectFoodQuery) {
                const recipes = await RecipeModel.getAllRecipes();
                const recipe = recipes.find(
                  (r) =>
                    r.name.toLowerCase() === text.toLowerCase() ||
                    r.name.toLowerCase().includes(text.toLowerCase())
                );

                if (recipe) {
                  console.log(`Setting food context for direct query: ${text}`);
                  await UserModel.setFoodContext(userId, recipe);
                }
              }

              // บันทึกคำถามและคำตอบ
              try {
                await RecipeModel.saveUserQuery(
                  text,
                  dialogflowResponse.response,
                  "dialogflow"
                );
              } catch (error) {
                console.error("Error saving query:", error);
              }
              console.log("✅ Dialogflow response sent successfully");
              return;
            } else {
              // ถ้าเป็นคำปฏิเสธ ให้ลองใช้ Gemini แทน
              console.log(
                "Dialogflow returned rejection response, trying Gemini instead"
              );
              // ไม่ return ในที่นี้ เพื่อให้ทำงานต่อกับ Gemini
            }
          } else {
            console.log(
              "No intent found in Dialogflow, falling back to Gemini"
            );
          }
        } else {
          console.log(
            `Dialogflow error: ${dialogflowResponse.message || "Unknown error"}`
          );
          console.log("Using Gemini as fallback");
        }
      } catch (dialogflowInnerError) {
        // จัดการข้อผิดพลาดที่เกิดจาก Dialogflow API
        console.error("❌ Error with Dialogflow API:", dialogflowInnerError);
        console.log("Falling back to Gemini due to Dialogflow error");
      }
    } else {
      console.log("Dialogflow not configured, using Gemini directly");
    }
  } catch (dialogflowError) {
    console.error("❌ General error with Dialogflow process:", dialogflowError);
    console.log("Falling back to Gemini due to general error");
  }

  // 3. ถ้าไม่พบใน Dialogflow หรือเกิดข้อผิดพลาด ใช้ Gemini
  try {
    console.log("Fetching context for Gemini...");
    // Get popular food queries for context
    const popularQueries = await RecipeModel.getPopularQueries(5);
    console.log("Popular queries:", JSON.stringify(popularQueries, null, 2));

    const popularQueriesText =
      popularQueries.length > 0
        ? `เมนูที่ถามบ่อย: ${popularQueries.map((q) => q.text).join(", ")}`
        : "";

    // Get recipes for context
    const recipes = await RecipeModel.getAllRecipes();
    console.log(`Fetched ${recipes.length} recipes for context`);

    console.log("Sending query to Gemini API...");

    // เพิ่มการตรวจสอบคำถามว่าเป็นคำถามเกี่ยวกับอาหารหรือไม่
    let query = text;
    if (checkIfDirectFoodQuery(text)) {
      // ถ้าเป็นชื่ออาหารโดยตรง เราควรถามเพิ่มเติมเพื่อให้ได้คำตอบที่ดี
      query = `อธิบายเกี่ยวกับอาหารอีสานที่เรียกว่า "${text}" ทั้งส่วนประกอบ วิธีทำ รสชาติ และวิธีรับประทาน`;

      // ถ้าเป็นชื่ออาหารโดยตรง ให้หาข้อมูลอาหารและเก็บลงในบริบท
      const recipe = recipes.find(
        (r) =>
          r.name.toLowerCase() === text.toLowerCase() ||
          r.name.toLowerCase().includes(text.toLowerCase())
      );

      if (recipe) {
        console.log(`Found recipe for direct food query: ${recipe.name}`);
        await UserModel.setFoodContext(userId, recipe);
      }
    }

    const geminiResponse = await GeminiUtil.foodQuery(query, recipes);
    console.log("Gemini response:", geminiResponse);

    // ตรวจสอบว่าเป็นข้อความปฏิเสธหรือไม่
    const rejectResponses = [
      "ขอโทษ",
      "ขอโทษนะ",
      "ฉันเป็นผู้เชี่ยวชาญด้านอาหารเท่านั้น",
      "ไม่สามารถตอบคำถามได้",
      "ไม่เข้าใจคำถาม",
    ];

    const isRejectionResponse = rejectResponses.some((phrase) =>
      geminiResponse.toLowerCase().includes(phrase.toLowerCase())
    );

    if (isRejectionResponse) {
      // ถ้าเป็นคำตอบปฏิเสธและเป็นคำถามเกี่ยวกับอาหาร พยายามถามใหม่ด้วยคำถามที่ชัดเจนมากขึ้น
      if (checkIfDirectFoodQuery(text) || isFoodQuery(text)) {
        console.log(
          "Rejection response detected, trying with a different prompt"
        );
        const fallbackQuery = `อธิบายอาหารอีสานชื่อ "${text}" และวิธีทำโดยละเอียด`;
        const fallbackResponse = await GeminiUtil.textOnly(fallbackQuery);

        await LineUtil.reply(replyToken, [
          {
            type: "text",
            text: fallbackResponse,
          },
        ]);

        // บันทึกคำถามและคำตอบจาก Gemini เพื่อใช้ในอนาคต
        try {
          await RecipeModel.saveUserQuery(
            text,
            fallbackResponse,
            "gemini_fallback"
          );
        } catch (saveError) {
          console.error("Error saving Gemini fallback query:", saveError);
        }

        console.log("✅ Gemini fallback response sent successfully");
        return;
      }
    }

    // บันทึกคำถามและคำตอบจาก Gemini เพื่อใช้ในอนาคต
    try {
      await RecipeModel.saveUserQuery(text, geminiResponse, "gemini");
      console.log("✅ Saved Gemini query to database");
    } catch (saveError) {
      console.error("Error saving Gemini query:", saveError);
    }

    console.log("Sending response back to user...");
    await LineUtil.reply(replyToken, [
      {
        type: "text",
        text: geminiResponse,
      },
    ]);
    console.log("✅ Gemini response sent successfully");
  } catch (error) {
    console.error("❌ Error generating response:", error);
    console.error(error.stack);
    await LineUtil.reply(replyToken, [
      {
        type: "text",
        text: "ขออภัย ไม่สามารถสร้างคำตอบได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง",
      },
    ]);
  }
}
/**
 * ตรวจสอบว่าคำถามใหม่เกี่ยวข้องกับบริบทเดิมหรือไม่
 * @param {string} query - คำถามใหม่
 * @param {Object} foodContext - บริบทอาหารปัจจุบัน
 * @returns {boolean} ผลการตรวจสอบ
 */
function isRelatedToContext(query, foodContext) {
  // ถ้าไม่มีบริบท ถือว่าเกี่ยวข้อง
  if (!foodContext) return true;

  // ตรวจสอบว่าคำถามมีชื่ออาหารจากบริบทหรือไม่
  const foodName = foodContext.name.toLowerCase();
  const lowerQuery = query.toLowerCase();

  // ถ้ามีชื่ออาหารในคำถาม ถือว่าเกี่ยวข้อง
  if (lowerQuery.includes(foodName)) return true;

  // ถ้าเป็นคำถามทั่วไปเกี่ยวกับวิธีทำ ส่วนประกอบ ที่ไม่ระบุชื่ออาหารอื่น
  // ให้ตรวจสอบว่าเป็นคำถามทั่วไปที่ต้องการบริบทหรือไม่
  if (isGenericFoodQuestion(lowerQuery)) return true;

  // ตรวจสอบว่ามีการถามถึงอาหารอื่นหรือไม่
  const otherFoodName = checkIfContainsOtherFood(lowerQuery, foodName);
  // ถ้ามีการถามถึงอาหารอื่น แสดงว่าไม่เกี่ยวข้องกับบริบทเดิม
  if (otherFoodName) return false;

  // ถ้าไม่แน่ใจ ถือว่าเกี่ยวข้อง
  return true;
}

/**
 * ตรวจสอบว่าคำถามมีการถามถึงอาหารอื่นที่ไม่ใช่อาหารในบริบทปัจจุบันหรือไม่
 * @param {string} query - คำถาม
 * @param {string} currentFoodName - ชื่ออาหารในบริบทปัจจุบัน
 * @returns {string|null} ชื่ออาหารอื่นที่พบ หรือ null
 */
function checkIfContainsOtherFood(query, currentFoodName) {
  // รายการชื่ออาหารอีสานที่นิยม (ใช้รายการเดียวกับในฟังก์ชัน checkIfDirectFoodQuery)
  const isanFoods = [
    "ลาบ",
    "ลาบหมู",
    "ลาบเนื้อ",
    "ลาบปลา",
    "ลาบไก่",
    "ลาบเป็ด",
    "ส้มตำ",
    "ตำไทย",
    "ตำปูปลาร้า",
    "ตำซั่ว",
    "ตำไท",
    "ตำถั่ว",
    "ตำเขือ",
    "ต้มแซบ",
    "ต้มยำ",
    "แกงหน่อไม้",
    "อ่อม",
    "แกงอ่อม",
    "ซุปหน่อไม้",
    "ก้อย",
    "ก้อยเนื้อ",
    "ก้อยปลา",
    "ก้อยกุ้ง",
    "ก้อยหอย",
    "หมกหน่อไม้",
    "หมกปลา",
    "หมกไก่",
    "หมกเนื้อ",
    "ป่น",
    "ป่นปลา",
    "ป่นหอย",
    "ป่นแมงดา",
    "แจ่ว",
    "น้ำแจ่ว",
    "แจ่วบอง",
    "น้ำพริก",
    "ซุปหน่อไม้",
    "แกงหน่อไม้",
    "แกงเห็ด",
    "ไข่มดแดง",
    "ปาปิก",
    "หมี่กะทิ",
    "ขนมจีนน้ำยา",
    "ข้าวหมาก",
    "ข้าวจี่",
  ];

  // ตรวจสอบว่ามีชื่ออาหารอื่นในคำถามหรือไม่
  for (const food of isanFoods) {
    // ข้ามอาหารที่ตรงกับบริบทปัจจุบัน
    if (food.toLowerCase() === currentFoodName) continue;

    // ถ้าพบชื่ออาหารอื่น
    if (query.includes(food.toLowerCase())) {
      return food;
    }
  }

  return null;
}

/**
 * ฟังก์ชันสำหรับจัดการคำถามด้วย Gemini โดยใช้บริบทอาหาร
 * @param {string} text - ข้อความคำถาม
 * @param {Object} foodContext - บริบทอาหารที่กำลังสนทนา
 * @param {Object} event - LINE event object
 * @param {Object} user - User session data
 */
async function handleGeminiWithContext(text, foodContext, event, user) {
  const replyToken = event.replyToken;
  const userId = event.source.userId;

  console.log("======= HANDLING GEMINI WITH CONTEXT =======");
  console.log("Food context:", JSON.stringify(foodContext, null, 2));

  try {
    // ใช้ฟังก์ชันใหม่ที่ออกแบบมาสำหรับการสนทนาต่อเนื่อง
    console.log("Using continueFoodConversation function...");
    const response = await GeminiUtil.continueFoodConversation(
      text,
      foodContext
    );
    console.log("Gemini conversation response:", response);

    // บันทึกคำถามและคำตอบลงในฐานข้อมูล
    try {
      await RecipeModel.saveUserQuery(text, response, "gemini_with_context");
    } catch (error) {
      console.error("Error saving query:", error);
    }

    // ส่งคำตอบกลับไปยังผู้ใช้
    await LineUtil.reply(replyToken, [
      {
        type: "text",
        text: response,
      },
    ]);

    console.log("✅ Gemini response with context sent successfully");
  } catch (error) {
    console.error("❌ Error generating response with context:", error);
    await LineUtil.reply(replyToken, [
      {
        type: "text",
        text: "ขออภัย ไม่สามารถตอบคำถามได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง",
      },
    ]);
  }
}

/**
 * ตรวจสอบว่าผู้ใช้กำลังถามซ้ำหรือไม่
 * @param {string} userId - LINE user ID
 * @param {string} text - ข้อความที่ผู้ใช้ส่งมา
 * @returns {Promise<boolean>} True หากเป็นการถามซ้ำ
 */
async function isRepeatedQuery(userId, text) {
  try {
    // ดึงประวัติการถามคำถามของผู้ใช้นี้
    const userRef = db.ref(`users/${userId}/queryHistory`);
    const snapshot = await userRef
      .orderByChild("query")
      .equalTo(text.toLowerCase().trim())
      .once("value");

    return snapshot.exists();
  } catch (error) {
    console.error("Error checking repeated query:", error);
    return false; // กรณีเกิดข้อผิดพลาด ถือว่าไม่ใช่การถามซ้ำ
  }
}

/**
 * บันทึกประวัติการถามคำถามของผู้ใช้
 * @param {string} userId - LINE user ID
 * @param {string} text - ข้อความที่ผู้ใช้ส่งมา
 * @returns {Promise<void>}
 */
async function saveQueryHistory(userId, text) {
  try {
    const userRef = db.ref(`users/${userId}/queryHistory`);
    const newQuery = {
      query: text.toLowerCase().trim(),
      timestamp: new Date().toISOString(),
    };

    // บันทึกคำถามลงในประวัติ
    await userRef.push().set(newQuery);
    console.log(`✅ Saved query history for user ${userId}`);
  } catch (error) {
    console.error("Error saving query history:", error);
  }
}

/**
 * Handle image message
 * @param {Object} event - LINE event object
 * @param {Object} user - User session data
 */
async function handleImageMessage(event, user) {
  const messageId = event.message.id;
  const replyToken = event.replyToken;

  console.log(`======= HANDLING IMAGE MESSAGE =======`);
  console.log(`Message ID: ${messageId}`);

  try {
    // Get image content
    console.log("Fetching image content...");
    const imageContent = await LineUtil.getImageBinary(messageId);
    console.log("Image content fetched successfully");

    // Analyze image with Gemini
    console.log("Sending image to Gemini API for analysis...");
    const response = await GeminiUtil.multimodal(imageContent);
    console.log("Gemini response:", response);

    // บันทึกการวิเคราะห์ภาพเพื่อใช้ในอนาคต (ถ้าต้องการ)
    try {
      await RecipeModel.saveUserQuery(
        `image_${messageId}`,
        response,
        "gemini_multimodal"
      );
      console.log("✅ Saved image analysis to database");
    } catch (saveError) {
      console.error("Error saving image analysis:", saveError);
    }

    console.log("Sending response back to user...");
    await LineUtil.reply(replyToken, [
      {
        type: "text",
        text: response,
      },
    ]);
    console.log("✅ Response sent successfully");
  } catch (error) {
    console.error("❌ Error processing image:", error);
    console.error(error.stack);
    await LineUtil.reply(replyToken, [
      {
        type: "text",
        text: "ขออภัย เกิดข้อผิดพลาดในการวิเคราะห์ภาพ กรุณาลองใหม่อีกครั้ง",
      },
    ]);
  }
}
/**
 * Handle showing all Isaan dishes
 * @param {Object} event - LINE event object
 * @param {Object} user - User session data
 */
async function handleShowAllDishes(event, user) {
  const replyToken = event.replyToken;
  const userId = user.profile ? user.profile.userId : event.source.userId;

  console.log(`======= HANDLING SHOW ALL DISHES =======`);

  try {
    // Fetch only from isan_dishes collection directly
    console.log("Fetching all Isaan dishes...");
    const isanDishesSnapshot = await db.ref("isan_dishes").once("value");
    const allDishes = [];

    isanDishesSnapshot.forEach((childSnapshot) => {
      const dish = childSnapshot.val();
      dish.id = childSnapshot.key;
      dish.source = "isan_dishes";
      // Normalize field names
      if (dish.image_url && !dish.imageUrl) dish.imageUrl = dish.image_url;
      if (dish.video_url && !dish.youtubeUrl) dish.youtubeUrl = dish.video_url;
      if (!dish.description) dish.description = "อาหารอีสาน";
      allDishes.push(dish);
    });

    console.log(`Fetched ${allDishes.length} Isaan dishes`);

    // Take only 10 items for the carousel (LINE limit)
    const dishesToShow = allDishes.slice(0, 10);

    // Create messages array (keep it simple to avoid message size issues)
    const messages = [
      {
        type: "text",
        text: `📋 รายการอาหารอีสานทั้งหมด ${allDishes.length} รายการ:`,
      },
      LineUtil.createRecipeMenu(dishesToShow),
    ];

    // Reply with messages
    console.log("Sending all dishes response...");
    await LineUtil.reply(replyToken, messages);
    console.log("✅ All dishes response sent successfully");
  } catch (error) {
    console.error("❌ Error handling show all dishes:", error);

    try {
      await LineUtil.reply(replyToken, [
        {
          type: "text",
          text: "ขออภัย ไม่สามารถแสดงรายการอาหารได้ในขณะนี้ กรุณาลองใหม่ภายหลัง",
        },
      ]);
    } catch (replyError) {
      console.error("❌ Cannot send error reply:", replyError);
    }
  }
}

/**
 * Handle popular queries request
 * @param {Object} event - LINE event object
 * @param {Object} user - User session data
 */
async function handlePopularQueries(event, user) {
  const replyToken = event.replyToken;

  console.log(`======= HANDLING POPULAR QUERIES =======`);

  try {
    // Fetch popular queries from database
    console.log("Fetching popular queries...");
    const popularQueries = await RecipeModel.getPopularQueries(10); // Get top 10 popular queries
    console.log(`Fetched ${popularQueries.length} popular queries`);

    if (popularQueries.length === 0) {
      // No popular queries found
      await LineUtil.reply(replyToken, [
        {
          type: "text",
          text: "ยังไม่มีคำถามยอดนิยมในขณะนี้ โปรดกลับมาตรวจสอบในภายหลัง",
        },
      ]);
      return;
    }

    // Create messages array
    const messages = [];

    // Add header message
    messages.push({
      type: "text",
      text: "🔍 คำถามยอดนิยม 10 อันดับ:",
    });

    // Format the popular queries
    let queryList = popularQueries
      .map((query, index) => {
        return `${index + 1}. ${query.text} (ถูกถาม ${query.count} ครั้ง)`;
      })
      .join("\n");

    // Add queries list
    messages.push({
      type: "text",
      text: queryList,
    });

    // Add quick reply options for top 5 queries
    const topQueries = popularQueries.slice(0, 5);
    if (topQueries.length > 0) {
      const quickReplyItems = topQueries.map((query) => ({
        label:
          query.text.length > 20
            ? query.text.substring(0, 17) + "..."
            : query.text,
        text: query.text,
      }));

      messages.push(
        LineUtil.createQuickReplyMenu(
          "ต้องการถามคำถามใดต่อไปหรือไม่?",
          quickReplyItems
        )
      );
    }

    // Reply with messages
    console.log("Sending popular queries response...");
    await LineUtil.reply(replyToken, messages);
    console.log("✅ Popular queries response sent successfully");
  } catch (error) {
    console.error("❌ Error handling popular queries:", error);

    try {
      await LineUtil.reply(replyToken, [
        {
          type: "text",
          text: "ขออภัย ไม่สามารถแสดงคำถามยอดนิยมได้ในขณะนี้ กรุณาลองใหม่ภายหลัง",
        },
      ]);
    } catch (replyError) {
      console.error("❌ Cannot send error reply:", replyError);
    }
  }
}
/**
 * Handle menu command
 * @param {Object} event - LINE event object
 * @param {Object} user - User session data
 */
async function handleMenuCommand(event, user) {
  const replyToken = event.replyToken;
  const userId = user.profile ? user.profile.userId : event.source.userId;

  console.log(`======= HANDLING MENU COMMAND =======`);

  try {
    // Get recommended recipes based on user clicks (limited to 5 for carousel)
    console.log("Fetching recommended recipes...");
    const recommendedRecipes = await RecipeModel.getRecommendedRecipes(
      userId,
      5
    ); // Limit to 5
    console.log(`Fetched ${recommendedRecipes.length} recommended recipes`);

    // Prepare welcome message
    const welcomeMessage = {
      type: "text",
      text: `สวัสดีค่ะ ${user.profile.displayName} 👋\nยินดีต้อนรับสู่บอทสูตรอาหารอีสาน!`,
    };

    // Prepare messages to send - keep it compact
    const messages = [welcomeMessage];

    // Add recommended recipes if available
    if (recommendedRecipes.length > 0) {
      const recommendedMenu = LineUtil.createRecipeMenu(recommendedRecipes);
      messages.push(recommendedMenu);
    }

    // Add usage instructions
    messages.push({
      type: "text",
      text: '💡 วิธีใช้งาน:\n1. เลือกเมนูที่สนใจเพื่อดูวิธีทำ\n2. พิมพ์ "วิธีทำ + ชื่อเมนู" เพื่อดูสูตรโดยตรง\n3. พิมพ์ "รายการอาหาร" เพื่อดูอาหารทั้งหมด\n4. พิมพ์ "คำถามที่ถามบ่อย" เพื่อดูอันดับคำถามที่ถูกถามบ่อย\n5. พิมพ์ "reset" เพื่อเริ่มต้นใหม่',
    });

    // Reply with messages
    console.log("Sending menu response...");
    await LineUtil.reply(replyToken, messages);
    console.log("✅ Menu response sent successfully");
  } catch (error) {
    console.error("❌ Error handling menu command:", error);

    try {
      // Simple error response
      await LineUtil.reply(replyToken, [
        {
          type: "text",
          text: "ขออภัย ไม่สามารถแสดงเมนูได้ในขณะนี้ กรุณาลองใหม่ภายหลัง",
        },
      ]);
    } catch (replyError) {
      console.error("❌ Cannot send error reply:", replyError);
    }
  }
}

/**
 * ปรับปรุงฟังก์ชัน handleRecipeDetail
 * @param {string} recipeName - Recipe name
 * @param {Object} event - LINE event object
 * @param {Object} user - User session data
 * @returns {Promise<Object>} Recipe object and status
 */
async function handleRecipeDetail(recipeName, event, user) {
  const replyToken = event.replyToken;
  const userId = user.profile ? user.profile.userId : event.source.userId;

  console.log(`======= HANDLING RECIPE DETAIL =======`);
  console.log(`Recipe name: ${recipeName}`);

  try {
    // Get all recipes (now prioritizing isan_dishes)
    console.log("Fetching all recipes...");
    const recipes = await RecipeModel.getAllRecipes();
    console.log(`Fetched ${recipes.length} recipes`);

    console.log(`Looking for recipe: ${recipeName}`);
    let recipe = recipes.find(
      (r) => r.name.toLowerCase() === recipeName.toLowerCase()
    );

    if (recipe) {
      console.log(`Recipe found: ${recipe.id} from ${recipe.source}`);

      // Track user click for recommendation system
      await RecipeModel.trackUserClick(userId, recipe.id, recipe.source);

      // Also track view for traditional view counter
      await TrackingUtil.trackRecipeView(recipe.id, recipe.source);

      // Create recipe detail messages
      const detailMessages = LineUtil.createRecipeDetail(recipe);

      // Reply with recipe details
      console.log("Sending recipe detail response...");
      await LineUtil.reply(replyToken, detailMessages);
      console.log("✅ Recipe detail response sent successfully");

      // คืนค่าเมนูอาหารเพื่อเก็บใน context
      return { success: true, recipe: recipe };
    } else {
      // Recipe not found, use Gemini to generate a response
      console.log(`Recipe not found in any collection, using Gemini`);

      // Use existing Gemini code here...
      const query = `ช่วยสอนวิธีทำ${recipeName} อย่างละเอียด พร้อมส่วนประกอบ ขั้นตอน และเคล็ดลับ`;
      const response = await GeminiUtil.foodQuery(query, recipes);
      console.log("Gemini response:", response);

      // Check for rejection response
      const rejectResponses = [
        "ขอโทษ",
        "ขอโทษนะ",
        "ฉันเป็นผู้เชี่ยวชาญด้านอาหารอีสานเท่านั้น",
        "ไม่สามารถตอบคำถามได้",
        "ไม่เข้าใจคำถาม",
      ];

      const isRejectionResponse = rejectResponses.some((phrase) =>
        response.toLowerCase().includes(phrase.toLowerCase())
      );

      if (isRejectionResponse) {
        // Try with a different prompt if rejected
        console.log(
          "Rejection response detected, trying with a different prompt"
        );
        const fallbackQuery = `อธิบายวิธีทำอาหารที่เรียกว่า${recipeName} ทั้งวัตถุดิบและขั้นตอนการทำอย่างละเอียด`;
        const fallbackResponse = await GeminiUtil.textOnly(fallbackQuery);

        await LineUtil.reply(replyToken, [
          {
            type: "text",
            text: fallbackResponse,
          },
        ]);

        // สร้างข้อมูลอาหารแบบพื้นฐานเพื่อเก็บใน context
        const basicRecipe = {
          name: recipeName,
          description: `อาหารชื่อ ${recipeName}`,
          source: "gemini_generated",
        };

        return { success: true, recipe: basicRecipe };
      } else {
        await LineUtil.reply(replyToken, [
          {
            type: "text",
            text: response,
          },
        ]);

        // สร้างข้อมูลอาหารแบบพื้นฐานเพื่อเก็บใน context
        const basicRecipe = {
          name: recipeName,
          description: `อาหารชื่อ ${recipeName}`,
          source: "gemini_generated",
        };

        return { success: true, recipe: basicRecipe };
      }
    }
  } catch (error) {
    console.error("❌ Error handling recipe detail:", error);
    console.error(error.stack);
    await LineUtil.reply(replyToken, [
      {
        type: "text",
        text: "ขออภัย เกิดข้อผิดพลาดในการแสดงรายละเอียดเมนู กรุณาลองใหม่อีกครั้ง",
      },
    ]);
    return { success: false };
  }
}

/**
 * Check if a message is a food-related query
 * @param {string} text - Message text
 * @returns {boolean} True if food-related, false otherwise
 */
function isFoodQuery(text) {
  const foodKeywords = [
    "อาหาร",
    "เมนู",
    "สูตร",
    "วิธีทำ",
    "วัตถุดิบ",
    "ทำอาหาร",
    "กับข้าว",
    "อีสาน",
    "อาหารอีสาน",
    "รสชาติ",
    "อร่อย",
    "แซ่บ",
    "ลาบ",
    "ส้มตำ",
    "ต้มแซ่บ",
    "ปาปิก",
    "แกงอ่อม",
    "ผัด",
    "ต้ม",
    "แกง",
    "ยำ",
  ];

  return foodKeywords.some((keyword) =>
    text.toLowerCase().includes(keyword.toLowerCase())
  );
}

/**
 * ตรวจสอบว่าข้อความเป็นการถามถึงอาหารโดยตรงหรือไม่
 * @param {string} text - ข้อความที่ต้องการตรวจสอบ
 * @returns {boolean} True if direct food query, false otherwise
 */
function checkIfDirectFoodQuery(text) {
  // รายการชื่ออาหารอีสานที่นิยม
  const isanFoods = [
    "ลาบ",
    "ลาบหมู",
    "ลาบเนื้อ",
    "ลาบปลา",
    "ลาบไก่",
    "ลาบเป็ด",
    "ส้มตำ",
    "ตำไทย",
    "ตำปูปลาร้า",
    "ตำซั่ว",
    "ตำไท",
    "ตำถั่ว",
    "ตำเขือ",
    "ต้มแซบ",
    "ต้มยำ",
    "แกงหน่อไม้",
    "อ่อม",
    "แกงอ่อม",
    "ซุปหน่อไม้",
    "ก้อย",
    "ก้อยเนื้อ",
    "ก้อยปลา",
    "ก้อยกุ้ง",
    "ก้อยหอย",
    "หมกหน่อไม้",
    "หมกปลา",
    "หมกไก่",
    "หมกเนื้อ",
    "ป่น",
    "ป่นปลา",
    "ป่นหอย",
    "ป่นแมงดา",
    "แจ่ว",
    "น้ำแจ่ว",
    "แจ่วบอง",
    "น้ำพริก",
    "ซุปหน่อไม้",
    "แกงหน่อไม้",
    "แกงเห็ด",
    "ไข่มดแดง",
    "ปาปิก",
    "หมี่กะทิ",
    "ขนมจีนน้ำยา",
    "ข้าวหมาก",
  ];

  const searchText = text.toLowerCase().trim();

  // ตรวจสอบว่าข้อความตรงกับชื่ออาหารในรายการหรือไม่
  return isanFoods.some(
    (food) =>
      searchText === food.toLowerCase() ||
      searchText.includes(food.toLowerCase())
  );
}

/**
 * ตรวจสอบว่าคำถามเป็นคำถามทั่วไปที่ไม่มีบริบทชัดเจนหรือไม่
 * @param {string} text - ข้อความคำถาม
 * @returns {boolean} ผลการตรวจสอบ
 */
function isGenericFoodQuestion(text) {
  // รายการคำถามทั่วไปที่มักไม่มีบริบทระบุชื่ออาหาร
  const genericPatterns = [
    /ใส่.*ได้ไหม/i, // เช่น "ใส่น้ำปลาได้ไหม", "ใส่พริกได้ไหม"
    /ไม่ใส่.*ได้ไหม/i, // เช่น "ไม่ใส่พริกได้ไหม", "ไม่ใส่น้ำปลาได้ไหม"
    /ต้องใส่.*ไหม/i, // เช่น "ต้องใส่กระเทียมไหม"
    /ใช้.*แทนได้ไหม/i, // เช่น "ใช้น้ำตาลแทนได้ไหม"
    /ทำยังไง/i, // เช่น "ทำยังไง", "ทำยังไงให้อร่อย"
    /เก็บได้.*วัน/i, // เช่น "เก็บได้กี่วัน"
    /กินกับอะไร/i, // เช่น "กินกับอะไรได้บ้าง"
    /รสชาติ/i, // เช่น "รสชาติเป็นยังไง"
    /ดีต่อสุขภาพไหม/i, // เช่น "ดีต่อสุขภาพไหม"
    /อันตรายไหม/i, // เช่น "อันตรายไหม"
    /ทำไมคนชอบกิน/i, // เช่น "ทำไมคนชอบกิน"
    /ประโยชน์/i, // เช่น "มีประโยชน์อะไรบ้าง"
    /ข้อเสีย/i, // เช่น "มีข้อเสียอะไรไหม"
    /เตาไมโครเวฟ/i, // เช่น "เข้าเตาไมโครเวฟได้ไหม"
    /แคลอรี่/i, // เช่น "มีแคลอรี่เท่าไหร่"
    /วิธีเลือก/i, // เช่น "มีวิธีเลือกยังไง"
    /เคล็ดลับ/i, // เช่น "มีเคล็ดลับอะไรบ้าง"
    /ใช้เวลา/i, // เช่น "ใช้เวลาทำนานไหม"
    /ยากไหม/i, // เช่น "ทำยากไหม"
    /ควรทำ/i, // เช่น "ควรทำตอนไหน"
  ];

  // ตรวจสอบว่าตรงกับรูปแบบคำถามทั่วไปหรือไม่
  return genericPatterns.some((pattern) => pattern.test(text));
}

/**
 * ค้นหาบริบทอาหารจากประวัติการสนทนาล่าสุด
 * @param {string} userId - LINE user ID
 * @returns {Promise<Object|null>} บริบทอาหารที่พบหรือ null
 */
async function findContextFromHistory(userId) {
  try {
    // ดึงประวัติการถามคำถามของผู้ใช้นี้
    const userRef = db.ref(`users/${userId}/queryHistory`);
    const snapshot = await userRef
      .orderByChild("timestamp")
      .limitToLast(5) // ดึงแค่ 5 คำถามล่าสุด
      .once("value");

    if (!snapshot.exists()) {
      console.log("No query history found for user");
      return null;
    }

    // แปลงข้อมูลให้เป็น array และเรียงตาม timestamp จากใหม่ไปเก่า
    const history = [];
    snapshot.forEach((child) => {
      history.push({
        query: child.val().query,
        timestamp: child.val().timestamp,
      });
    });

    // เรียงจากใหม่ไปเก่า
    history.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    console.log(
      `Found ${history.length} recent queries:`,
      JSON.stringify(history, null, 2)
    );

    // ตรวจสอบว่ามีคำถามที่อาจจะเป็นชื่ออาหารหรือไม่
    for (const item of history) {
      const query = item.query;

      // ข้ามคำถามที่เป็น generic
      if (isGenericFoodQuestion(query)) {
        continue;
      }

      // ตรวจสอบว่าคำถามเป็นชื่ออาหารหรือคำถามเกี่ยวกับอาหารโดยตรงหรือไม่
      if (checkIfDirectFoodQuery(query) || query.startsWith("วิธีทำ")) {
        // ดึงชื่ออาหารออกมา
        let foodName = query;
        if (query.startsWith("วิธีทำ")) {
          foodName = query.replace("วิธีทำ", "").trim();
        }

        console.log(`Found potential food name in history: ${foodName}`);

        // ค้นหาข้อมูลอาหารจากฐานข้อมูล
        const recipes = await RecipeModel.getAllRecipes();
        const recipe = recipes.find(
          (r) =>
            r.name.toLowerCase() === foodName.toLowerCase() ||
            r.name.toLowerCase().includes(foodName.toLowerCase()) ||
            foodName.toLowerCase().includes(r.name.toLowerCase())
        );

        if (recipe) {
          console.log(`Found recipe from history: ${recipe.name}`);
          return recipe;
        } else {
          // ถ้าไม่พบในฐานข้อมูล สร้างบริบทอย่างง่าย
          console.log(`Creating simple context for: ${foodName}`);
          return {
            name: foodName,
            description: `อาหารชื่อ ${foodName}`,
            source: "history_generated",
          };
        }
      }
    }

    // ถ้าไม่พบบริบทที่เหมาะสม
    console.log("No suitable food context found in history");
    return null;
  } catch (error) {
    console.error("Error finding context from history:", error);
    return null;
  }
}

module.exports = WebhookController;
