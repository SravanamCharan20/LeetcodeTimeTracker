const mongoose = require('mongoose');

const problemSchema = new mongoose.Schema({
  id: String,
  title: String,
  difficulty: {
    type: String,
    enum: ['Easy', 'Medium', 'Hard'],
    default: 'Medium'
  },
  language: String,
  timeSpent: Number,
  timestamp: Number,
  url: String
});

const activityStatsSchema = new mongoose.Schema({
  date: {
    type: String,
    required: true,
    unique: true
  },
  problemsSolved: [problemSchema],
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
});

module.exports = mongoose.model('ActivityStats', activityStatsSchema); 