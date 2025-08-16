const { db } = require('../config/firebase');

const usersRef = db.ref('users');

/**
 * User model for handling user session data
 */
const UserModel = {
  /**
   * Get user session data
   * @param {string} userId - LINE user ID
   * @returns {Promise} Promise resolving to user data
   */
  getUserSession: async (userId) => {
    try {
      const snapshot = await usersRef.child(userId).once('value');
      if (!snapshot.exists()) {
        return null;
      }
      
      return snapshot.val();
    } catch (error) {
      console.error(`Error fetching user session for ${userId}:`, error);
      throw error;
    }
  },

  /**
   * Create or update user session
   * @param {string} userId - LINE user ID
   * @param {Object} data - User session data
   * @returns {Promise} Promise resolving to updated user data
   */
  updateUserSession: async (userId, data) => {
    try {
      const userRef = usersRef.child(userId);
      const snapshot = await userRef.once('value');
      
      let userData = {};
      if (snapshot.exists()) {
        userData = snapshot.val();
      }
      
      // Merge existing data with new data
      const updatedData = {
        ...userData,
        ...data,
        lastUpdated: new Date().toISOString()
      };
      
      await userRef.set(updatedData);
      return updatedData;
    } catch (error) {
      console.error(`Error updating user session for ${userId}:`, error);
      throw error;
    }
  },

  /**
   * Reset user session mode
   * @param {string} userId - LINE user ID
   * @returns {Promise} Promise resolving to updated user data
   */
  resetUserSession: async (userId) => {
    try {
      const userRef = usersRef.child(userId);
      const snapshot = await userRef.once('value');
      
      let userData = {};
      if (snapshot.exists()) {
        userData = snapshot.val();
      }
      
      // Reset mode, foodContext, and keep user profile
      const updatedData = {
        ...userData,
        mode: 'default',
        foodContext: null, // เคลียร์บริบทอาหาร
        lastUpdated: new Date().toISOString()
      };
      
      await userRef.set(updatedData);
      return updatedData;
    } catch (error) {
      console.error(`Error resetting user session for ${userId}:`, error);
      throw error;
    }
  },

  /**
   * Set food context for ongoing conversation
   * @param {string} userId - LINE user ID
   * @param {Object} foodData - Food context data
   * @returns {Promise} Promise resolving to updated user data
   */
  setFoodContext: async (userId, foodData) => {
    try {
      const userRef = usersRef.child(userId);
      const snapshot = await userRef.once('value');
      
      let userData = {};
      if (snapshot.exists()) {
        userData = snapshot.val();
      }
      
      // Add food context to user data
      const updatedData = {
        ...userData,
        foodContext: foodData,
        mode: 'gemini', // เปลี่ยนโหมดเป็น gemini สำหรับการสนทนาต่อไป
        lastUpdated: new Date().toISOString()
      };
      
      await userRef.set(updatedData);
      return updatedData;
    } catch (error) {
      console.error(`Error setting food context for ${userId}:`, error);
      throw error;
    }
  },

  /**
   * Get current food context
   * @param {string} userId - LINE user ID
   * @returns {Promise<Object|null>} Food context or null if not set
   */
  getFoodContext: async (userId) => {
    try {
      const userData = await UserModel.getUserSession(userId);
      return userData && userData.foodContext ? userData.foodContext : null;
    } catch (error) {
      console.error(`Error getting food context for ${userId}:`, error);
      return null;
    }
  }
};

module.exports = UserModel;