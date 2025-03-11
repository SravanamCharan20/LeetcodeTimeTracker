const mongoose = require('mongoose');

const activityStatsSchema = new mongoose.Schema({
  date: {
    type: String,
    required: true,
    unique: true
  },
  problemsSolved: [{
    id: String,
    title: String,
    difficulty: String,
    language: String,
    timeSpent: Number,
    timestamp: Number,
    url: String
  }],
  problemsSolvedCount: {
    type: Number,
    default: 0
  },
  totalTimeSpent: {
    type: Number,
    default: 0
  },
  idleTimeSpent: {
    type: Number,
    default: 0
  }
}, { 
  timestamps: true,
  versionKey: false // Disable version key to prevent conflicts
});

module.exports = mongoose.model('ActivityStats', activityStatsSchema); 