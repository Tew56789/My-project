const { db, admin } = require("../config/firebase");

const recipesRef = db.ref("recipes");
const popularQueriesRef = db.ref("popularQueries");

/**
 * Recipe model for handling recipe data
 */
const RecipeModel = {
  /**
   * Get all recipes, prioritizing isan_dishes collection
   * @returns {Promise} Promise resolving to recipes array
   */
  getAllRecipes: async () => {
    try {
      const recipes = [];

      // Primary: Get recipes from isan_dishes collection
      const isanDishesSnapshot = await db.ref("isan_dishes").once("value");

      isanDishesSnapshot.forEach((childSnapshot) => {
        const dish = childSnapshot.val();
        dish.id = childSnapshot.key;
        dish.source = "isan_dishes";
        // Normalize field names
        if (dish.image_url && !dish.imageUrl) dish.imageUrl = dish.image_url;
        if (dish.video_url && !dish.youtubeUrl)
          dish.youtubeUrl = dish.video_url;
        if (!dish.description) dish.description = "อาหารอีสาน";
        // Normalize instructions/steps
        if (dish.instructions && !dish.steps) dish.steps = dish.instructions;
        recipes.push(dish);
      });

      // Secondary: Get recipes from original recipes collection
      const recipesSnapshot = await recipesRef.once("value");

      recipesSnapshot.forEach((childSnapshot) => {
        const recipe = childSnapshot.val();
        recipe.id = childSnapshot.key;
        recipe.source = "recipes";

        // Check if this recipe already exists in isan_dishes
        const isDuplicate = recipes.some(
          (dish) => dish.name.toLowerCase() === recipe.name.toLowerCase()
        );

        if (!isDuplicate) {
          recipes.push(recipe);
        }
      });

      return recipes;
    } catch (error) {
      console.error("Error fetching recipes:", error);
      throw error;
    }
  },

  /**
   * Get recipe by ID from either collection
   * @param {string} recipeId - Recipe ID
   * @param {string} source - Source collection ('recipes' or 'isan_dishes')
   * @returns {Promise} Promise resolving to recipe object
   */
  getRecipeById: async (recipeId, source = "isan_dishes") => {
    try {
      const ref =
        source === "isan_dishes"
          ? db.ref(`isan_dishes/${recipeId}`)
          : recipesRef.child(recipeId);

      const snapshot = await ref.once("value");
      if (!snapshot.exists()) {
        return null;
      }

      const recipe = snapshot.val();
      recipe.id = snapshot.key;
      recipe.source = source;

      // Normalize field names
      if (recipe.image_url && !recipe.imageUrl)
        recipe.imageUrl = recipe.image_url;
      if (recipe.video_url && !recipe.youtubeUrl)
        recipe.youtubeUrl = recipe.video_url;
      if (!recipe.description) recipe.description = "อาหารอีสาน";
      if (recipe.instructions && !recipe.steps)
        recipe.steps = recipe.instructions;

      return recipe;
    } catch (error) {
      console.error(`Error fetching recipe with ID ${recipeId}:`, error);
      throw error;
    }
  },

  /**
   * Track user click for recommendations
   * @param {string} userId - LINE user ID
   * @param {string} recipeId - Recipe ID
   * @param {string} source - Source collection ('recipes' or 'isan_dishes')
   * @returns {Promise} Promise resolving to success status
   */
  trackUserClick: async (userId, recipeId, source = "isan_dishes") => {
    try {
      const userClicksRef = db.ref(`userClicks/${userId}`);
      const clickTimestamp = Date.now();

      // Create/update click entry
      await userClicksRef.child(recipeId).update({
        lastClicked: clickTimestamp,
        source: source,
        // Increment click count or set to 1 if new
        count: admin.database.ServerValue.increment(1),
      });

      // Update global recipe scores
      const recipeScoreRef = db.ref(`recipeScores/${recipeId}`);
      await recipeScoreRef.update({
        totalClicks: admin.database.ServerValue.increment(1),
        lastClicked: clickTimestamp,
        source: source,
      });

      console.log(
        `✅ Tracked click for user ${userId} on ${source}:${recipeId}`
      );
      return true;
    } catch (error) {
      console.error(`❌ Error tracking user click:`, error);
      return false;
    }
  },

  /**
   * Get recommended recipes based on user clicks and tiered randomization
   * @param {string} userId - LINE user ID (optional)
   * @param {number} limit - Maximum number of recipes to return
   * @returns {Promise} Promise resolving to recommended recipes array
   */
  getRecommendedRecipes: async (userId = null, limit = 5) => {
    limit = Math.min(limit, 10);
    try {
      // If we have userId, try to get personalized recommendations
      let userRecommendations = [];
      if (userId) {
        const userClicksRef = db.ref(`userClicks/${userId}`);
        const userClicksSnapshot = await userClicksRef.once("value");

        if (userClicksSnapshot.exists()) {
          // Convert user clicks to array with scores
          userClicksSnapshot.forEach((snapshot) => {
            const recipeId = snapshot.key;
            const data = snapshot.val();
            // Recency factor: clicks from last 7 days get higher weight
            const daysSinceClick =
              (Date.now() - data.lastClicked) / (1000 * 60 * 60 * 24);
            const recencyFactor = daysSinceClick <= 7 ? 1.5 : 1;
            // Final score = clicks * recency
            const score = data.count * recencyFactor;

            userRecommendations.push({
              id: recipeId,
              score: score,
              source: data.source || "isan_dishes",
            });
          });

          // Sort by score
          userRecommendations.sort((a, b) => b.score - a.score);
          userRecommendations = userRecommendations.slice(0, limit);
        }
      }

      // Get global recipe scores for popular items
      const recipeScoresSnapshot = await db
        .ref("recipeScores")
        .orderByChild("totalClicks")
        .limitToLast(20)
        .once("value");
      const globalRecommendations = [];

      recipeScoresSnapshot.forEach((snapshot) => {
        const recipeId = snapshot.key;
        const data = snapshot.val();

        // Skip if already in user recommendations
        if (userRecommendations.some((r) => r.id === recipeId)) {
          return;
        }

        globalRecommendations.push({
          id: recipeId,
          score: data.totalClicks,
          source: data.source || "isan_dishes",
        });
      });

      // Sort global recommendations by score
      globalRecommendations.sort((a, b) => b.score - a.score);

      // Combine user and global recommendations (prioritize user recommendations)
      const combinedRecommendations = [
        ...userRecommendations,
        ...globalRecommendations,
      ].slice(0, limit);

      // If we still need more recommendations, add random ones from each tier
      if (combinedRecommendations.length < limit) {
        // Get all recipes and dishes
        const allRecipes = await RecipeModel.getAllRecipes();

        // Filter out ones already in recommendations
        const remainingRecipes = allRecipes.filter(
          (recipe) =>
            !combinedRecommendations.some((rec) => rec.id === recipe.id)
        );

        // Create tiers (3 tiers)
        const tierSize = Math.ceil(remainingRecipes.length / 3);
        const tier1 = remainingRecipes.slice(0, tierSize);
        const tier2 = remainingRecipes.slice(tierSize, tierSize * 2);
        const tier3 = remainingRecipes.slice(tierSize * 2);

        // Shuffle each tier separately
        const shuffledTier1 = tier1.sort(() => 0.5 - Math.random());
        const shuffledTier2 = tier2.sort(() => 0.5 - Math.random());
        const shuffledTier3 = tier3.sort(() => 0.5 - Math.random());

        // Take items from each tier (prioritize tier 1)
        const neededCount = limit - combinedRecommendations.length;
        let randomRecommendations = [];

        // Try to take ~60% from tier 1, ~30% from tier 2, ~10% from tier 3
        const tier1Count = Math.ceil(neededCount * 0.6);
        const tier2Count = Math.ceil(neededCount * 0.3);
        const tier3Count = neededCount - tier1Count - tier2Count;

        randomRecommendations = [
          ...shuffledTier1.slice(0, tier1Count),
          ...shuffledTier2.slice(0, tier2Count),
          ...shuffledTier3.slice(0, tier3Count),
        ];

        // Add random recommendations to combined list
        combinedRecommendations.push(...randomRecommendations);
      }

      // Fetch full recipe data for recommended items
      const recommendedRecipes = [];

      for (const item of combinedRecommendations) {
        try {
          // Get complete recipe data
          const recipe = await RecipeModel.getRecipeById(item.id, item.source);
          if (recipe) {
            recommendedRecipes.push(recipe);
          }
        } catch (err) {
          console.error(`Error fetching recipe ${item.id}:`, err);
          // Continue with other recipes if one fails
        }
      }

      return recommendedRecipes;
    } catch (error) {
      console.error("Error fetching recommended recipes:", error);
      // If error, try to return some random recipes
      try {
        const allRecipes = await RecipeModel.getAllRecipes();
        const shuffled = allRecipes.sort(() => 0.5 - Math.random());
        return shuffled.slice(0, limit);
      } catch (fallbackError) {
        console.error("Error in fallback recommendation:", fallbackError);
        return [];
      }
    }
  },

  /**
   * Track a popular query
   * @param {string} query - The query to track
   * @returns {Promise} Promise resolving to updated query
   */
  trackPopularQuery: async (query) => {
    try {
      // Check if query already exists
      const formattedQuery = query.toLowerCase().trim();
      const snapshot = await popularQueriesRef
        .orderByChild("text")
        .equalTo(formattedQuery)
        .once("value");

      if (snapshot.exists()) {
        // Query exists, increment count
        let queryId = null;
        let count = 0;

        snapshot.forEach((childSnapshot) => {
          queryId = childSnapshot.key;
          count = childSnapshot.val().count || 0;
        });

        await popularQueriesRef.child(queryId).update({
          count: count + 1,
          lastUpdated: new Date().toISOString(),
        });

        return { id: queryId, text: formattedQuery, count: count + 1 };
      } else {
        // Create new query
        const newQueryRef = popularQueriesRef.push();
        const newQuery = {
          text: formattedQuery,
          count: 1,
          created: new Date().toISOString(),
          lastUpdated: new Date().toISOString(),
        };

        await newQueryRef.set(newQuery);
        return { id: newQueryRef.key, ...newQuery };
      }
    } catch (error) {
      console.error("Error tracking popular query:", error);
      throw error;
    }
  },

  /**
   * Get most popular queries
   * @param {number} limit - Maximum number of queries to return
   * @returns {Promise} Promise resolving to popular queries array
   */
  getPopularQueries: async (limit = 5) => {
    try {
      const snapshot = await popularQueriesRef
        .orderByChild("count")
        .limitToLast(limit)
        .once("value");
      const queries = [];

      snapshot.forEach((childSnapshot) => {
        const query = childSnapshot.val();
        query.id = childSnapshot.key;
        queries.push(query);
      });

      // Return in descending order (most popular first)
      return queries.sort((a, b) => b.count - a.count);
    } catch (error) {
      console.error("Error fetching popular queries:", error);
      throw error;
    }
  },

  /**
   * ค้นหาคำถามที่เคยถามมาก่อน
   * @param {string} query - คำถามที่ต้องการค้นหา
   * @returns {Promise} Promise resolving to previous query or null
   */
  findPreviousQuery: async (query) => {
    try {
      const formattedQuery = query.toLowerCase().trim();
      const userQueriesRef = db.ref("userQueries");
      const snapshot = await userQueriesRef
        .orderByChild("query")
        .equalTo(formattedQuery)
        .limitToLast(1)
        .once("value");

      if (!snapshot.exists()) {
        return null;
      }

      let previousQuery = null;
      snapshot.forEach((childSnapshot) => {
        previousQuery = childSnapshot.val();
        previousQuery.id = childSnapshot.key;
      });

      return previousQuery;
    } catch (error) {
      console.error("Error finding previous query:", error);
      throw error;
    }
  },

  /**
   * บันทึกคำถามและคำตอบของผู้ใช้
   * @param {string} query - คำถามที่ผู้ใช้ถาม
   * @param {string} response - คำตอบที่ได้
   * @param {string} source - แหล่งที่มาของคำตอบ (เช่น dialogflow, gemini)
   * @returns {Promise} Promise resolving to saved query
   */
  saveUserQuery: async (query, response, source = "unknown") => {
    try {
      const formattedQuery = query.toLowerCase().trim();
      const userQueriesRef = db.ref("userQueries");

      const newQuery = {
        query: formattedQuery,
        response: response,
        source: source,
        timestamp: new Date().toISOString(),
        count: 1,
      };

      // ตรวจสอบว่าเคยมีคำถามนี้แล้วหรือไม่
      const snapshot = await userQueriesRef
        .orderByChild("query")
        .equalTo(formattedQuery)
        .once("value");

      if (snapshot.exists()) {
        // อัพเดทคำถามเดิม
        let queryId = null;
        let count = 0;

        snapshot.forEach((childSnapshot) => {
          queryId = childSnapshot.key;
          count = childSnapshot.val().count || 0;
        });

        await userQueriesRef.child(queryId).update({
          response: response,
          count: count + 1,
          lastUpdated: new Date().toISOString(),
        });

        return { id: queryId, ...newQuery, count: count + 1 };
      } else {
        // สร้างคำถามใหม่
        const newQueryRef = userQueriesRef.push();
        await newQueryRef.set(newQuery);
        return { id: newQueryRef.key, ...newQuery };
      }
    } catch (error) {
      console.error("Error saving user query:", error);
      throw error;
    }
  },
};

module.exports = RecipeModel;
