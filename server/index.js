const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const ActivityStats = require('./models/ActivityStats');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB Connection
mongoose.connect('mongodb+srv://cherry:cherry@authapp.7mr5p4o.mongodb.net/', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

const db = mongoose.connection;
db.on('error', console.error.bind(console, 'MongoDB connection error:'));
db.once('open', () => {
  console.log('Connected to MongoDB');
});

// Routes
app.post('/api/stats', async (req, res) => {
  try {
    const { date, problemsSolved, problemsSolvedCount, totalTimeSpent, idleTimeSpent, isNewDay } = req.body;
    
    if (isNewDay) {
      // For a new day, first ensure previous day's data is saved
      const previousDate = new Date(date);
      previousDate.setDate(previousDate.getDate() - 1);
      const previousDateStr = previousDate.toISOString().split('T')[0];
      
      // Then create a fresh document for the new day
      const stats = await ActivityStats.findOneAndUpdate(
        { date },
        {
          date,
          problemsSolved: [],
          problemsSolvedCount: 0,
          totalTimeSpent: 0,
          idleTimeSpent: 0
        },
        {
          new: true,
          upsert: true,
          runValidators: true
        }
      );
      
      return res.json(stats);
    }
    
    // Normal update for existing day
    const stats = await ActivityStats.findOneAndUpdate(
      { date },
      { 
        date,
        problemsSolved,
        problemsSolvedCount,
        totalTimeSpent,
        idleTimeSpent
      },
      {
        new: true,
        upsert: true,
        runValidators: true
      }
    );

    res.json(stats);
  } catch (error) {
    console.error('Error saving stats:', error);
    res.status(500).json({ error: 'Failed to save stats' });
  }
});

app.get('/api/stats/:date', async (req, res) => {
  try {
    const stats = await ActivityStats.findOne({ date: req.params.date });
    if (!stats) {
      return res.status(404).json({ error: 'No stats found for this date' });
    }
    res.json(stats);
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

app.get('/api/stats', async (req, res) => {
  try {
    const stats = await ActivityStats.find().sort({ date: -1 });
    res.json(stats);
  } catch (error) {
    console.error('Error fetching all stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 