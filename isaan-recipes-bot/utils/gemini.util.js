const { genAI } = require("../config/gemini");

/**
 * Gemini AI utility functions
 */
const GeminiUtil = {
  /**
   * Get text response from Gemini
   * @param {string} prompt - Text prompt
   * @returns {Promise<string>} Promise resolving to text response
   */
  textOnly: async (prompt) => {
    try {
      console.log("======= GEMINI TEXT REQUEST =======");
      console.log("Prompt:", prompt);

      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-8b" });
      console.log("Model initialized: gemini-1.5-flash-8b");

      const result = await model.generateContent(prompt);
      console.log("Response received from Gemini API");
      const text = result.response.text();

      // Log a preview of the response
      console.log(
        "Response preview:",
        text.substring(0, 100) + (text.length > 100 ? "..." : "")
      );
      console.log("✅ Gemini text request successful");

      return text;
    } catch (error) {
      console.error("❌ Error generating text with Gemini:", error);
      console.error("Error details:", error.stack);
      return "ขออภัย ไม่สามารถสร้างคำตอบได้ในขณะนี้";
    }
  },

  /**
   * Generate response based on image input
   * @param {Buffer} imageBuffer - Image buffer
   * @returns {Promise<string>} Promise resolving to text response
   */
  multimodal: async (imageBuffer) => {
    try {
      console.log("======= GEMINI MULTIMODAL REQUEST =======");
      console.log("Image buffer size:", imageBuffer.length, "bytes");

      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-8b" });
      console.log("Model initialized: gemini-1.5-flash-8b");

      const prompt =
        "นี่คือภาพอาหารหรือไม่? ถ้าใช่ กรุณาบรรยายว่าเป็นอาหารอะไร มีส่วนประกอบอะไรบ้าง และถ้าเป็นอาหารอีสาน ให้ให้ข้อมูลเพิ่มเติมเกี่ยวกับเมนูนี้ รสชาติ และวิธีรับประทาน";
      const mimeType = "image/jpeg";

      console.log("Converting image to base64...");
      // Convert image buffer to base64
      const imageBase64 = imageBuffer.toString("base64");
      console.log("Image converted to base64, length:", imageBase64.length);

      // Create parts array with prompt and image
      const imageParts = [
        {
          inlineData: {
            data: imageBase64,
            mimeType,
          },
        },
      ];

      console.log("Sending image to Gemini API...");
      const result = await model.generateContent([prompt, ...imageParts]);
      console.log("Response received from Gemini API");
      const text = result.response.text();

      // Log a preview of the response
      console.log(
        "Response preview:",
        text.substring(0, 100) + (text.length > 100 ? "..." : "")
      );
      console.log("✅ Gemini multimodal request successful");

      return text;
    } catch (error) {
      console.error(
        "❌ Error generating multimodal response with Gemini:",
        error
      );
      console.error("Error details:", error.stack);
      return "ขออภัย ไม่สามารถวิเคราะห์ภาพได้ในขณะนี้";
    }
  },

  /**
   * Generate contextual chat response
   * @param {string} prompt - Text prompt
   * @param {string} context - Optional context for more specific responses
   * @returns {Promise<string>} Promise resolving to text response
   */
  chat: async (prompt, context = "") => {
    try {
      console.log("======= GEMINI CHAT REQUEST =======");
      console.log("Prompt:", prompt);
      console.log("Context provided:", context ? "Yes" : "No");

      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-8b" });
      console.log("Model initialized: gemini-1.5-flash-8b");

      // Create chat with initial context
      console.log("Starting chat session with initial context...");
      const chat = model.startChat({
        history: [
          {
            role: "user",
            parts: [{ text: "สวัสดีจ้า" }],
          },
          {
            role: "model",
            parts: [
              {
                text: "สวัสดีค่ะ ฉันเป็นผู้ช่วยเกี่ยวกับอาหารอีสาน คุณอยากรู้อะไรเกี่ยวกับอาหารอีสานหรือสูตรอาหารบ้างคะ?",
              },
            ],
          },
        ],
      });

      // Add context if provided
      let fullPrompt = prompt;
      if (context) {
        fullPrompt = `${prompt}\nข้อมูลเพิ่มเติม: ${context}`;
        console.log("Full prompt with context:", fullPrompt);
      }

      console.log("Sending message to chat...");
      const result = await chat.sendMessage(fullPrompt);
      console.log("Response received from Gemini API");
      const text = result.response.text();

      // Log a preview of the response
      console.log(
        "Response preview:",
        text.substring(0, 100) + (text.length > 100 ? "..." : "")
      );
      console.log("✅ Gemini chat request successful");

      return text;
    } catch (error) {
      console.error("❌ Error generating chat response with Gemini:", error);
      console.error("Error details:", error.stack);
      return "ขออภัย ไม่สามารถสร้างคำตอบได้ในขณะนี้";
    }
  },

  /**
   * Generate food-specific response with enhanced context support
   * @param {string} prompt - Text prompt
   * @param {Array} recipes - Array of recipe objects to provide context
   * @param {Object} foodContext - Optional specific food context
   * @returns {Promise<string>} Promise resolving to food-related response
   */
  foodQuery: async (prompt, recipes = [], foodContext = null) => {
    try {
      console.log("======= GEMINI FOOD QUERY REQUEST =======");
      console.log("Prompt:", prompt);
      console.log("Recipes provided:", recipes.length);
      console.log("Food context provided:", foodContext ? "Yes" : "No");

      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-8b" });
      console.log("Model initialized: gemini-1.5-flash-8b");

      // Create context from available recipes
      let recipeContext = "";
      if (recipes.length > 0) {
        recipeContext =
          "ข้อมูลเมนูอาหารที่มี: " +
          recipes.map((r) => `${r.name} (${r.description})`).join(", ");
        console.log("Recipe context created with", recipes.length, "recipes");
      }

      // Create additional context from specific food
      let specificFoodContext = "";
      if (foodContext) {
        // สร้างบริบทเฉพาะจากอาหารที่กำลังสนทนาอยู่
        specificFoodContext = `
          ตอนนี้กำลังสนทนาเกี่ยวกับอาหารชื่อ "${foodContext.name}"
          คำอธิบาย: ${foodContext.description || 'ไม่มีคำอธิบาย'}
        `;

        // ถ้ามีส่วนประกอบ ให้เพิ่มในบริบท
        if (foodContext.ingredients) {
          if (Array.isArray(foodContext.ingredients)) {
            specificFoodContext += `\nส่วนประกอบ: ${foodContext.ingredients.join(', ')}`;
          } else if (typeof foodContext.ingredients === 'string') {
            specificFoodContext += `\nส่วนประกอบ: ${foodContext.ingredients}`;
          }
        }

        // ถ้ามีขั้นตอนการทำ ให้เพิ่มในบริบท
        if (foodContext.steps || foodContext.instructions) {
          const steps = foodContext.steps || foodContext.instructions;
          if (Array.isArray(steps)) {
            specificFoodContext += `\nขั้นตอนการทำ: ${steps.join(' ')}`;
          } else if (typeof steps === 'string') {
            specificFoodContext += `\nขั้นตอนการทำ: ${steps}`;
          }
        }

        console.log("Specific food context created for:", foodContext.name);
      }

      const systemPrompt = `คุณเป็นผู้เชี่ยวชาญด้านอาหารโดยเฉพาะอาหารอีสาน ช่วยตอบคำถามเกี่ยวกับอาหารทั่วไป วัตถุดิบ วิธีการทำ และเคล็ดลับต่างๆ 
ถ้าคำถามไม่เกี่ยวกับอาหารเลย ให้ตอบว่า "ขอโทษค่ะ ฉันเป็นผู้เชี่ยวชาญด้านอาหารเท่านั้น" 
ให้ตอบอย่างเป็นมิตร ใช้ภาษาทางการแต่เข้าใจง่าย ให้ความรู้ที่ถูกต้องและครบถ้วน

เมื่อมีคนถามเกี่ยวกับอาหารอีสาน หรือพิมพ์แค่ชื่ออาหาร โดยเฉพาะอาหารเช่น "ก้อยเนื้อ" "ลาบหมู" "ต้มแซบ" "ส้มตำ" ให้อธิบายเกี่ยวกับอาหารนั้นอย่างละเอียด ทั้งส่วนประกอบ วิธีการทำ รสชาติ และวิธีรับประทาน

แม้จะเป็นผู้เชี่ยวชาญด้านอาหารอีสานเป็นหลัก แต่สามารถให้ข้อมูลเกี่ยวกับอาหารประเภทอื่นได้ด้วย โดยเฉพาะอาหารไทย
${recipeContext}
${specificFoodContext}`;

      console.log("System prompt created");

      // Create chat with system prompt
      console.log("Starting chat session with system prompt...");
      const chat = model.startChat({
        history: [
          {
            role: "user",
            parts: [{ text: "คุณเป็นใคร?" }],
          },
          {
            role: "model",
            parts: [
              {
                text: "สวัสดีค่ะ ฉันเป็นผู้ช่วยเกี่ยวกับอาหารอีสาน ฉันสามารถให้ข้อมูลเกี่ยวกับอาหารอีสาน วัตถุดิบ วิธีการทำ และเคล็ดลับต่างๆ ได้ค่ะ",
              },
            ],
          },
          {
            role: "user",
            parts: [{ text: systemPrompt }],
          },
          {
            role: "model",
            parts: [
              {
                text: "รับทราบค่ะ ฉันจะตอบคำถามเกี่ยวกับอาหาร โดยเฉพาะอาหารอีสาน อย่างละเอียดและเป็นมิตร คุณมีคำถามเกี่ยวกับอาหารอะไรบ้างคะ?",
              },
            ],
          },
        ],
      });

      console.log("Sending food query to chat...");
      const result = await chat.sendMessage(prompt);
      console.log("Response received from Gemini API");
      const text = result.response.text();

      // Log a preview of the response
      console.log(
        "Response preview:",
        text.substring(0, 100) + (text.length > 100 ? "..." : "")
      );
      console.log("✅ Gemini food query request successful");

      return text;
    } catch (error) {
      console.error("❌ Error generating food response with Gemini:", error);
      console.error("Error details:", error.stack);
      return "ขออภัย ไม่สามารถตอบคำถามเกี่ยวกับอาหารได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง";
    }
  },

  /**
   * Generate food response with explicit conversation context
   * @param {string} prompt - Text prompt
   * @param {Object} foodContext - Food context object with details
   * @returns {Promise<string>} Promise resolving to contextual response
   */
  continueFoodConversation: async (prompt, foodContext) => {
    try {
      console.log("======= GEMINI FOOD CONVERSATION REQUEST =======");
      console.log("Prompt:", prompt);
      console.log("Food context:", JSON.stringify(foodContext, null, 2));

      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-8b" });
      console.log("Model initialized: gemini-1.5-flash-8b");

      // สร้างบริบทการสนทนาเกี่ยวกับอาหารนี้
      const foodName = foodContext.name;
      const foodDescription = foodContext.description || `อาหารชื่อ ${foodName}`;
      
      // สร้างประวัติการสนทนาเริ่มต้น
      const chatHistory = [
        {
          role: "user",
          parts: [{ text: `ขอข้อมูลเกี่ยวกับ ${foodName}` }],
        },
        {
          role: "model",
          parts: [
            {
              text: `${foodName} เป็น${foodDescription}`,
            },
          ],
        },
      ];
      
      // สร้างคำถามที่มีบริบทชัดเจน
      let contextualPrompt = prompt;
      if (!prompt.toLowerCase().includes(foodName.toLowerCase())) {
        contextualPrompt = `เกี่ยวกับ ${foodName}: ${prompt}`;
      }

      // สร้าง system prompt ที่มีข้อมูลเกี่ยวกับอาหาร
      const systemPrompt = `
      คุณเป็นผู้เชี่ยวชาญเกี่ยวกับอาหารอีสาน 
      ตอนนี้เรากำลังคุยกันเกี่ยวกับอาหารชื่อ "${foodName}" 
      ${foodContext.description ? `คำอธิบาย: ${foodContext.description}` : ''}
      ${foodContext.ingredients ? `วัตถุดิบ: ${Array.isArray(foodContext.ingredients) ? foodContext.ingredients.join(', ') : foodContext.ingredients}` : ''}
      ${foodContext.steps || foodContext.instructions ? `วิธีทำ: ${Array.isArray(foodContext.steps || foodContext.instructions) ? (foodContext.steps || foodContext.instructions).join(' ') : (foodContext.steps || foodContext.instructions)}` : ''}
      
      ให้ตอบคำถามโดยคำนึงว่าเรากำลังพูดถึงอาหารนี้อยู่ ถ้าไม่ได้ระบุชื่ออาหารในคำถาม ให้ตอบเสมือนว่ากำลังพูดถึง ${foodName} อยู่
      ตอบให้ละเอียด ถูกต้อง และเป็นมิตร
      `;

      // Create chat with history and system prompt
      console.log("Starting contextualized chat session...");
      const chat = model.startChat({
        history: [
          {
            role: "user",
            parts: [{ text: systemPrompt }],
          },
          {
            role: "model",
            parts: [
              {
                text: `เข้าใจแล้วค่ะ ฉันจะตอบคำถามเกี่ยวกับ ${foodName} อย่างละเอียด ถูกต้อง และเป็นมิตร คุณมีคำถามอะไรเกี่ยวกับอาหารนี้คะ?`,
              },
            ],
          },
          ...chatHistory
        ],
      });

      console.log("Sending contextualized food query...");
      const result = await chat.sendMessage(contextualPrompt);
      console.log("Response received from Gemini API");
      const text = result.response.text();

      // Log a preview of the response
      console.log(
        "Response preview:",
        text.substring(0, 100) + (text.length > 100 ? "..." : "")
      );
      console.log("✅ Gemini contextualized food query successful");

      return text;
    } catch (error) {
      console.error("❌ Error generating contextualized food response:", error);
      console.error("Error details:", error.stack);
      return "ขออภัย ไม่สามารถตอบคำถามเกี่ยวกับอาหารนี้ได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง";
    }
  },
};

module.exports = GeminiUtil;