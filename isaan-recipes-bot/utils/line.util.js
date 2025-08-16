const axios = require('axios');
const { lineClient } = require('../config/line');
require('dotenv').config();

/**
 * LINE API utility functions
 */
const LineUtil = {
  /**
   * Reply to a message
   * @param {string} replyToken - LINE reply token
   * @param {Array} messages - Array of message objects
   * @returns {Promise} Promise resolving to API response
   */
  reply: async (replyToken, messages) => {
    try {
      console.log('======= SENDING LINE REPLY =======');
      console.log('Reply token:', replyToken);
      
      // Check reply token validity
      if (!replyToken || replyToken === '00000000000000000000000000000000' || replyToken === 'ffffffffffffffffffffffffffffffff') {
        console.log('❌ Invalid reply token, skipping reply');
        return;
      }
      
      // Ensure we're not sending too many messages
      if (messages.length > 5) {
        console.log('⚠️ Too many messages, truncating to 5');
        messages = messages.slice(0, 5);
      }
      
      // Limit the size of flex messages
      for (let i = 0; i < messages.length; i++) {
        if (messages[i].type === 'flex' && messages[i].contents && messages[i].contents.type === 'carousel') {
          // Limit carousel items to 10 max
          if (messages[i].contents.contents.length > 10) {
            console.log('⚠️ Too many carousel items, truncating to 10');
            messages[i].contents.contents = messages[i].contents.contents.slice(0, 10);
          }
        }
      }
      
      const messagePreview = JSON.stringify(messages).length > 500 
        ? JSON.stringify(messages).substring(0, 500) + '...'
        : JSON.stringify(messages, null, 2);
      console.log('Messages to send (preview):', messagePreview);
      
      // Set timeout to ensure we don't wait too long
      const response = await Promise.race([
        lineClient.replyMessage(replyToken, messages),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Reply timeout')), 20000)
        )
      ]);
      
      console.log('LINE API response:', JSON.stringify(response, null, 2));
      console.log('✅ Reply sent successfully');
      return response;
    } catch (error) {
      console.error('❌ Error replying to LINE message:', error);
      
      if (error.response) {
        console.error('Error details:', error.response.data);
      } else {
        console.error('Error details:', error.message);
      }
      
      throw error;
    }
  },

  /**
   * Get user profile from LINE
   * @param {string} userId - LINE user ID
   * @returns {Promise} Promise resolving to user profile
   */
  getUserProfile: async (userId) => {
    try {
      console.log(`Fetching profile for user: ${userId}`);
      const profile = await lineClient.getProfile(userId);
      console.log(`Profile fetched successfully:`, JSON.stringify(profile, null, 2));
      return profile;
    } catch (error) {
      console.error('❌ Error fetching LINE user profile:', error);
      console.error('Error details:', JSON.stringify(error.response?.data || {}, null, 2));
      throw error;
    }
  },

  /**
   * Get binary content of an image message
   * @param {string} messageId - LINE message ID
   * @returns {Promise} Promise resolving to binary data
   */
  getImageBinary: async (messageId) => {
    try {
      console.log(`Fetching image content for message: ${messageId}`);
      const content = await lineClient.getMessageContent(messageId);
      console.log(`Image content fetched successfully`);
      return content;
    } catch (error) {
      console.error('❌ Error fetching image content:', error);
      console.error('Error details:', JSON.stringify(error.response?.data || {}, null, 2));
      throw error;
    }
  },

  /**
   * Create a quick reply menu
   * @param {string} text - Message text
   * @param {Array} items - Array of quick reply items
   * @returns {Object} Quick reply message object
   */
  createQuickReplyMenu: (text, items) => {
    console.log(`Creating quick reply menu with ${items.length} items`);
    return {
      type: 'text',
      text: text,
      quickReply: {
        items: items.map(item => ({
          type: 'action',
          action: {
            type: 'message',
            label: item.label,
            text: item.text
          }
        }))
      }
    };
  },

  /**
   * Create a flex message for recipe menu
   * @param {Array} recipes - Array of recipe objects
   * @returns {Object} Flex message object
   */
  // ตรวจสอบฟังก์ชัน createRecipeMenu เพื่อให้แสดงเมนูจาก isan_dishes ได้อย่างถูกต้อง
  createRecipeMenu: (recipes) => {
    // Check if we have recipes to display
    if (!recipes || recipes.length === 0) {
      return {
        type: "text",
        text: "ไม่พบเมนูอาหารในระบบ กรุณาลองใหม่อีกครั้ง"
      };
    }
  
    // Map recipes to bubble content format
    const contents = recipes.map(recipe => {
      // Handle different field names between collections
      const title = recipe.name || '';
      const description = recipe.description || 'อาหารอีสาน';
      const imageUrl = recipe.imageUrl || recipe.image_url || 'https://via.placeholder.com/1024';
      
      return {
        type: "bubble",
        hero: {
          type: "image",
          url: imageUrl,
          size: "full",
          aspectRatio: "20:13",
          aspectMode: "cover"
        },
        body: {
          type: "box",
          layout: "vertical",
          contents: [
            {
              type: "text",
              text: title,
              weight: "bold",
              size: "xl",
              wrap: true
            },
            {
              type: "text",
              text: description,
              color: "#aaaaaa",
              size: "sm",
              wrap: true
            }
          ]
        },
        footer: {
          type: "box",
          layout: "vertical",
          contents: [
            {
              type: "button",
              action: {
                type: "message",
                label: "วิธีทำ",
                text: `วิธีทำ${title}`
              },
              style: "primary"
            }
          ]
        }
      };
    });
  
    return {
      type: "flex",
      altText: "รายการเมนูอาหาร",
      contents: {
        type: "carousel",
        contents: contents
      }
    };
  },
  
  /**
   * Create a recipe detail message
   * @param {Object} recipe - Recipe object
   * @returns {Array} Array of message objects
   */
  createRecipeDetail: (recipe) => {
    console.log(`Creating recipe detail for: ${recipe.name}`);
    const messages = [];
    
    // Image message (support both imageUrl and image_url)
    const imageUrl = recipe.imageUrl || recipe.image_url || '';
    if (imageUrl) {
      messages.push({
        type: 'image',
        originalContentUrl: imageUrl,
        previewImageUrl: imageUrl
      });
    }
    
    // Text with recipe details
    let detailText = `📝 วิธีทำ ${recipe.name}\n\n`;
    
    // Ingredients (support both Array and String)
    detailText += '🛒 วัตถุดิบ:\n';
    if (Array.isArray(recipe.ingredients)) {
      recipe.ingredients.forEach((ingredient, index) => {
        detailText += `${index + 1}. ${ingredient}\n`;
      });
    } else if (typeof recipe.ingredients === 'string') {
      detailText += recipe.ingredients + '\n';
    }
    
    detailText += '\n🔪 วิธีทำ:\n';
    // Support both steps and instructions
    const cookingSteps = recipe.steps || recipe.instructions || [];
    if (Array.isArray(cookingSteps)) {
      cookingSteps.forEach((step, index) => {
        detailText += `${index + 1}. ${step}\n`;
      });
    } else if (typeof cookingSteps === 'string') {
      detailText += cookingSteps + '\n';
    }
    
    messages.push({
      type: 'text',
      text: detailText
    });
    
    // YouTube video if available (support both youtubeUrl and video_url)
    const videoUrl = recipe.youtubeUrl || recipe.video_url || '';
    if (videoUrl) {
      messages.push({
        type: 'text',
        text: `🎬 ดูวิดีโอวิธีทำได้ที่:\n${videoUrl}`
      });
    }
    
    return messages;
  }
}

module.exports = LineUtil;