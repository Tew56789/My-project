const express = require('express');
const router = express.Router();
const RecipeModel = require('../models/recipe.model');

// Get all recipes
router.get('/recipes', async (req, res) => {
  try {
    const recipes = await RecipeModel.getAllRecipes();
    res.json({ success: true, data: recipes });
  } catch (error) {
    console.error('Error fetching recipes:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Get recommended recipes
router.get('/recipes/recommended', async (req, res) => {
  try {
    const recipes = await RecipeModel.getRecommendedRecipes();
    res.json({ success: true, data: recipes });
  } catch (error) {
    console.error('Error fetching recommended recipes:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Get popular queries
router.get('/popular-queries', async (req, res) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit) : 5;
    const queries = await RecipeModel.getPopularQueries(limit);
    res.json({ success: true, data: queries });
  } catch (error) {
    console.error('Error fetching popular queries:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

module.exports = router;