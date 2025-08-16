const { db } = require('../config/firebase');

/**
 * Tracking utility functions
 */
const TrackingUtil = {
  /**
   * Track a recipe view
   * @param {string} recipeId - Recipe ID
   * @param {string} source - Source collection ('recipes' or 'isan_dishes')
   * @returns {Promise} Promise resolving to success status
   */
  trackRecipeView: async (recipeId, source = 'isan_dishes') => {
    try {
      console.log(`Tracking view for recipe: ${recipeId} from ${source}`);
      
      // Reference to the appropriate collection stats
      const viewsRef = source === 'isan_dishes' 
        ? db.ref(`isanDishesViews/${recipeId}`)
        : db.ref(`recipeViews/${recipeId}`);
      
      // Read current value
      const snapshot = await viewsRef.once('value');
      const currentViews = snapshot.val() || 0;
      
      // Increment view count
      await viewsRef.set(currentViews + 1);
      
      console.log(`✅ Tracked view for ${source} ${recipeId}: ${currentViews + 1} views`);
      return true;
    } catch (error) {
      console.error(`❌ Error tracking recipe view for ${recipeId}:`, error);
      return false;
    }
  },
  
  /**
   * Get popular dishes based on views
   * @param {number} limit - Maximum number to return
   * @returns {Promise} Promise resolving to array of popular dishes with view counts
   */
  getPopularDishes: async (limit = 10) => {
    try {
      // Get view counts from both collections
      const recipeViewsSnapshot = await db.ref('recipeViews').once('value');
      const isanViewsSnapshot = await db.ref('isanDishesViews').once('value');
      
      // Convert to arrays
      const popularDishes = [];
      
      // Add recipe views
      recipeViewsSnapshot.forEach((snapshot) => {
        const recipeId = snapshot.key;
        const views = snapshot.val() || 0;
        popularDishes.push({ 
          id: recipeId, 
          views, 
          source: 'recipes' 
        });
      });
      
      // Add isan_dishes views
      isanViewsSnapshot.forEach((snapshot) => {
        const dishId = snapshot.key;
        const views = snapshot.val() || 0;
        popularDishes.push({ 
          id: dishId, 
          views, 
          source: 'isan_dishes' 
        });
      });
      
      // Sort by views (descending)
      popularDishes.sort((a, b) => b.views - a.views);
      
      return popularDishes.slice(0, limit);
    } catch (error) {
      console.error('Error fetching popular dishes:', error);
      return [];
    }
  }
};

module.exports = TrackingUtil;